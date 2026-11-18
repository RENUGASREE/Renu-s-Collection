import { Types } from "mongoose";
import { Product, InventoryLog } from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import type { InventoryAction } from "../types/index.js";

export async function adjustStock(params: {
  productId: string;
  quantityChange: number;
  action: InventoryAction;
  reason?: string;
  orderId?: string;
  performedBy?: string;
}): Promise<{ productId: string; previousStock: number; newStock: number }> {
  if (!Types.ObjectId.isValid(params.productId)) {
    throw new AppError("Invalid product id", 400);
  }

  if (!Number.isFinite(params.quantityChange)) {
    throw new AppError("Invalid quantity change", 400);
  }

  let updatedProduct;
  let previousStock: number;
  let newStock: number;

  if (params.quantityChange < 0) {
    const requiredQty = Math.abs(params.quantityChange);

    // Atomic conditional decrement: only succeeds if stock is sufficient
    updatedProduct = await Product.findOneAndUpdate(
      {
        _id: params.productId,
        stock: { $gte: requiredQty },
      },
      {
        $inc: { stock: params.quantityChange },
      },
      {
        new: true,
      }
    );

    if (!updatedProduct) {
      const exists = await Product.exists({ _id: params.productId });
      if (!exists) {
        throw new AppError("Product not found", 404);
      }
      throw new AppError("Insufficient stock", 400);
    }

    newStock = updatedProduct.stock;
    previousStock = newStock - params.quantityChange;
  } else if (params.quantityChange > 0) {
    // Atomic increment
    updatedProduct = await Product.findOneAndUpdate(
      {
        _id: params.productId,
      },
      {
        $inc: { stock: params.quantityChange },
      },
      {
        new: true,
      }
    );

    if (!updatedProduct) {
      throw new AppError("Product not found", 404);
    }

    newStock = updatedProduct.stock;
    previousStock = newStock - params.quantityChange;
  } else {
    // quantityChange === 0
    updatedProduct = await Product.findById(params.productId);
    if (!updatedProduct) {
      throw new AppError("Product not found", 404);
    }
    previousStock = updatedProduct.stock;
    newStock = updatedProduct.stock;
  }

  await InventoryLog.create({
    productId: updatedProduct._id,
    sku: updatedProduct.sku,
    action: params.action,
    quantityChange: params.quantityChange,
    previousStock,
    newStock,
    reason: params.reason,
    orderId: params.orderId && Types.ObjectId.isValid(params.orderId) ? new Types.ObjectId(params.orderId) : undefined,
    performedBy: params.performedBy && Types.ObjectId.isValid(params.performedBy) ? new Types.ObjectId(params.performedBy) : undefined,
  });

  return { productId: updatedProduct.id || updatedProduct._id.toString(), previousStock, newStock };
}

export async function deductStockForOrder(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string
): Promise<void> {
  const deductedItems: { productId: string; quantity: number }[] = [];

  try {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      await adjustStock({
        productId: item.productId,
        quantityChange: -item.quantity,
        action: "deduct",
        reason: "Order placement",
        orderId,
        performedBy,
      });
      deductedItems.push(item);
    }
  } catch (error) {
    // Rollback previously deducted items in reverse order
    for (const item of [...deductedItems].reverse()) {
      try {
        await adjustStock({
          productId: item.productId,
          quantityChange: item.quantity,
          action: "release",
          reason: "Order placement failed - rollback",
          orderId,
          performedBy,
        });
      } catch (rollbackErr) {
        console.error(
          `[deductStockForOrder] Failed to rollback stock for product ${item.productId} in order ${orderId}:`,
          rollbackErr
        );
      }
    }
    throw error;
  }
}

// Inventory reservation strategy
// Reserve stock when payment is initiated, release on failure, confirm on success
const RESERVATION_TIMEOUT_MINUTES = 30;

export async function reserveStockForOrder(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string
): Promise<void> {
  const reservedItems: { productId: string; quantity: number }[] = [];

  try {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      await adjustStock({
        productId: item.productId,
        quantityChange: -item.quantity,
        action: "reserve",
        reason: "Payment initiated - stock reserved",
        orderId,
        performedBy,
      });
      reservedItems.push(item);
    }
  } catch (error) {
    // Rollback previously reserved items in reverse order
    for (const item of [...reservedItems].reverse()) {
      try {
        await adjustStock({
          productId: item.productId,
          quantityChange: item.quantity,
          action: "release",
          reason: "Stock reservation failed - rollback",
          orderId,
          performedBy,
        });
      } catch (rollbackErr) {
        console.error(
          `[reserveStockForOrder] Failed to rollback reservation for product ${item.productId} in order ${orderId}:`,
          rollbackErr
        );
      }
    }
    throw error;
  }
}

export async function releaseReservedStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string
): Promise<void> {
  for (const item of items) {
    if (item.quantity <= 0) continue;
    await adjustStock({
      productId: item.productId,
      quantityChange: item.quantity,
      action: "release",
      reason: "Payment failed - reservation released",
      orderId,
      performedBy,
    });
  }
}

export async function confirmReservedStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string
): Promise<void> {
  for (const item of items) {
    await adjustStock({
      productId: item.productId,
      quantityChange: 0,
      action: "confirm",
      reason: "Payment confirmed - reservation converted to sale",
      orderId,
      performedBy,
    });
  }
}

// Clean up expired reservations (should be run periodically via cron)
export async function cleanupExpiredReservations(): Promise<void> {
  const cutoffTime = new Date(Date.now() - RESERVATION_TIMEOUT_MINUTES * 60 * 1000);
  
  const expiredLogs = await InventoryLog.find({
    action: "reserve",
    createdAt: { $lt: cutoffTime },
  }).populate("orderId");

  for (const log of expiredLogs) {
    const order = log.orderId as any;
    if (order && order.paymentStatus === "pending") {
      // Release the reservation
      await adjustStock({
        productId: log.productId.toString(),
        quantityChange: Math.abs(log.quantityChange),
        action: "release",
        reason: "Reservation expired",
        orderId: order._id.toString(),
      });
      
      // Update order status
      order.paymentStatus = "failed";
      order.notes = `${order.notes ?? ""}\nStock reservation expired`.trim();
      await order.save();
    }
  }
}
