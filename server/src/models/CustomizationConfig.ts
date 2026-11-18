import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ProductType } from "../types/index.js";

export interface ICustomizationOption {
  key: string;
  label: string;
  type: "select" | "multiselect" | "color" | "text" | "number";
  options: {
    value: string;
    label: string;
    priceModifier: number;
    imageUrl?: string;
    materialId?: Types.ObjectId | string | null;
    variantSku?: string | null;
    metadata?: Record<string, string>;
  }[];
  required: boolean;
  sortOrder: number;
}

export interface ICustomizationConfig extends Document {
  name: string;
  productType: ProductType;
  categoryId?: Types.ObjectId | null;
  fields: ICustomizationOption[];
  basePriceModifier: number;
  previewLayers?: {
    layerId: string;
    imageUrl: string;
    zIndex: number;
    linkedFieldKey?: string;
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customizationOptionSchema = new Schema<ICustomizationOption>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["select", "multiselect", "color", "text", "number"],
      required: true,
    },
    options: [
      {
        value: String,
        label: String,
        priceModifier: { type: Number, default: 0 },
        imageUrl: String,
        materialId: { type: Schema.Types.ObjectId, ref: "StudioMaterial", default: null },
        variantSku: { type: String, trim: true, uppercase: true, default: null },
        metadata: Schema.Types.Mixed,
      },
    ],
    required: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const previewLayerSchema = new Schema(
  {
    layerId: String,
    imageUrl: String,
    zIndex: Number,
    linkedFieldKey: String,
  },
  { _id: false }
);

const customizationConfigSchema = new Schema<ICustomizationConfig>(
  {
    name: { type: String, required: true },
    productType: {
      type: String,
      enum: ["bracelet", "earring", "bangle", "other"],
      required: true,
      index: true,
    },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    fields: { type: [customizationOptionSchema], default: [] },
    basePriceModifier: { type: Number, default: 0 },
    previewLayers: [previewLayerSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customizationConfigSchema.index({ productType: 1, categoryId: 1, isActive: 1 });

export const CustomizationConfig: Model<ICustomizationConfig> =
  mongoose.models.CustomizationConfig ??
  mongoose.model<ICustomizationConfig>("CustomizationConfig", customizationConfigSchema);
