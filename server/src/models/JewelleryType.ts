import mongoose, { Schema, Document, Model } from "mongoose";

export type DesignerStatus = "available" | "coming_soon" | "maintenance";

export interface IJewelleryType extends Document {
  slug: string;
  displayName: string;
  description?: string;
  displayOrder: number;
  isEnabled: boolean;
  designerStatus: DesignerStatus;
  supportedConstructionTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

const jewelleryTypeSchema = new Schema<IJewelleryType>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    designerStatus: {
      type: String,
      enum: ["available", "coming_soon", "maintenance"],
      default: "coming_soon",
      index: true,
    },
    supportedConstructionTypes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

jewelleryTypeSchema.index({ isEnabled: 1, displayOrder: 1 });

export const JewelleryType: Model<IJewelleryType> =
  mongoose.models.JewelleryType ??
  mongoose.model<IJewelleryType>("JewelleryType", jewelleryTypeSchema);
