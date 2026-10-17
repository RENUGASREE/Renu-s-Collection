import mongoose, { Schema, Document, Model } from "mongoose";

export const STUDIO_MATERIAL_TYPES = [
  "bead",
  "stone",
  "spacer",
  "charm",
  "chain",
  "clasp",
  "pendant",
  "jewellery_base",
  "findings",
  "other",
] as const;

export type StudioMaterialType = (typeof STUDIO_MATERIAL_TYPES)[number];

export const SELLING_UNITS = ["piece", "pair", "cm", "unit"] as const;
export type SellingUnit = (typeof SELLING_UNITS)[number];

export interface IMaterialDimensions {
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
  holeDiameterMm?: number;
  attachmentSizeMm?: number;
}

export interface IMaterialVariant {
  sku: string;
  color?: string;
  finish?: string;
  sizeLabel: string;
  dimensionsMm: IMaterialDimensions;
  sellingUnit: SellingUnit;
  purchaseCost: number; // Private cost to business
  sellingRate: number;  // Direct customer selling price in INR
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface IStudioMaterial extends Document {
  name: string;
  code: string;
  description?: string;
  materialType: StudioMaterialType;
  imageUrl: string;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  isActive: boolean;
  sortOrder: number;
  variants: IMaterialVariant[];
  createdAt: Date;
  updatedAt: Date;
}

const dimensionsSchema = new Schema<IMaterialDimensions>(
  {
    lengthMm: { type: Number, min: 0 },
    widthMm: { type: Number, min: 0 },
    heightMm: { type: Number, min: 0 },
    diameterMm: { type: Number, min: 0 },
    holeDiameterMm: { type: Number, min: 0 },
    attachmentSizeMm: { type: Number, min: 0 },
  },
  { _id: false }
);

const variantSchema = new Schema<IMaterialVariant>(
  {
    sku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    color: { type: String, trim: true },
    finish: { type: String, trim: true },
    sizeLabel: { type: String, required: true, trim: true },
    dimensionsMm: { type: dimensionsSchema, default: () => ({}) },
    sellingUnit: {
      type: String,
      enum: SELLING_UNITS,
      default: "piece",
    },
    purchaseCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sellingRate: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const studioMaterialSchema = new Schema<IStudioMaterial>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    materialType: {
      type: String,
      enum: STUDIO_MATERIAL_TYPES,
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    renderAssetUrl: {
      type: String,
      trim: true,
    },
    additionalImages: {
      type: [String],
      default: [],
    },
    allowedJewelleryTypes: {
      type: [String],
      default: [],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
  },
  { timestamps: true }
);

studioMaterialSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });
studioMaterialSchema.index({ isActive: 1, allowedJewelleryTypes: 1, materialType: 1 });

export const StudioMaterial: Model<IStudioMaterial> =
  mongoose.models.StudioMaterial ??
  mongoose.model<IStudioMaterial>("StudioMaterial", studioMaterialSchema);
