import slugify from "slugify";
import { Types } from "mongoose";

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

/** 24-character lowercase hexadecimal MongoDB ObjectId (strict — rejects 12-byte strings). */
const MONGO_OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/** 36-character canonical UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `true` if `id` is a valid 24-char hex MongoDB ObjectId OR a valid
 * 36-char canonical UUID.  Never silently generates a replacement ID.
 */
export function isValidEntityId(id: string): boolean {
  return MONGO_OBJECT_ID_RE.test(id) || UUID_RE.test(id);
}

/**
 * Throws an `Error` with `statusCode: 400` if `id` is not a valid entity ID.
 * Uses a plain Error (not `AppError`) to avoid a circular import between
 * helpers and errorHandler.
 */
export function assertValidEntityId(id: string, fieldName = "id"): void {
  if (!isValidEntityId(id)) {
    const err = Object.assign(
      new Error(
        `Invalid ${fieldName}: must be a 24-character hex ObjectId or a 36-character UUID`
      ),
      { statusCode: 400 }
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Existing helpers (unchanged)
// ---------------------------------------------------------------------------

export function toSlug(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true });
}

export function parseObjectId(id: string, fieldName = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return new Types.ObjectId(id);
}

export function paginate(page: number, limit: number) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

export function generateOrderNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `RL${stamp}${rand}`;
}

export function generateSku(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}
