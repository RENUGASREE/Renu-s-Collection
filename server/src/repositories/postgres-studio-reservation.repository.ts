/**
 * ============================================================================
 * PostgreSQL Studio Reservation Repository (Phase 3H)
 * ============================================================================
 *
 * Implements typed, parameterized operations for studio reservations and
 * reservation items stored in the Supabase PostgreSQL tables:
 * - `studio_reservations`
 * - `studio_reservation_items`
 *
 * Adheres strictly to:
 * - Atomic conditional status transitions (preventing race conditions / double-commits).
 * - Multi-item transactional consistency.
 * - Idempotency safeguards.
 * - Zero direct Mongoose dependencies.
 */

import { randomUUID } from "node:crypto";
import {
  IDbClient,
  IStudioReservationRecord,
  IStudioReservationItemRecord,
  ICreateStudioReservationData,
  StudioReservationStatusType,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

export class PostgresStudioReservationRepository {
  private client?: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client;
  }

  private getExecutor(overrideClient?: IDbClient): IDbClient {
    if (overrideClient) return overrideClient;
    if (this.client) return this.client;
    return PostgresDatabase.getPool();
  }

  public mapRowToReservationItem(row: any): IStudioReservationItemRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      reservationId: String(row.reservation_id),
      materialId: row.material_id ? String(row.material_id) : null,
      materialName: String(row.material_name),
      sku: String(row.sku).toUpperCase(),
      quantity: Number(row.quantity),
    };
  }

  public mapRowToReservation(row: any, items: IStudioReservationItemRecord[] = []): IStudioReservationRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      orderId: String(row.order_id),
      orderNumber: String(row.order_number),
      userId: String(row.user_id),
      status: row.status as StudioReservationStatusType,
      reservedAt: new Date(row.reserved_at),
      expiresAt: new Date(row.expires_at),
      committedAt: row.committed_at ? new Date(row.committed_at) : null,
      releasedAt: row.released_at ? new Date(row.released_at) : null,
      restockedAt: row.restocked_at ? new Date(row.restocked_at) : null,
      releaseReason: row.release_reason ? String(row.release_reason) : null,
      reconciliationNotes: row.reconciliation_notes ? String(row.reconciliation_notes) : null,
      items,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async createReservation(
    data: ICreateStudioReservationData,
    client?: IDbClient
  ): Promise<IStudioReservationRecord> {
    assertValidEntityId(data.orderId, "orderId");
    assertValidEntityId(data.userId, "userId");

    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const now = data.reservedAt ? new Date(data.reservedAt) : new Date();
    const status = data.status || "reserved";

    const sql = `
      INSERT INTO studio_reservations (
        id, order_id, order_number, user_id, status,
        reserved_at, expires_at, committed_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, order_id, order_number, user_id, status,
                reserved_at, expires_at, committed_at, released_at, restocked_at,
                release_reason, reconciliation_notes, created_at, updated_at;
    `;
    const params = [
      id,
      data.orderId,
      data.orderNumber,
      data.userId,
      status,
      now,
      new Date(data.expiresAt),
      data.committedAt ? new Date(data.committedAt) : null,
    ];
    const resResult = await executor.query(sql, params);

    const items: IStudioReservationItemRecord[] = [];
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        const itemId = randomUUID();
        const itemSql = `
          INSERT INTO studio_reservation_items (
            id, reservation_id, material_id, material_name, sku, quantity
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, reservation_id, material_id, material_name, sku, quantity;
        `;
        const itemParams = [
          itemId,
          id,
          item.materialId || null,
          item.materialName,
          item.sku.trim().toUpperCase(),
          item.quantity,
        ];
        const itemResult = await executor.query(itemSql, itemParams);
        items.push(this.mapRowToReservationItem(itemResult.rows[0]));
      }
    }

    return this.mapRowToReservation(resResult.rows[0], items);
  }

  public async findById(id: string, client?: IDbClient): Promise<IStudioReservationRecord | null> {
    if (!id) return null;
    assertValidEntityId(id, "reservationId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, order_id, order_number, user_id, status,
             reserved_at, expires_at, committed_at, released_at, restocked_at,
             release_reason, reconciliation_notes, created_at, updated_at
      FROM studio_reservations
      WHERE id = $1
      LIMIT 1;
    `;
    const resResult = await executor.query(sql, [id]);
    if (resResult.rows.length === 0) return null;

    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = $1
       ORDER BY sku ASC;`,
      [id]
    );
    const items = itemsResult.rows.map((r) => this.mapRowToReservationItem(r));
    return this.mapRowToReservation(resResult.rows[0], items);
  }

  public async findByOrderId(orderId: string, client?: IDbClient): Promise<IStudioReservationRecord | null> {
    if (!orderId) return null;
    assertValidEntityId(orderId, "orderId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, order_id, order_number, user_id, status,
             reserved_at, expires_at, committed_at, released_at, restocked_at,
             release_reason, reconciliation_notes, created_at, updated_at
      FROM studio_reservations
      WHERE order_id = $1
      LIMIT 1;
    `;
    const resResult = await executor.query(sql, [orderId]);
    if (resResult.rows.length === 0) return null;

    const reservation = resResult.rows[0];
    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = $1
       ORDER BY sku ASC;`,
      [reservation.id]
    );
    const items = itemsResult.rows.map((r) => this.mapRowToReservationItem(r));
    return this.mapRowToReservation(reservation, items);
  }

  public async findAll(
    options?: { status?: string; limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<{ reservations: IStudioReservationRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*)::integer AS total FROM studio_reservations ${whereClause};`;
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    let querySql = `
      SELECT id, order_id, order_number, user_id, status,
             reserved_at, expires_at, committed_at, released_at, restocked_at,
             release_reason, reconciliation_notes, created_at, updated_at
      FROM studio_reservations
      ${whereClause}
      ORDER BY created_at DESC
    `;
    if (options?.limit && options.limit > 0) {
      querySql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset && options.offset > 0) {
      querySql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const resResult = await executor.query(querySql, params);
    if (resResult.rows.length === 0) {
      return { reservations: [], total };
    }

    const resIds = resResult.rows.map((r) => r.id);
    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = ANY($1)
       ORDER BY sku ASC;`,
      [resIds]
    );

    const itemsByResId = new Map<string, IStudioReservationItemRecord[]>();
    for (const r of itemsResult.rows) {
      const item = this.mapRowToReservationItem(r);
      if (!itemsByResId.has(item.reservationId)) {
        itemsByResId.set(item.reservationId, []);
      }
      itemsByResId.get(item.reservationId)!.push(item);
    }

    const reservations = resResult.rows.map((r) =>
      this.mapRowToReservation(r, itemsByResId.get(r.id) || [])
    );

    return { reservations, total };
  }

  public async findExpiredReservations(
    now: Date = new Date(),
    client?: IDbClient
  ): Promise<IStudioReservationRecord[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, order_id, order_number, user_id, status,
             reserved_at, expires_at, committed_at, released_at, restocked_at,
             release_reason, reconciliation_notes, created_at, updated_at
      FROM studio_reservations
      WHERE status = 'reserved' AND expires_at < $1
      ORDER BY expires_at ASC;
    `;
    const resResult = await executor.query(sql, [now]);
    if (resResult.rows.length === 0) return [];

    const resIds = resResult.rows.map((r) => r.id);
    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = ANY($1)
       ORDER BY sku ASC;`,
      [resIds]
    );

    const itemsByResId = new Map<string, IStudioReservationItemRecord[]>();
    for (const r of itemsResult.rows) {
      const item = this.mapRowToReservationItem(r);
      if (!itemsByResId.has(item.reservationId)) {
        itemsByResId.set(item.reservationId, []);
      }
      itemsByResId.get(item.reservationId)!.push(item);
    }

    return resResult.rows.map((r) =>
      this.mapRowToReservation(r, itemsByResId.get(r.id) || [])
    );
  }

  /**
   * Concurrency-safe atomic state transition for reservations.
   * Updates only if current status is in `fromStatuses`.
   */
  public async atomicTransitionStatus(
    orderId: string,
    fromStatuses: string[],
    toStatus: StudioReservationStatusType,
    updateData?: {
      releasedAt?: Date;
      restockedAt?: Date;
      committedAt?: Date;
      releaseReason?: string;
      reconciliationNotes?: string;
    },
    client?: IDbClient
  ): Promise<IStudioReservationRecord | null> {
    assertValidEntityId(orderId, "orderId");
    const executor = this.getExecutor(client);

    const setClauses: string[] = [`status = $2`, `updated_at = NOW()`];
    const params: any[] = [orderId, toStatus, fromStatuses];
    let pIdx = 4;

    if (updateData?.committedAt !== undefined) {
      setClauses.push(`committed_at = $${pIdx++}`);
      params.push(updateData.committedAt);
    }
    if (updateData?.releasedAt !== undefined) {
      setClauses.push(`released_at = $${pIdx++}`);
      params.push(updateData.releasedAt);
    }
    if (updateData?.restockedAt !== undefined) {
      setClauses.push(`restocked_at = $${pIdx++}`);
      params.push(updateData.restockedAt);
    }
    if (updateData?.releaseReason !== undefined) {
      setClauses.push(`release_reason = $${pIdx++}`);
      params.push(updateData.releaseReason);
    }
    if (updateData?.reconciliationNotes !== undefined) {
      setClauses.push(`reconciliation_notes = $${pIdx++}`);
      params.push(updateData.reconciliationNotes);
    }

    const sql = `
      UPDATE studio_reservations
      SET ${setClauses.join(", ")}
      WHERE order_id = $1 AND status = ANY($3)
      RETURNING id, order_id, order_number, user_id, status,
                reserved_at, expires_at, committed_at, released_at, restocked_at,
                release_reason, reconciliation_notes, created_at, updated_at;
    `;

    const resResult = await executor.query(sql, params);
    if (resResult.rows.length === 0) return null;

    const reservation = resResult.rows[0];
    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = $1
       ORDER BY sku ASC;`,
      [reservation.id]
    );
    const items = itemsResult.rows.map((r) => this.mapRowToReservationItem(r));
    return this.mapRowToReservation(reservation, items);
  }

  public async updateReconciliation(
    id: string,
    status: StudioReservationStatusType,
    notes: string,
    client?: IDbClient
  ): Promise<IStudioReservationRecord | null> {
    assertValidEntityId(id, "reservationId");
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE studio_reservations
      SET status = $2, reconciliation_notes = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id, order_id, order_number, user_id, status,
                reserved_at, expires_at, committed_at, released_at, restocked_at,
                release_reason, reconciliation_notes, created_at, updated_at;
    `;
    const resResult = await executor.query(sql, [id, status, notes]);
    if (resResult.rows.length === 0) return null;

    const reservation = resResult.rows[0];
    const itemsResult = await executor.query(
      `SELECT id, reservation_id, material_id, material_name, sku, quantity
       FROM studio_reservation_items
       WHERE reservation_id = $1
       ORDER BY sku ASC;`,
      [reservation.id]
    );
    const items = itemsResult.rows.map((r) => this.mapRowToReservationItem(r));
    return this.mapRowToReservation(reservation, items);
  }
}
