-- ============================================================================
-- Migration 002: Durable Recovery Queues (Phase 3L)
-- ============================================================================
-- Adds a durable PostgreSQL queue for image storage deletion recovery to
-- guarantee that pending storage cleanups survive server restarts without
-- leaving orphaned files in Supabase Storage or stale mappings in the database.

CREATE TABLE IF NOT EXISTS image_deletion_queue (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    supabase_bucket VARCHAR(100) NOT NULL,
    supabase_path TEXT NOT NULL UNIQUE,
    mongodb_id VARCHAR(36),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_deletion_queue_path ON image_deletion_queue (supabase_path);
CREATE INDEX IF NOT EXISTS idx_image_deletion_queue_attempts ON image_deletion_queue (attempts);
