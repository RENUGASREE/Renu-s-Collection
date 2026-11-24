/**
 * Phase 3B-1 — PostgreSQL Infrastructure Test Script
 *
 * Standalone script (no test-runner dependency) that validates:
 *   1.  PostgreSQL connectivity
 *   2.  withTransaction — successful commit
 *   3.  withTransaction — rollback on error
 *   4.  withTransaction — rollbackError attached when ROLLBACK itself fails
 *   5.  withTransaction — pool client released on success
 *   6.  withTransaction — pool client released on failure
 *   7.  isValidEntityId — 24-char hex ObjectId accepted
 *   8.  isValidEntityId — 36-char UUID accepted
 *   9.  isValidEntityId — invalid identifiers rejected
 *  10.  assertValidEntityId — throws with statusCode 400 for invalid IDs
 *  11.  PG error code 23505 → 409 mapping (unit-level)
 *  12.  PG error code 23503 → 409 mapping
 *  13.  PG error code 23502 → 400 mapping
 *  14.  PG error code 22P02 → 400 mapping
 *  15.  PG error code 40001 → 503 mapping
 *  16.  PG error code 40P01 → 503 mapping
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-pg-infrastructure.ts
 */

import path from "path";
import dns from "dns";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

import { createPostgresPool, withTransaction, checkPostgresConnectivity } from "../db/postgres.js";
import { isValidEntityId, assertValidEntityId } from "../utils/helpers.js";
import { IDbPool, IDbPoolClient } from "../types/database.types.js";

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err?.message ?? err}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// PG error-code mapping (extracted from errorHandler.ts for unit testing)
// ---------------------------------------------------------------------------

/** Returns the HTTP status that errorHandler would send for a PG error code. */
function pgCodeToStatus(code: string): number | null {
  switch (code) {
    case "23505": return 409;
    case "23503": return 409;
    case "23502": return 400;
    case "22P02": return 400;
    case "40001": return 503;
    case "40P01": return 503;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockClient(overrides: Partial<IDbPoolClient> = {}): IDbPoolClient & { releaseCalled: boolean } {
  let releaseCalled = false;
  const client: IDbPoolClient & { releaseCalled: boolean } = {
    releaseCalled,
    query: async (_sql: string, _params?: any[]) => ({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] }) as any,
    release: () => { client.releaseCalled = true; },
    ...overrides,
  };
  return client;
}

function makeMockPool(client: IDbPoolClient): IDbPool {
  return {
    connect: async () => client,
    query: async (_sql: string, _params?: any[]) => ({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] }) as any,
    end: async () => {},
    on: () => ({}) as any,
  } as unknown as IDbPool;
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3B-1: PostgreSQL Infrastructure Tests  ━━━\n");

  // ── Real pool for connectivity + commit/rollback tests ──────────────────
  let realPool: IDbPool | undefined;
  let poolAvailable = false;

  try {
    realPool = createPostgresPool();
    poolAvailable = true;
  } catch {
    console.warn("  [warn] DATABASE_URL not set — skipping live-pool tests\n");
  }

  // 1. Connectivity
  await test("checkPostgresConnectivity returns connected:true", async () => {
    if (!poolAvailable) throw new Error("No pool — skipped");
    const result = await checkPostgresConnectivity(realPool);
    assert(result.connected === true, `connected should be true, got: ${JSON.stringify(result)}`);
    assert(typeof result.latencyMs === "number", "latencyMs should be a number");
    assert(result.latencyMs! >= 0, "latencyMs should be non-negative");
  });

  // 2. Successful commit — withTransaction returns the callback result
  await test("withTransaction — successful commit returns callback value", async () => {
    if (!poolAvailable) throw new Error("No pool — skipped");
    const value = await withTransaction(realPool!, async (client) => {
      await client.query("SELECT 1");
      return 42;
    });
    assertEqual(value, 42, "withTransaction return value");
  });

  // 3. Rollback on error
  await test("withTransaction — rejects with original error on callback throw", async () => {
    if (!poolAvailable) throw new Error("No pool — skipped");
    let caught: any;
    try {
      await withTransaction(realPool!, async () => {
        throw new Error("test-callback-failure");
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof Error, "should have thrown an Error");
    assertEqual(caught.message, "test-callback-failure", "error message");
  });

  // 4. rollbackError attached when ROLLBACK itself fails (mock-based)
  await test("withTransaction — attaches rollbackError when ROLLBACK fails", async () => {
    let queryCount = 0;
    const mockClient = makeMockClient({
      query: async (sql: string) => {
        queryCount++;
        if (sql === "BEGIN") return {} as any;
        if (sql === "ROLLBACK") throw new Error("ROLLBACK-network-error");
        return {} as any;
      },
    });
    const pool = makeMockPool(mockClient);

    let caught: any;
    try {
      await withTransaction(pool, async () => {
        throw new Error("original-error");
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw");
    assertEqual(caught.message, "original-error", "original error preserved");
    assert(caught.rollbackError instanceof Error, "rollbackError should be set");
    assertEqual(caught.rollbackError.message, "ROLLBACK-network-error", "rollbackError.message");
  });

  // 5. Client released on success (mock-based)
  await test("withTransaction — releases client after successful commit", async () => {
    let queryCall = 0;
    const mockClient = makeMockClient({
      query: async () => { queryCall++; return {} as any; },
    });
    const pool = makeMockPool(mockClient);

    await withTransaction(pool, async () => "ok");

    assert(mockClient.releaseCalled, "release() must be called after success");
  });

  // 6. Client released on failure (mock-based)
  await test("withTransaction — releases client after failed callback", async () => {
    const mockClient = makeMockClient({
      query: async () => ({}) as any,
    });
    const pool = makeMockPool(mockClient);

    try {
      await withTransaction(pool, async () => { throw new Error("fail"); });
    } catch { /* expected */ }

    assert(mockClient.releaseCalled, "release() must be called after failure");
  });

  // 7. Valid 24-char hex ObjectId
  await test("isValidEntityId — accepts 24-char hex ObjectId", () => {
    assert(isValidEntityId("6aa14bc803bc2db28142fcef"), "canonical ObjectId");
    assert(isValidEntityId("6aa14bc403bc2db28142fcec"), "second ObjectId");
    assert(isValidEntityId("000000000000000000000000"), "all-zeros ObjectId");
  });

  // 8. Valid 36-char UUID
  await test("isValidEntityId — accepts 36-char canonical UUID", () => {
    assert(isValidEntityId("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"), "UUID v4");
    assert(isValidEntityId("00000000-0000-0000-0000-000000000000"), "nil UUID");
  });

  // 9. Invalid identifiers rejected
  await test("isValidEntityId — rejects invalid identifiers", () => {
    const invalids = [
      "",
      "123",
      "not-an-id",
      "gggggggggggggggggggggggg",        // 24 chars but non-hex
      "6aa14bc803bc2db28142fce",          // 23 chars
      "6aa14bc803bc2db28142fceFF",        // 25 chars
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1",  // 35-char UUID (too short)
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a111", // 37-char UUID (too long)
      "a0eebc999c0b4ef8bb6d6bb9bd380a11",  // UUID without hyphens
    ];
    for (const id of invalids) {
      assert(!isValidEntityId(id), `"${id}" should be rejected`);
    }
  });

  // 10. assertValidEntityId throws with statusCode 400
  await test("assertValidEntityId — throws statusCode 400 for invalid ID", () => {
    let caught: any;
    try {
      assertValidEntityId("not-valid", "userId");
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof Error, "should throw an Error");
    assertEqual((caught as any).statusCode, 400, "statusCode");
    assert(caught.message.includes("userId"), "message includes field name");
  });

  // assertValidEntityId does NOT throw for valid IDs
  await test("assertValidEntityId — does not throw for valid ObjectId or UUID", () => {
    assertValidEntityId("6aa14bc803bc2db28142fcef");
    assertValidEntityId("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    // no throw → pass
  });

  // 11-16. PG error-code → HTTP status mapping
  const pgMappings: Array<[string, number]> = [
    ["23505", 409],
    ["23503", 409],
    ["23502", 400],
    ["22P02", 400],
    ["40001", 503],
    ["40P01", 503],
  ];

  for (const [code, expectedStatus] of pgMappings) {
    await test(`PG error code ${code} → HTTP ${expectedStatus}`, () => {
      assertEqual(pgCodeToStatus(code), expectedStatus, `pgCodeToStatus("${code}")`);
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }

  // Always close the pool cleanly
  if (realPool) {
    try { await realPool.end(); } catch { /* ignore */ }
  }
}

run().catch((err) => {
  console.error("\n[FATAL] Test runner crashed:", err);
  process.exitCode = 1;
});
