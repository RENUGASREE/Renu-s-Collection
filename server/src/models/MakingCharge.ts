import mongoose, { Schema, Document, Model } from "mongoose";

export interface IServiceCharge {
  name: string;
  fee: number;
  isOptional: boolean;
  description?: string;
}

export interface IMakingCharge extends Document {
  jewelleryType: string;
  constructionType: string;
  baseFee: number;
  serviceCharges: IServiceCharge[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const serviceChargeSchema = new Schema<IServiceCharge>(
  {
    name: { type: String, required: true, trim: true },
    fee: { type: Number, required: true, min: 0 },
    isOptional: { type: Boolean, default: true },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const makingChargeSchema = new Schema<IMakingCharge>(
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
    baseFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    serviceCharges: {
      type: [serviceChargeSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

makingChargeSchema.index({ jewelleryType: 1, constructionType: 1 }, { unique: true });

export const MakingCharge: Model<IMakingCharge> =
  mongoose.models.MakingCharge ??
  mongoose.model<IMakingCharge>("MakingCharge", makingChargeSchema);
