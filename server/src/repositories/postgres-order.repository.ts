/**
 * ============================================================================
 * PostgreSQL Order Repository (Phase 3F)
 * ============================================================================
 *
 * Implements typed, parameterized data access for `orders` and `order_items` tables
 * on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. 100% parameterized queries — zero SQL injection risk.
 * 2. Dual identifier compatibility (`id` and `_id`) for both orders and items.
 * 3. Atomic state transitions for payment processing (single-winner concurrency guard).
 * 4. Idempotency guarantees via `uq_orders_user_idempotency` and fast-path lookup.
 * 5. Full support for IDbClient / IDbPool for transaction propagation (`withTransaction`).
 */

import {
  IDbClient,
  IDbPool,
  IOrderDbRow,
  IOrderItemDbRow,
  IOrderRecord,
  IOrderItemRecord,
  ICreateOrderData,
  ICreateOrderItemData,
  IUpdateOrderData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import crypto from "crypto";

function parseJsonField<T>(field: any, defaultValue: T): T {
  if (field === null || field === undefined) return defaultValue;
  if (typeof field === "object") return field as T;
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T;
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

export function mapRowToOrderItem(row: IOrderItemDbRow): IOrderItemRecord {
  const idStr = String(row.id);
  const orderIdStr = String(row.order_id);
  const productIdStr = row.product_id ? String(row.product_id) : null;

  return {
    id: idStr,
    _id: idStr,
    orderId: orderIdStr,
    itemType: (row.item_type as "product" | "custom_design") || "product",
    productId: productIdStr,
    sku: String(row.sku || ""),
    name: String(row.name || ""),
    imageUrl: row.image_url ? String(row.image_url) : null,
    unitPrice: typeof row.unit_price === "string" ? parseFloat(row.unit_price) : Number(row.unit_price || 0),
    quantity: Number(row.quantity || 1),
    subtotal: typeof row.subtotal === "string" ? parseFloat(row.subtotal) : Number(row.subtotal || 0),
    customization: parseJsonField(row.customization, null),
    studioDesign: parseJsonField(row.studio_design, null),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

export function mapRowToOrder(row: IOrderDbRow, items: IOrderItemRecord[] = []): IOrderRecord {
  const idStr = String(row.id);
  const userIdStr = row.user_id ? String(row.user_id) : null;

  return {
    id: idStr,
    _id: idStr,
    orderNumber: String(row.order_number),
    userId: userIdStr,
    status: (row.status as any) || "pending",
    paymentStatus: (row.payment_status as any) || "pending",
    subtotal: typeof row.subtotal === "string" ? parseFloat(row.subtotal) : Number(row.subtotal || 0),
    discount: typeof row.discount === "string" ? parseFloat(row.discount) : Number(row.discount || 0),
    tax: typeof row.tax === "string" ? parseFloat(row.tax) : Number(row.tax || 0),
    shipping: typeof row.shipping === "string" ? parseFloat(row.shipping) : Number(row.shipping || 0),
    total: typeof row.total === "string" ? parseFloat(row.total) : Number(row.total || 0),
    currency: String(row.currency || "INR"),
    couponCode: row.coupon_code ? String(row.coupon_code) : null,
    shippingAddress: parseJsonField(row.shipping_address, {}),
    billingAddress: parseJsonField(row.billing_address, null),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    notes: row.notes ? String(row.notes) : null,
    paymentMethod: String(row.payment_method || "razorpay"),
    razorpayOrderId: row.razorpay_order_id ? String(row.razorpay_order_id) : null,
    razorpayPaymentId: row.razorpay_payment_id ? String(row.razorpay_payment_id) : null,
    razorpaySignature: row.razorpay_signature ? String(row.razorpay_signature) : null,
    trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
    invoiceUrl: row.invoice_url ? String(row.invoice_url) : null,
    statusHistory: parseJsonField(row.status_history, []),
    fulfillmentStatus: (row.fulfillment_status as any) || "pending",
    fulfillmentErrors: Array.isArray(row.fulfillment_errors) ? row.fulfillment_errors.map(String) : [],
    deductedItemIds: Array.isArray(row.deducted_item_ids) ? row.deducted_item_ids.map(String) : [],
    couponProcessed: Boolean(row.coupon_processed),
    cartCleared: Boolean(row.cart_cleared),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    checkoutFingerprint: row.checkout_fingerprint ? String(row.checkout_fingerprint) : null,
    studioReservationId: row.studio_reservation_id ? String(row.studio_reservation_id) : null,
    studioReservationStatus: row.studio_reservation_status ? String(row.studio_reservation_status) : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    items,
  };
}

export class PostgresOrderRepository {
  private readonly pool?: IDbPool;

  constructor(pool?: IDbPool) {
    this.pool = pool;
  }

  private getExecutor(client?: IDbClient): IDbClient {
    if (client) return client;
    if (this.pool) return this.pool;
    return PostgresDatabase.getPool();
  }

  /**
   * Helper to load items for a list of order IDs in batch.
   */
  private async loadItemsForOrders(
    orderIds: string[],
    client?: IDbClient
  ): Promise<Map<string, IOrderItemRecord[]>> {
    const map = new Map<string, IOrderItemRecord[]>();
    for (const id of orderIds) {
      map.set(id, []);
    }
    if (orderIds.length === 0) return map;

    const executor = this.getExecutor(client);
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(", ");
    const result = await executor.query<IOrderItemDbRow>(
      `SELECT id, order_id, item_type, product_id, sku, name, image_url,
              unit_price, quantity, subtotal, customization, studio_design, created_at
       FROM order_items
       WHERE order_id IN (${placeholders})
       ORDER BY created_at ASC;`,
      orderIds
    );

    for (const row of result.rows) {
      const item = mapRowToOrderItem(row);
      const list = map.get(item.orderId);
      if (list) {
        list.push(item);
      }
    }

    return map;
  }

  /**
   * Creates a new order header row in PostgreSQL.
   */
  public async create(orderData: ICreateOrderData, client?: IDbClient): Promise<IOrderRecord> {
    const executor = this.getExecutor(client);
    const orderId = orderData.id || crypto.randomUUID();

    const sql = `
      INSERT INTO orders (
        id, order_number, user_id, status, payment_status,
        subtotal, discount, tax, shipping, total, currency,
        coupon_code, shipping_address, billing_address, email, phone,
        notes, payment_method, razorpay_order_id, razorpay_payment_id,
        razorpay_signature, tracking_number, invoice_url, status_history,
        fulfillment_status, fulfillment_errors, deducted_item_ids,
        coupon_processed, cart_cleared, idempotency_key,
        checkout_fingerprint, studio_reservation_id, studio_reservation_status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30,
        $31, $32, $33,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const params = [
      orderId,
      orderData.orderNumber,
      orderData.userId || null,
      orderData.status || "pending",
      orderData.paymentStatus || "pending",
      orderData.subtotal,
      orderData.discount || 0,
      orderData.tax || 0,
      orderData.shipping || 0,
      orderData.total,
      orderData.currency || "INR",
      orderData.couponCode || null,
      JSON.stringify(orderData.shippingAddress || {}),
      orderData.billingAddress ? JSON.stringify(orderData.billingAddress) : null,
      orderData.email,
      orderData.phone,
      orderData.notes || null,
      orderData.paymentMethod || "razorpay",
      orderData.razorpayOrderId || null,
      orderData.razorpayPaymentId || null,
      orderData.razorpaySignature || null,
      orderData.trackingNumber || null,
      orderData.invoiceUrl || null,
      JSON.stringify(orderData.statusHistory || []),
      orderData.fulfillmentStatus || "pending",
      orderData.fulfillmentErrors || [],
      orderData.deductedItemIds || [],
      orderData.couponProcessed || false,
      orderData.cartCleared || false,
      orderData.idempotencyKey || null,
      orderData.checkoutFingerprint || null,
      orderData.studioReservationId || null,
      orderData.studioReservationStatus || null,
    ];

    const result = await executor.query<IOrderDbRow>(sql, params);
    return mapRowToOrder(result.rows[0], []);
  }

  /**
   * Adds line items to an existing order.
   */
  public async addItems(
    orderId: string,
    items: ICreateOrderItemData[],
    client?: IDbClient
  ): Promise<IOrderItemRecord[]> {
    if (items.length === 0) return [];
    const executor = this.getExecutor(client);

    const insertedItems: IOrderItemRecord[] = [];
    for (const item of items) {
      const itemId = item.id || crypto.randomUUID();
      const sql = `
        INSERT INTO order_items (
          id, order_id, item_type, product_id, sku, name,
          image_url, unit_price, quantity, subtotal, customization,
          studio_design, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, NOW()
        )
        RETURNING *;
      `;
      const params = [
        itemId,
        orderId,
        item.itemType || "product",
        item.productId || null,
        item.sku,
        item.name,
        item.imageUrl || null,
        item.unitPrice,
        item.quantity,
        item.subtotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1)),
        item.customization ? JSON.stringify(item.customization) : null,
        item.studioDesign ? JSON.stringify(item.studioDesign) : null,
      ];

      const res = await executor.query<IOrderItemDbRow>(sql, params);
      insertedItems.push(mapRowToOrderItem(res.rows[0]));
    }

    return insertedItems;
  }

  /**
   * Finds an order by its ID with items populated.
   */
  public async findById(id: string, client?: IDbClient): Promise<IOrderRecord | null> {
    if (!isValidEntityId(id)) return null;
    const executor = this.getExecutor(client);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders WHERE id = $1 LIMIT 1;`,
      [id]
    );

    if (result.rows.length === 0) return null;
    const itemsMap = await this.loadItemsForOrders([id], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(id) || []);
  }

  /**
   * Finds an order by order_number with items populated.
   */
  public async findByOrderNumber(orderNumber: string, client?: IDbClient): Promise<IOrderRecord | null> {
    if (!orderNumber) return null;
    const executor = this.getExecutor(client);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders WHERE order_number = $1 LIMIT 1;`,
      [orderNumber]
    );

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Finds an order by Razorpay order ID.
   */
  public async findByRazorpayOrderId(razorpayOrderId: string, client?: IDbClient): Promise<IOrderRecord | null> {
    if (!razorpayOrderId) return null;
    const executor = this.getExecutor(client);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders WHERE razorpay_order_id = $1 LIMIT 1;`,
      [razorpayOrderId]
    );

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Finds an order by Razorpay payment ID.
   */
  public async findByRazorpayPaymentId(razorpayPaymentId: string, client?: IDbClient): Promise<IOrderRecord | null> {
    if (!razorpayPaymentId) return null;
    const executor = this.getExecutor(client);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders WHERE razorpay_payment_id = $1 LIMIT 1;`,
      [razorpayPaymentId]
    );

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Finds an order by user ID and idempotency key.
   */
  public async findByIdempotencyKey(userId: string, key: string, client?: IDbClient): Promise<IOrderRecord | null> {
    if (!isValidEntityId(userId) || !key) return null;
    const executor = this.getExecutor(client);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1;`,
      [userId, key]
    );

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Secondary duplicate check: finds recent order within maxAgeMs by checkoutFingerprint.
   */
  public async findRecentByCheckoutFingerprint(
    userId: string,
    fingerprint: string,
    maxAgeMs: number = 15000,
    client?: IDbClient
  ): Promise<IOrderRecord | null> {
    if (!isValidEntityId(userId) || !fingerprint) return null;
    const executor = this.getExecutor(client);
    const minTime = new Date(Date.now() - maxAgeMs);

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders
       WHERE user_id = $1 AND checkout_fingerprint = $2 AND created_at >= $3
       ORDER BY created_at DESC
       LIMIT 1;`,
      [userId, fingerprint, minTime]
    );

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Retrieves all orders for a specific user, ordered newest first.
   */
  public async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<IOrderRecord[]> {
    if (!isValidEntityId(userId)) return [];
    const executor = this.getExecutor(client);

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3;`,
      [userId, limit, offset]
    );

    if (result.rows.length === 0) return [];
    const orderIds = result.rows.map((r) => String(r.id));
    const itemsMap = await this.loadItemsForOrders(orderIds, client);

    return result.rows.map((r) => mapRowToOrder(r, itemsMap.get(String(r.id)) || []));
  }

  /**
   * Retrieves orders requiring fulfillment retry:
   * - Paid orders with 'requires_action' status.
   * - Stranded 'pending' orders whose explicit lease has expired (claim_expires_at <= NOW()),
   *   or fallback to updated_at <= NOW() - leaseMinutes when claim_expires_at is null.
   */
  public async findOrdersRequiringFulfillment(
    limit = 50,
    client?: IDbClient,
    leaseMinutes = 5
  ): Promise<IOrderRecord[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<IOrderDbRow>(
      `SELECT * FROM orders
       WHERE payment_status = 'paid' AND (
         fulfillment_status = 'requires_action'
         OR (
           fulfillment_status = 'pending' AND (
             claim_expires_at <= NOW()
             OR (claim_expires_at IS NULL AND updated_at <= NOW() - ($2 * INTERVAL '1 minute'))
           )
         )
       )
       ORDER BY created_at ASC
       LIMIT $1;`,
      [limit, leaseMinutes]
    );

    if (result.rows.length === 0) return [];
    const orderIds = result.rows.map((r) => String(r.id));
    const itemsMap = await this.loadItemsForOrders(orderIds, client);
    return result.rows.map((r) => mapRowToOrder(r, itemsMap.get(String(r.id)) || []));
  }

  /**
   * Admin listing with status/search filtering and pagination.
   */
  public async findAll(
    filter?: { status?: string; paymentStatus?: string; search?: string },
    options?: { limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<{ orders: IOrderRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (filter?.status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(filter.status);
    }
    if (filter?.paymentStatus) {
      conditions.push(`payment_status = $${pIdx++}`);
      params.push(filter.paymentStatus);
    }
    if (filter?.search) {
      conditions.push(`(order_number ILIKE $${pIdx} OR email ILIKE $${pIdx} OR phone ILIKE $${pIdx})`);
      params.push(`%${filter.search}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRes = await executor.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM orders ${whereClause};`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || "0", 10);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const dataSql = `
      SELECT * FROM orders
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++};
    `;
    const dataParams = [...params, limit, offset];

    const result = await executor.query<IOrderDbRow>(dataSql, dataParams);
    if (result.rows.length === 0) {
      return { orders: [], total };
    }

    const orderIds = result.rows.map((r) => String(r.id));
    const itemsMap = await this.loadItemsForOrders(orderIds, client);

    const orders = result.rows.map((r) => mapRowToOrder(r, itemsMap.get(String(r.id)) || []));
    return { orders, total };
  }

  /**
   * Updates an order by ID.
   */
  public async updateById(
    id: string,
    updateData: IUpdateOrderData,
    client?: IDbClient
  ): Promise<IOrderRecord | null> {
    if (!isValidEntityId(id)) return null;
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const params: any[] = [id];
    let pIdx = 2;

    if (updateData.status !== undefined) {
      setClauses.push(`status = $${pIdx++}`);
      params.push(updateData.status);
    }
    if (updateData.paymentStatus !== undefined) {
      setClauses.push(`payment_status = $${pIdx++}`);
      params.push(updateData.paymentStatus);
    }
    if (updateData.razorpayOrderId !== undefined) {
      setClauses.push(`razorpay_order_id = $${pIdx++}`);
      params.push(updateData.razorpayOrderId);
    }
    if (updateData.razorpayPaymentId !== undefined) {
      setClauses.push(`razorpay_payment_id = $${pIdx++}`);
      params.push(updateData.razorpayPaymentId);
    }
    if (updateData.razorpaySignature !== undefined) {
      setClauses.push(`razorpay_signature = $${pIdx++}`);
      params.push(updateData.razorpaySignature);
    }
    if (updateData.trackingNumber !== undefined) {
      setClauses.push(`tracking_number = $${pIdx++}`);
      params.push(updateData.trackingNumber);
    }
    if (updateData.invoiceUrl !== undefined) {
      setClauses.push(`invoice_url = $${pIdx++}`);
      params.push(updateData.invoiceUrl);
    }
    if (updateData.notes !== undefined) {
      setClauses.push(`notes = $${pIdx++}`);
      params.push(updateData.notes);
    }
    if (updateData.statusHistory !== undefined) {
      setClauses.push(`status_history = $${pIdx++}`);
      params.push(JSON.stringify(updateData.statusHistory));
    }
    if (updateData.fulfillmentStatus !== undefined) {
      setClauses.push(`fulfillment_status = $${pIdx++}`);
      params.push(updateData.fulfillmentStatus);
    }
    if (updateData.fulfillmentErrors !== undefined) {
      setClauses.push(`fulfillment_errors = $${pIdx++}`);
      params.push(updateData.fulfillmentErrors);
    }
    if (updateData.deductedItemIds !== undefined) {
      setClauses.push(`deducted_item_ids = $${pIdx++}`);
      params.push(updateData.deductedItemIds);
    }
    if (updateData.couponProcessed !== undefined) {
      setClauses.push(`coupon_processed = $${pIdx++}`);
      params.push(updateData.couponProcessed);
    }
    if (updateData.cartCleared !== undefined) {
      setClauses.push(`cart_cleared = $${pIdx++}`);
      params.push(updateData.cartCleared);
    }
    if (updateData.studioReservationId !== undefined) {
      setClauses.push(`studio_reservation_id = $${pIdx++}`);
      params.push(updateData.studioReservationId);
    }
    if (updateData.studioReservationStatus !== undefined) {
      setClauses.push(`studio_reservation_status = $${pIdx++}`);
      params.push(updateData.studioReservationStatus);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);

    const sql = `
      UPDATE orders
      SET ${setClauses.join(", ")}
      WHERE id = $1
      RETURNING *;
    `;

    const result = await executor.query<IOrderDbRow>(sql, params);
    if (result.rows.length === 0) return null;

    const itemsMap = await this.loadItemsForOrders([id], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(id) || []);
  }

  /**
   * Atomic transition to paid by Order ID.
   * Only transitions if payment_status != 'paid', preventing duplicate fulfillment.
   */
  public async atomicTransitionToPaid(
    orderId: string,
    data: {
      razorpayPaymentId: string;
      razorpaySignature?: string;
      note?: string;
    },
    client?: IDbClient
  ): Promise<IOrderRecord | null> {
    if (!isValidEntityId(orderId)) return null;
    const executor = this.getExecutor(client);

    const note = data.note || "Payment confirmed via Razorpay";
    const historyEntry = JSON.stringify({
      status: "processing",
      note,
      changedAt: new Date().toISOString(),
    });

    const sql = `
      UPDATE orders
      SET payment_status = 'paid',
          status = 'processing',
          razorpay_payment_id = $2,
          razorpay_signature = COALESCE($3, razorpay_signature),
          fulfillment_status = 'pending',
          status_history = status_history || $4::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND payment_status != 'paid'
      RETURNING *;
    `;

    const result = await executor.query<IOrderDbRow>(sql, [
      orderId,
      data.razorpayPaymentId,
      data.razorpaySignature || null,
      historyEntry,
    ]);

    if (result.rows.length === 0) return null;
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Atomic transition to paid by Razorpay Order ID.
   */
  public async atomicTransitionToPaidByRazorpayOrderId(
    razorpayOrderId: string,
    data: {
      razorpayPaymentId: string;
      razorpaySignature?: string;
      note?: string;
    },
    client?: IDbClient
  ): Promise<IOrderRecord | null> {
    if (!razorpayOrderId) return null;
    const executor = this.getExecutor(client);

    const note = data.note || "Payment confirmed via Razorpay webhook";
    const historyEntry = JSON.stringify({
      status: "processing",
      note,
      changedAt: new Date().toISOString(),
    });

    const sql = `
      UPDATE orders
      SET payment_status = 'paid',
          status = 'processing',
          razorpay_payment_id = $2,
          razorpay_signature = COALESCE($3, razorpay_signature),
          fulfillment_status = 'pending',
          status_history = status_history || $4::jsonb,
          updated_at = NOW()
      WHERE razorpay_order_id = $1 AND payment_status != 'paid'
      RETURNING *;
    `;

    const result = await executor.query<IOrderDbRow>(sql, [
      razorpayOrderId,
      data.razorpayPaymentId,
      data.razorpaySignature || null,
      historyEntry,
    ]);

    if (result.rows.length === 0) return null;
    const orderId = String(result.rows[0].id);
    const itemsMap = await this.loadItemsForOrders([orderId], client);
    return mapRowToOrder(result.rows[0], itemsMap.get(orderId) || []);
  }

  /**
   * Claim coupon processing atomically on the order to prevent duplicate coupon usage increments.
   */
  public async claimCouponProcessed(orderId: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(orderId)) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET coupon_processed = TRUE, updated_at = NOW()
       WHERE id = $1 AND coupon_processed = FALSE
       RETURNING id;`,
      [orderId]
    );

    return result.rowCount > 0;
  }

  /**
   * Claim cart clearing atomically on the order to prevent duplicate cart clears.
   */
  public async claimCartCleared(orderId: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(orderId)) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET cart_cleared = TRUE, updated_at = NOW()
       WHERE id = $1 AND cart_cleared = FALSE
       RETURNING id;`,
      [orderId]
    );

    return result.rowCount > 0;
  }

  /**
   * Atomically claims an order for fulfillment processing to prevent concurrent runs across instances.
   * Supports lease recovery with dedicated claim tokens and explicit expiration timestamps:
   * if an order was claimed as 'pending' but the worker crashed or its lease expired,
   * another worker can safely reclaim it with a fresh claim token.
   */
  public async claimOrderForFulfillment(
    orderId: string,
    client?: IDbClient,
    leaseMinutes: number = 5,
    customToken?: string
  ): Promise<{ claimed: boolean; claimToken?: string }> {
    if (!isValidEntityId(orderId)) return { claimed: false };
    const executor = this.getExecutor(client);
    const token = customToken || crypto.randomUUID();

    const result = await executor.query(
      `UPDATE orders
       SET fulfillment_status = 'pending',
           claim_token = $2,
           claim_expires_at = NOW() + ($3 * INTERVAL '1 minute'),
           updated_at = NOW()
       WHERE id = $1 AND (
         fulfillment_status = 'requires_action'
         OR (
           fulfillment_status = 'pending' AND (
             claim_expires_at <= NOW()
             OR (claim_expires_at IS NULL AND updated_at <= NOW() - ($3 * INTERVAL '1 minute'))
           )
         )
       )
       RETURNING id, claim_token;`,
      [orderId, token, leaseMinutes]
    );

    if (result.rowCount > 0) {
      return { claimed: true, claimToken: token };
    }
    return { claimed: false };
  }

  /**
   * Extends the worker lease (heartbeat) for long-running fulfillment operations.
   */
  public async extendOrderFulfillmentLease(
    orderId: string,
    claimToken: string,
    additionalMinutes: number = 5,
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(orderId) || !claimToken) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET claim_expires_at = NOW() + ($3 * INTERVAL '1 minute'), updated_at = NOW()
       WHERE id = $1 AND claim_token = $2 AND fulfillment_status = 'pending'
       RETURNING id;`,
      [orderId, claimToken, additionalMinutes]
    );

    return result.rowCount > 0;
  }

  /**
   * Completes order fulfillment conditionally guarded by the worker's claim token (fencing).
   * If another worker has reclaimed the lease, the completion is rejected.
   */
  public async completeOrderFulfillment(
    orderId: string,
    claimToken: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(orderId) || !claimToken) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET fulfillment_status = 'completed',
           claim_token = NULL,
           claim_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND claim_token = $2 AND fulfillment_status = 'pending'
       RETURNING id;`,
      [orderId, claimToken]
    );

    return result.rowCount > 0;
  }

  /**
   * Releases an order fulfillment claim back to 'requires_action' on error, guarded by claim token.
   */
  public async releaseOrderFulfillmentClaim(
    orderId: string,
    claimToken: string,
    errorMsg?: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(orderId) || !claimToken) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET fulfillment_status = 'requires_action',
           claim_token = NULL,
           claim_expires_at = NULL,
           fulfillment_errors = CASE 
             WHEN $3::text IS NOT NULL THEN array_append(fulfillment_errors, $3::text)
             ELSE fulfillment_errors
           END,
           updated_at = NOW()
       WHERE id = $1 AND claim_token = $2
       RETURNING id;`,
      [orderId, claimToken, errorMsg || null]
    );

    return result.rowCount > 0;
  }

  /**
   * Records a line item ID in deducted_item_ids atomically.
   */
  public async addDeductedItemId(orderId: string, itemId: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(orderId) || !itemId) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `UPDATE orders
       SET deducted_item_ids = array_append(deducted_item_ids, $2),
           updated_at = NOW()
       WHERE id = $1 AND NOT ($2 = ANY(deducted_item_ids))
       RETURNING id;`,
      [orderId, itemId]
    );

    return result.rowCount > 0;
  }

  /**
   * Appends an entry to status_history.
   */
  public async appendStatusHistory(
    orderId: string,
    entry: {
      status: string;
      note?: string;
      changedAt?: Date | string;
      changedBy?: string;
    },
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(orderId)) return false;
    const executor = this.getExecutor(client);

    const record = JSON.stringify({
      status: entry.status,
      note: entry.note,
      changedAt: entry.changedAt
        ? (entry.changedAt instanceof Date ? entry.changedAt.toISOString() : entry.changedAt)
        : new Date().toISOString(),
      changedBy: entry.changedBy,
    });

    const result = await executor.query(
      `UPDATE orders
       SET status_history = status_history || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id;`,
      [orderId, record]
    );

    return result.rowCount > 0;
  }

  /**
   * Deletes an order by ID (cascades to order_items).
   */
  public async deleteById(id: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(id)) return false;
    const executor = this.getExecutor(client);

    const result = await executor.query(
      `DELETE FROM orders WHERE id = $1 RETURNING id;`,
      [id]
    );

    return result.rowCount > 0;
  }
}
