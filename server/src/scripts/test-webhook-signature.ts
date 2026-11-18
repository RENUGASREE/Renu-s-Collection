import dotenv from "dotenv";
import path from "path";

// Ensure environment is loaded from server/.env or current working directory
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import crypto from "crypto";
import http from "http";
import { createApp } from "../app.js";
import { env } from "../config/env.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.cause?.message || err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.cause?.message || err?.message}`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Razorpay Webhook Raw Body Signature Verification Test Suite");
  console.log("================================================================================");

  const testSecret = "test_webhook_secret_xyz123";
  // Temporarily set webhook secret for test execution
  const originalSecret = env.RAZORPAY_WEBHOOK_SECRET;
  (env as any).RAZORPAY_WEBHOOK_SECRET = testSecret;

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay`;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Valid signature with standard raw JSON payload
    // -------------------------------------------------------------------------
    await runTest("1. Valid signature with raw JSON body verifies successfully", async () => {
      const rawPayload = JSON.stringify({
        event: "dummy.test.event",
        payload: { test: true },
      });
      const validSignature = crypto
        .createHmac("sha256", testSecret)
        .update(Buffer.from(rawPayload, "utf8"))
        .digest("hex");

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validSignature,
        },
        body: rawPayload,
      });

      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const json: any = await res.json();
      assert(json.success === true, `Expected success true, got ${JSON.stringify(json)}`);
    });

    // -------------------------------------------------------------------------
    // Test 2: Valid signature with formatted/spaced raw JSON (which breaks JSON.stringify)
    // -------------------------------------------------------------------------
    await runTest("2. Raw JSON with specific spacing/key ordering verifies via rawBody", async () => {
      // Intentionally formatted with spaces and newlines
      const rawPayload = '{\n  "event": "dummy.test.event",\n  "z_last": 1,\n  "a_first": 2\n}';
      const validSignature = crypto
        .createHmac("sha256", testSecret)
        .update(Buffer.from(rawPayload, "utf8"))
        .digest("hex");

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validSignature,
        },
        body: rawPayload,
      });

      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const json: any = await res.json();
      assert(json.success === true, `Expected success true, got ${JSON.stringify(json)}`);
    });

    // -------------------------------------------------------------------------
    // Test 3: Modified / Tampered request body is rejected with 401
    // -------------------------------------------------------------------------
    await runTest("3. Tampered payload with original signature is rejected (401)", async () => {
      const originalPayload = JSON.stringify({ event: "payment.captured", amount: 1000 });
      const validSignature = crypto
        .createHmac("sha256", testSecret)
        .update(Buffer.from(originalPayload, "utf8"))
        .digest("hex");

      // Attacker changes amount from 1000 to 10
      const tamperedPayload = JSON.stringify({ event: "payment.captured", amount: 10 });

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validSignature, // Signature for 1000, not 10
        },
        body: tamperedPayload,
      });

      assert(res.status === 401, `Expected status 401 for tampered payload, got ${res.status}`);
      const json: any = await res.json();
      assert(json.error === "Invalid signature", `Expected "Invalid signature", got ${json.error}`);
    });

    // -------------------------------------------------------------------------
    // Test 4: Completely invalid / forged signature is rejected with 401
    // -------------------------------------------------------------------------
    await runTest("4. Forged / invalid signature is rejected (401)", async () => {
      const rawPayload = JSON.stringify({ event: "dummy.event" });
      const fakeSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": fakeSignature,
        },
        body: rawPayload,
      });

      assert(res.status === 401, `Expected status 401, got ${res.status}`);
      const json: any = await res.json();
      assert(json.error === "Invalid signature", `Expected "Invalid signature", got ${json.error}`);
    });

    // -------------------------------------------------------------------------
    // Test 5: Missing signature header is rejected with 400
    // -------------------------------------------------------------------------
    await runTest("5. Missing x-razorpay-signature header is rejected (400)", async () => {
      const rawPayload = JSON.stringify({ event: "dummy.event" });

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: rawPayload,
      });

      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const json: any = await res.json();
      assert(json.error === "Missing signature", `Expected "Missing signature", got ${json.error}`);
    });

    // -------------------------------------------------------------------------
    // Test 6: Missing webhook secret on server returns safe 500 without crashing
    // -------------------------------------------------------------------------
    await runTest("6. Unconfigured webhook secret returns safe 500 without crashing", async () => {
      (env as any).RAZORPAY_WEBHOOK_SECRET = undefined;

      const rawPayload = JSON.stringify({ event: "dummy.event" });
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "some-signature",
        },
        body: rawPayload,
      });

      assert(res.status === 500, `Expected status 500, got ${res.status}`);
      const json: any = await res.json();
      assert(json.error === "Webhook secret not configured", `Expected "Webhook secret not configured", got ${json.error}`);
    });
  } finally {
    // Restore original secret
    (env as any).RAZORPAY_WEBHOOK_SECRET = originalSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Summary: Total ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
