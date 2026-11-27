export type StructureComponentRole =
  | "bracelet_base"
  | "elastic_cord"
  | "memory_wire"
  | "lobster_clasp"
  | "jump_ring"
  | "end_cap"
  | "extension_chain"
  | "extension_end_charm"
  | "decorative_charm"
  | "bead"
  | "custom";

export interface IStructureNode {
  id: string; // Stable UUID within this product structure
  role: StructureComponentRole;
  displayName: string;
  materialId?: string | null;
  variantSku?: string | null;
  customAssetUrl?: string | null;
  
  // Placement coordinates (normalized to 0-480 SVG space)
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  zIndex: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
  visible: boolean;

  // Extension chain parameters (if role === "extension_chain")
  chainConfig?: {
    lengthMm: number;        // e.g. 50mm
    curvature: number;       // drape curvature (positive = hangs downward)
    linkSpacingPx?: number;  // px between links (default 6)
    linkWidthPx?: number;    // width of each link (default 5)
    linkHeightPx?: number;   // height of each link (default 9)
    color?: string;          // e.g. "#D4BF90" / "#B76E79"
  };

  // Decorative charm or bead parameters
  beadConfig?: {
    diameterMm?: number;
    color?: string;
    finish?: string;
  };
}

export interface IComponentConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  connectionType?: "endpoint" | "jump_ring" | "chain_link" | "charm_drop";
}

export interface IAttachmentPoint {
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
  required?: boolean;
  allowMultiple?: boolean;
  defaultMaterialId?: string | null;
  defaultVariantSku?: string | null;
}

export interface IBraceletStructure {
  version: number;
  updatedAt: string;
  canvas: {
    width: number;
    height: number;
    viewBox: string;
  };
  baseType: "circular_bead" | "memory_wire" | "chain_link" | "open_cuff" | "custom";
  baseConfig?: {
    cordDiameterMm?: number;
    openGapAngleDeg?: number;
    rotationDeg?: number;
  };
  nodes: IStructureNode[];
  connections: IComponentConnection[];
  attachmentPoints: IAttachmentPoint[];
}
