import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDesignRule extends Document {
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
  requiresReviewThresholds: {
    minComponentsForReview?: number;
    maxComponentsForReview?: number;
    notes?: string;
  };
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const designRuleSchema = new Schema<IDesignRule>(
  {
    jewelleryType: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    constructionType: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    minWristMm: {
      type: Number,
      required: true,
      min: 0,
      default: 130,
    },
    maxWristMm: {
      type: Number,
      required: true,
      min: 0,
      default: 230,
    },
    minComponents: {
      type: Number,
      required: true,
      min: 1,
      default: 12,
    },
    maxComponents: {
      type: Number,
      required: true,
      min: 1,
      default: 45,
    },
    permittedBeadSizesMm: {
      type: [Number],
      default: [4, 6, 8, 10, 12],
    },
    allowedMaterialTypes: {
      type: [String],
      default: ["bead", "stone", "spacer", "charm"],
    },
    maxCharms: {
      type: Number,
      default: 5,
      min: 0,
    },
    fitAllowanceMm: {
      type: Number,
      default: 10,
      min: 0,
    },
    requiresReviewThresholds: {
      minComponentsForReview: { type: Number },
      maxComponentsForReview: { type: Number },
      notes: { type: String, trim: true },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

designRuleSchema.index({ jewelleryType: 1, constructionType: 1 }, { unique: true });

export const DesignRule: Model<IDesignRule> =
  mongoose.models.DesignRule ??
  mongoose.model<IDesignRule>("DesignRule", designRuleSchema);
