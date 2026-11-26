/**
 * ============================================================================
 * Database Abstraction Types for Supabase PostgreSQL & Supabase Storage (Phase 1.1)
 * ============================================================================
 *
 * Identifier Strategy:
 * - EntityId: string representing either a 24-character hexadecimal MongoDB ObjectId
 *   (e.g., '6ae44c64900e0da3e5b0adf9') or a standard 36-character canonical UUID
 *   (e.g., 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11').
 * - Columns in PostgreSQL use VARCHAR(36) to seamlessly accommodate both formats.
 */

export type EntityId = string;

export interface IQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>>;
}

export interface IDbPool {
  query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>>;
  connect(): Promise<IDbPoolClient>;
  end(): Promise<void>;
}

export interface IDbPoolClient extends IDbClient {
  release(): void;
}

export interface ISupabaseStorageUploadResult {
  path: string;
  publicUrl: string;
  md5Hash?: string;
  bytesUploaded: number;
}

export interface ISupabaseStorageClient {
  uploadStream(
    bucket: string,
    path: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    expectedMd5?: string
  ): Promise<ISupabaseStorageUploadResult>;
  getPublicUrl(bucket: string, path: string): string;
  fileExists(bucket: string, path: string): Promise<boolean>;
  deleteFile?(bucket: string, path: string): Promise<boolean>;
  downloadFile?(bucket: string, path: string): Promise<Buffer>;
}

export interface IImageMappingRecord {
  mongodb_id: string; // 24-char hex MongoDB ObjectId (or 36-char UUID)
  filename: string;
  content_type: string;
  file_size_bytes: number;
  supabase_bucket: string;
  supabase_path: string;
  public_url: string;
  md5_hash?: string;
  is_referenced: boolean;
  migrated_at: Date;
  created_at: Date;
}

export interface ICategoryDbRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  product_type: string;
  image_url: string | null;
  is_active: boolean;
  show_in_menu: boolean;
  sort_order: number;
  customization_fields: any;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ICategoryRecord {
  id: string;
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  productType: string;
  imageUrl: string | null;
  isActive: boolean;
  showInMenu: boolean;
  sortOrder: number;
  customizationFields: any[];
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateCategoryData {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  productType: string;
  imageUrl?: string | null;
  isActive?: boolean;
  showInMenu?: boolean;
  sortOrder?: number;
  customizationFields?: any[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface IUpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  productType?: string;
  imageUrl?: string | null;
  isActive?: boolean;
  showInMenu?: boolean;
  sortOrder?: number;
  customizationFields?: any[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface IProductMedia {
  url: string;
  alt?: string;
  type: "image" | "video";
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface IProductDbRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string | null;
  category_id: string;
  subcategory_id: string | null;
  price: string | number;
  sale_price: string | number | null;
  currency: string;
  sku: string;
  stock: number;
  low_stock_threshold: number;
  weight_grams: string | number | null;
  material_info: string | null;
  care_instructions: string | null;
  additional_info: string | null;
  media: any;
  colors: string[];
  materials: string[];
  tags: string[];
  badge: string | null;
  is_signature_piece: boolean;
  signature_category: string;
  is_active: boolean;
  is_customizable: boolean;
  average_rating: string | number;
  review_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IProductRecord {
  id: string;
  _id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  subcategoryId: string | null;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  currency: string;
  sku: string;
  stock: number;
  isInStock: boolean;
  lowStockThreshold: number;
  weightGrams: number | null;
  materialInfo: string | null;
  careInstructions: string | null;
  additionalInfo: string | null;
  media: IProductMedia[];
  colors: string[];
  materials: string[];
  tags: string[];
  badge: string | null;
  isSignaturePiece: boolean;
  signatureCategory: string;
  isActive: boolean;
  isCustomizable: boolean;
  averageRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateProductData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  price: number;
  salePrice?: number | null;
  currency?: string;
  sku: string;
  stock?: number;
  lowStockThreshold?: number;
  weightGrams?: number | null;
  materialInfo?: string | null;
  careInstructions?: string | null;
  additionalInfo?: string | null;
  media?: IProductMedia[];
  colors?: string[];
  materials?: string[];
  tags?: string[];
  badge?: string | null;
  isSignaturePiece?: boolean;
  signatureCategory?: "fashion" | "trending" | "latest" | "none" | string;
  isActive?: boolean;
  isCustomizable?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

export interface IUpdateProductData {
  name?: string;
  slug?: string;
  description?: string;
  shortDescription?: string | null;
  categoryId?: string;
  subcategoryId?: string | null;
  price?: number;
  salePrice?: number | null;
  currency?: string;
  sku?: string;
  stock?: number;
  lowStockThreshold?: number;
  weightGrams?: number | null;
  materialInfo?: string | null;
  careInstructions?: string | null;
  additionalInfo?: string | null;
  media?: IProductMedia[];
  colors?: string[];
  materials?: string[];
  tags?: string[];
  badge?: string | null;
  isSignaturePiece?: boolean;
  signatureCategory?: "fashion" | "trending" | "latest" | "none" | string;
  isActive?: boolean;
  isCustomizable?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

export interface IInventoryLogDbRow {
  id: string;
  product_id: string;
  sku: string;
  action: string;
  quantity_change: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  order_id: string | null;
  performed_by: string | null;
  created_at: Date | string;
}

export interface IInventoryLogRecord {
  id: string;
  _id: string;
  productId: string;
  sku: string;
  action: "add" | "deduct" | "adjust" | "reserve" | "release" | "confirm";
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  orderId: string | null;
  performedBy: string | null;
  createdAt: Date;
}

export interface ICreateInventoryLogData {
  id?: string;
  productId: string;
  sku: string;
  action: "add" | "deduct" | "adjust" | "reserve" | "release" | "confirm";
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason?: string | null;
  orderId?: string | null;
  performedBy?: string | null;
}

export interface IInventoryLogFilterOptions {
  productId?: string;
  sku?: string;
  action?: "add" | "deduct" | "adjust" | "reserve" | "release" | "confirm";
  orderId?: string;
  performedBy?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface IInventorySummaryRecord {
  totalProducts: number;
  totalStockQuantity: number;
  outOfStockCount: number;
  lowStockCount: number;
  recentMovementsCount: number;
}

export interface IUserDbRow {
  id: string;
  email: string;
  username: string;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: "customer" | "admin";
  google_id: string | null;
  avatar_url: string | null;
  is_email_verified: boolean;
  refresh_token_hash: string | null;
  previous_refresh_token_hash: string | null;
  previous_refresh_token_expires_at: Date | string | null;
  password_reset_token: string | null;
  password_reset_expires: Date | string | null;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IUserRecord {
  id: string;
  _id: string;
  email: string;
  username: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: "customer" | "admin";
  googleId?: string;
  avatarUrl?: string;
  isEmailVerified: boolean;
  refreshTokenHash?: string;
  previousRefreshTokenHash?: string;
  previousRefreshTokenExpiresAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateUserData {
  id?: string;
  email: string;
  username: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: "customer" | "admin";
  googleId?: string;
  avatarUrl?: string;
  isEmailVerified?: boolean;
}

export interface IUpdateUserData {
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: "customer" | "admin";
  googleId?: string;
  avatarUrl?: string;
  isEmailVerified?: boolean;
  passwordHash?: string;
  refreshTokenHash?: string | null;
  previousRefreshTokenHash?: string | null;
  previousRefreshTokenExpiresAt?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  lastLoginAt?: Date | null;
}

export interface IUserAddressDbRow {
  id: string;
  user_id: string;
  label: string | null;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  is_default: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IUserAddressRecord {
  id: string;
  _id: string;
  userId: string;
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateAddressData {
  id?: string;
  userId: string;
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  phone: string;
  isDefault?: boolean;
}

export interface IUpdateAddressData {
  label?: string;
  fullName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  isDefault?: boolean;
}

// ============================================================================
// Shopping Carts & Items (Phase 3E)
// ============================================================================

export interface ICartDbRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  coupon_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ICartItemDbRow {
  id: string;
  cart_id: string;
  item_type: "product" | "custom_design";
  product_id: string | null;
  sku: string;
  name: string;
  image_url: string | null;
  unit_price: number | string;
  quantity: number;
  customization: any | null;
  studio_design: any | null;
  saved_for_later: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ICartRecord {
  id: string;
  _id: string;
  userId: string | null;
  sessionId: string | null;
  couponCode?: string | null;
  items: ICartItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICartItemRecord {
  id: string;
  _id: string;
  cartId: string;
  itemType: "product" | "custom_design";
  productId?: string | null;
  sku: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  customization?: any;
  studioDesign?: any;
  savedForLater: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateCartData {
  id?: string;
  userId?: string | null;
  sessionId?: string | null;
  couponCode?: string | null;
}

export interface ICreateCartItemData {
  id?: string;
  cartId: string;
  itemType?: "product" | "custom_design";
  productId?: string | null;
  sku: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity?: number;
  customization?: any;
  studioDesign?: any;
  savedForLater?: boolean;
}

export interface IUpdateCartItemData {
  quantity?: number;
  unitPrice?: number;
  customization?: any;
  studioDesign?: any;
  savedForLater?: boolean;
}

// ============================================================================
// Wishlist Items (Phase 3E)
// ============================================================================

export interface IWishlistItemDbRow {
  id: string;
  user_id: string;
  product_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  product_name?: string | null;
  product_sku?: string | null;
  product_price?: number | string | null;
  product_sale_price?: number | string | null;
  product_media?: any | null;
  product_stock?: number | null;
  product_is_active?: boolean | null;
}

export interface IWishlistItemRecord {
  id: string;
  _id: string;
  userId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    _id: string;
    name: string;
    sku: string;
    price: number;
    salePrice?: number | null;
    media: any[];
    stock: number;
    isActive: boolean;
  };
}

// ============================================================================
// Orders & Order Items (Phase 3F)
// ============================================================================

export interface IOrderDbRow {
  id: string;
  order_number: string;
  user_id: string | null;
  status: string;
  payment_status: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  shipping: number | string;
  total: number | string;
  currency: string;
  coupon_code: string | null;
  shipping_address: any;
  billing_address: any | null;
  email: string;
  phone: string;
  notes: string | null;
  payment_method: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  tracking_number: string | null;
  invoice_url: string | null;
  status_history: any;
  fulfillment_status: string;
  fulfillment_errors: string[] | null;
  deducted_item_ids: string[] | null;
  coupon_processed: boolean;
  cart_cleared: boolean;
  idempotency_key: string | null;
  checkout_fingerprint: string | null;
  studio_reservation_id: string | null;
  studio_reservation_status: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IOrderItemDbRow {
  id: string;
  order_id: string;
  item_type: string;
  product_id: string | null;
  sku: string;
  name: string;
  image_url: string | null;
  unit_price: number | string;
  quantity: number;
  subtotal: number | string;
  customization: any | null;
  studio_design: any | null;
  created_at: Date | string;
}

export interface IOrderItemRecord {
  id: string;
  _id: string;
  orderId: string;
  itemType: "product" | "custom_design";
  productId: string | null;
  sku: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  customization: any | null;
  studioDesign: any | null;
  createdAt: Date;
}

export interface IOrderRecord {
  id: string;
  _id: string;
  orderNumber: string;
  userId: string | null;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  couponCode: string | null;
  shippingAddress: any;
  billingAddress: any | null;
  email: string;
  phone: string;
  notes: string | null;
  paymentMethod: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  trackingNumber: string | null;
  invoiceUrl: string | null;
  statusHistory: Array<{
    status: string;
    note?: string;
    changedAt: Date | string;
    changedBy?: string;
  }>;
  fulfillmentStatus: "pending" | "completed" | "requires_action";
  fulfillmentErrors: string[];
  deductedItemIds: string[];
  couponProcessed: boolean;
  cartCleared: boolean;
  idempotencyKey: string | null;
  checkoutFingerprint: string | null;
  studioReservationId: string | null;
  studioReservationStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: IOrderItemRecord[];
}

export interface ICreateOrderData {
  id?: string;
  orderNumber: string;
  userId: string | null;
  status?: string;
  paymentStatus?: string;
  subtotal: number;
  discount?: number;
  tax?: number;
  shipping?: number;
  total: number;
  currency?: string;
  couponCode?: string | null;
  shippingAddress: any;
  billingAddress?: any | null;
  email: string;
  phone: string;
  notes?: string | null;
  paymentMethod?: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  trackingNumber?: string | null;
  invoiceUrl?: string | null;
  statusHistory?: any[];
  fulfillmentStatus?: string;
  fulfillmentErrors?: string[];
  deductedItemIds?: string[];
  couponProcessed?: boolean;
  cartCleared?: boolean;
  idempotencyKey?: string | null;
  checkoutFingerprint?: string | null;
  studioReservationId?: string | null;
  studioReservationStatus?: string | null;
}

export interface ICreateOrderItemData {
  id?: string;
  orderId?: string;
  itemType?: "product" | "custom_design";
  productId?: string | null;
  sku: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  customization?: any | null;
  studioDesign?: any | null;
}

export interface IUpdateOrderData {
  status?: string;
  paymentStatus?: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  trackingNumber?: string | null;
  invoiceUrl?: string | null;
  notes?: string | null;
  statusHistory?: any[];
  fulfillmentStatus?: string;
  fulfillmentErrors?: string[];
  deductedItemIds?: string[];
  couponProcessed?: boolean;
  cartCleared?: boolean;
  studioReservationId?: string | null;
  studioReservationStatus?: string | null;
}

/**
 * ============================================================================
 * Coupon Domain Types (Phase 3G)
 * ============================================================================
 */

export interface ICouponDbRow {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number | string;
  min_order_amount: number | string;
  max_discount: number | string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | Date | null;
  expires_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ICouponRecord {
  id: string;
  code: string;
  description?: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  startsAt?: Date | string;
  expiresAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateCouponData {
  id?: string;
  code: string;
  description?: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount?: number;
  isActive?: boolean;
  startsAt?: Date | string;
  expiresAt?: Date | string;
}

export interface IUpdateCouponData {
  code?: string;
  description?: string;
  type?: "percentage" | "fixed";
  value?: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount?: number;
  isActive?: boolean;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
}

export interface ICouponValidationResult {
  isValid: boolean;
  discount: number;
  coupon: ICouponRecord | null;
  error?: string;
}

/**
 * ============================================================================
 * Review Domain Types (Phase 3G)
 * ============================================================================
 */

export interface IReviewDbRow {
  id: string;
  user_id: string;
  product_id: string;
  order_id: string | null;
  rating: number;
  title: string;
  body: string;
  images: string[] | string;
  is_verified_purchase: boolean;
  is_approved: boolean;
  helpful_count: number;
  created_at: string | Date;
  updated_at: string | Date;
  user_username?: string | null;
  user_email?: string | null;
  product_name?: string | null;
}

export interface IReviewRecord {
  id: string;
  userId: string;
  productId: string;
  orderId?: string | null;
  rating: number;
  title: string;
  body: string;
  images: string[];
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  helpfulCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  user?: {
    username?: string;
    email?: string;
  };
  product?: {
    name?: string;
  };
}

export interface ICreateReviewData {
  id?: string;
  userId: string;
  productId: string;
  orderId?: string | null;
  rating: number;
  title: string;
  body: string;
  images?: string[];
  isVerifiedPurchase?: boolean;
  isApproved?: boolean;
  helpfulCount?: number;
}

export interface IUpdateReviewData {
  rating?: number;
  title?: string;
  body?: string;
  images?: string[];
  isApproved?: boolean;
  helpfulCount?: number;
}

export interface IProductRatingSummary {
  averageRating: number;
  reviewCount: number;
}

/**
 * ============================================================================
 * Studio Domain Types (Phase 3H)
 * ============================================================================
 */

export interface IComponentTypeRecord {
  id: string;
  _id?: string;
  typeId: string;
  displayName: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateComponentTypeData {
  id?: string;
  typeId: string;
  displayName: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IUpdateComponentTypeData {
  displayName?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IJewelleryTypeRecord {
  id: string;
  _id?: string;
  slug: string;
  displayName: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder: number;
  isEnabled: boolean;
  isPublished: boolean;
  isArchived: boolean;
  archivedAt?: Date | string | null;
  designerStatus: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateJewelleryTypeData {
  id?: string;
  slug: string;
  displayName: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number;
  isEnabled?: boolean;
  isPublished?: boolean;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  designerStatus?: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes?: string[];
}

export interface IUpdateJewelleryTypeData {
  displayName?: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number;
  isEnabled?: boolean;
  isPublished?: boolean;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  designerStatus?: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes?: string[];
}

export interface IStudioMaterialVariantRecord {
  id: string;
  _id?: string;
  materialId: string;
  sku: string;
  color?: string | null;
  finish?: string | null;
  sizeLabel: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  diameterMm?: number | null;
  holeDiameterMm?: number | null;
  attachmentSizeMm?: number | null;
  sellingUnit: "piece" | "pair" | "cm" | "unit";
  purchaseCost: number;
  sellingRate: number;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  dimensionsMm?: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    holeDiameter?: number;
    attachmentSize?: number;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateStudioMaterialVariantData {
  id?: string;
  materialId?: string;
  sku: string;
  color?: string | null;
  finish?: string | null;
  sizeLabel: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  diameterMm?: number | null;
  holeDiameterMm?: number | null;
  attachmentSizeMm?: number | null;
  sellingUnit?: "piece" | "pair" | "cm" | "unit";
  purchaseCost?: number;
  sellingRate: number;
  stock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  dimensionsMm?: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    holeDiameter?: number;
    attachmentSize?: number;
  };
}

export interface IUpdateStudioMaterialVariantData {
  sku?: string;
  color?: string | null;
  finish?: string | null;
  sizeLabel?: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  diameterMm?: number | null;
  holeDiameterMm?: number | null;
  attachmentSizeMm?: number | null;
  sellingUnit?: "piece" | "pair" | "cm" | "unit";
  purchaseCost?: number;
  sellingRate?: number;
  stock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  dimensionsMm?: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    holeDiameter?: number;
    attachmentSize?: number;
  };
}

export interface IStudioMaterialRecord {
  id: string;
  _id?: string;
  name: string;
  code: string;
  description?: string | null;
  materialType: string;
  imageUrl?: string | null;
  renderAssetUrl?: string | null;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  supportedConstructionTypes: string[];
  visibilityScopes: string[];
  isActive: boolean;
  sortOrder: number;
  variants: IStudioMaterialVariantRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateStudioMaterialData {
  id?: string;
  name: string;
  code: string;
  description?: string | null;
  materialType: string;
  imageUrl?: string | null;
  renderAssetUrl?: string | null;
  additionalImages?: string[];
  allowedJewelleryTypes?: string[];
  supportedConstructionTypes?: string[];
  visibilityScopes?: string[];
  isActive?: boolean;
  sortOrder?: number;
  variants?: ICreateStudioMaterialVariantData[];
}

export interface IUpdateStudioMaterialData {
  name?: string;
  code?: string;
  description?: string | null;
  materialType?: string;
  imageUrl?: string | null;
  renderAssetUrl?: string | null;
  additionalImages?: string[];
  allowedJewelleryTypes?: string[];
  supportedConstructionTypes?: string[];
  visibilityScopes?: string[];
  isActive?: boolean;
  sortOrder?: number;
  syncVariantSkus?: boolean;
}

export interface ICustomizationConfigRecord {
  id: string;
  _id?: string;
  name: string;
  productType: string;
  categoryId?: string | null;
  fields: any[];
  basePriceModifier: number;
  previewLayers: any[];
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateCustomizationConfigData {
  id?: string;
  name: string;
  productType: string;
  categoryId?: string | null;
  fields?: any[];
  basePriceModifier?: number;
  previewLayers?: any[];
  isActive?: boolean;
}

export interface IUpdateCustomizationConfigData {
  name?: string;
  productType?: string;
  categoryId?: string | null;
  fields?: any[];
  basePriceModifier?: number;
  previewLayers?: any[];
  isActive?: boolean;
}

export interface IMakingChargeRecord {
  id: string;
  _id?: string;
  jewelleryType: string;
  constructionType: string;
  baseFee: number;
  serviceCharges: Array<{
    name: string;
    fee: number;
    isOptional?: boolean;
    description?: string;
  }>;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IUpsertMakingChargeData {
  id?: string;
  jewelleryType: string;
  constructionType: string;
  baseFee: number;
  serviceCharges?: Array<{
    name: string;
    fee: number;
    isOptional?: boolean;
    description?: string;
  }>;
  isActive?: boolean;
}

export interface IDesignRuleRecord {
  id: string;
  _id?: string;
  jewelleryType: string;
  constructionType: string;
  minWristMm: number;
  maxWristMm: number;
  minComponents: number;
  maxComponents: number;
  permittedBeadSizesMm: number[];
  allowedMaterialTypes: string[];
  maxCharms: number;
  fitAllowanceMm: number;
  requiresReviewThresholds?: any;
  isActive: boolean;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IUpsertDesignRuleData {
  id?: string;
  jewelleryType: string;
  constructionType: string;
  minWristMm?: number;
  maxWristMm?: number;
  minComponents?: number;
  maxComponents?: number;
  permittedBeadSizesMm?: number[];
  allowedMaterialTypes?: string[];
  maxCharms?: number;
  fitAllowanceMm?: number;
  requiresReviewThresholds?: any;
  isActive?: boolean;
  version?: number;
}

export interface IDesignTemplateRecord {
  id: string;
  _id?: string;
  slug: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  jewelleryType: string;
  constructionType: string;
  wristMm: number;
  beadSequence: any[];
  charms: any[];
  isPublished: boolean;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateDesignTemplateData {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  jewelleryType?: string;
  constructionType?: string;
  wristMm?: number;
  beadSequence?: any[];
  charms?: any[];
  isPublished?: boolean;
  sortOrder?: number;
}

export interface IUpdateDesignTemplateData {
  name?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  jewelleryType?: string;
  constructionType?: string;
  wristMm?: number;
  beadSequence?: any[];
  charms?: any[];
  isPublished?: boolean;
  sortOrder?: number;
}

export interface ISavedDesignRecord {
  id: string;
  _id?: string;
  userId: string;
  name: string;
  jewelleryType: string;
  constructionType: string;
  wristMm: number;
  dimensionLabel?: string | null;
  beadSequence: any[];
  charms: any[];
  estimatedTotal: number;
  lastValidatedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateSavedDesignData {
  id?: string;
  userId: string;
  name: string;
  jewelleryType?: string;
  constructionType?: string;
  wristMm?: number;
  dimensionLabel?: string | null;
  beadSequence?: any[];
  charms?: any[];
  estimatedTotal?: number;
}

export interface IUpdateSavedDesignData {
  name?: string;
  jewelleryType?: string;
  constructionType?: string;
  wristMm?: number;
  dimensionLabel?: string | null;
  beadSequence?: any[];
  charms?: any[];
  estimatedTotal?: number;
}

export interface IStudioReservationItemRecord {
  id: string;
  _id?: string;
  reservationId: string;
  materialId?: string | null;
  materialName: string;
  sku: string;
  quantity: number;
}

export type StudioReservationStatusType =
  | "reserved"
  | "committed"
  | "released"
  | "restocked"
  | "reconciliation_required";

export interface IStudioReservationRecord {
  id: string;
  _id?: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  status: StudioReservationStatusType;
  reservedAt: Date | string;
  expiresAt: Date | string;
  committedAt?: Date | string | null;
  releasedAt?: Date | string | null;
  restockedAt?: Date | string | null;
  releaseReason?: string | null;
  reconciliationNotes?: string | null;
  items: IStudioReservationItemRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateStudioReservationData {
  id?: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  status?: StudioReservationStatusType;
  reservedAt?: Date | string;
  expiresAt: Date | string;
  committedAt?: Date | string | null;
  items: Array<{
    materialId?: string | null;
    materialName: string;
    sku: string;
    quantity: number;
  }>;
}

// ----------------------------------------------------------------------------
// Contact Message Records & Interfaces (Phase 3I)
// ----------------------------------------------------------------------------

export type ContactMessageStatusType = "new" | "read" | "replied" | "archived";
export type EmailNotificationStatusType = "sent" | "failed" | "not_configured";

export interface IContactMessageRecord {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactMessageStatusType;
  email_notification_status: EmailNotificationStatusType;
  email_notification_attempted_at?: Date | string | null;
  email_notification_error?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ICreateContactMessageData {
  id?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status?: ContactMessageStatusType;
  email_notification_status?: EmailNotificationStatusType;
  email_notification_attempted_at?: Date | string | null;
  email_notification_error?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}







