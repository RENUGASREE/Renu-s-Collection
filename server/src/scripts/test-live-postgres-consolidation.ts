import { createPostgresPool } from "../db/postgres.js";
import { postgresStudioCategoryRepository } from "../repositories/postgres-studio-category.repository.js";
import { postgresConstructionMethodRepository } from "../repositories/postgres-construction-method.repository.js";
import { postgresStudioDesignRuleRepository } from "../repositories/postgres-studio-design-rule.repository.js";
import { postgresStudioAssemblyRepository } from "../repositories/postgres-studio-assembly.repository.js";
import { postgresMaterialLinkRepository } from "../repositories/postgres-material-link.repository.js";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";

async function run() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS: INDEPENDENT STUDIO CONSOLIDATION & PERSISTENCE VERIFICATION");
  console.log("================================================================================");

  const pool = createPostgresPool();
  const studioRepo = new PostgresStudioRepository();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Verify Existing Production Tables & Baseline Integrity
    console.log("\n--- 1. Baseline Database Table Integrity ---");
    const countsRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*)::integer FROM categories) AS categories,
        (SELECT COUNT(*)::integer FROM jewellery_types) AS jewellery_types,
        (SELECT COUNT(*)::integer FROM component_types) AS component_types,
        (SELECT COUNT(*)::integer FROM design_rules) AS design_rules,
        (SELECT COUNT(*)::integer FROM making_charges) AS making_charges,
        (SELECT COUNT(*)::integer FROM studio_materials) AS studio_materials,
        (SELECT COUNT(*)::integer FROM studio_material_variants) AS studio_material_variants,
        (SELECT COUNT(*)::integer FROM design_templates) AS design_templates,
        (SELECT COUNT(*)::integer FROM products) AS products;
    `);
    const c = countsRes.rows[0];
    assert(c.categories === 5, `categories count preserved (${c.categories} === 5)`);
    assert(c.jewellery_types === 5, `jewellery_types count preserved (${c.jewellery_types} === 5)`);
    assert(c.component_types === 2, `component_types single source of truth preserved (${c.component_types} === 2)`);
    assert(c.design_rules === 3, `legacy design_rules preserved (${c.design_rules} === 3)`);
    assert(c.making_charges === 1, `making_charges ₹20 record preserved (${c.making_charges} === 1)`);
    assert(c.studio_materials === 25, `studio_materials preserved (${c.studio_materials} === 25)`);
    assert(c.studio_material_variants === 79, `studio_material_variants preserved (${c.studio_material_variants} === 79)`);
    assert(c.design_templates === 2, `design_templates preserved (${c.design_templates} === 2)`);
    assert(c.products === 11, `products catalogue preserved (${c.products} === 11)`);

    // 2. Direct PostgreSQL Persistence: studio_categories
    console.log("\n--- 2. Independent Studio Categories Persistence ---");
    const testCat = await postgresStudioCategoryRepository.create({
      name: "Test Persistence Category",
      slug: `test-cat-${Date.now()}`,
      description: "Ephemeral verification category",
      isActive: true,
      isPublished: true,
    });
    assert(Boolean(testCat.id), `Category created via repository (ID: ${testCat.id})`);

    // Verify raw query in PostgreSQL
    const catCheck = await pool.query("SELECT * FROM studio_categories WHERE id = $1", [testCat.id]);
    assert(catCheck.rows.length === 1, `Category persisted directly in live PostgreSQL studio_categories table`);

    // Clean up
    await postgresStudioCategoryRepository.delete(testCat.id);
    const catDeletedCheck = await pool.query("SELECT * FROM studio_categories WHERE id = $1", [testCat.id]);
    assert(catDeletedCheck.rows.length === 0, `Category deleted cleanly from PostgreSQL`);

    // 3. Direct PostgreSQL Persistence: studio_construction_methods
    console.log("\n--- 3. Independent Construction Methods & Physical Measurements ---");
    const testMethod = await postgresConstructionMethodRepository.create({
      name: "Test Wire Method",
      slug: `test-method-${Date.now()}`,
      baseMaterialType: "wire_wrap",
      physicalSpecsConfig: {
        cordDiameterMm: null, // Verify nullable
        wireThicknessMm: 0.6,
        chainLengthMm: null,
      },
      allowedComponentRoles: ["bead", "charm"],
    });
    assert(Boolean(testMethod.id), `Construction method created with nullable specs (ID: ${testMethod.id})`);

    const methodCheck = await pool.query("SELECT * FROM studio_construction_methods WHERE id = $1", [testMethod.id]);
    assert(methodCheck.rows.length === 1, `Method persisted directly in live PostgreSQL table`);
    const fetchedSpecs = methodCheck.rows[0].physical_specs_config;
    assert(fetchedSpecs.cordDiameterMm === null, `Nullable cordDiameterMm correctly persisted as null`);
    assert(fetchedSpecs.wireThicknessMm === 0.6, `Non-null wireThicknessMm correctly persisted`);

    await postgresConstructionMethodRepository.delete(testMethod.id);
    const methodDeleted = await pool.query("SELECT * FROM studio_construction_methods WHERE id = $1", [testMethod.id]);
    assert(methodDeleted.rows.length === 0, `Method deleted cleanly from PostgreSQL`);

    // 4. Direct PostgreSQL Persistence: studio_design_rules & Customer Resolution
    console.log("\n--- 4. Studio Design Rules Customer Resolution ---");
    const ruleMethod = await postgresConstructionMethodRepository.create({
      name: "Rule Test Method",
      slug: `rule-test-method-${Date.now()}`,
      baseMaterialType: "elastic_thread",
      allowedComponentRoles: ["bead", "charm"],
    });

    const testRule = await postgresStudioDesignRuleRepository.create({
      name: "Test Independent Rule",
      constructionMethodId: ruleMethod.id,
      maxComponents: 40,
      maxCharms: 4,
      charmCountMode: "distinct_types",
      isActive: true,
      isPublished: true,
    });
    assert(Boolean(testRule.id), `Design rule created (ID: ${testRule.id})`);

    const resolved = await studioRepo.findDesignRule("any_category", ruleMethod.id);
    assert(Boolean(resolved), `findDesignRule successfully resolves independent rule by method`);
    assert(resolved?.maxCharms === 4, `Resolved maxCharms matches rule (4)`);
    assert(resolved?.charmCountMode === "distinct_types", `Resolved charmCountMode matches rule (distinct_types)`);

    await postgresStudioDesignRuleRepository.delete(testRule.id);
    const ruleDeleted = await pool.query("SELECT * FROM studio_design_rules WHERE id = $1", [testRule.id]);
    assert(ruleDeleted.rows.length === 0, `Design rule deleted cleanly from PostgreSQL`);

    // 5. Direct PostgreSQL Persistence: studio_material_links
    console.log("\n--- 5. Inventory Connections (Material Links) Persistence ---");
    const testLink = await postgresMaterialLinkRepository.create({
      studioMaterialId: "mat_test_123",
      customizationMaterialId: "cust_mat_456",
      authoritativeSource: "inventory",
      consumptionQty: 1,
      notes: "Test link verification",
    });
    assert(Boolean(testLink.id), `Material link created (ID: ${testLink.id})`);

    const linkCheck = await pool.query("SELECT * FROM studio_material_links WHERE id = $1", [testLink.id]);
    assert(linkCheck.rows.length === 1, `Material link persisted in live PostgreSQL studio_material_links table`);
    assert(linkCheck.rows[0].authoritative_source === "inventory", `Authoritative source preserved as inventory`);

    await postgresMaterialLinkRepository.delete(testLink.id);
    const linkDeleted = await pool.query("SELECT * FROM studio_material_links WHERE id = $1", [testLink.id]);
    assert(linkDeleted.rows.length === 0, `Material link deleted cleanly from PostgreSQL`);

    // 6. Direct PostgreSQL Persistence: studio_assembly_structures
    console.log("\n--- 6. Visual Assembly Structure Persistence ---");
    const testAssembly = await postgresStudioAssemblyRepository.create({
      constructionMethodId: ruleMethod.id,
      name: "Test Assembly Structure",
      nodes: [
        {
          id: "node_1",
          role: "bead",
          displayName: "Test Bead",
          x: 250,
          y: 250,
          width: 24,
          height: 24,
          rotationDeg: 0,
          zIndex: 1,
          visible: true,
        },
      ],
      connections: [],
      attachmentPoints: [],
    });
    assert(Boolean(testAssembly.id), `Assembly structure saved (ID: ${testAssembly.id})`);

    const assemblyCheck = await pool.query("SELECT * FROM studio_assembly_structures WHERE id = $1", [testAssembly.id]);
    assert(assemblyCheck.rows.length === 1, `Assembly structure persisted in live PostgreSQL table`);
    assert(Array.isArray(assemblyCheck.rows[0].nodes), `Nodes column correctly serialized as JSON/array in PostgreSQL`);

    await postgresStudioAssemblyRepository.delete(testAssembly.id);
    const assemblyDeleted = await pool.query("SELECT * FROM studio_assembly_structures WHERE id = $1", [testAssembly.id]);
    assert(assemblyDeleted.rows.length === 0, `Assembly structure deleted cleanly from PostgreSQL`);

    await postgresConstructionMethodRepository.delete(ruleMethod.id);

    // 7. Component Types Single Source of Truth
    console.log("\n--- 7. Component Types Single Source of Truth ---");
    const compTypes = await studioRepo.listComponentTypes();
    assert(compTypes.length === 2, `Component types returns exactly 2 records from database (found ${compTypes.length})`);
    assert(compTypes.some(t => t.typeId === "bead"), `Contains 'bead'`);
    assert(compTypes.some(t => t.typeId === "charm"), `Contains 'charm'`);
    assert(!compTypes.some(t => t.typeId === "stone"), `Does NOT contain inactive/deleted 'stone'`);

    console.log("\n================================================================================");
    console.log(`TOTAL CONSOLIDATION PERSISTENCE SUITE: ${passed} PASSED / ${failed} FAILED`);
    console.log("================================================================================");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in consolidation verification:", err);
  process.exit(1);
});
