-- ============================================================================
-- MIGRATION 006: Independent Create Your Own Studio Architecture
-- ============================================================================
-- Purpose:
-- Establishes a completely independent relational schema for the Create Your Own Studio.
-- The Studio does NOT depend on the ordinary Product Catalogue (no product IDs,
-- product SKUs, or product categories required).
--
-- Safety & Preservation:
-- - Additive tables only. Does NOT drop or alter existing product catalogue tables.
-- - Migration 005 and products.bracelet_structure are preserved and isolated.
-- - Existing jewellery_types, studio_materials, and saved_designs are preserved.
-- ============================================================================

-- 1. STUDIO JEWELLERY CATEGORIES & NESTED SUBCATEGORIES
CREATE TABLE IF NOT EXISTS studio_categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id VARCHAR(36) REFERENCES studio_categories(id) ON DELETE RESTRICT,
    description TEXT,
    cover_image_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_categories_parent ON studio_categories (parent_id, display_order);
CREATE INDEX IF NOT EXISTS idx_studio_categories_slug ON studio_categories (slug);
CREATE INDEX IF NOT EXISTS idx_studio_categories_published ON studio_categories (is_published, is_active, display_order);

-- 2. INDEPENDENT CONSTRUCTION METHODS
CREATE TABLE IF NOT EXISTS studio_construction_methods (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    base_material_type VARCHAR(50) NOT NULL DEFAULT 'wire', -- e.g. 'elastic_cord', 'memory_wire', 'clasp_extension', 'beading_wire', 'custom'
    physical_specs_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- technical specs: wireThicknessMm, wireDiameterMm, actualWireLengthMm, turnsCount, innerDiameterMm, endLoopAllowanceMm, beadableLengthMm, sizeOptions (Small, Medium, Large) - ALL OPTIONAL
    endpoint_a_config JSONB NOT NULL DEFAULT '{"visible": true, "hasAssembly": true, "isCustomerSelectable": true, "isSelectionRequired": false, "allowedRoles": ["jump_ring", "lobster_clasp", "charm"]}'::jsonb,
    endpoint_b_config JSONB NOT NULL DEFAULT '{"visible": true, "hasAssembly": true, "isCustomerSelectable": true, "isSelectionRequired": false, "allowedRoles": ["jump_ring", "extension_chain", "end_charm"]}'::jsonb,
    allowed_component_roles TEXT[] NOT NULL DEFAULT '{"bead", "stone", "spacer", "charm", "clasp", "jump_ring", "extension_chain"}',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_methods_slug ON studio_construction_methods (slug);
CREATE INDEX IF NOT EXISTS idx_studio_methods_published ON studio_construction_methods (is_published, is_active, display_order);

-- 3. SUBCATEGORY <-> CONSTRUCTION METHOD MAPPING (Multiple methods per subcategory)
CREATE TABLE IF NOT EXISTS studio_subcategory_methods (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subcategory_id VARCHAR(36) NOT NULL REFERENCES studio_categories(id) ON DELETE CASCADE,
    construction_method_id VARCHAR(36) NOT NULL REFERENCES studio_construction_methods(id) ON DELETE CASCADE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_studio_subcat_method UNIQUE (subcategory_id, construction_method_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_subcat_methods_subcat ON studio_subcategory_methods (subcategory_id, is_published);
CREATE INDEX IF NOT EXISTS idx_studio_subcat_methods_method ON studio_subcategory_methods (construction_method_id);

-- 4. INDEPENDENT DESIGN RULES (Multi-rule management, assignable to categories & methods)
CREATE TABLE IF NOT EXISTS studio_design_rules (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(36) REFERENCES studio_categories(id) ON DELETE SET NULL,
    construction_method_id VARCHAR(36) REFERENCES studio_construction_methods(id) ON DELETE SET NULL,
    min_wrist_mm NUMERIC(6, 2), -- All dimensions completely optional
    max_wrist_mm NUMERIC(6, 2),
    min_components INTEGER,
    max_components INTEGER,
    max_charms INTEGER,
    fit_allowance_mm NUMERIC(6, 2),
    permitted_bead_sizes_mm NUMERIC(6, 2)[],
    allowed_material_types TEXT[],
    endpoint_assembly_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_rules_cat_method ON studio_design_rules (category_id, construction_method_id, is_published);

-- 5. MANUAL VISUAL ASSEMBLY STRUCTURES (Saved visual layouts for methods/subcategories)
CREATE TABLE IF NOT EXISTS studio_assembly_structures (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    subcategory_id VARCHAR(36) REFERENCES studio_categories(id) ON DELETE SET NULL,
    construction_method_id VARCHAR(36) NOT NULL REFERENCES studio_construction_methods(id) ON DELETE CASCADE,
    canvas_config JSONB NOT NULL DEFAULT '{"width": 500, "height": 500, "viewBox": "0 0 500 500"}'::jsonb,
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb, -- manual components placed by admin
    connections JSONB NOT NULL DEFAULT '[]'::jsonb, -- logical connections between nodes
    attachment_points JSONB NOT NULL DEFAULT '[]'::jsonb, -- charm slots & customer selection points
    endpoint_a JSONB NOT NULL DEFAULT '{"x": 180, "y": 80, "hangDirectionDeg": 90, "assembly": null}'::jsonb,
    endpoint_b JSONB NOT NULL DEFAULT '{"x": 320, "y": 80, "hangDirectionDeg": 90, "assembly": null}'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_assembly_method ON studio_assembly_structures (construction_method_id, subcategory_id, is_published);

-- 6. EXPLICIT MATERIAL LINKING (Between Studio Materials and Customization Materials)
CREATE TABLE IF NOT EXISTS studio_material_links (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_material_id VARCHAR(36) NOT NULL,
    studio_variant_sku VARCHAR(100),
    customization_material_id VARCHAR(36) NOT NULL,
    customization_variant_sku VARCHAR(100),
    authoritative_source VARCHAR(50) NOT NULL DEFAULT 'studio' CHECK (authoritative_source IN ('studio', 'customization', 'inventory')),
    consumption_qty INTEGER NOT NULL DEFAULT 1 CHECK (consumption_qty >= 1),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_studio_mat_link UNIQUE (studio_material_id, studio_variant_sku, customization_material_id, customization_variant_sku)
);

CREATE INDEX IF NOT EXISTS idx_studio_mat_link_studio ON studio_material_links (studio_material_id, studio_variant_sku);
CREATE INDEX IF NOT EXISTS idx_studio_mat_link_custom ON studio_material_links (customization_material_id, customization_variant_sku);

-- 7. STUDIO CUSTOM DESIGN ORDERS & SNAPSHOTS (Independent of product catalog)
CREATE TABLE IF NOT EXISTS studio_design_orders (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    order_id VARCHAR(36) REFERENCES orders(id) ON DELETE CASCADE,
    category_id VARCHAR(36) REFERENCES studio_categories(id) ON DELETE SET NULL,
    subcategory_id VARCHAR(36) REFERENCES studio_categories(id) ON DELETE SET NULL,
    construction_method_id VARCHAR(36) REFERENCES studio_construction_methods(id) ON DELETE SET NULL,
    assembly_structure_id VARCHAR(36) REFERENCES studio_assembly_structures(id) ON DELETE SET NULL,
    design_rule_id VARCHAR(36) REFERENCES studio_design_rules(id) ON DELETE SET NULL,
    base_material_sku VARCHAR(100),
    selected_size_label VARCHAR(100),
    physical_measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
    endpoint_a_selection JSONB NOT NULL DEFAULT '{}'::jsonb,
    endpoint_b_selection JSONB NOT NULL DEFAULT '{}'::jsonb,
    component_selections JSONB NOT NULL DEFAULT '[]'::jsonb,
    visual_structure_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_orders_user ON studio_design_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_orders_order ON studio_design_orders (order_id);

-- 8. VARIANT-SPECIFIC IMAGES, SELLER-RANDOM ASSORTMENTS, AND ALLOCATIONS
ALTER TABLE studio_material_variants
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS render_asset_url TEXT;

ALTER TABLE studio_materials
    ADD COLUMN IF NOT EXISTS selection_policy VARCHAR(50) NOT NULL DEFAULT 'customer_selects_variant',
    ADD COLUMN IF NOT EXISTS assortment_notes TEXT,
    ADD COLUMN IF NOT EXISTS eligible_assortment_skus TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE studio_design_rules
    ADD COLUMN IF NOT EXISTS charm_count_mode VARCHAR(50) NOT NULL DEFAULT 'total_units';

ALTER TABLE studio_design_orders
    ADD COLUMN IF NOT EXISTS allocated_variant_skus JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- ROLLBACK SCRIPT (Documented for safety; do not run in production):
-- ============================================================================
-- DROP TABLE IF EXISTS studio_design_orders;
-- DROP TABLE IF EXISTS studio_material_links;
-- DROP TABLE IF EXISTS studio_assembly_structures;
-- DROP TABLE IF EXISTS studio_design_rules;
-- DROP TABLE IF EXISTS studio_subcategory_methods;
-- DROP TABLE IF EXISTS studio_construction_methods;
-- DROP TABLE IF EXISTS studio_categories;
