import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComponentType extends Document {
  typeId: string;
  displayName: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_COMPONENT_TYPES = [
  { typeId: "bead", displayName: "Bead", displayOrder: 1 },
  { typeId: "stone", displayName: "Stone", displayOrder: 2 },
  { typeId: "spacer", displayName: "Spacer", displayOrder: 3 },
  { typeId: "charm", displayName: "Charm", displayOrder: 4 },
  { typeId: "clasp", displayName: "Clasp", displayOrder: 5 },
  { typeId: "chain", displayName: "Chain", displayOrder: 6 },
  { typeId: "pendant", displayName: "Pendant", displayOrder: 7 },
  { typeId: "findings", displayName: "Findings", displayOrder: 8 },
] as const;

const componentTypeSchema = new Schema<IComponentType>(
  {
    typeId: {
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

componentTypeSchema.index({ isActive: 1, displayOrder: 1 });

export const ComponentType: Model<IComponentType> =
  mongoose.models.ComponentType ??
  mongoose.model<IComponentType>("ComponentType", componentTypeSchema);

/**
 * Ensures the 8 standard default component types exist in MongoDB.
 * Uses $setOnInsert so existing admin customisations (e.g. edited displayName) are preserved.
 */
export async function ensureDefaultComponentTypes(): Promise<void> {
  const count = await ComponentType.countDocuments();
  if (count > 0) {
    // Already initialized; do not revive types deleted by administrator!
    return;
  }
  const operations = DEFAULT_COMPONENT_TYPES.map((t) => ({
    updateOne: {
      filter: { typeId: t.typeId },
      update: {
        $setOnInsert: {
          typeId: t.typeId,
          displayName: t.displayName,
          displayOrder: t.displayOrder,
          isActive: true,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await ComponentType.bulkWrite(operations, { ordered: false });
  }
}
