import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const actionSource = readFileSync(
  new URL("../src/app/repairs/actions.ts", import.meta.url),
  "utf8",
);
const auditSource = readFileSync(
  new URL("../src/lib/audit.ts", import.meta.url),
  "utf8",
);
const validationSource = readFileSync(
  new URL("../src/lib/validation/repairs.ts", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../src/app/repairs/repair-form.tsx", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260729133000_enforce_repair_customer_tenant_integrity.sql",
    import.meta.url,
  ),
  "utf8",
);

const REPAIR_ID = "00000000-0000-4000-8000-000000000901";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000902";
const ACTOR_ID = "00000000-0000-4000-8000-000000000801";
const ORG_ID = "00000000-0000-4000-8000-000000000802";
const BRANCH_ID = "00000000-0000-4000-8000-000000000803";
const AUDIT_FAILURE =
  "The repair was saved, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const HISTORY_FAILURE =
  "The repair was saved, but its initial status history could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";

const saveStart = actionSource.indexOf("export async function saveRepairAction");
const statusStart = actionSource.indexOf(
  "export async function updateRepairStatusAction",
  saveStart,
);
const statusEnd = actionSource.indexOf(
  "export async function saveDiagnosisAndNotesAction",
  statusStart,
);
assert.notEqual(saveStart, -1);
assert.notEqual(statusStart, -1);
assert.notEqual(statusEnd, -1);
const saveSource = actionSource.slice(saveStart, statusStart);
const statusSource = actionSource.slice(statusStart, statusEnd);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compileModule(source, dependencies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", compiled)(
    localRequire,
    compiledModule,
    compiledModule.exports,
  );
  return compiledModule.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function validRepair(overrides = {}) {
  return {
    customer_name: "QA walk-in",
    device_type: "Mobile",
    problem_description: "QA durability",
    estimated_cost: 0,
    advance_paid: 0,
    payment_method: "cash",
    status: "received",
    ...overrides,
  };
}

function repairFormData(overrides = {}) {
  const values = {
    customer_name: "QA walk-in",
    device_type: "Mobile",
    problem_description: "QA durability",
    estimated_cost: "0",
    advance_paid: "0",
    payment_method: "cash",
    status: "received",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) formData.set(key, String(value));
  }
  return formData;
}

function createHarness(options = {}) {
  const store = {
    events: [],
    repairs: [],
    histories: [],
    audits: [],
    customerLookups: 0,
    clientCreations: 0,
  };
  const auditGate = options.auditGate ?? null;

  function createSupabase() {
    store.clientCreations += 1;
    return {
      from(table) {
        let operation = "select";
        let payload;
        let executed;
        const query = {
          select() {
            return query;
          },
          insert(value) {
            operation = "insert";
            payload = value;
            return query;
          },
          update(value) {
            operation = "update";
            payload = value;
            return query;
          },
          eq() {
            return query;
          },
          maybeSingle() {
            return run(true);
          },
          single() {
            return run(true);
          },
          then(resolve, reject) {
            return run(false).then(resolve, reject);
          },
        };

        function run(single) {
          if (!executed) {
            executed = (async () => {
              if (table === "customers" && operation === "select") {
                store.customerLookups += 1;
                store.events.push("customer-lookup:complete");
                return options.tenantReject
                  ? { data: null, error: null }
                  : { data: { id: CUSTOMER_ID }, error: null };
              }
              if (table === "repairs" && operation === "select") {
                store.events.push("repair-list:complete");
                return { data: store.repairs.map(({ job_no }) => ({ job_no })), error: null };
              }
              if (table === "repairs" && operation === "insert") {
                store.events.push("repair:started");
                if (options.repairInsertError) {
                  store.events.push("repair:error");
                  return { data: null, error: { code: "QA_REPAIR_INSERT" } };
                }
                const repair = { ...payload, id: REPAIR_ID };
                store.repairs.push(repair);
                store.events.push("repair:complete");
                return { data: single ? { id: REPAIR_ID } : [repair], error: null };
              }
              if (table === "repairs" && operation === "update") {
                store.repairs.push({ ...payload, id: REPAIR_ID, updated: true });
                store.events.push("repair-update:complete");
                return { data: null, error: null };
              }
              if (table === "repair_status_history" && operation === "insert") {
                if (options.historyThrow) {
                  store.events.push("history:threw");
                  throw new Error("QA_HISTORY_THROW");
                }
                if (options.historyError) {
                  store.events.push("history:error");
                  return { data: null, error: { code: "QA_HISTORY_INSERT" } };
                }
                store.histories.push(payload);
                store.events.push("history:complete");
                return { data: null, error: null };
              }
              if (table === "audit_logs" && operation === "insert") {
                store.events.push("audit:started");
                if (auditGate) await auditGate.promise;
                if (options.auditThrow) {
                  store.events.push("audit:threw");
                  throw new Error("QA_AUDIT_THROW");
                }
                if (options.auditError) {
                  store.events.push("audit:error");
                  return { data: null, error: { code: "QA_AUDIT_INSERT" } };
                }
                store.audits.push(payload);
                store.events.push("audit:complete");
                return { data: null, error: null };
              }
              throw new Error(`Unexpected query: ${table} ${operation}`);
            })();
          }
          return executed;
        }

        return query;
      },
    };
  }

  const parsedRepair = validRepair(
    options.selectedCustomer ? { customer_id: CUSTOMER_ID } : {},
  );
  const saveRepairAction = compileModule(actionSource, {
    "next/cache": {
      revalidatePath: (path) => store.events.push(`revalidate:${path}`),
    },
    "next/navigation": {
      redirect: (path) => {
        throw new Error(`redirect:${path}`);
      },
    },
    "@/lib/supabase/server": { createClient: async () => createSupabase() },
    "@/lib/auth/session": {
      getCurrentContext: async () => ({
        user: { id: "auth-user" },
        profile: {
          id: ACTOR_ID,
          organization_id: ORG_ID,
          branch_id: BRANCH_ID,
          role: "owner",
        },
      }),
    },
    "@/lib/permissions": {
      canCreateRepairs: () => true,
      canEditRepairs: () => true,
      canUpdateRepairStatus: () => true,
    },
    "@/lib/validation/repairs": {
      repairSchema: {
        safeParse: () =>
          options.validationError
            ? { success: false, error: { issues: [{ message: "Invalid input" }] } }
            : { success: true, data: parsedRepair },
      },
    },
    "@/lib/audit": {
      logAudit: () => {
        throw new Error("saveRepairAction must not use the fire-and-forget helper");
      },
    },
    "@/lib/errors/safe-action-error": {
      getSafeActionError: (_error, fallback) => fallback,
    },
  }).saveRepairAction;

  return { store, saveRepairAction };
}

test("successful intake awaits one exact create audit after repair and history", async () => {
  const { store, saveRepairAction } = createHarness();
  const result = await saveRepairAction(
    { error: null, success: null },
    repairFormData(),
  );

  assert.deepEqual(result, {
    error: null,
    success: "Repair job created.",
    id: REPAIR_ID,
  });
  assert.equal(store.repairs.length, 1);
  assert.equal(store.histories.length, 1);
  assert.equal(store.audits.length, 1);
  assert.deepEqual(store.audits[0], {
    organization_id: ORG_ID,
    branch_id: BRANCH_ID,
    actor_id: ACTOR_ID,
    module: "repairs",
    action: "repairs.created",
    details: "Created repair: QA walk-in - Mobile",
    metadata: {
      repair_id: REPAIR_ID,
      customer_name: "QA walk-in",
      device_type: "Mobile",
    },
  });
  assert.ok(store.events.indexOf("repair:complete") < store.events.indexOf("history:complete"));
  assert.ok(store.events.indexOf("history:complete") < store.events.indexOf("audit:started"));
  assert.equal(store.events.filter((event) => event === "audit:complete").length, 1);
});

test("delayed audit keeps the action pending until the audit completes", async () => {
  const gate = deferred();
  const { store, saveRepairAction } = createHarness({ auditGate: gate });
  let settled = false;
  const actionPromise = saveRepairAction(
    { error: null, success: null },
    repairFormData(),
  ).then((result) => {
    settled = true;
    return result;
  });

  await waitFor(() => store.events.includes("audit:started"), "audit start");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(store.repairs.length, 1);
  assert.equal(store.histories.length, 1);
  assert.equal(store.audits.length, 0);

  gate.resolve();
  const result = await actionPromise;
  assert.equal(result.success, "Repair job created.");
  assert.equal(store.audits.length, 1);
});

test("returned or thrown audit failure returns safe partial-success truth without a duplicate", async () => {
  for (const options of [{ auditError: true }, { auditThrow: true }]) {
    const { store, saveRepairAction } = createHarness(options);
    const result = await saveRepairAction(
      { error: null, success: null },
      repairFormData(),
    );

    assert.deepEqual(result, { error: AUDIT_FAILURE, success: null, id: REPAIR_ID });
    assert.equal(store.repairs.length, 1);
    assert.equal(store.histories.length, 1);
    assert.equal(store.audits.length, 0);
    assert.equal(store.events.filter((event) => event === "repair:complete").length, 1);
    assert.equal(
      store.events.filter((event) => event === "audit:error" || event === "audit:threw")
        .length,
      1,
    );
  }
});

test("returned or thrown initial history failure is truthful and does not audit", async () => {
  for (const options of [{ historyError: true }, { historyThrow: true }]) {
    const { store, saveRepairAction } = createHarness(options);
    const result = await saveRepairAction(
      { error: null, success: null },
      repairFormData(),
    );

    assert.deepEqual(result, { error: HISTORY_FAILURE, success: null, id: REPAIR_ID });
    assert.equal(store.repairs.length, 1);
    assert.equal(store.histories.length, 0);
    assert.equal(store.audits.length, 0);
    assert.equal(store.events.filter((event) => event === "repair:complete").length, 1);
    assert.equal(
      store.events.filter(
        (event) => event === "history:error" || event === "history:threw",
      ).length,
      1,
    );
    assert.equal(store.events.filter((event) => event.startsWith("audit:")).length, 0);
  }
});

test("validation, tenant, and repair insert failures do not audit", async () => {
  const validation = createHarness({ validationError: true });
  const validationResult = await validation.saveRepairAction(
    { error: null, success: null },
    repairFormData(),
  );
  assert.equal(validationResult.error, "Invalid input");
  assert.equal(validation.store.clientCreations, 0);
  assert.equal(validation.store.repairs.length, 0);
  assert.equal(validation.store.histories.length, 0);
  assert.equal(validation.store.audits.length, 0);

  const tenant = createHarness({ selectedCustomer: true, tenantReject: true });
  const tenantResult = await tenant.saveRepairAction(
    { error: null, success: null },
    repairFormData({ customer_id: CUSTOMER_ID }),
  );
  assert.equal(tenantResult.error, "The selected customer is unavailable.");
  assert.equal(tenant.store.customerLookups, 1);
  assert.equal(tenant.store.repairs.length, 0);
  assert.equal(tenant.store.histories.length, 0);
  assert.equal(tenant.store.audits.length, 0);

  const insert = createHarness({ repairInsertError: true });
  const insertResult = await insert.saveRepairAction(
    { error: null, success: null },
    repairFormData(),
  );
  assert.equal(insertResult.error, "We couldn't save this repair job. Please try again.");
  assert.equal(insert.store.repairs.length, 0);
  assert.equal(insert.store.histories.length, 0);
  assert.equal(insert.store.audits.length, 0);
});

test("the shared edit audit is also awaited without changing edit business semantics", async () => {
  const gate = deferred();
  const { store, saveRepairAction } = createHarness({ auditGate: gate });
  let settled = false;
  const actionPromise = saveRepairAction(
    { error: null, success: null },
    repairFormData({ id: REPAIR_ID }),
  ).then((result) => {
    settled = true;
    return result;
  });
  await waitFor(() => store.events.includes("audit:started"), "edit audit start");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(store.histories.length, 0);
  gate.resolve();
  const result = await actionPromise;
  assert.equal(result.success, "Repair job updated.");
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].action, "repairs.updated");
  assert.equal(store.audits[0].metadata.repair_id, REPAIR_ID);
});

test("the global logger cannot expose a returned Supabase insert error", async () => {
  let insertCalls = 0;
  let consoleErrors = 0;
  const originalConsoleError = console.error;
  console.error = () => {
    consoleErrors += 1;
  };
  try {
    const { logAudit } = compileModule(auditSource, {
      "server-only": {},
      "@/lib/supabase/server": {
        createClient: async () => ({
          from: () => ({
            insert: async () => {
              insertCalls += 1;
              return { error: { code: "QA_RETURNED_ERROR" } };
            },
          }),
        }),
      },
      "@/lib/auth/session": {
        getCurrentContext: async () => ({
          profile: { id: ACTOR_ID, organization_id: ORG_ID, branch_id: BRANCH_ID },
        }),
      },
    });
    assert.equal(
      await logAudit({ module: "repairs", action: "repairs.created", details: "QA" }),
      undefined,
    );
    assert.equal(insertCalls, 1);
    assert.equal(consoleErrors, 0);
  } finally {
    console.error = originalConsoleError;
  }
});

test("repair save audit payload stays record-specific without expanding existing intake values", () => {
  const auditStart = saveSource.indexOf('await supabase.from("audit_logs").insert');
  const auditEnd = saveSource.indexOf("auditFailed = Boolean(auditError)", auditStart);
  assert.ok(auditStart > -1);
  assert.ok(auditEnd > auditStart);
  const payload = saveSource.slice(auditStart, auditEnd);
  assert.match(payload, /organization_id: orgId/);
  assert.match(payload, /branch_id: branchId/);
  assert.match(payload, /actor_id: profile\.id/);
  assert.match(payload, /repair_id: savedId/);
  assert.match(payload, /customer_name: parsed\.data\.customer_name/);
  assert.match(payload, /device_type: parsed\.data\.device_type/);
  assert.doesNotMatch(
    payload,
    /customer_phone|serial_imei|problem_description|notes|accessories_received/,
  );
});

test("optional, tenant, form, migration, global helper, and durable status boundaries remain exact", () => {
  assert.equal(
    digest(validationSource),
    "5a2b044a04f7d20e4ee980b3c3201867dd7473199e09dabc2500d8f68a616940",
  );
  assert.equal(
    digest(formSource),
    "fa7e4affa5e29cc16c84069bdf5446bb4dcb819133b8abaea2d566846bb22959",
  );
  assert.equal(
    digest(migrationSource),
    "7ff005a554c2ce966b600959dcd6ea8e8c0417bae659a679c4f7b1b183a2ce97",
  );
  assert.equal(
    digest(auditSource),
    "30e4f40b94d3969a97631ead57e17f4d41b367f3f199b5776bb3a0fd19caeb47",
  );
  assert.match(
    saveSource,
    /\.from\("customers"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.eq\("id", finalCustomerId\)[\s\S]*?\.eq\("organization_id", orgId\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(statusSource, /logAudit\s*\(/);
  assert.match(
    statusSource,
    /await supabase\.from\("audit_logs"\)\.insert\(\{[\s\S]*?action: "repairs\.status_changed"/,
  );
  assert.match(statusSource, /auditFailed = Boolean\(auditError\)/);
  assert.match(statusSource, /catch \{\s*auditFailed = true;/);
  assert.match(
    statusSource,
    /metadata: \{ repair_id: id, old_status: oldStatus, new_status: newStatus \}/,
  );
  assert.equal((actionSource.match(/action: "repairs\.status_changed"/g) ?? []).length, 1);
  assert.equal(
    (actionSource.match(/The status was updated, but its audit record could not be confirmed\./g) ?? [])
      .length,
    1,
  );
});
