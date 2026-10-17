import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ICartItemCustomization {
  selections: Record<string, string | string[] | number>;
  previewImageUrl?: string;
  priceModifier?: number;
  engraving?: string;
  breakdown?: {
    field: string;
    option: string;
    modifier?: number;
  }[];
}

export interface IStudioDesignSnapshot {
  savedDesignId?: Types.ObjectId | string;
  name?: string;
  jewelleryType: string;
  constructionType: string;
  wristMm: number;
  beadSequence: Array<{
    materialId: string;
    variantSku: string;
    displayName: string;
    diameterMm: number;
    imageUrl: string;
    unitPrice?: number;
  }>;
  charms: Array<{
    instanceId: string;
    anchorInstanceId: string;
    materialId: string;
    variantSku: string;
    displayName: string;
    imageUrl: string;
    unitPrice?: number;
  }>;
  breakdown?: {
    componentsTotal: number;
    baseMakingCharge: number;
    customizationCharge: number;
    giftBoxPrice?: number;
    total: number;
  };
}

export interface ICartItem {
  itemType?: "product" | "custom_design";
  productId?: Types.ObjectId;
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  customization?: ICartItemCustomization;
  studioDesign?: IStudioDesignSnapshot;
  savedForLater: boolean;
}

export interface ICart extends Document {
  userId?: Types.ObjectId | null;
  sessionId?: string | null;
  items: ICartItem[];
  couponCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    itemType: { type: String, enum: ["product", "custom_design"], default: "product" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: false },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    imageUrl: String,
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    customization: {
      selections: { type: Schema.Types.Mixed, default: {} },
      previewImageUrl: String,
      priceModifier: { type: Number, default: 0 },
      engraving: String,
      breakdown: { type: Schema.Types.Mixed, default: [] },
    },
    studioDesign: {
      type: new Schema(
        {
          savedDesignId: { type: Schema.Types.ObjectId, ref: "SavedDesign" },
          name: String,
          jewelleryType: { type: String, default: "bracelet" },
          constructionType: { type: String, default: "elastic_bead" },
          wristMm: Number,
          beadSequence: { type: Schema.Types.Mixed, default: [] },
          charms: { type: Schema.Types.Mixed, default: [] },
          breakdown: { type: Schema.Types.Mixed },
        },
        { _id: false }
      ),
      default: undefined,
    },
    savedForLater: { type: Boolean, default: false },
  },
  { _id: true }
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sessionId: { type: String, default: null },
    items: { type: [cartItemSchema], default: [] },
    couponCode: String,
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } } });
cartSchema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } });

export const Cart: Model<ICart> =
  mongoose.models.Cart ?? mongoose.model<ICart>("Cart", cartSchema);
