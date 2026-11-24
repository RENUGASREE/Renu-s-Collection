import { reconcileUserGroup, MongoToSupabaseMigrator } from "./migrate-mongo-to-supabase.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – DUPLICATE USER RECONCILIATION & FK MAPPING TESTS");
  console.log("================================================================================\n");

  const doc1 = {
    _id: "6aa14bc403bc2db28142fcec",
    email: "athithyans07@gmail.com",
    username: "Athithyan S",
    passwordHash: "$2b$12$doc1HashValuePlaceholder12345678901234567890",
    role: "customer",
    googleId: null,
    avatarUrl: null,
    isEmailVerified: false,
    refreshTokenHash: "$2b$12$doc1RefreshTokenHash1234567890",
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    lastLoginAt: new Date("2026-09-09T12:06:32.759Z"),
    createdAt: new Date("2026-09-09T12:06:28.466Z"),
    updatedAt: new Date("2026-09-09T12:06:32.760Z"),
    addresses: [],
  };

  const doc2 = {
    _id: "6aa14bc803bc2db28142fcef",
    email: "athithyans07@gmail.com",
    username: "Athithyan S",
    passwordHash: "$2b$12$doc2HashValueActiveSession123456789012345678",
    role: "customer",
    googleId: null,
    avatarUrl: null,
    isEmailVerified: false,
    refreshTokenHash: "$2b$12$doc2RefreshTokenHashActiveSession1234567890",
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    lastLoginAt: new Date("2026-09-09T12:06:35.059Z"),
    createdAt: new Date("2026-09-09T12:06:32.568Z"),
    updatedAt: new Date("2026-09-09T12:08:11.224Z"),
    addresses: [
      {
        _id: "6aa14c2b03bc2db28142fd22",
        label: "",
        fullName: "Athithyan S",
        line1: "Sample Line 1",
        city: "Kodaikanal",
        state: "Tamilnadu",
        postalCode: "624101",
        country: "India",
        phone: "9876543210",
        isDefault: true,
      },
    ],
  };

  // --------------------------------------------------------------------------
  // Test 1: Canonical Account Selection
  // --------------------------------------------------------------------------
  console.log("--- Test 1: Canonical Account Selection & Credential Retention ---");
  const aliasMap1 = new Map<string, string>();
  const reconciled1 = reconcileUserGroup([doc1, doc2], aliasMap1);

  assert(
    reconciled1._id.toString() === "6aa14bc803bc2db28142fcef",
    "Canonical account selected is Document 2 (6aa14bc803bc2db28142fcef)"
  );

  assert(
    reconciled1.passwordHash === doc2.passwordHash,
    "Document 2's active password hash is preserved"
  );

  assert(
    reconciled1.refreshTokenHash === doc2.refreshTokenHash,
    "Document 2's active session refreshTokenHash is preserved"
  );

  assert(
    reconciled1.lastLoginAt.getTime() === doc2.lastLoginAt.getTime(),
    "Document 2's latest login timestamp is preserved"
  );

  assert(
    reconciled1.updatedAt.getTime() === doc2.updatedAt.getTime(),
    "Document 2's latest updatedAt timestamp is preserved"
  );

  // --------------------------------------------------------------------------
  // Test 2: Earliest Created Timestamp & Address Merging
  // --------------------------------------------------------------------------
  console.log("\n--- Test 2: Timestamp & Address Merging ---");
  assert(
    reconciled1.createdAt.getTime() === doc1.createdAt.getTime(),
    "Earliest account creation timestamp is preserved from Document 1 (12:06:28Z)"
  );

  assert(
    Array.isArray(reconciled1.addresses) && reconciled1.addresses.length === 1,
    "Saved customer address from Document 2 is preserved"
  );

  assert(
    reconciled1.addresses[0].city === "Kodaikanal",
    "Customer address details (Kodaikanal) preserved intact"
  );

  // --------------------------------------------------------------------------
  // Test 3: Alias Mapping & Foreign-Key Redirection
  // --------------------------------------------------------------------------
  console.log("\n--- Test 3: Alias Mapping & Foreign-Key Redirection ---");
  assert(
    aliasMap1.get("6aa14bc403bc2db28142fcec") === "6aa14bc803bc2db28142fcef",
    "Document 1 ID maps to canonical Document 2 ID in aliasMap"
  );

  const migrator = new MongoToSupabaseMigrator({ dryRun: true, resume: false, batchSize: 50 });
  // Simulate registered alias
  (migrator as any).userIdAliases = aliasMap1;

  assert(
    migrator.resolveUserId("6aa14bc403bc2db28142fcec") === "6aa14bc803bc2db28142fcef",
    "resolveUserId redirects Document 1 reference to canonical Document 2 ID"
  );

  assert(
    migrator.resolveUserId("6aa14bc803bc2db28142fcef") === "6aa14bc803bc2db28142fcef",
    "resolveUserId preserves canonical Document 2 ID unchanged"
  );

  assert(
    migrator.resolveUserId("unrelated_user_789") === "unrelated_user_789",
    "resolveUserId preserves unrelated user IDs without alteration"
  );

  // Simulate dependent records
  const mockOrder = { orderNumber: "ORD-1001", userId: "6aa14bc403bc2db28142fcec" };
  const mockCart = { sessionId: "sess-abc", userId: "6aa14bc403bc2db28142fcec" };
  const mockSavedDesign = { name: "My Bracelet", userId: "6aa14bc403bc2db28142fcec" };

  assert(
    migrator.resolveUserId(mockOrder.userId) === "6aa14bc803bc2db28142fcef",
    "Order foreign-key pointing to Document 1 redirected to canonical Document 2"
  );

  assert(
    migrator.resolveUserId(mockCart.userId) === "6aa14bc803bc2db28142fcef",
    "Cart foreign-key pointing to Document 1 redirected to canonical Document 2"
  );

  assert(
    migrator.resolveUserId(mockSavedDesign.userId) === "6aa14bc803bc2db28142fcef",
    "SavedDesign foreign-key pointing to Document 1 redirected to canonical Document 2"
  );

  // --------------------------------------------------------------------------
  // Test 4: Input Order Independence (Commutativity)
  // --------------------------------------------------------------------------
  console.log("\n--- Test 4: Input Order Independence (Commutativity) ---");
  const aliasMapReversed = new Map<string, string>();
  const reconciledReversed = reconcileUserGroup([doc2, doc1], aliasMapReversed);

  assert(
    reconciledReversed._id.toString() === "6aa14bc803bc2db28142fcef",
    "Reconciliation produces Document 2 regardless of array order [doc2, doc1]"
  );

  assert(
    aliasMapReversed.get("6aa14bc403bc2db28142fcec") === "6aa14bc803bc2db28142fcef",
    "Alias mapping correctly created regardless of input order"
  );

  assert(
    reconciledReversed.passwordHash === doc2.passwordHash,
    "Document 2 password hash selected regardless of input order"
  );

  // --------------------------------------------------------------------------
  // Test 5: Idempotency & Repeatability
  // --------------------------------------------------------------------------
  console.log("\n--- Test 5: Idempotency & Repeatability ---");
  const aliasMapRepeat1 = new Map<string, string>();
  const resPass1 = reconcileUserGroup([doc1, doc2], aliasMapRepeat1);

  const aliasMapRepeat2 = new Map<string, string>();
  const resPass2 = reconcileUserGroup([doc1, doc2], aliasMapRepeat2);

  assert(
    resPass1._id.toString() === resPass2._id.toString(),
    "Repeat execution produces identical canonical ID"
  );

  assert(
    aliasMapRepeat1.get("6aa14bc403bc2db28142fcec") === aliasMapRepeat2.get("6aa14bc403bc2db28142fcec"),
    "Repeat execution produces identical alias mapping"
  );

  assert(
    resPass1.createdAt.getTime() === resPass2.createdAt.getTime(),
    "Repeat execution produces identical timestamps"
  );

  console.log("\n================================================================================");
  console.log("ALL 18 RECONCILIATION & FK MAPPING ASSERTIONS PASSED SUCCESSFULLY!");
  console.log("================================================================================\n");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
});
