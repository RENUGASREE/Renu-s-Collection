import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { OrderStatus, PaymentStatus } from "../types/index.js";
import { IAddress } from "./User.js";

export interface IOrderItem {
  productId: Types.ObjectId;
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  customization?: {
    selections: Record<string, string | string[] | number>;
    previewImageUrl?: string;
    engraving?: string;
    breakdown?: {
      field: string;
      option: string;
      modifier?: number;
    }[];
  };
}

export interface IOrderStatusHistory {
  status: OrderStatus;
  note?: string;
  changedAt: Date;
  changedBy?: Types.ObjectId;
}

export interface IOrder extends Document {
  orderNumber: string;
  userId: Types.ObjectId;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  couponCode?: string;
  shippingAddress: IAddress;
  billingAddress: IAddress;
  email: string;
  phone: string;
  notes?: string;
  paymentMethod: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  trackingNumber?: string;
  invoiceUrl?: string;
  statusHistory: IOrderStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    imageUrl: String,
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    customization: {
      selections: Schema.Types.Mixed,
      previewImageUrl: String,
      engraving: String,
      breakdown: Schema.Types.Mixed,
    },
  },
  { _id: true }
);

const statusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"],
      required: true,
    },
    note: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const addressSnapshotSchema = new Schema(
  {
    label: String,
    fullName: { type: String, required: true },
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    couponCode: String,
    shippingAddress: { type: addressSnapshotSchema, required: true },
    billingAddress: { type: addressSnapshotSchema, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    notes: String,
    paymentMethod: { type: String, default: "razorpay" },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: String,
    razorpaySignature: String,
    trackingNumber: String,
    invoiceUrl: String,
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order ?? mongoose.model<IOrder>("Order", orderSchema);
