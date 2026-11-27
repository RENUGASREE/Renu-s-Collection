// ============================================================================
// INDEPENDENT CREATE YOUR OWN STUDIO TYPES (FRONTEND)
// ============================================================================

export interface IStudioCategory {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
  subcategories?: IStudioCategory[];
  depth?: number;
  path?: string;
}

export interface PhysicalSpecsConfig {
  cordDiameterMm?: number | null;
  chainLengthMm?: number | null;
  wireThicknessMm?: number | null;
  wireDiameterMm?: number | null;
  actualWireLengthMm?: number | null;
  turnsCount?: number | null;
  innerDiameterMm?: number | null;
  endLoopAllowanceMm?: number | null;
  beadableLengthMm?: number | null;
  sizeOptions?: Array<{
    id?: string;
    name: string;
    innerDiameterMm?: number | null;
    actualLengthMm?: number | null;
    isPublished?: boolean;
    description?: string;
  }>;
  customFields?: Record<string, any>;
}

export interface EndpointConfig {
  visible: boolean;
  hasAssembly: boolean;
  isCustomerSelectable: boolean;
  isSelectionRequired: boolean;
  label?: string;
  allowedRoles: string[];
  defaultComponentSku?: string | null;
  position?: { x: number; y: number };
  hangDirectionDeg?: number;
}

export interface IStudioConstructionMethod {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  baseMaterialType: string;
  physicalSpecsConfig: PhysicalSpecsConfig;
  endpointAConfig: EndpointConfig;
  endpointBConfig: EndpointConfig;
  allowedComponentRoles: string[];
  isPublished: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStudioDesignRule {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  constructionMethodId?: string | null;
  minWristMm?: number | null;
  maxWristMm?: number | null;
  minComponents?: number | null;
  maxComponents?: number | null;
  maxCharms?: number | null;
  charmCountMode?: 'total_units' | 'distinct_types';
  fitAllowanceMm?: number | null;
  permittedBeadSizesMm?: number[] | null;
  allowedMaterialTypes?: string[] | null;
  endpointAssemblyRules?: Record<string, any>;
  isPublished: boolean;
  isActive: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStudioDesignOrder {
  id: string;
  userId?: string | null;
  orderId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  constructionMethodId?: string | null;
  assemblyStructureId?: string | null;
  designRuleId?: string | null;
  baseMaterialSku?: string | null;
  selectedSizeLabel?: string | null;
  physicalMeasurements: Record<string, any>;
  endpointASelection: Record<string, any>;
  endpointBSelection: Record<string, any>;
  componentSelections: any[];
  visualStructureSnapshot: Record<string, any>;
  pricingSnapshot: Record<string, any>;
  allocatedVariantSkus?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStudioAssemblyStructure {
  id: string;
  name: string;
  subcategory_id?: string | null;
  subcategoryId?: string | null;
  construction_method_id?: string;
  constructionMethodId: string;
  canvasConfig: {
    width: number;
    height: number;
    viewBox: string;
  };
  nodes: Array<{
    id: string;
    role: string;
    displayName: string;
    materialId?: string | null;
    variantSku?: string | null;
    customAssetUrl?: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
    zIndex: number;
    visible: boolean;
    chainConfig?: {
      lengthMm: number;
      curvature: number;
      linkSpacingPx?: number;
      linkWidthPx?: number;
      linkHeightPx?: number;
      color?: string;
    };
    beadConfig?: {
      color?: string;
      finish?: string;
      diameterMm?: number;
    };
  }>;
  connections: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    connectionType?: string;
  }>;
  attachmentPoints: Array<{
    id: string;
    label: string;
    parentNodeId?: string | null;
    x: number;
    y: number;
    hangDirectionDeg: number;
    isCustomerSelectable: boolean;
    linkedFieldKey?: string | null;
    allowedMaterialIds?: string[];
    allowedVariantSkus?: string[];
    defaultVariantSku?: string | null;
    required?: boolean;
  }>;
  endpointA?: {
    x: number;
    y: number;
    hangDirectionDeg: number;
    assembly?: any;
  };
  endpointB?: {
    x: number;
    y: number;
    hangDirectionDeg: number;
    assembly?: any;
  };
  isPublished: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStudioMaterialLink {
  id: string;
  studioMaterialId: string;
  studioVariantSku?: string | null;
  customizationMaterialId: string;
  customizationVariantSku?: string | null;
  authoritativeSource: 'studio' | 'customization' | 'inventory';
  consumptionQty: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStudioInventoryVariantItem {
  id: string;
  sku: string;
  name: string;
  sizeLabel: string;
  color: string | null;
  finish: string | null;
  stockQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isActive: boolean;
  inventorySource: string;
  authoritativeSource: "studio" | "customization" | "inventory";
}

export interface IStudioInventoryMaterialItem {
  id: string;
  name: string;
  code: string;
  componentType: string;
  categories: string[];
  selectionPolicy: "customer_selects_variant" | "seller_random_variant";
  assortmentNotes?: string | null;
  eligibleAssortmentSkus?: string[];
  imageUrl?: string | null;
  isActive: boolean;
  isPublished: boolean;
  visibilityScopes: string[];
  variantCount: number;
  totalAvailableStock: number;
  totalReservedStock: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  inventorySource: string;
  authoritativeSource: "studio" | "customization" | "inventory";
  variants: IStudioInventoryVariantItem[];
}

export interface IStudioInventorySummary {
  totalMaterials: number;
  totalVariants: number;
  totalAvailableUnits: number;
  totalReservedUnits: number;
  outOfStockVariants: number;
  lowStockVariants: number;
}

export interface IStudioInventoryFilterOptions {
  search?: string;
  category?: string;
  componentType?: string;
  stockStatus?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  inventorySource?: string;
  status?: "all" | "active" | "inactive";
  published?: "all" | "published" | "unpublished";
}

export interface IStudioInventoryResponse {
  summary: IStudioInventorySummary;
  materials: IStudioInventoryMaterialItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
  componentTypes: Array<{ typeId: string; displayName: string }>;
  inventorySources: string[];
}

