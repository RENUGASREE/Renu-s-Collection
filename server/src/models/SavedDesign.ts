import mongoose, { Schema, Document, Model, Types } from "mongoose";

// ============================================================================
// A customer-owned snapshot of a studio design.
// Prices and dimensions are NOT stored — they are always re-fetched from
// the live studio API at cart-add time.
// ============================================================================

export interface IDesignBeadItem {
  materialId: string;
  variantSku: string;
  displayName: string;
  diameterMm: number;
  imageUrl: string;
}

export interface IDesignCharmItem {
  instanceId: string;
  anchorInstanceId: string;
  materialId: string;
  variantSku: string;
  displayName: string;
  imageUrl: string;
}

export interface ISavedDesign extends Document {
  userId: Types.ObjectId;
  name: string;
  jewelleryType: string;
  constructionType: string;
  wristMm?: number;
  dimensionLabel?: string;
  beadSequence: IDesignBeadItem[];
  charms: IDesignCharmItem[];
  /** Provisional estimated total captured from last price-quote call. Display only — never authoritative. */
  estimatedTotal: number;
  /** ISO timestamp of last price-quote validation */
  lastValidatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const beadItemSchema = new Schema<IDesignBeadItem>(
  {
    materialId: { type: String, required: true },
    variantSku: { type: String, required: true },
    displayName: { type: String, required: true },
    diameterMm: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const charmItemSchema = new Schema<IDesignCharmItem>(
  {
    instanceId: { type: String, required: true },
    anchorInstanceId: { type: String, required: true },
    materialId: { type: String, required: true },
    variantSku: { type: String, required: true },
    displayName: { type: String, required: true },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const savedDesignSchema = new Schema<ISavedDesign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    jewelleryType: { type: String, required: true, trim: true, lowercase: true, default: "bracelet" },
    constructionType: { type: String, required: true, trim: true, lowercase: true, default: "elastic_bead" },
    wristMm: { type: Number, min: 0, max: 500, default: 160 },
    dimensionLabel: { type: String, trim: true },
    beadSequence: { type: [beadItemSchema], default: [] },
    charms: { type: [charmItemSchema], default: [] },
    estimatedTotal: { type: Number, default: 0 },
    lastValidatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

savedDesignSchema.index({ userId: 1, createdAt: -1 });

export const SavedDesign: Model<ISavedDesign> =
  mongoose.models.SavedDesign ??
  mongoose.model<ISavedDesign>("SavedDesign", savedDesignSchema);
