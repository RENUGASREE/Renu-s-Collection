import mongoose, { Schema, Document, Model } from "mongoose";

// ============================================================================
// Admin-published starter design templates that customers can load into the
// bracelet designer as a starting point.
// ============================================================================

export interface ITemplateBeadItem {
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface ITemplateCharmItem {
  anchorVariantSku: string; // charm attaches after the bead matching this SKU
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface IDesignTemplate extends Document {
  slug: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  jewelleryType: string;
  constructionType: string;
  wristMm: number;
  beadSequence: ITemplateBeadItem[];
  charms: ITemplateCharmItem[];
  isPublished: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const templateBeadSchema = new Schema<ITemplateBeadItem>(
  {
    variantSku: { type: String, required: true, uppercase: true, trim: true },
    displayName: { type: String, required: true },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const templateCharmSchema = new Schema<ITemplateCharmItem>(
  {
    anchorVariantSku: { type: String, required: true, uppercase: true, trim: true },
    variantSku: { type: String, required: true, uppercase: true, trim: true },
    displayName: { type: String, required: true },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const designTemplateSchema = new Schema<IDesignTemplate>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
    jewelleryType: { type: String, required: true, trim: true, lowercase: true, default: "bracelet" },
    constructionType: { type: String, required: true, trim: true, lowercase: true, default: "elastic_bead" },
    wristMm: { type: Number, min: 0, max: 500, default: 160 },
    beadSequence: { type: [templateBeadSchema], default: [] },
    charms: { type: [templateCharmSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

designTemplateSchema.index({ isPublished: 1, sortOrder: 1 });

export const DesignTemplate: Model<IDesignTemplate> =
  mongoose.models.DesignTemplate ??
  mongoose.model<IDesignTemplate>("DesignTemplate", designTemplateSchema);
