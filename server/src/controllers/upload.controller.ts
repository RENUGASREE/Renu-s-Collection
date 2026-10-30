import { Request, Response, NextFunction } from "express";
import {
  uploadImageToGridFS,
  getGridFSImageMetadata,
  openGridFSDownloadStream,
  deleteGridFSImage,
} from "../services/gridfs.service.js";
import { detectImageFormat } from "../middleware/upload.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Handle multipart image upload from admin dashboard.
 * Validates binary magic numbers on each buffer (JPEG, PNG, WebP).
 * Stores original image binaries directly into MongoDB GridFS.
 * Returns application URLs: `/api/v1/products/images/:id`
 */
export async function uploadProductImagesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawFiles = req.files as Express.Multer.File[] | undefined;
    const singleFile = req.file as Express.Multer.File | undefined;

    const files: Express.Multer.File[] = [];
    if (Array.isArray(rawFiles) && rawFiles.length > 0) {
      files.push(...rawFiles);
    } else if (singleFile) {
      files.push(singleFile);
    }

    if (files.length === 0) {
      throw new AppError("No image files provided for upload.", 400);
    }

    // Verify magic bytes on every file buffer
    for (const file of files) {
      const verifiedFormat = detectImageFormat(file.buffer);
      if (!verifiedFormat) {
        throw new AppError(
          `File "${file.originalname}" is not a valid JPEG, PNG, or WebP image. The file content does not match image binary signatures.`,
          400
        );
      }
      // Use verified content type
      file.mimetype = verifiedFormat;
    }

    const uploadPromises = files.map((file) =>
      uploadImageToGridFS(
        file.buffer,
        file.originalname || "product-image",
        file.mimetype
      )
    );

    const storedFiles = await Promise.all(uploadPromises);

    res.status(201).json({
      success: true,
      data: storedFiles.map((item) => ({
        id: item.id,
        url: `/api/v1/products/images/${item.id}`,
        contentType: item.contentType,
        length: item.length,
        originalFilename: item.filename,
      })),
      message: `Successfully uploaded and stored ${storedFiles.length} image(s) in MongoDB GridFS.`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Serve an image directly from MongoDB GridFS.
 * Publicly accessible to customers, search engines, and admin with caching headers.
 * Safely handles client aborts and stream cleanup.
 */
export async function serveGridFSImageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { imageId } = req.params;
    const file = await getGridFSImageMetadata(imageId);

    if (!file) {
      throw new AppError("Image not found", 404);
    }

    const contentType = file.contentType || (file.metadata as any)?.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", file.length);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Cache for 30 days, revalidate if stale, support browser & CDN caching
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.setHeader("Accept-Ranges", "bytes");

    const downloadStream = openGridFSDownloadStream(imageId);

    let streamDestroyed = false;

    // Detect interrupted image response: only destroy the stream if the response closed prematurely
    res.on("close", () => {
      if (!res.writableFinished && !streamDestroyed) {
        streamDestroyed = true;
        downloadStream.destroy();
      }
    });

    downloadStream.on("error", (err) => {
      streamDestroyed = true;
      if (!res.headersSent) {
        next(err);
      } else {
        res.end();
      }
    });

    downloadStream.on("end", () => {
      streamDestroyed = true;
    });

    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * Admin-only delete an image from MongoDB GridFS.
 * Safeguard: Checks whether any active or inactive product references this image.
 * If referenced, returns HTTP 409 Conflict.
 */
export async function deleteGridFSImageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { imageId } = req.params;
    const file = await getGridFSImageMetadata(imageId);

    if (!file) {
      throw new AppError("Image not found", 404);
    }

    // Match image URL patterns: relative or absolute with imageId
    const imageUrlRegex = new RegExp(`/api/v1/products/images/${imageId}`, "i");

    const referencingProduct = await Product.findOne({
      $or: [
        { imageUrl: { $regex: imageUrlRegex } },
        { "media.url": { $regex: imageUrlRegex } },
      ],
    }).select("name sku isActive");

    if (referencingProduct) {
      throw new AppError(
        `Cannot delete image because it is referenced by product "${referencingProduct.name}" (SKU: ${referencingProduct.sku}, Status: ${referencingProduct.isActive ? "Active" : "Inactive"}). Please remove or replace the image in that product before deleting.`,
        409
      );
    }

    await deleteGridFSImage(imageId);

    res.json({
      success: true,
      message: "Image successfully deleted from MongoDB GridFS.",
    });
  } catch (error) {
    next(error);
  }
}
