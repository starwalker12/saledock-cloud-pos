import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/customers/actions.ts", import.meta.url),
  "utf8",
);
const e2eSource = readFileSync(
  new URL("./e2e/customer-lifecycle-audit.spec.ts", import.meta.url),
  "utf8",
);

function actionSource(name, nextName) {
  const start = actionsSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName
    ? actionsSource.indexOf(`export async function ${nextName}`, start)
    : actionsSource.length;
  assert.notEqual(end, -1, `${nextName} must exist`);
  return actionsSource.slice(start, end);
}

const saveSource = actionSource("saveCustomerAction", "archiveCustomerAction");
const archiveSource = actionSource(
  "archiveCustomerAction",
  "restoreCustomerAction",
);
const restoreSource = actionSource(
  "restoreCustomerAction",
  "recordCreditPaymentAction",
);
const creditSource = actionSource(
  "recordCreditPaymentAction",
  "recordWriteOffAction",
);
const writeOffSource = actionSource("recordWriteOffAction");

test("create and genuine update confirm one organization-scoped row before auditing", () => {
  assert.match(
    saveSource,
    /\.insert\([\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/,
  );
  assert.match(saveSource, /if \(error \|\| !createdCustomer\)/);
  assert.match(
    saveSource,
    /await logAudit\(\{[\s\S]*?action: "customers\.created"/,
  );
  assert.match(
    saveSource,
    /details: `Created customer \$\{createdCustomer\.id\}`/,
  );
  assert.match(saveSource, /customer_id: createdCustomer\.id/);
  assert.match(
    saveSource,
    /new_status: basePayload\.is_archived \? "archived" : "active"/,
  );
  assert.ok(
    saveSource.indexOf('.select("id")') <
      saveSource.indexOf('action: "customers.created"'),
  );

  assert.match(
    saveSource,
    /\.update\(\{ \.\.\.basePayload, archived_at: archivedAt \}\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", w\.ctx\.profile!\.organization_id!\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(saveSource, /if \(error \|\| !updatedCustomer\)/);
  assert.match(
    saveSource,
    /await logAudit\(\{[\s\S]*?action: "customers\.updated"/,
  );
  assert.match(
    saveSource,
    /details: `Updated customer \$\{updatedCustomer\.id\}`/,
  );
  assert.match(saveSource, /customer_id: updatedCustomer\.id/);
  assert.match(saveSource, /changed_fields: changedFields/);
});

test("identical updates return success without a database write or lifecycle audit", () => {
  assert.match(
    saveSource,
    /if \(changedFields\.length === 0\) \{\s*return ok\("Customer details updated\."\);\s*\}/,
  );
  const noOpIndex = saveSource.indexOf("if (changedFields.length === 0)");
  const updateIndex = saveSource.indexOf(".update({ ...basePayload");
  const auditIndex = saveSource.indexOf('action: "customers.updated"');
  assert.ok(noOpIndex < updateIndex);
  assert.ok(noOpIndex < auditIndex);
});

test("archive and Restore audit only confirmed organization-scoped state transitions", () => {
  assert.match(
    archiveSource,
    /\.update\(\{ is_archived: true, archived_at: new Date\(\)\.toISOString\(\) \}\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", w\.ctx\.profile!\.organization_id!\)[\s\S]*?\.eq\("is_archived", false\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(archiveSource, /if \(error \|\| !archivedCustomer\) return/);
  assert.match(
    archiveSource,
    /await logAudit\(\{[\s\S]*?action: "customers\.archived"/,
  );
  assert.match(archiveSource, /customer_id: archivedCustomer\.id/);
  assert.match(archiveSource, /previous_status: "active"/);
  assert.match(archiveSource, /new_status: "archived"/);

  assert.match(
    restoreSource,
    /\.update\(\{ is_archived: false, archived_at: null \}\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", w\.ctx\.profile!\.organization_id!\)[\s\S]*?\.eq\("is_archived", true\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(restoreSource, /if \(error \|\| !restoredCustomer\) return/);
  assert.match(
    restoreSource,
    /await logAudit\(\{[\s\S]*?action: "customers\.restored"/,
  );
  assert.match(restoreSource, /customer_id: restoredCustomer\.id/);
  assert.match(restoreSource, /previous_status: "archived"/);
  assert.match(restoreSource, /new_status: "active"/);
});

test("lifecycle audit payloads identify records without copying private profile values", () => {
  const lifecycleAuditSource = [
    ...saveSource.matchAll(/await logAudit\(\{[\s\S]*?\n    \}\);/g),
    ...archiveSource.matchAll(/await logAudit\(\{[\s\S]*?\n  \}\);/g),
    ...restoreSource.matchAll(/await logAudit\(\{[\s\S]*?\n  \}\);/g),
  ]
    .map((match) => match[0])
    .filter((source) =>
      /customers\.(?:created|updated|archived|restored)/.test(source),
    )
    .join("\n");

  assert.match(lifecycleAuditSource, /customer_id/);
  assert.doesNotMatch(
    lifecycleAuditSource,
    /parsed\.data\.(?:phone|email|address|notes)|basePayload\.(?:phone|email|address|notes)|existingCustomer\.(?:phone|email|address|notes)/,
  );
  assert.doesNotMatch(lifecycleAuditSource, /phone:|email:|address:|notes:/);
});

test("existing customer financial actions and RPCs retain their established contracts", () => {
  assert.match(creditSource, /\.rpc\("record_credit_payment"/);
  assert.match(creditSource, /action: "customer\.credit_payment"/);
  assert.match(writeOffSource, /\.rpc\("record_customer_write_off"/);
  assert.match(writeOffSource, /action: "customer\.write_off"/);
  assert.equal((actionsSource.match(/\.rpc\(/g) ?? []).length, 2);
});

test("production-mode regression remains marker-isolated and excludes settlement", () => {
  assert.match(e2eSource, /markerCustomers/);
  assert.match(e2eSource, /matchingLifecycleAudits/);
  assert.match(e2eSource, /captureSafetySnapshot/);
  assert.match(e2eSource, /cleanupGeneratedRows/);
  assert.match(
    e2eSource,
    /expect\(await markerCustomers\(admin, marker\)\)\.toHaveLength\(0\)/,
  );
  assert.doesNotMatch(
    e2eSource,
    /recordCreditPaymentAction|recordWriteOffAction|record_credit_payment|record_customer_write_off/,
  );
});
