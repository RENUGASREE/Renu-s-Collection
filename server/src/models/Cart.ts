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

export interface ICartItem {
  productId: Types.ObjectId;
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  customization?: ICartItemCustomization;
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
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
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
    savedForLater: { type: Boolean, default: false },
  },
  { _id: true }
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, sparse: true },
    sessionId: { type: String, default: null, sparse: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: String,
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } } });
cartSchema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } });

export const Cart: Model<ICart> =
  mongoose.models.Cart ?? mongoose.model<ICart>("Cart", cartSchema);
