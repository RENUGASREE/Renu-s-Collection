import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import {
  ISupabaseStorageClient,
  ISupabaseStorageUploadResult,
} from "../types/database.types.js";

/**
 * Supabase Storage Client Adapter (Phase 2A)
 *
 * Security & Design:
 * 1. Runs exclusively on the backend with SUPABASE_SERVICE_ROLE_KEY.
 * 2. Implements stream consumption with MD5 checksum calculation and verification.
 * 3. Never logs secret keys or sensitive tokens.
 */
export class SupabaseStorageAdapter implements ISupabaseStorageClient {
  private client: SupabaseClient;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const url = supabaseUrl || env.SUPABASE_URL || process.env.SUPABASE_URL;
    const key = serviceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "Cannot initialize Supabase Storage client: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
      );
    }

    this.client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Uploads a readable stream to Supabase Storage, computing its MD5 hash and verifying integrity.
   */
  public async uploadStream(
    bucket: string,
    destinationPath: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    expectedMd5?: string
  ): Promise<ISupabaseStorageUploadResult> {
    // Collect stream chunks into buffer while computing MD5 hash
    const chunks: Buffer[] = [];
    const hash = crypto.createHash("md5");

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        hash.update(chunk);
      });
      stream.on("end", () => resolve());
      stream.on("error", (err) => reject(err));
    });

    const buffer = Buffer.concat(chunks);
    const calculatedMd5 = hash.digest("hex");

    if (expectedMd5 && expectedMd5.toLowerCase() !== calculatedMd5.toLowerCase()) {
      throw new Error(
        `MD5 checksum mismatch for "${destinationPath}". Expected: ${expectedMd5}, Calculated: ${calculatedMd5}`
      );
    }

    const { error } = await this.client.storage
      .from(bucket)
      .upload(destinationPath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
    }

    const publicUrl = this.getPublicUrl(bucket, destinationPath);

    return {
      path: destinationPath,
      publicUrl,
      md5Hash: calculatedMd5,
      bytesUploaded: buffer.length,
    };
  }

  /**
   * Gets the public CDN URL for an object in a public bucket.
   */
  public getPublicUrl(bucket: string, path: string): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Checks whether a specific object exists in the bucket.
   */
  public async fileExists(bucket: string, fullPath: string): Promise<boolean> {
    const lastSlash = fullPath.lastIndexOf("/");
    const folder = lastSlash !== -1 ? fullPath.substring(0, lastSlash) : "";
    const filename = lastSlash !== -1 ? fullPath.substring(lastSlash + 1) : fullPath;

    const { data, error } = await this.client.storage
      .from(bucket)
      .list(folder, { search: filename, limit: 1 });

    if (error || !data) {
      return false;
    }

    return data.some((item) => item.name === filename);
  }

  /**
   * Directly checks if a bucket exists and inspects its metadata.
   */
  public async getBucketInfo(bucketName: string): Promise<{ id: string; name: string; public: boolean } | null> {
    const { data, error } = await this.client.storage.getBucket(bucketName);
    if (error || !data) {
      return null;
    }
    return {
      id: data.id,
      name: data.name,
      public: data.public,
    };
  }

  /**
   * Deletes a file from Supabase Storage by bucket and path.
   */
  public async deleteFile(bucket: string, path: string): Promise<boolean> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      console.error(`Failed to delete file "${path}" from bucket "${bucket}":`, error.message);
      return false;
    }
    return true;
  }

  /**
   * Downloads a file from Supabase Storage as a Buffer.
   */
  public async downloadFile(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(`Failed to download file "${path}" from bucket "${bucket}": ${error?.message || "No data returned"}`);
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
