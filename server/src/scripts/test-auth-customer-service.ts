/**
 * ============================================================================
 * Phase 3D: Authentication & Customer Services Test Suite
 * ============================================================================
 *
 * Verifies that the migrated Authentication, Customer, and Address services
 * operate exclusively on Supabase PostgreSQL while preserving the custom
 * JWT + bcrypt architecture, existing customer credentials, refresh token
 * rotation, and address management.
 *
 * Test Coverage:
 *  1.  registerUser creates new customer, hashes password with bcrypt, and issues tokens.
 *  2.  registerUser throws AppError 409 when email is already registered.
 *  3.  loginUser succeeds with correct credentials and returns sanitized user + tokens.
 *  4.  loginUser throws AppError 401 on incorrect password.
 *  5.  loginUser throws AppError 401 when email is not found.
 *  6.  loginUser throws AppError 401 for accounts without password (e.g. Google-only).
 *  7.  refreshSession rotates refresh token and updates session hashes in database.
 *  8.  refreshSession accepts previous token within 30s grace window without re-rotating.
 *  9.  refreshSession rejects expired or tampered refresh tokens (401).
 *  10. logoutUser clears refresh token hashes and revokes active session.
 *  11. forgotPassword generates SHA-256 reset token with 1-hour expiry.
 *  12. forgotPassword does not reveal if email exists (silent safe return).
 *  13. resetPassword updates password hash, clears reset token and active sessions.
 *  14. resetPassword throws AppError 400 for invalid or expired reset token.
 *  15. loginWithGoogle links existing customer account by email or googleId.
 *  16. loginWithGoogle creates new customer account when email does not exist.
 *  17. getUserById retrieves sanitized user and throws 404 if not found.
 *  18. updateProfile updates profile fields and returns sanitized user.
 *  19. updateProfile throws AppError 409 if new username is already taken.
 *  20. changePassword updates password hash and revokes refresh tokens.
 *  21. changePassword throws AppError 400 on incorrect current password.
 *  22. listUsers returns paginated user list with role filtering and text search.
 *  23. updateUserRole updates user authorization role and rejects invalid role.
 *  24. getUserAddresses retrieves addresses with dual id and _id compatibility.
 *  25. createAddress validates Indian PIN code (6 digits) and phone numbers.
 *  26. createAddress marks first address for user as default automatically.
 *  27. createAddress with isDefault=true clears previous default addresses in transaction.
 *  28. updateAddress updates fields and verifies user ownership (throws 404 if unauthorized).
 *  29. deleteAddress deletes address and promotes next remaining address to default.
 *  30. setDefaultAddress marks target address as default and clears others.
 *  31. Dual ID compatibility — verifies 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 *  32. Transaction rollback — address operations roll back atomically on failure.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-auth-customer-service.ts
 */

import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  forgotPassword,
  resetPassword,
  loginWithGoogle,
  getUserById,
  setUserRepository as setAuthUserRepo,
} from "../services/auth.service.js";
import {
  updateProfile,
  changePassword,
  listUsers,
  updateUserRole,
  setUserRepository as setUserServiceUserRepo,
} from "../services/user.service.js";
import {
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  setAddressRepository,
  setAddressUserRepository,
  setAddressDatabasePool,
} from "../services/address.service.js";
import {
  PostgresUserRepository,
  mapRowToUser,
} from "../repositories/postgres-user.repository.js";
import {
  PostgresAddressRepository,
  mapRowToAddress,
} from "../repositories/postgres-address.repository.js";
import {
  IUserRecord,
  IUserAddressRecord,
  IDbPool,
  IDbPoolClient,
  IQueryResult,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword, comparePassword, hashToken } from "../utils/password.js";
import { signRefreshToken } from "../utils/jwt.js";

// ---------------------------------------------------------------------------
// Test runner helpers
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
// Test fixtures & mock factories
// ---------------------------------------------------------------------------

const sampleUserId = "6ae44c64900e0da3e5b0adfd"; // 24-char hex MongoDB ID
const sampleUuidUserId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // 36-char canonical UUID
const sampleAddressId = "6ae44c64900e0da3e5b0adfe";

const sampleUserRecord: IUserRecord = {
  id: sampleUserId,
  _id: sampleUserId,
  email: "customer@renucollections.com",
  username: "renucustomer",
  firstName: "Renu",
  lastName: "Collections",
  phone: "9876543210",
  role: "customer",
  isEmailVerified: true,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

const sampleAddressRecord: IUserAddressRecord = {
  id: sampleAddressId,
  _id: sampleAddressId,
  userId: sampleUserId,
  label: "Home",
  fullName: "Renu Customer",
  line1: "123 Temple Street",
  city: "Madurai",
  state: "Tamil Nadu",
  postalCode: "625001",
  country: "IN",
  phone: "9876543210",
  isDefault: true,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

function createMockDbPool(
  queryHandler?: (sql: string, params?: any[]) => Promise<IQueryResult<any>> | IQueryResult<any>
): {
  pool: IDbPool;
  queries: Array<{ sql: string; params?: any[] }>;
  released: boolean[];
} {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  const released: boolean[] = [];

  const client: IDbPoolClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      queries.push({ sql: sql.trim(), params });
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      released.push(true);
    },
  };

  const pool: IDbPool = {
    connect: async () => client,
    query: async (sql, params) => client.query(sql, params),
    end: async () => {},
  };

  return { pool, queries, released };
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3D: Authentication & Customer Services Tests  ━━━\n");

  // 1. registerUser — creates customer with bcrypt hash and issues tokens
  await test("registerUser creates new customer, hashes password with bcrypt, and issues tokens", async () => {
    let capturedInsert: any;
    const mockUserRepo = {
      findByEmail: async () => null,
      create: async (data: any) => {
        capturedInsert = data;
        return { ...sampleUserRecord, ...data, id: sampleUserId, _id: sampleUserId };
      },
      updateById: async (_id: string, update: any) => ({
        ...sampleUserRecord,
        ...capturedInsert,
        ...update,
        id: sampleUserId,
        _id: sampleUserId,
      }),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const result = await registerUser({
      email: "newcustomer@example.com",
      password: "SecurePassword123",
      username: "newcust",
      firstName: "New",
      lastName: "Customer",
    });

    assertEqual(result.user.email, "newcustomer@example.com", "user email");
    assertEqual(result.user.role, "customer", "customer role assigned");
    assert(typeof result.accessToken === "string", "accessToken is string");
    assert(typeof result.refreshToken === "string", "refreshToken is string");

    assertEqual(capturedInsert.role, "customer", "assigned customer role");
    assert(capturedInsert.passwordHash.startsWith("$2"), "hashed with bcrypt ($2)");
  });

  // 2. registerUser — duplicate email throws 409
  await test("registerUser throws AppError 409 when email is already registered", async () => {
    const mockUserRepo = {
      findByEmail: async () => sampleUserRecord,
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await registerUser({
        email: "customer@renucollections.com",
        password: "SecurePassword123",
      });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 409, "throws 409 on duplicate email");
  });

  // 3. loginUser — valid credentials succeeds
  await test("loginUser succeeds with correct credentials and returns sanitized user + tokens", async () => {
    const rawPassword = "CorrectPassword123";
    const passwordHash = await hashPassword(rawPassword);

    const mockUserRepo = {
      findByEmail: async () => ({ ...sampleUserRecord, passwordHash }),
      updateById: async (_id: string, update: any) => ({ ...sampleUserRecord, ...update }),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const result = await loginUser("customer@renucollections.com", rawPassword);
    assertEqual(result.user.email, "customer@renucollections.com", "user email");
    assert(typeof result.accessToken === "string", "accessToken issued");
    assert(typeof result.refreshToken === "string", "refreshToken issued");
  });

  // 4. loginUser — incorrect password throws 401
  await test("loginUser throws AppError 401 on incorrect password", async () => {
    const passwordHash = await hashPassword("RealPassword123");

    const mockUserRepo = {
      findByEmail: async () => ({ ...sampleUserRecord, passwordHash }),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await loginUser("customer@renucollections.com", "WrongPassword999");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 401, "throws 401 on bad password");
  });

  // 5. loginUser — missing user throws 401
  await test("loginUser throws AppError 401 when email is not found", async () => {
    const mockUserRepo = {
      findByEmail: async () => null,
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await loginUser("unknown@example.com", "Password123");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 401, "throws 401 on unknown email");
  });

  // 6. loginUser — account without password throws 401
  await test("loginUser throws AppError 401 for accounts without password (e.g. Google-only)", async () => {
    const mockUserRepo = {
      findByEmail: async () => ({ ...sampleUserRecord, passwordHash: undefined }),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await loginUser("googleuser@example.com", "Password123");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 401, "throws 401 for passwordless account");
  });

  // 7. refreshSession — rotates refresh token and updates database
  await test("refreshSession rotates refresh token and updates session hashes in database", async () => {
    const currentToken = signRefreshToken(sampleUserId);
    const currentTokenHash = await hashToken(currentToken);

    let capturedUpdate: any;
    const mockUserRepo = {
      findById: async () => ({ ...sampleUserRecord, refreshTokenHash: currentTokenHash }),
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return { ...sampleUserRecord, ...update };
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const result = await refreshSession(currentToken);
    assert(typeof result.accessToken === "string", "new access token");
    assert(typeof result.refreshToken === "string", "new refresh token");

    assert(capturedUpdate.previousRefreshTokenHash === currentTokenHash, "previous hash stored");
    assert(capturedUpdate.previousRefreshTokenExpiresAt instanceof Date, "grace expiry set");
    assert(typeof capturedUpdate.refreshTokenHash === "string", "new refresh token hash set");
  });

  // 8. refreshSession — accepts previous token within grace window
  await test("refreshSession accepts previous token within 30s grace window without re-rotating", async () => {
    const oldToken = signRefreshToken(sampleUserId);
    const oldTokenHash = await hashToken(oldToken);

    let wasUpdated = false;
    const mockUserRepo = {
      findById: async () => ({
        ...sampleUserRecord,
        refreshTokenHash: "someOtherActiveHash",
        previousRefreshTokenHash: oldTokenHash,
        previousRefreshTokenExpiresAt: new Date(Date.now() + 20 * 1000), // active grace window
      }),
      updateById: async () => {
        wasUpdated = true;
        return sampleUserRecord;
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const result = await refreshSession(oldToken);
    assert(typeof result.accessToken === "string", "access token returned");
    assertEqual(result.refreshToken, oldToken, "original refresh token returned intact");
    assert(!wasUpdated, "did not mutate or invalidate session during grace window");
  });

  // 9. refreshSession — rejects expired or tampered refresh tokens (401)
  await test("refreshSession rejects expired or tampered refresh tokens (401)", async () => {
    const mockUserRepo = {
      findById: async () => sampleUserRecord,
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await refreshSession("tampered.jwt.token");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 401, "throws 401 on invalid token");
  });

  // 10. logoutUser — clears refresh token hashes
  await test("logoutUser clears refresh token hashes and revokes active session", async () => {
    let capturedUpdate: any;
    const mockUserRepo = {
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return sampleUserRecord;
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    await logoutUser(sampleUserId);
    assertEqual(capturedUpdate.refreshTokenHash, null, "refreshTokenHash cleared");
    assertEqual(capturedUpdate.previousRefreshTokenHash, null, "previousRefreshTokenHash cleared");
    assertEqual(capturedUpdate.previousRefreshTokenExpiresAt, null, "grace expiry cleared");
  });

  // 11. forgotPassword — generates SHA-256 reset token with 1-hour expiry
  await test("forgotPassword generates SHA-256 reset token with 1-hour expiry", async () => {
    let capturedUpdate: any;
    const mockUserRepo = {
      findByEmail: async () => sampleUserRecord,
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return sampleUserRecord;
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    await forgotPassword("customer@renucollections.com");
    assert(typeof capturedUpdate.passwordResetToken === "string", "reset token hash generated");
    assert(capturedUpdate.passwordResetExpires instanceof Date, "expiry is Date");
    assert(capturedUpdate.passwordResetExpires.getTime() > Date.now() + 50 * 60 * 1000, "expiry > 50 min");
  });

  // 12. forgotPassword — silent return for unknown email
  await test("forgotPassword does not reveal if email exists (silent safe return)", async () => {
    let updateCalled = false;
    const mockUserRepo = {
      findByEmail: async () => null,
      updateById: async () => {
        updateCalled = true;
        return null;
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    await forgotPassword("doesnotexist@example.com");
    assert(!updateCalled, "no update performed for non-existent email");
  });

  // 13. resetPassword — updates password hash and revokes sessions
  await test("resetPassword updates password hash, clears reset token and active sessions", async () => {
    let capturedUpdate: any;
    const mockUserRepo = {
      findByPasswordResetToken: async () => sampleUserRecord,
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return sampleUserRecord;
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    await resetPassword("valid-token-string", "BrandNewPassword123");
    assert(capturedUpdate.passwordHash.startsWith("$2"), "password hashed with bcrypt");
    assertEqual(capturedUpdate.passwordResetToken, null, "reset token cleared");
    assertEqual(capturedUpdate.passwordResetExpires, null, "reset expires cleared");
    assertEqual(capturedUpdate.refreshTokenHash, null, "sessions revoked");
  });

  // 14. resetPassword — invalid or expired token throws 400
  await test("resetPassword throws AppError 400 for invalid or expired reset token", async () => {
    const mockUserRepo = {
      findByPasswordResetToken: async () => null,
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await resetPassword("expired-token", "NewPassword123");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 for invalid token");
  });

  // 15. loginWithGoogle — links existing customer account by email
  await test("loginWithGoogle links existing customer account by email or googleId", async () => {
    const capturedUpdates: any[] = [];
    const mockUserRepo = {
      findByGoogleId: async () => null,
      findByEmail: async () => ({ ...sampleUserRecord, googleId: undefined }),
      updateById: async (_id: string, update: any) => {
        capturedUpdates.push(update);
        return { ...sampleUserRecord, ...update };
      },
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const prevClientId = env.GOOGLE_CLIENT_ID;
    (env as any).GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com";

    // Mock verifyIdToken
    const originalVerify = (OAuth2Client.prototype as any).verifyIdToken;
    (OAuth2Client.prototype as any).verifyIdToken = async () => ({
      getPayload: () => ({
        email: "customer@renucollections.com",
        sub: "google-sub-12345",
        picture: "https://example.com/avatar.jpg",
        email_verified: true,
        given_name: "Renu",
        family_name: "Customer",
      }),
    });

    try {
      const result = await loginWithGoogle("fake-id-token");
      assertEqual(result.user.email, "customer@renucollections.com", "user email");
      const linkUpdate = capturedUpdates.find((u) => u.googleId);
      assertEqual(linkUpdate?.googleId, "google-sub-12345", "googleId linked to existing user");
      assertEqual(linkUpdate?.avatarUrl, "https://example.com/avatar.jpg", "avatar updated");
    } finally {
      (OAuth2Client.prototype as any).verifyIdToken = originalVerify;
      (env as any).GOOGLE_CLIENT_ID = prevClientId;
    }
  });

  // 16. loginWithGoogle — creates new customer account
  await test("loginWithGoogle creates new customer account when email does not exist", async () => {
    let capturedCreate: any;
    const mockUserRepo = {
      findByGoogleId: async () => null,
      findByEmail: async () => null,
      create: async (data: any) => {
        capturedCreate = data;
        return { ...sampleUserRecord, ...data, id: sampleUserId, _id: sampleUserId };
      },
      updateById: async (_id: string, update: any) => ({
        ...sampleUserRecord,
        ...capturedCreate,
        ...update,
        id: sampleUserId,
        _id: sampleUserId,
      }),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const prevClientId = env.GOOGLE_CLIENT_ID;
    (env as any).GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com";

    const originalVerify = (OAuth2Client.prototype as any).verifyIdToken;
    (OAuth2Client.prototype as any).verifyIdToken = async () => ({
      getPayload: () => ({
        email: "brandnew@gmail.com",
        sub: "google-new-99999",
        name: "Google New User",
        email_verified: true,
      }),
    });

    try {
      const result = await loginWithGoogle("fake-id-token");
      assertEqual(result.user.email, "brandnew@gmail.com", "new user email");
      assertEqual(capturedCreate.googleId, "google-new-99999", "assigned googleId");
      assertEqual(capturedCreate.role, "customer", "customer role assigned");
    } finally {
      (OAuth2Client.prototype as any).verifyIdToken = originalVerify;
      (env as any).GOOGLE_CLIENT_ID = prevClientId;
    }
  });

  // 17. getUserById — retrieves sanitized user
  await test("getUserById retrieves sanitized user and throws 404 if not found", async () => {
    const mockUserRepo = {
      findById: async (id: string) => (id === sampleUserId ? sampleUserRecord : null),
    } as unknown as PostgresUserRepository;

    setAuthUserRepo(mockUserRepo);

    const user = await getUserById(sampleUserId);
    assertEqual(user.id, sampleUserId, "user id");
    assertEqual(user.email, sampleUserRecord.email, "user email");

    let error: any = null;
    try {
      await getUserById("6ae44c64900e0da3e5b0adff");
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 404, "throws 404 on missing user");
  });

  // 18. updateProfile — updates fields and returns sanitized user
  await test("updateProfile updates profile fields and returns sanitized user", async () => {
    let capturedUpdate: any;
    const mockUserRepo = {
      findByUsername: async () => null,
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return { ...sampleUserRecord, ...update };
      },
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    const updated = await updateProfile(sampleUserId, {
      username: "renunewname",
      phone: "9123456789",
    });

    assertEqual(updated.username, "renunewname", "username updated");
    assertEqual(capturedUpdate.phone, "9123456789", "phone passed to update");
  });

  // 19. updateProfile — throws 409 if username taken
  await test("updateProfile throws AppError 409 if new username is already taken", async () => {
    const mockUserRepo = {
      findByUsername: async () => ({ ...sampleUserRecord, id: "differentUserId12345678" }),
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await updateProfile(sampleUserId, { username: "alreadytaken" });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 409, "throws 409 for duplicate username");
  });

  // 20. changePassword — updates hash and revokes sessions
  await test("changePassword updates password hash and revokes refresh tokens", async () => {
    const oldPass = "OldPassword123";
    const oldHash = await hashPassword(oldPass);

    let capturedUpdate: any;
    const mockUserRepo = {
      findById: async () => ({ ...sampleUserRecord, passwordHash: oldHash }),
      updateById: async (_id: string, update: any) => {
        capturedUpdate = update;
        return sampleUserRecord;
      },
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    await changePassword(sampleUserId, oldPass, "NewPassword456");
    const isNewValid = await comparePassword("NewPassword456", capturedUpdate.passwordHash);
    assert(isNewValid, "new password matches updated hash");
    assertEqual(capturedUpdate.refreshTokenHash, null, "refresh tokens revoked");
  });

  // 21. changePassword — bad current password throws 400
  await test("changePassword throws AppError 400 on incorrect current password", async () => {
    const realHash = await hashPassword("RealPassword123");
    const mockUserRepo = {
      findById: async () => ({ ...sampleUserRecord, passwordHash: realHash }),
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    let error: any = null;
    try {
      await changePassword(sampleUserId, "WrongCurrentPass1", "NewPass999");
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 on bad current pass");
  });

  // 22. listUsers — pagination and filters
  await test("listUsers returns paginated user list with role filtering and text search", async () => {
    let capturedQuery: any;
    const mockUserRepo = {
      findUsers: async (q: any) => {
        capturedQuery = q;
        return { items: [sampleUserRecord], total: 1 };
      },
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    const result = await listUsers({ page: 2, limit: 10, role: "customer", q: "renu" });
    assertEqual(result.items.length, 1, "items length");
    assertEqual(result.meta.page, 2, "meta.page");
    assertEqual(result.meta.limit, 10, "meta.limit");
    assertEqual(capturedQuery.role, "customer", "role filter passed");
    assertEqual(capturedQuery.q, "renu", "search term passed");
  });

  // 23. updateUserRole — updates authorization role
  await test("updateUserRole updates user authorization role and rejects invalid role", async () => {
    let capturedRole: any;
    const mockUserRepo = {
      updateRole: async (_id: string, role: string) => {
        capturedRole = role;
        return { ...sampleUserRecord, role };
      },
    } as unknown as PostgresUserRepository;

    setUserServiceUserRepo(mockUserRepo);

    const updated = await updateUserRole(sampleUserId, "admin");
    assertEqual(updated.role, "admin", "role updated to admin");
    assertEqual(capturedRole, "admin", "role passed to repository");

    let errBadRole: any = null;
    try {
      await updateUserRole(sampleUserId, "superadmin" as any);
    } catch (e) {
      errBadRole = e;
    }
    assert(errBadRole instanceof AppError && errBadRole.statusCode === 400, "rejects invalid role");
  });

  // 24. getUserAddresses — dual id and _id compatibility
  await test("getUserAddresses retrieves addresses with dual id and _id compatibility", async () => {
    const mockUserRepo = {
      findById: async () => sampleUserRecord,
    } as unknown as PostgresUserRepository;

    const mockAddrRepo = {
      findByUserId: async () => [sampleAddressRecord],
    } as unknown as PostgresAddressRepository;

    setAddressUserRepository(mockUserRepo);
    setAddressRepository(mockAddrRepo);

    const addresses = await getUserAddresses(sampleUserId);
    assertEqual(addresses.length, 1, "addresses count");
    assertEqual(addresses[0].id, sampleAddressId, "id is present");
    assertEqual(addresses[0]._id, sampleAddressId, "_id matches id");
    assertEqual(addresses[0].postalCode, "625001", "postalCode matches");
  });

  // 25. createAddress — validates Indian PIN code and phone
  await test("createAddress validates Indian PIN code (6 digits) and phone numbers", async () => {
    const mockUserRepo = { findById: async () => sampleUserRecord } as unknown as PostgresUserRepository;
    setAddressUserRepository(mockUserRepo);

    // Invalid PIN (5 digits)
    let errPin: any = null;
    try {
      await createAddress(sampleUserId, {
        fullName: "Test User",
        line1: "123 Street",
        city: "City",
        state: "State",
        postalCode: "12345", // 5 digits
        phone: "9876543210",
      });
    } catch (e) {
      errPin = e;
    }
    assert(errPin instanceof AppError && errPin.statusCode === 400, "rejects 5-digit PIN");

    // Invalid phone (7 digits)
    let errPhone: any = null;
    try {
      await createAddress(sampleUserId, {
        fullName: "Test User",
        line1: "123 Street",
        city: "City",
        state: "State",
        postalCode: "625001",
        phone: "1234567", // 7 digits
      });
    } catch (e) {
      errPhone = e;
    }
    assert(errPhone instanceof AppError && errPhone.statusCode === 400, "rejects 7-digit phone");
  });

  // 26. createAddress — first address marked default
  await test("createAddress marks first address for user as default automatically", async () => {
    let capturedData: any;
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("SELECT id, email FROM users")) return { rows: [sampleUserRecord], rowCount: 1 };
      if (sql.includes("SELECT COUNT(*)::int AS count FROM user_addresses")) return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.includes("INSERT INTO user_addresses")) {
        return { rows: [{ ...sampleAddressRecord, is_default: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const mockAddrRepo = {
      countByUserId: async () => 0,
      clearDefaultsForUser: async () => {},
      create: async (data: any) => {
        capturedData = data;
        return { ...sampleAddressRecord, ...data };
      },
    } as unknown as PostgresAddressRepository;

    const mockUserRepo = { findById: async () => sampleUserRecord } as unknown as PostgresUserRepository;

    setAddressDatabasePool(pool);
    setAddressUserRepository(mockUserRepo);
    setAddressRepository(mockAddrRepo);

    await createAddress(sampleUserId, {
      fullName: "First Address",
      line1: "123 Main St",
      city: "Madurai",
      state: "Tamil Nadu",
      postalCode: "625001",
      phone: "9876543210",
      isDefault: false, // passed false, but first address should become true
    });

    assertEqual(capturedData.isDefault, true, "first address promoted to default");
  });

  // 27. createAddress — with isDefault=true clears previous defaults
  await test("createAddress with isDefault=true clears previous default addresses in transaction", async () => {
    let clearedDefaults = false;
    const { pool } = createMockDbPool();

    const mockAddrRepo = {
      countByUserId: async () => 2,
      clearDefaultsForUser: async () => {
        clearedDefaults = true;
      },
      create: async (data: any) => ({ ...sampleAddressRecord, ...data }),
    } as unknown as PostgresAddressRepository;

    const mockUserRepo = { findById: async () => sampleUserRecord } as unknown as PostgresUserRepository;

    setAddressDatabasePool(pool);
    setAddressUserRepository(mockUserRepo);
    setAddressRepository(mockAddrRepo);

    await createAddress(sampleUserId, {
      fullName: "New Default",
      line1: "456 North St",
      city: "Madurai",
      state: "Tamil Nadu",
      postalCode: "625001",
      phone: "9876543210",
      isDefault: true,
    });

    assert(clearedDefaults, "cleared previous default addresses");
  });

  // 28. updateAddress — verifies ownership (404 on unauthorized)
  await test("updateAddress updates fields and verifies user ownership (throws 404 if unauthorized)", async () => {
    const { pool } = createMockDbPool();
    const unauthorizedUserId = "6ae44c64900e0da3e5b0adff";

    const mockAddrRepo = {
      findByIdAndUserId: async (_id: string, userId: string) => {
        if (userId === unauthorizedUserId) return null;
        return sampleAddressRecord;
      },
      clearDefaultsForUser: async () => {},
      updateById: async (_id: string, _uid: string, update: any) => ({
        ...sampleAddressRecord,
        ...update,
      }),
    } as unknown as PostgresAddressRepository;

    setAddressDatabasePool(pool);
    setAddressRepository(mockAddrRepo);

    // Authorized update
    const updated = await updateAddress(sampleUserId, sampleAddressId, {
      line1: "789 Updated Blvd",
    });
    assertEqual(updated.line1, "789 Updated Blvd", "line1 updated");

    // Unauthorized update attempt
    let error: any = null;
    try {
      await updateAddress(unauthorizedUserId, sampleAddressId, { line1: "Hacked" });
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 404, "throws 404 for unowned address");
  });

  // 29. deleteAddress — promotes next address to default if default deleted
  await test("deleteAddress deletes address and promotes next remaining address to default", async () => {
    let deleted = false;
    let promotedId: string | null = null;
    const { pool } = createMockDbPool();

    const mockAddrRepo = {
      findByIdAndUserId: async () => ({ ...sampleAddressRecord, isDefault: true }),
      deleteById: async () => {
        deleted = true;
        return sampleAddressRecord;
      },
      findFirstByUserId: async () => ({
        ...sampleAddressRecord,
        id: "remainingAddrId12345678",
      }),
      setDefault: async (id: string) => {
        promotedId = id;
      },
    } as unknown as PostgresAddressRepository;

    setAddressDatabasePool(pool);
    setAddressRepository(mockAddrRepo);

    await deleteAddress(sampleUserId, sampleAddressId);
    assert(deleted, "address deleted");
    assertEqual(promotedId, "remainingAddrId12345678", "remaining address promoted to default");
  });

  // 30. setDefaultAddress — marks target as default
  await test("setDefaultAddress marks target address as default and clears others", async () => {
    let setDefaultCalledWith: string | null = null;
    const { pool } = createMockDbPool();

    const mockAddrRepo = {
      findByIdAndUserId: async () => sampleAddressRecord,
      setDefault: async (id: string) => {
        setDefaultCalledWith = id;
      },
    } as unknown as PostgresAddressRepository;

    setAddressDatabasePool(pool);
    setAddressRepository(mockAddrRepo);

    await setDefaultAddress(sampleUserId, sampleAddressId);
    assertEqual(setDefaultCalledWith, sampleAddressId, "target address marked as default");
  });

  // 31. Dual ID compatibility — ObjectId and UUID
  await test("Dual ID compatibility — verifies 24-char hex MongoDB ObjectIds and 36-char UUIDs", async () => {
    // 24-char hex Mongo ObjectId
    const userMongo = mapRowToUser({
      id: sampleUserId,
      email: "mongo@example.com",
      username: "mongouser",
      password_hash: null,
      first_name: null,
      last_name: null,
      phone: null,
      role: "customer",
      google_id: null,
      avatar_url: null,
      is_email_verified: false,
      refresh_token_hash: null,
      previous_refresh_token_hash: null,
      previous_refresh_token_expires_at: null,
      password_reset_token: null,
      password_reset_expires: null,
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(userMongo.id, sampleUserId, "mongo id");
    assertEqual(userMongo._id, sampleUserId, "mongo _id");

    // 36-char canonical UUID
    const userUuid = mapRowToUser({
      id: sampleUuidUserId,
      email: "uuid@example.com",
      username: "uuiduser",
      password_hash: null,
      first_name: null,
      last_name: null,
      phone: null,
      role: "customer",
      google_id: null,
      avatar_url: null,
      is_email_verified: false,
      refresh_token_hash: null,
      previous_refresh_token_hash: null,
      previous_refresh_token_expires_at: null,
      password_reset_token: null,
      password_reset_expires: null,
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(userUuid.id, sampleUuidUserId, "uuid id");
    assertEqual(userUuid._id, sampleUuidUserId, "uuid _id");

    const addr = mapRowToAddress({
      id: sampleAddressId,
      user_id: sampleUserId,
      label: null,
      full_name: "Test",
      line1: "Line 1",
      line2: null,
      city: "City",
      state: "State",
      postal_code: "123456",
      country: "IN",
      phone: "9876543210",
      is_default: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(addr.id, sampleAddressId, "addr id");
    assertEqual(addr._id, sampleAddressId, "addr _id");
  });

  // 32. Transaction rollback — address operations roll back on error
  await test("Transaction rollback — address operations roll back atomically on failure", async () => {
    const sampleUserDbRow = {
      id: sampleUserId,
      email: "customer@renucollections.com",
      username: "renucustomer",
      password_hash: null,
      first_name: "Renu",
      last_name: "Collections",
      phone: "9876543210",
      role: "customer",
      google_id: null,
      avatar_url: null,
      is_email_verified: true,
      refresh_token_hash: null,
      previous_refresh_token_hash: null,
      previous_refresh_token_expires_at: null,
      password_reset_token: null,
      password_reset_expires: null,
      last_login_at: null,
      created_at: new Date("2026-01-01T10:00:00Z"),
      updated_at: new Date("2026-01-01T10:00:00Z"),
    };

    const { pool, queries, released } = createMockDbPool((sql) => {
      if (sql.includes("FROM users")) return { rows: [sampleUserDbRow], rowCount: 1 };
      if (sql.includes("SELECT COUNT(*)")) return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.includes("INSERT INTO user_addresses")) {
        throw new Error("Simulated address insert failure");
      }
      return { rows: [], rowCount: 0 };
    });

    setAddressDatabasePool(pool);
    setAddressUserRepository(new PostgresUserRepository(pool));
    setAddressRepository(new PostgresAddressRepository(pool));

    let error: any = null;
    try {
      await createAddress(sampleUserId, {
        fullName: "Failing Address",
        line1: "123 Street",
        city: "City",
        state: "State",
        postalCode: "625001",
        phone: "9876543210",
      });
    } catch (e) {
      error = e;
    }

    assert(error !== null && error.message.includes("Simulated address insert failure"), "error propagated");
    const hasRollback = queries.some((q) => q.sql === "ROLLBACK");
    assert(hasRollback, "ROLLBACK executed on failure");
    assert(released[0] === true, "client released back to pool");
  });

  // ── Results Summary ───────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner encountered an unhandled error:", err);
  process.exit(1);
});
