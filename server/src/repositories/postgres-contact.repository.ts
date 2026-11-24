import {
  IDbClient,
  IContactMessageRecord,
  ICreateContactMessageData,
  ContactMessageStatusType,
  EmailNotificationStatusType,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";

export interface IContactRepository {
  createMessage(data: ICreateContactMessageData): Promise<IContactMessageRecord>;
  updateEmailNotification(
    id: string,
    update: {
      status: EmailNotificationStatusType;
      attemptedAt?: Date | string;
      error?: string | null;
    }
  ): Promise<boolean>;
  findById(id: string): Promise<IContactMessageRecord | null>;
  findAll(options?: {
    page?: number;
    limit?: number;
    status?: ContactMessageStatusType;
  }): Promise<{ messages: IContactMessageRecord[]; total: number }>;
  updateStatus(id: string, status: ContactMessageStatusType): Promise<boolean>;
  count(status?: ContactMessageStatusType): Promise<number>;
}

export class PostgresContactRepository implements IContactRepository {
  private client: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client || PostgresDatabase.getPool();
  }

  public async createMessage(data: ICreateContactMessageData): Promise<IContactMessageRecord> {
    const query = `
      INSERT INTO contact_messages (
        name,
        email,
        subject,
        message,
        status,
        email_notification_status,
        email_notification_attempted_at,
        email_notification_error,
        ip_address,
        user_agent,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;
    `;
    const values = [
      data.name,
      data.email,
      data.subject,
      data.message,
      data.status || "new",
      data.email_notification_status || "not_configured",
      data.email_notification_attempted_at || null,
      data.email_notification_error || null,
      data.ip_address || null,
      data.user_agent || null,
    ];

    const result = await this.client.query<IContactMessageRecord>(query, values);
    return result.rows[0];
  }

  public async updateEmailNotification(
    id: string,
    update: {
      status: EmailNotificationStatusType;
      attemptedAt?: Date | string;
      error?: string | null;
    }
  ): Promise<boolean> {
    const query = `
      UPDATE contact_messages
      SET
        email_notification_status = $1,
        email_notification_attempted_at = COALESCE($2, NOW()),
        email_notification_error = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id;
    `;
    const result = await this.client.query(query, [
      update.status,
      update.attemptedAt || null,
      update.error || null,
      id,
    ]);
    return result.rowCount > 0;
  }

  public async findById(id: string): Promise<IContactMessageRecord | null> {
    const query = `
      SELECT *
      FROM contact_messages
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await this.client.query<IContactMessageRecord>(query, [id]);
    return result.rows[0] || null;
  }

  public async findAll(options: {
    page?: number;
    limit?: number;
    status?: ContactMessageStatusType;
  } = {}): Promise<{ messages: IContactMessageRecord[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const params: any[] = [];

    if (options.status) {
      params.push(options.status);
      whereConditions.push(`status = $${params.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) as total FROM contact_messages ${whereClause};`;
    const countResult = await this.client.query<{ total: string | number }>(countQuery, params);
    const total = Number(countResult.rows[0]?.total || 0);

    const dataQuery = `
      SELECT *
      FROM contact_messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;
    const dataResult = await this.client.query<IContactMessageRecord>(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    return {
      messages: dataResult.rows,
      total,
    };
  }

  public async updateStatus(id: string, status: ContactMessageStatusType): Promise<boolean> {
    const query = `
      UPDATE contact_messages
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id;
    `;
    const result = await this.client.query(query, [status, id]);
    return result.rowCount > 0;
  }

  public async count(status?: ContactMessageStatusType): Promise<number> {
    if (status) {
      const result = await this.client.query<{ count: string | number }>(
        `SELECT COUNT(*) as count FROM contact_messages WHERE status = $1;`,
        [status]
      );
      return Number(result.rows[0]?.count || 0);
    }
    const result = await this.client.query<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM contact_messages;`
    );
    return Number(result.rows[0]?.count || 0);
  }
}
