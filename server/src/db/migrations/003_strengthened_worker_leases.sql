-- ============================================================================
-- Migration 003: Strengthened Worker Leases and Fencing Tokens (Phase 3M.1)
-- ============================================================================
-- Adds explicit claim tokens and lease expiration timestamps to order fulfillment
-- and image deletion recovery queues. This guarantees:
-- 1. Atomic worker claiming across multiple instances with cryptographic fencing tokens.
-- 2. Clean recovery from worker crashes via explicit claim_expires_at timestamps.
-- 3. Fencing: expired workers whose lease was reclaimed are blocked from committing completion.
-- 4. Heartbeat/lease extension capability for long-running batch operations.

-- 1. Orders: Worker Fulfillment Lease & Fencing Token
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_lease 
    ON orders (fulfillment_status, claim_expires_at);

-- 2. Image Deletion Queue: Storage Deletion Lease & Fencing Token
ALTER TABLE image_deletion_queue
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_image_deletion_queue_lease 
    ON image_deletion_queue (claim_expires_at, attempts);
