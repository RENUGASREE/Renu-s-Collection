-- ============================================================================
-- Migration 005: Add Bracelet Structure to Products
-- ============================================================================
-- Allows products (specifically customizable bracelets) to store their independent
-- 2D structural arrangement: nodes (clasps, jump rings, extension chains, base wire),
-- logical connections, attachment points, and customer-selectable charm slots.

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS bracelet_structure JSONB DEFAULT NULL;
