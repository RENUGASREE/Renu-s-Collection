-- ============================================================================
-- Renu's Collections – Supabase PostgreSQL Initial Migration Schema (Phase 1.1)
-- Migration: 001_initial_schema.sql
-- Database Target: Supabase PostgreSQL (PostgreSQL 15+)
-- Storage Target: Supabase Storage ('product-images' bucket)
--
-- Identifier Strategy (Phase 1.1 Hardened):
-- 1. All primary keys and corresponding foreign keys use VARCHAR(36).
--    - Accommodates migrated 24-character MongoDB hexadecimal ObjectIds verbatim
--      (e.g., '6ae44c64900e0da3e5b0adf9').
--    - Accommodates standard 36-character canonical UUIDs for future records
--      (e.g., 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11').
--    - New records default to gen_random_uuid()::text.
-- 2. Foreign keys maintain strict relational integrity with ON DELETE clauses.
-- 3. Strict UNIQUE constraints are enforced on SKU, codes, slugs, and emails.
-- 4. Monetary amounts use NUMERIC(10, 2) for exact decimal calculations.
-- 5. Timestamps use TIMESTAMPTZ with default NOW().
-- 6. Complex historical snapshots (order item customizations, studio snapshots)
--    use JSONB for historical immutability.
-- ============================================================================

-- Ensure required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS & ADDRESSES (Authoritative Custom JWT Authentication)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    google_id VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    refresh_token_hash VARCHAR(255),
    previous_refresh_token_hash VARCHAR(255),
    previous_refresh_token_expires_at TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role_created ON users (role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS user_addresses (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50),
    full_name VARCHAR(100) NOT NULL,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(10) NOT NULL DEFAULT 'IN',
    phone VARCHAR(50) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses (user_id);

-- ============================================================================
-- 2. CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    parent_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    product_type VARCHAR(50) NOT NULL CHECK (product_type IN ('bracelet', 'earring', 'bangle', 'other')),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    show_in_menu BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    customization_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo_title VARCHAR(255),
    seo_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_active_menu ON categories (is_active, show_in_menu, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_product_type ON categories (product_type);

-- ============================================================================
-- 3. PRODUCTS & MEDIA
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    short_description TEXT,
    category_id VARCHAR(36) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    subcategory_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    sale_price NUMERIC(10, 2) CHECK (sale_price IS NULL OR sale_price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    sku VARCHAR(100) UNIQUE NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    weight_grams NUMERIC(8, 2),
    material_info TEXT,
    care_instructions TEXT,
    additional_info TEXT,
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    colors TEXT[] NOT NULL DEFAULT '{}',
    materials TEXT[] NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    badge VARCHAR(50),
    is_signature_piece BOOLEAN NOT NULL DEFAULT FALSE,
    signature_category VARCHAR(50) NOT NULL DEFAULT 'none' CHECK (signature_category IN ('fashion', 'trending', 'latest', 'none')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_customizable BOOLEAN NOT NULL DEFAULT TRUE,
    average_rating NUMERIC(3, 2) NOT NULL DEFAULT 0.00 CHECK (average_rating >= 0 AND average_rating <= 5),
    review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category_active ON products (category_id, is_active, price);
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON products (is_active, stock);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_signature ON products (is_signature_piece, is_active);
CREATE INDEX IF NOT EXISTS idx_products_average_rating ON products (average_rating DESC);

CREATE TABLE IF NOT EXISTS product_media (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (type IN ('image', 'video')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_media_product_id ON product_media (product_id, sort_order);

-- ============================================================================
-- 4. STUDIO FOUNDATION: COMPONENT TYPES & JEWELLERY TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_types (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_component_types_active_order ON component_types (is_active, display_order);

CREATE TABLE IF NOT EXISTS jewellery_types (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    designer_status VARCHAR(50) NOT NULL DEFAULT 'coming_soon' CHECK (designer_status IN ('available', 'coming_soon', 'maintenance')),
    supported_construction_types TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jewellery_types_published ON jewellery_types (is_published, is_archived, display_order);
CREATE INDEX IF NOT EXISTS idx_jewellery_types_enabled ON jewellery_types (is_enabled, display_order);

-- ============================================================================
-- 5. STUDIO MATERIALS & VARIANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS studio_materials (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    material_type VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,
    render_asset_url TEXT,
    additional_images TEXT[] NOT NULL DEFAULT '{}',
    allowed_jewellery_types TEXT[] NOT NULL DEFAULT '{}',
    supported_construction_types TEXT[] NOT NULL DEFAULT '{}',
    visibility_scopes TEXT[] NOT NULL DEFAULT '{"studio"}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_materials_type ON studio_materials (material_type, is_active);
CREATE INDEX IF NOT EXISTS idx_studio_materials_code ON studio_materials (code);

CREATE TABLE IF NOT EXISTS studio_material_variants (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    material_id VARCHAR(36) NOT NULL REFERENCES studio_materials(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(100),
    finish VARCHAR(100),
    size_label VARCHAR(50) NOT NULL,
    length_mm NUMERIC(6, 2),
    width_mm NUMERIC(6, 2),
    height_mm NUMERIC(6, 2),
    diameter_mm NUMERIC(6, 2),
    hole_diameter_mm NUMERIC(6, 2),
    attachment_size_mm NUMERIC(6, 2),
    selling_unit VARCHAR(20) NOT NULL DEFAULT 'piece' CHECK (selling_unit IN ('piece', 'pair', 'cm', 'unit')),
    purchase_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
    selling_rate NUMERIC(10, 2) NOT NULL CHECK (selling_rate >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_variants_material ON studio_material_variants (material_id);
CREATE INDEX IF NOT EXISTS idx_studio_variants_sku ON studio_material_variants (sku);
CREATE INDEX IF NOT EXISTS idx_studio_variants_stock ON studio_material_variants (is_active, stock);

-- ============================================================================
-- 6. CUSTOMIZATION CONFIGS & RULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS customization_configs (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    product_type VARCHAR(50) NOT NULL CHECK (product_type IN ('bracelet', 'earring', 'bangle', 'other')),
    category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    base_price_modifier NUMERIC(10, 2) NOT NULL DEFAULT 0,
    preview_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customization_configs ON customization_configs (product_type, category_id, is_active);

CREATE TABLE IF NOT EXISTS making_charges (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    jewellery_type VARCHAR(50) NOT NULL,
    construction_type VARCHAR(50) NOT NULL,
    base_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
    service_charges JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_making_charges_jewellery_construction UNIQUE (jewellery_type, construction_type)
);

CREATE TABLE IF NOT EXISTS design_rules (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    jewellery_type VARCHAR(50) NOT NULL,
    construction_type VARCHAR(50) NOT NULL,
    min_wrist_mm NUMERIC(6, 2) NOT NULL DEFAULT 130,
    max_wrist_mm NUMERIC(6, 2) NOT NULL DEFAULT 230,
    min_components INTEGER NOT NULL DEFAULT 12,
    max_components INTEGER NOT NULL DEFAULT 45,
    permitted_bead_sizes_mm NUMERIC(6, 2)[] NOT NULL DEFAULT '{4,6,8,10,12}',
    allowed_material_types TEXT[] NOT NULL DEFAULT '{"bead","stone","spacer","charm"}',
    max_charms INTEGER NOT NULL DEFAULT 5,
    fit_allowance_mm NUMERIC(6, 2) NOT NULL DEFAULT 10,
    requires_review_thresholds JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_design_rules_jewellery_construction UNIQUE (jewellery_type, construction_type)
);

-- ============================================================================
-- 7. DESIGN TEMPLATES & SAVED DESIGNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS design_templates (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    jewellery_type VARCHAR(50) NOT NULL DEFAULT 'bracelet',
    construction_type VARCHAR(50) NOT NULL DEFAULT 'elastic_bead',
    wrist_mm NUMERIC(6, 2) NOT NULL DEFAULT 160,
    bead_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
    charms JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_templates_published ON design_templates (is_published, sort_order);

CREATE TABLE IF NOT EXISTS saved_designs (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    jewellery_type VARCHAR(50) NOT NULL DEFAULT 'bracelet',
    construction_type VARCHAR(50) NOT NULL DEFAULT 'elastic_bead',
    wrist_mm NUMERIC(6, 2) NOT NULL DEFAULT 160,
    dimension_label VARCHAR(100),
    bead_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
    charms JSONB NOT NULL DEFAULT '[]'::jsonb,
    estimated_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    last_validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_designs_user ON saved_designs (user_id, created_at DESC);

-- ============================================================================
-- 8. ORDERS & ORDER ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
    shipping NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (shipping >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    coupon_code VARCHAR(50),
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    notes TEXT,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    tracking_number VARCHAR(100),
    invoice_url TEXT,
    status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    fulfillment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'completed', 'requires_action')),
    fulfillment_errors TEXT[] NOT NULL DEFAULT '{}',
    deducted_item_ids TEXT[] NOT NULL DEFAULT '{}',
    coupon_processed BOOLEAN NOT NULL DEFAULT FALSE,
    cart_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key VARCHAR(100),
    checkout_fingerprint VARCHAR(100),
    studio_reservation_id VARCHAR(36),
    studio_reservation_status VARCHAR(50) CHECK (studio_reservation_status IS NULL OR studio_reservation_status IN ('reserved', 'committed', 'released', 'restocked', 'reconciliation_required')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order ON orders (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'custom_design')),
    product_id VARCHAR(36) REFERENCES products(id) ON DELETE SET NULL,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    customization JSONB,
    studio_design JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items (sku);

-- ============================================================================
-- 9. STUDIO RESERVATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS studio_reservations (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id VARCHAR(36) UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released', 'restocked', 'reconciliation_required')),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    restocked_at TIMESTAMPTZ,
    release_reason TEXT,
    reconciliation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_reservations_status_expires ON studio_reservations (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_studio_reservations_user ON studio_reservations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_reservations_order_num ON studio_reservations (order_number);

-- Add foreign key constraint back from orders to studio_reservations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_studio_reservation'
    ) THEN
        ALTER TABLE orders
        ADD CONSTRAINT fk_orders_studio_reservation
        FOREIGN KEY (studio_reservation_id) REFERENCES studio_reservations(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS studio_reservation_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reservation_id VARCHAR(36) NOT NULL REFERENCES studio_reservations(id) ON DELETE CASCADE,
    material_id VARCHAR(36) REFERENCES studio_materials(id) ON DELETE SET NULL,
    material_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1)
);

CREATE INDEX IF NOT EXISTS idx_reservation_items_res_id ON studio_reservation_items (reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_items_sku ON studio_reservation_items (sku);

-- ============================================================================
-- 10. SHOPPING CARTS & ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS carts (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100),
    coupon_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_user_id ON carts(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_session_id ON carts(session_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cart_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    cart_id VARCHAR(36) NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'custom_design')),
    product_id VARCHAR(36) REFERENCES products(id) ON DELETE SET NULL,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    customization JSONB DEFAULT '{}'::jsonb,
    studio_design JSONB,
    saved_for_later BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id, saved_for_later);

-- ============================================================================
-- 11. WISHLIST, REVIEWS, COUPONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS wishlist_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wishlist_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items (user_id);

CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id VARCHAR(36) REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    images TEXT[] NOT NULL DEFAULT '{}',
    is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    helpful_count INTEGER NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reviews_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_approved ON reviews (product_id, is_approved, created_at DESC);

CREATE TABLE IF NOT EXISTS coupons (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
    value NUMERIC(10, 2) NOT NULL CHECK (value >= 0),
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
    max_discount NUMERIC(10, 2) CHECK (max_discount IS NULL OR max_discount >= 0),
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code_active ON coupons (code, is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_expires ON coupons (expires_at);

-- ============================================================================
-- 12. INVENTORY AUDIT LOGS & CONTACT MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_logs (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('add', 'deduct', 'adjust', 'reserve', 'release')),
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reason TEXT,
    order_id VARCHAR(36) REFERENCES orders(id) ON DELETE SET NULL,
    performed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product ON inventory_logs (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_sku ON inventory_logs (sku, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON inventory_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
    email_notification_status VARCHAR(50) NOT NULL DEFAULT 'not_configured' CHECK (email_notification_status IN ('sent', 'failed', 'not_configured')),
    email_notification_attempted_at TIMESTAMPTZ,
    email_notification_error TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status);

-- ============================================================================
-- 13. MIGRATION FOUNDATION & IMAGE STORAGE MAPPING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS image_mappings (
    mongodb_id VARCHAR(36) PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    supabase_bucket VARCHAR(100) NOT NULL DEFAULT 'product-images',
    supabase_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    md5_hash VARCHAR(32),
    is_referenced BOOLEAN NOT NULL DEFAULT TRUE,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_mappings_path ON image_mappings (supabase_path);
CREATE INDEX IF NOT EXISTS idx_image_mappings_referenced ON image_mappings (is_referenced);

-- ============================================================================
-- 14. AUTOMATIC UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
          AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON %I;
            CREATE TRIGGER trg_set_updated_at_%I
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at_timestamp();
        ', t, t, t, t);
    END LOOP;
END $$;
