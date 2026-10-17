import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type StudioReservationStatus =
  | "reserved"
  | "committed"
  | "released"
  | "restocked"
  | "reconciliation_required";

export interface IStudioReservationItem {
  materialId?: Types.ObjectId;
  materialName: string;
  sku: string;
  quantity: number;
}

export interface IStudioReservation extends Document {
  orderId: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  status: StudioReservationStatus;
  items: IStudioReservationItem[];
  reservedAt: Date;
  expiresAt: Date;
  committedAt?: Date;
  releasedAt?: Date;
  restockedAt?: Date;
  releaseReason?: string;
  reconciliationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reservationItemSchema = new Schema<IStudioReservationItem>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: "StudioMaterial" },
    materialName: { type: String, required: true },
    sku: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const studioReservationSchema = new Schema<IStudioReservation>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["reserved", "committed", "released", "restocked", "reconciliation_required"],
      default: "reserved",
      index: true,
    },
    items: {
      type: [reservationItemSchema],
      required: true,
    },
    reservedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    committedAt: Date,
    releasedAt: Date,
    restockedAt: Date,
    releaseReason: String,
    reconciliationNotes: String,
  },
  { timestamps: true }
);

studioReservationSchema.index({ status: 1, expiresAt: 1 });
studioReservationSchema.index({ userId: 1, createdAt: -1 });

export const StudioReservation: Model<IStudioReservation> =
  mongoose.models.StudioReservation ??
  mongoose.model<IStudioReservation>("StudioReservation", studioReservationSchema);
