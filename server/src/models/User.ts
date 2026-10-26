import mongoose, { Schema, Document, Model } from "mongoose";
import { UserRole } from "../types/index.js";

export interface IAddress {
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
}

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  googleId?: string;
  avatarUrl?: string;
  addresses: IAddress[];
  isEmailVerified: boolean;
  refreshTokenHash?: string;
  previousRefreshTokenHash?: string;
  previousRefreshTokenExpiresAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    label: String,
    fullName: { type: String, required: true },
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: "IN" },
    phone: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, select: false },
    username: { type: String, required: true, trim: true },
    firstName: String,
    lastName: String,
    phone: String,
    role: { type: String, enum: ["customer", "admin"], default: "customer", index: true },
    googleId: { type: String, sparse: true, unique: true },
    avatarUrl: String,
    addresses: [addressSchema],
    isEmailVerified: { type: Boolean, default: false },
    refreshTokenHash: { type: String, select: false },
    previousRefreshTokenHash: { type: String, select: false },
    previousRefreshTokenExpiresAt: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });

export const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
