import multer from "multer";
import { Request } from "express";
import { AppError } from "./errorHandler.js";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Validates the true binary magic numbers of an image buffer.
 * Supports:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
 */
export function detectImageFormat(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG check: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG check: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP check: RIFF at 0..3, WEBP at 8..11
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46; // 'RIFF'
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50; // 'WEBP'

  if (isRiff && isWebp) {
    return "image/webp";
  }

  return null;
}

/**
 * Validates whether an image buffer contains native transparency / alpha channel.
 * Supports:
 * - PNG: IHDR color type 4 (grey+alpha), 6 (RGBA), or presence of tRNS chunk.
 * - WebP: VP8X with Alpha bit set, VP8L with alpha bit, or presence of ALPH chunk.
 * - JPEG: Always false (JPEG standard has no transparency support).
 */
export function detectImageTransparency(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 26) return false;

  // 1. PNG Check: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    // In PNG, IHDR color type byte is at offset 25
    const colorType = buffer[25];
    if (colorType === 4 || colorType === 6) {
      return true;
    }
    // Search subsequent chunks for tRNS
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
      if (chunkType === "tRNS") {
        return true;
      }
      if (chunkType === "IEND") {
        break;
      }
      offset += 12 + chunkLength;
    }
    return false;
  }

  // 2. WebP Check: RIFF ... WEBP
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isRiff && isWebp && buffer.length >= 30) {
    const chunkType = buffer.toString("ascii", 12, 16);
    if (chunkType === "VP8X") {
      const flags = buffer[20];
      return (flags & 0x10) !== 0; // Bit 4 = Alpha
    }
    if (chunkType === "VP8L") {
      if (buffer[20] === 0x2f) {
        const header = buffer.readUInt32LE(21);
        return (header & (1 << 28)) !== 0;
      }
    }
    // Search for ALPH chunk
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const subType = buffer.toString("ascii", offset, offset + 4);
      if (subType === "ALPH") {
        return true;
      }
      const chunkLen = buffer.readUInt32LE(offset + 4);
      offset += 8 + chunkLen + (chunkLen % 2);
    }
  }

  return false;
}

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type "${file.mimetype}". Only JPEG, PNG, and WebP images are supported.`,
        400
      )
    );
  }
};

export const uploadProductImages = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per image
    files: 10, // Up to 10 files per upload batch
  },
  fileFilter,
});
