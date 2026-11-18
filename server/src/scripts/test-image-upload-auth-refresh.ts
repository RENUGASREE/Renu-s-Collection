import dotenv from "dotenv";
import path from "path";
import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.message}`, err?.cause || "");
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Renu's Collections — Image Upload Auth Refresh & Expiration Test Suite");
  console.log("================================================================================");

  const { requireAuth } = await import("../middleware/auth.js");
  const { env } = await import("../config/env.js");

  // Setup local Express test server with real auth middleware
  const app = express();
  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  let uploadRequestsReceived = 0;
  let successfulUploadsProcessed = 0;
  let refreshAttempts = 0;

  // Endpoint 1: Refresh token
  app.post("/api/v1/auth/refresh", (req: Request, res: Response) => {
    refreshAttempts++;
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;
      const newAccessToken = jwt.sign(
        { sub: payload.sub, email: payload.email || "admin@renuscollections.com", role: "admin" },
        env.JWT_ACCESS_SECRET,
        { expiresIn: "15m" }
      );
      return res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken,
        },
      });
    } catch {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }
  });

  // Endpoint 2: Image upload with real requireAuth middleware
  app.post(
    "/api/v1/products/images/upload",
    (_req, _res, next) => {
      uploadRequestsReceived++;
      next();
    },
    requireAuth,
    upload.array("images", 10),
    (req: Request, res: Response) => {
      successfulUploadsProcessed++;
      const files = req.files as Express.Multer.File[];
      const uploadedData = (files || []).map((file, idx) => ({
        id: `img_${Date.now()}_${idx}`,
        url: `/api/v1/products/images/mock_${idx}.jpg`,
        filename: file.originalname,
        size: file.size,
      }));

      return res.status(200).json({
        success: true,
        data: uploadedData,
      });
    }
  );

  // Global error handler matching server/src/middleware/errorHandler.ts
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: err.message || "Internal server error",
    });
  });

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as any).port;
  const BASE_URL = `http://127.0.0.1:${port}`;

  try {
    const testUserId = "670000000000000000000001";
    const validRefreshToken = jwt.sign(
      { sub: testUserId, email: "admin@test.com", role: "admin" },
      env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    const expiredRefreshToken = jwt.sign(
      { sub: testUserId, email: "admin@test.com", role: "admin" },
      env.JWT_REFRESH_SECRET,
      { expiresIn: "-1h" }
    );

    const validAccessToken = jwt.sign(
      { sub: testUserId, email: "admin@test.com", role: "admin" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );
    const expiredAccessToken = jwt.sign(
      { sub: testUserId, email: "admin@test.com", role: "admin" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "-1h" }
    );

    // -------------------------------------------------------------------------
    // Test 1: Image upload with valid access token succeeds immediately
    // -------------------------------------------------------------------------
    await runTest("Test 1: Upload with valid access token succeeds on first attempt", async () => {
      uploadRequestsReceived = 0;
      successfulUploadsProcessed = 0;
      const boundary = "---------------------------974767299852498929531610575";
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="images"; filename="test1.jpg"',
        "Content-Type: image/jpeg",
        "",
        "fake-image-binary-data",
        `--${boundary}--`,
      ].join("\r\n");

      const res = await fetch(`${BASE_URL}/api/v1/products/images/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validAccessToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json: any = await res.json();
      assert(json.success === true, "Response must be success: true");
      assert(json.data.length === 1, "Must return 1 uploaded file");
      assert(uploadRequestsReceived === 1, "Must make 1 upload request");
      assert(successfulUploadsProcessed === 1, "Must process 1 upload");
    });

    // -------------------------------------------------------------------------
    // Test 2: Expired access token triggers HTTP 401 with exact message
    // -------------------------------------------------------------------------
    await runTest("Test 2: Server rejects expired access token with HTTP 401 'Invalid or expired access token'", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/products/images/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${expiredAccessToken}`,
        },
      });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      const json: any = await res.json();
      assert(json.success === false, "Response must be success: false");
      assert(json.message === "Invalid or expired access token", `Expected exact message, got '${json.message}'`);
    });

    // -------------------------------------------------------------------------
    // Test 3: Simulation of Client uploadImageFiles with expired token -> refresh -> retry
    // -------------------------------------------------------------------------
    await runTest("Test 3: Client automatically refreshes token on 401 and successfully retries once", async () => {
      uploadRequestsReceived = 0;
      successfulUploadsProcessed = 0;
      refreshAttempts = 0;

      // Simulated client state
      let mockLocalStorage: Record<string, string> = {
        authToken: expiredAccessToken,
        refreshToken: validRefreshToken,
      };

      let refreshPromise: Promise<string | null> | null = null;
      let progressEvents: number[] = [];

      async function clientRefreshAccessToken(): Promise<string | null> {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const refreshToken = mockLocalStorage.refreshToken;
              if (!refreshToken) return null;

              const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken }),
              });

              if (!res.ok) {
                delete mockLocalStorage.authToken;
                return null;
              }

              const json: any = await res.json();
              const newToken = json.data?.accessToken;
              if (newToken) {
                mockLocalStorage.authToken = newToken;
                return newToken;
              }
              return null;
            } finally {
              refreshPromise = null;
            }
          })();
        }
        return refreshPromise;
      }

      async function uploadImageFilesClient(
        retried = false
      ): Promise<any[]> {
        if (refreshPromise) {
          await refreshPromise;
        }

        const token = mockLocalStorage.authToken;
        const boundary = "---------------------------974767299852498929531610575";
        const body = [
          `--${boundary}`,
          'Content-Disposition: form-data; name="images"; filename="photo.jpg"',
          "Content-Type: image/jpeg",
          "",
          "fake-image-bytes",
          `--${boundary}--`,
        ].join("\r\n");

        progressEvents.push(50); // Simulate progress

        const res = await fetch(`${BASE_URL}/api/v1/products/images/upload`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        progressEvents.push(100);

        if (res.status >= 200 && res.status < 300) {
          const json: any = await res.json();
          return json.data || [];
        }

        let errMessage = `Upload failed with status ${res.status}`;
        try {
          const json: any = await res.json();
          if (json?.message) errMessage = json.message;
        } catch (_) {}

        const err: any = new Error(errMessage);
        err.status = res.status;

        const isUnauthorized =
          err.status === 401 ||
          err.message?.includes("401") ||
          err.message?.toLowerCase().includes("invalid or expired access token") ||
          err.message?.toLowerCase().includes("authentication required") ||
          err.message?.toLowerCase().includes("unauthorized");

        if (isUnauthorized && !retried) {
          const refreshedToken = await clientRefreshAccessToken();
          if (refreshedToken) {
            return uploadImageFilesClient(true);
          }
          throw new Error("Your session has expired. Please log in again to continue.");
        }

        throw err;
      }

      const uploadResult = await uploadImageFilesClient();
      assert(uploadResult.length === 1, "Must return 1 uploaded image on retry");
      assert(uploadRequestsReceived === 2, `Expected 2 upload requests (initial 401 + retry 200), got ${uploadRequestsReceived}`);
      assert(successfulUploadsProcessed === 1, `Expected 1 processed upload (no duplicate files created on 401), got ${successfulUploadsProcessed}`);
      assert(refreshAttempts === 1, `Expected exactly 1 refresh call, got ${refreshAttempts}`);
      assert(mockLocalStorage.authToken !== expiredAccessToken, "Auth token in storage was refreshed");
      assert(progressEvents.length === 4, "Progress events tracked across attempts");
    });

    // -------------------------------------------------------------------------
    // Test 4: Simultaneous upload calls share single refresh request
    // -------------------------------------------------------------------------
    await runTest("Test 4: Simultaneous upload requests coordinate on single refreshPromise without duplicate refreshes", async () => {
      uploadRequestsReceived = 0;
      successfulUploadsProcessed = 0;
      refreshAttempts = 0;

      let mockLocalStorage: Record<string, string> = {
        authToken: expiredAccessToken,
        refreshToken: validRefreshToken,
      };

      let refreshPromise: Promise<string | null> | null = null;

      async function clientRefreshAccessToken(): Promise<string | null> {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: mockLocalStorage.refreshToken }),
              });
              if (!res.ok) return null;
              const json: any = await res.json();
              const newToken = json.data?.accessToken;
              if (newToken) {
                mockLocalStorage.authToken = newToken;
                return newToken;
              }
              return null;
            } finally {
              refreshPromise = null;
            }
          })();
        }
        return refreshPromise;
      }

      async function uploadSingle(filename: string, retried = false): Promise<any> {
        if (refreshPromise) {
          await refreshPromise;
        }

        const token = mockLocalStorage.authToken;
        const boundary = "---------------------------974767299852498929531610575";
        const body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="images"; filename="${filename}"`,
          "Content-Type: image/jpeg",
          "",
          "data",
          `--${boundary}--`,
        ].join("\r\n");

        const res = await fetch(`${BASE_URL}/api/v1/products/images/upload`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        if (res.status === 200) {
          const json: any = await res.json();
          return json.data;
        }

        const isUnauthorized = res.status === 401;
        if (isUnauthorized && !retried) {
          const refreshed = await clientRefreshAccessToken();
          if (refreshed) {
            return uploadSingle(filename, true);
          }
        }
        throw new Error("Upload failed");
      }

      // Launch 3 simultaneous uploads with expired token
      const results = await Promise.all([
        uploadSingle("file1.jpg"),
        uploadSingle("file2.jpg"),
        uploadSingle("file3.jpg"),
      ]);

      assert(results.length === 3, "All 3 uploads must resolve");
      assert(refreshAttempts === 1, `Expected exactly 1 refresh call for all simultaneous uploads, got ${refreshAttempts}`);
    });

    // -------------------------------------------------------------------------
    // Test 5: Expired refresh token fails gracefully and prevents infinite retry
    // -------------------------------------------------------------------------
    await runTest("Test 5: Expired refresh token produces session-expired message and never loops infinitely", async () => {
      uploadRequestsReceived = 0;
      successfulUploadsProcessed = 0;
      refreshAttempts = 0;

      let mockLocalStorage: Record<string, string> = {
        authToken: expiredAccessToken,
        refreshToken: expiredRefreshToken,
      };

      let refreshPromise: Promise<string | null> | null = null;

      async function clientRefreshAccessToken(): Promise<string | null> {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: mockLocalStorage.refreshToken }),
              });
              if (!res.ok) return null;
              const json: any = await res.json();
              return json.data?.accessToken || null;
            } finally {
              refreshPromise = null;
            }
          })();
        }
        return refreshPromise;
      }

      async function uploadWithRetryCheck(retried = false): Promise<any> {
        const token = mockLocalStorage.authToken;
        const res = await fetch(`${BASE_URL}/api/v1/products/images/upload`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (res.status === 200) return true;

        if (res.status === 401 && !retried) {
          const refreshedToken = await clientRefreshAccessToken();
          if (refreshedToken) {
            return uploadWithRetryCheck(true);
          }
          throw new Error("Your session has expired. Please log in again to continue.");
        }

        throw new Error(`Upload failed with status ${res.status}`);
      }

      let caughtError: string | null = null;
      try {
        await uploadWithRetryCheck();
      } catch (err: any) {
        caughtError = err.message;
      }

      assert(
        caughtError === "Your session has expired. Please log in again to continue.",
        `Expected session expired error, got '${caughtError}'`
      );
      assert(refreshAttempts === 1, "Refresh should be attempted once and fail");
    });

    // -------------------------------------------------------------------------
    // Test 6: Verify error matching logic handles all shapes
    // -------------------------------------------------------------------------
    await runTest("Test 6: Client isUnauthorized predicate accurately matches 401 and token expiration variants", async () => {
      const isUnauthorized = (err: any) =>
        err?.status === 401 ||
        err?.message?.includes("401") ||
        err?.message?.toLowerCase().includes("invalid or expired access token") ||
        err?.message?.toLowerCase().includes("authentication required") ||
        err?.message?.toLowerCase().includes("unauthorized");

      // Positive cases
      assert(isUnauthorized({ status: 401, message: "Invalid or expired access token" }) === true, "Matches status 401");
      assert(isUnauthorized({ message: "Invalid or expired access token" }) === true, "Matches message without status");
      assert(isUnauthorized({ message: "Upload failed with status 401" }) === true, "Matches status in message");
      assert(isUnauthorized({ message: "Authentication required" }) === true, "Matches Authentication required");
      assert(isUnauthorized({ message: "Unauthorized request" }) === true, "Matches unauthorized text");

      // Negative cases
      assert(isUnauthorized({ status: 400, message: "File too large" }) === false, "Does not match 400");
      assert(isUnauthorized({ status: 404, message: "Not found" }) === false, "Does not match 404");
      assert(isUnauthorized({ status: 500, message: "Internal server error" }) === false, "Does not match 500");
    });

  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  console.log("\n================================================================================");
  console.log("Test Summary:");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed}/${total}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}/${total}`);
    process.exit(1);
  } else {
    console.log("All Image Upload Auth Refresh tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
