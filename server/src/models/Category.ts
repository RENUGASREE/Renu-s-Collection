import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ProductType } from "../types/index.js";

export interface ICustomizationOptionItem {
  value: string;
  label: string;
  priceModifier?: number;
  imageUrl?: string;
  materialId?: Types.ObjectId | string | null;
  variantSku?: string | null;
}

export interface ICustomizationField {
  key: string;
  label: string;
  type: "select" | "multiselect" | "color" | "text" | "number";
  options?: ICustomizationOptionItem[];
  required?: boolean;
  sortOrder?: number;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId | null;
  productType: ProductType;
  imageUrl?: string;
  isActive: boolean;
  showInMenu: boolean;
  sortOrder: number;
  customizationFields: ICustomizationField[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customizationFieldSchema = new Schema<ICustomizationField>(
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
      },
    ],
    required: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    productType: {
      type: String,
      enum: ["bracelet", "earring", "bangle", "other"],
      required: true,
      index: true,
    },
    imageUrl: String,
    isActive: { type: Boolean, default: true, index: true },
    showInMenu: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    customizationFields: [customizationFieldSchema],
    seoTitle: String,
    seoDescription: String,
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, showInMenu: 1, sortOrder: 1 });
categorySchema.index({ parentId: 1, sortOrder: 1 });
categorySchema.index({ name: "text", description: "text" });

export const Category: Model<ICategory> =
  mongoose.models.Category ?? mongoose.model<ICategory>("Category", categorySchema);
