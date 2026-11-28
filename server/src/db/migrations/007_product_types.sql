-- Migration 007: Product Types Management Table and Category Foreign Key
-- Established for Renu's Collections Product Catalogue

CREATE TABLE IF NOT EXISTS product_types (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique indexes for name and slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_types_name_lower ON product_types (LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_types_slug_lower ON product_types (LOWER(slug));
CREATE INDEX IF NOT EXISTS idx_product_types_active_order ON product_types (is_active, display_order);

-- Initial 6 Master Records (One-time migration seed, idempotent)
INSERT INTO product_types (name, slug, description, display_order, is_active)
VALUES 
    ('Bracelet', 'bracelet', 'Wrist jewellery including bangles, cuff and charm bracelets', 1, TRUE),
    ('Chain', 'chain', 'Fine metal, link, and cable chains', 2, TRUE),
    ('Necklace', 'necklace', 'Pendant necklaces, chokers, and collar pieces', 3, TRUE),
    ('Earring', 'earring', 'Studs, drops, hoops, and dangle earrings', 4, TRUE),
    ('Ring', 'ring', 'Bands, gemstone rings, and statement rings', 5, TRUE),
    ('Other', 'other', 'Accessories, brooches, and miscellaneous collections', 6, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Drop restrictive hardcoded check constraint from categories if present
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_product_type_check;

-- Relate categories to product_types via foreign key on slug
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_product_type'
    ) THEN
        ALTER TABLE categories 
            ADD CONSTRAINT fk_categories_product_type 
            FOREIGN KEY (product_type) REFERENCES product_types(slug) 
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
