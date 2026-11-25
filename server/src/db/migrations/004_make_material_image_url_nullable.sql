-- ============================================================================
-- Migration 004: Make Studio Material Image URL Nullable
-- ============================================================================
-- Allows creating and editing Studio materials without requiring a main/display
-- image upfront. Transparent render images remain optional.

ALTER TABLE studio_materials ALTER COLUMN image_url DROP NOT NULL;
ALTER TABLE studio_materials ALTER COLUMN image_url SET DEFAULT NULL;
