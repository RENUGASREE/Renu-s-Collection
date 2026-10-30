import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import { Readable } from "stream";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Returns a GridFSBucket attached to the current active Mongoose database connection.
 */
export function getGridFSBucket(): GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) {
    throw new AppError("Database connection is not initialized yet.", 500);
  }

  return new GridFSBucket(db, {
    bucketName: "product_images",
  });
}

export interface StoredGridFSImage {
  id: string;
  filename: string;
  contentType: string;
  length: number;
  uploadDate: Date;
}

/**
 * Upload an image buffer directly into MongoDB GridFS.
 * Preserves the pristine original image bytes without compression or conversion.
 * Safely cleans up on error.
 */
export async function uploadImageToGridFS(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<StoredGridFSImage> {
  const bucket = getGridFSBucket();

  return new Promise<StoredGridFSImage>((resolve, reject) => {
    let uploadStreamId: ObjectId | null = null;
    let isFinished = false;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata: {
        originalFilename: filename,
        uploadedAt: new Date(),
      },
    });

    uploadStreamId = uploadStream.id;

    const cleanupFailedUpload = async () => {
      if (uploadStreamId && !isFinished) {
        try {
          await bucket.delete(uploadStreamId);
        } catch {
          // Ignore deletion error if stream hadn't committed anything
        }
      }
    };

    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);

    uploadStream.on("error", async (error) => {
      await cleanupFailedUpload();
      reject(new AppError(`Failed to store image in GridFS: ${error.message}`, 500));
    });

    uploadStream.on("finish", () => {
      isFinished = true;
      resolve({
        id: uploadStream.id.toString(),
        filename,
        contentType,
        length: buffer.length,
        uploadDate: new Date(),
      });
    });

    readable.pipe(uploadStream);
  });
}

/**
 * Retrieve image file metadata from GridFS by string id or ObjectId.
 */
export async function getGridFSImageMetadata(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const bucket = getGridFSBucket();
  const objectId = new ObjectId(id);
  const files = await bucket.find({ _id: objectId }).toArray();
  return files[0] || null;
}

/**
 * Open a download stream for an image in GridFS.
 */
export function openGridFSDownloadStream(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new AppError("Invalid image ID", 400);
  }
  const bucket = getGridFSBucket();
  return bucket.openDownloadStream(new ObjectId(id));
}

/**
 * Delete an image from GridFS by ID.
 */
export async function deleteGridFSImage(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) {
    throw new AppError("Invalid image ID", 400);
  }
  const bucket = getGridFSBucket();
  await bucket.delete(new ObjectId(id));
}
