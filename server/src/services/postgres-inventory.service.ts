import { IDbClient } from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";

export interface StockDeductionItem {
  productId: string;
  sku: string;
  quantity: number;
}

export interface StudioReservationItemInput {
  materialId?: string;
  materialName: string;
  sku: string;
  quantity: number;
}

export interface StockDeductionResult {
  success: boolean;
  deductedItems: Array<{
    productId: string;
    sku: string;
    quantity: number;
    previousStock: number;
    newStock: number;
  }>;
}

export interface StudioReservationResult {
  reservationId: string;
  orderNumber: string;
  status: "reserved";
  expiresAt: Date;
  items: StudioReservationItemInput[];
}

/**
 * PostgreSQL Transaction-Safe Inventory & Reservation Service (Phase 1)
 *
 * Guarantees:
 * 1. Atomic conditional stock deduction:
 *    `UPDATE products SET stock = stock - $qty WHERE id = $id AND stock >= $qty`
 * 2. Multi-item ACID atomicity: If any item in an order fails, the whole transaction
 *    rolls back, preventing partial stock deductions.
 * 3. Studio component variant reservation & conditional deduction.
 * 4. Automatic expiry release for abandoned checkouts.
 * 5. Order idempotency verification using partial unique index.
 */
export class PostgresInventoryService {
  /**
   * Deducts standard product stock atomically inside a transaction.
   * Throws HTTP 400 (Insufficient stock) or 404 (Product not found) if any condition is not met.
   */
  public static async deductStandardStockInTx(
    client: IDbClient,
    items: StockDeductionItem[],
    orderId?: string
  ): Promise<StockDeductionResult> {
    const deductedItems: StockDeductionResult["deductedItems"] = [];

    for (const item of items) {
      if (item.quantity <= 0) {
        continue;
      }

      // Atomic conditional update in PostgreSQL
      const updateResult = await client.query<{
        id: string;
        sku: string;
        new_stock: number;
        previous_stock: number;
      }>(
        `UPDATE products
         SET stock = stock - $1
         WHERE id = $2 AND stock >= $1
         RETURNING id, sku, stock AS new_stock, (stock + $1) AS previous_stock;`,
        [item.quantity, item.productId]
      );

      if (updateResult.rowCount === 0) {
        // Query to distinguish between missing product vs insufficient stock
        const checkResult = await client.query<{ id: string; stock: number; sku: string }>(
          `SELECT id, stock, sku FROM products WHERE id = $1;`,
          [item.productId]
        );

        if (checkResult.rowCount === 0) {
          throw new AppError(`Product "${item.sku}" (ID: ${item.productId}) not found.`, 404);
        }

        const currentStock = checkResult.rows[0].stock;
        throw new AppError(
          `Insufficient stock for "${item.sku}". Available: ${currentStock}, Requested: ${item.quantity}.`,
          400
        );
      }

      const row = updateResult.rows[0];
      deductedItems.push({
        productId: row.id,
        sku: row.sku,
        quantity: item.quantity,
        previousStock: row.previous_stock,
        newStock: row.new_stock,
      });

      // Insert audit log
      await client.query(
        `INSERT INTO inventory_logs (
           id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, created_at
         ) VALUES (
           gen_random_uuid()::text,
           $1, $2, 'deduct', $3, $4, $5, 'Order checkout deduction', $6, NOW()
         );`,
        [row.id, row.sku, -item.quantity, row.previous_stock, row.new_stock, orderId || null]
      );
    }

    return {
      success: true,
      deductedItems,
    };
  }

  /**
   * Atomically restores product stock in the event of an order cancellation or manual rollback.
   */
  public static async restoreStandardStockInTx(
    client: IDbClient,
    items: StockDeductionItem[],
    orderId?: string,
    reason = "Order failed / rollback"
  ): Promise<void> {
    for (const item of items) {
      if (item.quantity <= 0) continue;

      const updateResult = await client.query<{
        id: string;
        sku: string;
        new_stock: number;
        previous_stock: number;
      }>(
        `UPDATE products
         SET stock = stock + $1
         WHERE id = $2
         RETURNING id, sku, stock AS new_stock, (stock - $1) AS previous_stock;`,
        [item.quantity, item.productId]
      );

      if (updateResult.rowCount > 0) {
        const row = updateResult.rows[0];
        await client.query(
          `INSERT INTO inventory_logs (
             id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, created_at
           ) VALUES (
             gen_random_uuid()::text,
             $1, $2, 'add', $3, $4, $5, $6, $7, NOW()
           );`,
          [row.id, row.sku, item.quantity, row.previous_stock, row.new_stock, reason, orderId || null]
        );
      }
    }
  }

  /**
   * Creates a studio reservation for custom designs, conditionally locking studio variant stock.
   */
  public static async createStudioReservationInTx(
    client: IDbClient,
    orderId: string,
    orderNumber: string,
    userId: string,
    items: StudioReservationItemInput[],
    expiryMinutes = 15
  ): Promise<StudioReservationResult> {
    // 1. Conditionally deduct component variant stock
    for (const item of items) {
      if (item.quantity <= 0) continue;

      const updateResult = await client.query<{
        id: string;
        sku: string;
        stock: number;
      }>(
        `UPDATE studio_material_variants
         SET stock = stock - $1
         WHERE sku = $2 AND stock >= $1
         RETURNING id, sku, stock;`,
        [item.quantity, item.sku]
      );

      if (updateResult.rowCount === 0) {
        const checkResult = await client.query<{ stock: number }>(
          `SELECT stock FROM studio_material_variants WHERE sku = $1;`,
          [item.sku]
        );

        const currentStock = checkResult.rowCount > 0 ? checkResult.rows[0].stock : 0;
        throw new AppError(
          `Insufficient studio stock for variant "${item.sku}". Available: ${currentStock}, Requested: ${item.quantity}.`,
          400
        );
      }
    }

    // 2. Insert reservation record
    const reservationId = orderId; // or 24-char hex
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO studio_reservations (
         id, order_id, order_number, user_id, status, reserved_at, expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'reserved', NOW(), $5, NOW(), NOW());`,
      [reservationId, orderId, orderNumber, userId, expiresAt]
    );

    // 3. Insert reservation items
    for (const item of items) {
      await client.query(
        `INSERT INTO studio_reservation_items (
           reservation_id, material_id, material_name, sku, quantity
         ) VALUES ($1, $2, $3, $4, $5);`,
        [reservationId, item.materialId || null, item.materialName, item.sku, item.quantity]
      );
    }

    return {
      reservationId,
      orderNumber,
      status: "reserved",
      expiresAt,
      items,
    };
  }

  /**
   * Commits a studio reservation upon successful payment confirmation.
   */
  public static async commitStudioReservationInTx(
    client: IDbClient,
    reservationId: string
  ): Promise<void> {
    const result = await client.query(
      `UPDATE studio_reservations
       SET status = 'committed', committed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'reserved'
       RETURNING id;`,
      [reservationId]
    );

    if (result.rowCount === 0) {
      throw new AppError(`Studio reservation "${reservationId}" cannot be committed (not in reserved state).`, 400);
    }
  }

  /**
   * Releases an expired or cancelled reservation, returning components back to stock.
   */
  public static async releaseStudioReservationInTx(
    client: IDbClient,
    reservationId: string,
    reason = "Checkout expired or cancelled"
  ): Promise<void> {
    // 1. Mark reservation as released
    const resResult = await client.query<{ id: string; status: string }>(
      `UPDATE studio_reservations
       SET status = 'released', released_at = NOW(), release_reason = $2, updated_at = NOW()
       WHERE id = $1 AND status IN ('reserved', 'reconciliation_required')
       RETURNING id, status;`,
      [reservationId, reason]
    );

    if (resResult.rowCount === 0) {
      return; // Already committed or released
    }

    // 2. Fetch items to return to stock
    const itemsResult = await client.query<{ sku: string; quantity: number }>(
      `SELECT sku, quantity FROM studio_reservation_items WHERE reservation_id = $1;`,
      [reservationId]
    );

    for (const item of itemsResult.rows) {
      await client.query(
        `UPDATE studio_material_variants
         SET stock = stock + $1
         WHERE sku = $2;`,
        [item.quantity, item.sku]
      );
    }
  }

  /**
   * Periodic background sweeper: releases all expired reservations where status is 'reserved' and expires_at < NOW().
   */
  public static async sweepExpiredReservations(client: IDbClient): Promise<number> {
    const expiredResult = await client.query<{ id: string }>(
      `SELECT id FROM studio_reservations
       WHERE status = 'reserved' AND expires_at < NOW();`
    );

    let releasedCount = 0;
    for (const row of expiredResult.rows) {
      await this.releaseStudioReservationInTx(client, row.id, "Auto-expired by background sweeper");
      releasedCount++;
    }

    return releasedCount;
  }

  /**
   * Verifies order idempotency against PostgreSQL `orders` table.
   */
  public static async findExistingIdempotentOrder(
    client: IDbClient,
    userId: string,
    idempotencyKey: string
  ): Promise<{ id: string; orderNumber: string; status: string } | null> {
    const result = await client.query<{ id: string; order_number: string; status: string }>(
      `SELECT id, order_number, status FROM orders
       WHERE user_id = $1 AND idempotency_key = $2;`,
      [userId, idempotencyKey]
    );

    if (!result.rows || result.rows.length === 0 || result.rowCount === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      orderNumber: result.rows[0].order_number,
      status: result.rows[0].status,
    };
  }
}
