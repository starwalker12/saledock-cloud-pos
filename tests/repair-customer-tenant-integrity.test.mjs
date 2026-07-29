import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionSource = readFileSync(
  new URL("../src/app/repairs/actions.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260729133000_enforce_repair_customer_tenant_integrity.sql",
    import.meta.url,
  ),
  "utf8",
);
const backupSource = readFileSync(
  new URL("../src/app/settings/backup-actions.ts", import.meta.url),
  "utf8",
);
const demoSource = readFileSync(
  new URL("../src/app/settings/demo-actions.ts", import.meta.url),
  "utf8",
);
const validationSource = readFileSync(
  new URL("../src/lib/validation/repairs.ts", import.meta.url),
  "utf8",
);
const e2eSource = readFileSync(
  new URL("./e2e/repair-customer-tenant-integrity.spec.ts", import.meta.url),
  "utf8",
);

const saveStart = actionSource.indexOf("export async function saveRepairAction");
const saveEnd = actionSource.indexOf(
  "export async function updateRepairStatusAction",
  saveStart,
);
assert.notEqual(saveStart, -1);
assert.notEqual(saveEnd, -1);
const saveSource = actionSource.slice(saveStart, saveEnd);

test("repair create and edit share one organization-scoped customer ownership check", () => {
  assert.match(
    saveSource,
    /\.from\("customers"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.eq\("id", finalCustomerId\)[\s\S]*?\.eq\("organization_id", orgId\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(
    saveSource,
    /if \(customerLookupError \|\| !selectedCustomer\) \{\s*return err\("The selected customer is unavailable\."\);\s*\}/,
  );
  assert.doesNotMatch(
    saveSource,
    /\.select\("(?:[^"]*name|[^"]*phone|[^"]*email|[^"]*address|[^"]*notes)[^"]*"\)/,
  );

  const lookupIndex = saveSource.indexOf('.from("customers")');
  assert.ok(lookupIndex < saveSource.indexOf('.from("repairs")'));
  assert.ok(lookupIndex < saveSource.indexOf('.from("repair_status_history")'));
  assert.ok(lookupIndex < saveSource.indexOf("logAudit({"));
  assert.equal((saveSource.match(/The selected customer is unavailable\./g) ?? []).length, 1);
});

test("quick-created customers remain organization-owned and use the returned ID", () => {
  assert.match(
    saveSource,
    /const customerPayload = \{[\s\S]*?organization_id: orgId,[\s\S]*?\};/,
  );
  assert.match(
    saveSource,
    /\.from\("customers"\)[\s\S]*?\.insert\(customerPayload\)[\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/,
  );
  assert.match(saveSource, /finalCustomerId = newCust\.id;/);
  assert.match(saveSource, /customer_id: finalCustomerId,/);
});

test("migration fails on historical mismatches and adds a composite tenant foreign key", () => {
  assert.match(
    migrationSource,
    /join public\.customers as customer\s+on customer\.id = repair\.customer_id/,
  );
  assert.match(
    migrationSource,
    /customer\.organization_id <> repair\.organization_id/,
  );
  assert.match(migrationSource, /if mismatch_count > 0 then\s+raise exception/);
  assert.doesNotMatch(
    migrationSource,
    /update\s+public\.repairs|delete\s+from\s+public\.repairs|customer_id\s*=\s*null/i,
  );
  assert.match(
    migrationSource,
    /create unique index if not exists customers_organization_id_id_key\s+on public\.customers \(organization_id, id\)/,
  );
  assert.match(
    migrationSource,
    /foreign key \(organization_id, customer_id\)\s+references public\.customers \(organization_id, id\)/,
  );
  assert.match(migrationSource, /on update restrict/);
  assert.match(migrationSource, /on delete set null \(customer_id\)/);
});

test("migration contract preserves nullable links and rejects insert and update bypasses", () => {
  assert.match(e2eSource, /DIRECT-NULL/);
  assert.match(e2eSource, /directForeignInsert\.error\?\.code\)\.toBe\("23503"\)/);
  assert.match(e2eSource, /directForeignUpdate\.error\?\.code\)\.toBe\("23503"\)/);
  assert.match(e2eSource, /nullToForeignEdit/);
  assert.match(e2eSource, /customerIdSetNull: true/);
  assert.match(e2eSource, /openingMismatchCount/);
  assert.match(e2eSource, /markerMismatchCount/);
});

test("backup and demo repair writers retain same-organization customer provenance", () => {
  assert.match(
    backupSource,
    /resolveTargetIdsBatch\(supabase, orgId, jobId, "Customers", customerIds\)/,
  );
  assert.match(
    backupSource,
    /\.from\("import_row_mappings"\)[\s\S]*?\.eq\("organization_id", orgId\)[\s\S]*?\.eq\("import_job_id", jobId\)/,
  );
  assert.match(
    backupSource,
    /tableName === "RepairJobs"[\s\S]*?organization_id: orgId,[\s\S]*?customer_id: custId \|\| null/,
  );
  assert.match(
    demoSource,
    /const repairsData = \[[\s\S]*?organization_id: orgId,[\s\S]*?customer_id: aliceCust\?\.id \?\? null/,
  );
});

test("tenant correction does not normalize optional repair fields", () => {
  assert.match(
    validationSource,
    /customer_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/,
  );
  assert.match(
    validationSource,
    /const optionalString = z[\s\S]*?\.preprocess\([\s\S]*?\.optional\(\)[\s\S]*?\.nullable\(\)/,
  );
  assert.match(validationSource, /device_model: optionalString/);
  assert.match(validationSource, /serial_imei: optionalString/);
  assert.match(validationSource, /expected_delivery_at: z\.string\(\)\.optional\(\)\.nullable\(\)/);
  assert.doesNotMatch(actionSource, /normalizeOptional|emptyToNull|blankUuid/);
});
