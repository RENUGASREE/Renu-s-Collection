import { apiRequest } from "@/lib/queryClient";

// ============================================================================
// SHARED TYPES — mirror the public projection from studio.service.ts
// ============================================================================

export interface PublicDimensions {
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
  holeDiameterMm?: number;
  attachmentSizeMm?: number;
}

export interface PublicVariant {
  sku: string;
  color?: string;
  finish?: string;
  sizeLabel: string;
  dimensionsMm: PublicDimensions;
  sellingUnit: string;
  sellingRate: number;
  inStock: boolean;
  stock?: number;
}

export interface PublicMaterial {
  id: string;
  name: string;
  code: string;
  description?: string;
  materialType: string;
  imageUrl: string;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  sortOrder: number;
  variants: PublicVariant[];
}

export interface DesignRule {
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
  isActive: boolean;
}

export interface ServiceCharge {
  name: string;
  fee: number;
  isOptional: boolean;
  description?: string;
}

export interface MakingChargeConfig {
  jewelleryType: string;
  constructionType: string;
  baseFee: number;
  serviceCharges: ServiceCharge[];
  isActive: boolean;
}

export interface PriceBreakdownItem {
  materialId: string;
  materialName: string;
  materialCode: string;
  materialType: string;
  variantSku: string;
  sizeLabel: string;
  color?: string;
  finish?: string;
  sellingUnit: string;
  unitRate: number;
  quantity: number;
  subtotal: number;
  imageUrl: string;
  renderAssetUrl?: string;
}

export interface DesignPriceQuote {
  jewelleryType: string;
  constructionType: string;
  items: PriceBreakdownItem[];
  totalComponentQuantity: number;
  componentSubtotal: number;
  makingCharge: {
    baseFee: number;
    selectedServiceCharges: Array<{ name: string; fee: number }>;
    totalMakingFee: number;
  };
  totalPrice: number;
  currency: string;
  calculatedAt: string;
  isProvisionalQuote: boolean;
  isPurchasable: boolean;
  status: string;
  disclaimer: string;
}

export interface ComponentInput {
  variantSku: string;
  quantity: number;
}

// ============================================================================
// API FETCH FUNCTIONS
// ============================================================================

export async function fetchBraceletMaterials(): Promise<PublicMaterial[]> {
  const res = await apiRequest(
    "GET",
    "/api/v1/studio/materials?jewelleryType=bracelet&limit=100"
  );
  if (!res.ok) throw new Error(`Materials fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("Materials API returned failure");
  return json.data as PublicMaterial[];
}

export async function fetchBraceletDesignRule(): Promise<DesignRule> {
  const res = await apiRequest(
    "GET",
    "/api/v1/studio/rules/bracelet/elastic_bead"
  );
  if (!res.ok) throw new Error(`Design rule fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("Design rule API returned failure");
  return json.data as DesignRule;
}

export async function fetchBraceletMakingCharge(): Promise<MakingChargeConfig> {
  const res = await apiRequest(
    "GET",
    "/api/v1/studio/making-charges/bracelet/elastic_bead"
  );
  if (!res.ok) throw new Error(`Making charge fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("Making charge API returned failure");
  return json.data as MakingChargeConfig;
}

export interface JewelleryTypeReadiness {
  slug: string;
  displayName: string;
  description?: string;
  designerStatus: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes: string[];
  eligibleMaterialCount: number;
  hasDesignRule: boolean;
  hasMakingCharge: boolean;
  templateCount: number;
  isFullyReady: boolean;
  gapAnalysis: {
    materialsStatus: "stocked" | "lacking_catalogue_components";
    materialsDetail: string;
    rulesStatus: "active" | "missing_construction_rule";
    pricingStatus: "active" | "missing_craftsmanship_fee";
    summary: string;
  };
}

export async function fetchJewelleryTypesReadiness(): Promise<JewelleryTypeReadiness[]> {
  const res = await apiRequest("GET", "/api/v1/studio/jewellery-types/readiness");
  if (!res.ok) throw new Error(`Readiness check failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("Failed to load studio readiness report");
  return json.data as JewelleryTypeReadiness[];
}

export async function fetchMaterialsForType(jewelleryType: string): Promise<PublicMaterial[]> {
  const res = await apiRequest(
    "GET",
    `/api/v1/studio/materials?jewelleryType=${encodeURIComponent(jewelleryType)}&limit=100`
  );
  if (!res.ok) throw new Error(`Materials fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("Materials API returned failure");
  return json.data as PublicMaterial[];
}

export async function fetchDesignRuleForType(
  jewelleryType: string,
  constructionType: string
): Promise<DesignRule | null> {
  const res = await apiRequest(
    "GET",
    `/api/v1/studio/rules/${encodeURIComponent(jewelleryType)}/${encodeURIComponent(constructionType)}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data as DesignRule) || null;
}

export async function fetchMakingChargeForType(
  jewelleryType: string,
  constructionType: string
): Promise<MakingChargeConfig | null> {
  const res = await apiRequest(
    "GET",
    `/api/v1/studio/making-charges/${encodeURIComponent(jewelleryType)}/${encodeURIComponent(constructionType)}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data as MakingChargeConfig) || null;
}

export async function fetchPriceQuote(
  components: ComponentInput[]
): Promise<DesignPriceQuote> {
  const res = await apiRequest("POST", "/api/v1/studio/price-quote", {
    jewelleryType: "bracelet",
    constructionType: "elastic_bead",
    components,
    selectedServiceCharges: [],
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      (errJson as any).message || `Price quote failed: ${res.status}`
    );
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Price quote API failure");
  return json.data as DesignPriceQuote;
}

// ============================================================================
// MILESTONE 3: SAVED DESIGNS & TEMPLATES API
// ============================================================================

export interface SavedDesignBead {
  materialId: string;
  variantSku: string;
  displayName: string;
  diameterMm: number;
  imageUrl: string;
}

export interface SavedDesignCharm {
  instanceId: string;
  anchorInstanceId: string;
  materialId: string;
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface SavedDesign {
  _id: string;
  name: string;
  jewelleryType: "bracelet";
  constructionType: "elastic_bead";
  wristMm: number;
  beadSequence: SavedDesignBead[];
  charms: SavedDesignCharm[];
  estimatedTotal: number;
  lastValidatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateBead {
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface TemplateCharm {
  anchorVariantSku: string;
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface DesignTemplate {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  jewelleryType: "bracelet";
  constructionType: "elastic_bead";
  wristMm: number;
  beadSequence: TemplateBead[];
  charms: TemplateCharm[];
  isPublished: boolean;
  sortOrder: number;
}

export interface AddToCartPayload {
  savedDesignId?: string;
  name: string;
  jewelleryType: "bracelet";
  constructionType: "elastic_bead";
  wristMm: number;
  quantity?: number;
  imageUrl?: string;
  beadSequence: SavedDesignBead[];
  charms?: SavedDesignCharm[];
  selectedServiceCharges?: string[];
}

export async function fetchSavedDesigns(): Promise<SavedDesign[]> {
  const res = await apiRequest("GET", "/api/v1/studio/my-designs");
  if (!res.ok) throw new Error(`Fetch saved designs failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Saved designs fetch error");
  return json.data as SavedDesign[];
}

export async function fetchSavedDesign(id: string): Promise<SavedDesign> {
  const res = await apiRequest("GET", `/api/v1/studio/my-designs/${id}`);
  if (!res.ok) throw new Error(`Fetch design failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Design fetch error");
  return json.data as SavedDesign;
}

export async function saveDesign(payload: {
  name: string;
  jewelleryType: "bracelet";
  constructionType: "elastic_bead";
  wristMm: number;
  beadSequence: SavedDesignBead[];
  charms?: SavedDesignCharm[];
  estimatedTotal?: number;
}): Promise<SavedDesign> {
  const res = await apiRequest("POST", "/api/v1/studio/my-designs", payload);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Save design failed: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Save design error");
  return json.data as SavedDesign;
}

export async function updateSavedDesign(
  id: string,
  payload: Partial<SavedDesign>
): Promise<SavedDesign> {
  const res = await apiRequest("PATCH", `/api/v1/studio/my-designs/${id}`, payload);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Update design failed: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Update design error");
  return json.data as SavedDesign;
}

export async function deleteSavedDesign(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/my-designs/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Delete design failed: ${res.status}`);
  }
}

export async function fetchDesignTemplates(): Promise<DesignTemplate[]> {
  const res = await apiRequest("GET", "/api/v1/studio/templates");
  if (!res.ok) throw new Error(`Fetch templates failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Templates fetch error");
  return json.data as DesignTemplate[];
}

export async function addCustomDesignToCart(payload: AddToCartPayload): Promise<any> {
  const res = await apiRequest("POST", "/api/v1/studio/cart/add", payload);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Add to cart failed: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Add to cart error");
  return json.data;
}

// ============================================================================
// AI DESIGN ASSISTANT TYPES & API
// ============================================================================

export interface AIDesignPromptInput {
  prompt: string;
  occasion?: string;
  colorTheme?: string;
  budget?: number;
  style?: string;
  wristMm?: number;
}

export interface SuggestionBead {
  variantSku: string;
  materialId: string;
  displayName: string;
  diameterMm: number;
  color?: string;
  imageUrl?: string;
  renderAssetUrl?: string;
}

export interface SuggestionCharm {
  variantSku: string;
  materialId: string;
  displayName: string;
  anchorIndex: number;
  imageUrl?: string;
  renderAssetUrl?: string;
}

export interface AIDesignSuggestion {
  id: string;
  name: string;
  tagline: string;
  description: string;
  matchReason: string;
  style: string;
  occasion: string;
  colorTheme: string;
  wristMm: number;
  isAiGenerated?: boolean;
  beadSequence: SuggestionBead[];
  charms: SuggestionCharm[];
  pricingQuote: {
    baseMakingCharge: number;
    componentSubtotal: number;
    totalPrice: number;
    breakdown: Array<{
      variantSku: string;
      materialName: string;
      quantity: number;
      unitRate: number;
      subtotal: number;
    }>;
  };
  fitSummary: {
    beadCount: number;
    estimatedCircumferenceMm: number;
    targetCircumferenceMm: number;
    isCompliantWithRules: boolean;
  };
}

export async function fetchAIDesignSuggestions(
  payload: AIDesignPromptInput
): Promise<AIDesignSuggestion[]> {
  const res = await apiRequest("POST", "/api/v1/studio/ai/suggestions", payload);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `AI design assistant error: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Failed to generate AI suggestions");
  return json.data as AIDesignSuggestion[];
}


