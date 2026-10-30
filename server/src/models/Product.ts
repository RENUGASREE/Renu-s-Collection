import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ProductMedia } from "../types/index.js";

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId | null;
  price: number;
  salePrice?: number | null;
  currency: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  weightGrams?: number;
  materialInfo?: string;
  careInstructions?: string;
  additionalInfo?: string;
  media: ProductMedia[];
  colors: string[];
  materials: string[];
  tags: string[];
  badge?: string;
  isSignaturePiece: boolean;
  signatureCategory?: "fashion" | "trending" | "latest" | "none";
  isActive: boolean;
  isCustomizable: boolean;
  averageRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<ProductMedia>(
  {
    url: { type: String, required: true },
    alt: String,
    type: { type: String, enum: ["image", "video"], default: "image" },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    shortDescription: String,
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0, default: null },
    currency: { type: String, default: "INR" },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0, index: true },
    lowStockThreshold: { type: Number, default: 5 },
    weightGrams: Number,
    materialInfo: String,
    careInstructions: String,
    additionalInfo: String,
    media: { type: [mediaSchema], default: [] },
    colors: { type: [String], default: [], index: true },
    materials: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    badge: String,
    isSignaturePiece: { type: Boolean, default: false, index: true },
    signatureCategory: {
      type: String,
      enum: ["fashion", "trending", "latest", "none"],
      default: "none",
    },
    isActive: { type: Boolean, default: true, index: true },
    isCustomizable: { type: Boolean, default: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", tags: "text", sku: "text" });
productSchema.index({ categoryId: 1, isActive: 1, price: 1 });
productSchema.index({ isActive: 1, stock: 1 });
productSchema.index({ salePrice: 1 });
productSchema.index({ averageRating: -1 });

productSchema.virtual("effectivePrice").get(function (this: IProduct) {
  return this.salePrice != null && this.salePrice < this.price ? this.salePrice : this.price;
});

productSchema.virtual("isInStock").get(function (this: IProduct) {
  return this.stock > 0;
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

export const Product: Model<IProduct> =
  mongoose.models.Product ?? mongoose.model<IProduct>("Product", productSchema);
