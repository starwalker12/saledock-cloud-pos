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
const repairFormSource = readFileSync(
  new URL("../src/app/repairs/repair-form.tsx", import.meta.url),
  "utf8",
);
const statusFormSource = readFileSync(
  new URL("../src/app/repairs/[id]/status-form.tsx", import.meta.url),
  "utf8",
);
const permissionSource = readFileSync(
  new URL("../src/lib/permissions.ts", import.meta.url),
  "utf8",
);
const tenantMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260729133000_enforce_repair_customer_tenant_integrity.sql",
    import.meta.url,
  ),
  "utf8",
);

const REPAIR_ID = "00000000-0000-4000-8000-000000000a01";
const ACTOR_ID = "00000000-0000-4000-8000-000000000a02";
const ORG_ID = "00000000-0000-4000-8000-000000000a03";
const BRANCH_ID = "00000000-0000-4000-8000-000000000a04";
const HISTORY_FAILURE =
  "The status was updated, but we couldn't save the history note.";
const AUDIT_FAILURE =
  "The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";

const statusStart = actionSource.indexOf(
  "export async function updateRepairStatusAction",
);
const statusEnd = actionSource.indexOf(
  "export async function saveDiagnosisAndNotesAction",
  statusStart,
);
assert.notEqual(statusStart, -1);
assert.notEqual(statusEnd, -1);
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

function statusFormData(overrides = {}) {
  const values = {
    id: REPAIR_ID,
    status: "in_progress",
    old_status: "received",
    status_note: "QA status durability",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) formData.set(key, String(value));
  }
  return formData;
}

function createStatusHarness(options = {}) {
  const store = {
    events: [],
    updates: [],
    updateFilters: [],
    histories: [],
    audits: [],
    clients: 0,
  };

  function createSupabase() {
    store.clients += 1;
    return {
      from(table) {
        let operation = "select";
        let payload;
        let executed;
        const filters = [];
        const query = {
          update(value) {
            operation = "update";
            payload = value;
            return query;
          },
          insert(value) {
            operation = "insert";
            payload = value;
            return query;
          },
          eq(column, value) {
            filters.push([column, value]);
            return query;
          },
          then(resolve, reject) {
            return run().then(resolve, reject);
          },
        };

        function run() {
          if (!executed) {
            executed = (async () => {
              if (table === "repairs" && operation === "update") {
                store.events.push("repair:complete");
                store.updates.push(payload);
                store.updateFilters.push(filters);
                return options.updateError
                  ? { error: { code: "QA_UPDATE_ERROR" } }
                  : { error: null };
              }
              if (table === "repair_status_history" && operation === "insert") {
                store.events.push("history:started");
                if (options.historyError) {
                  store.events.push("history:error");
                  return { error: { code: "QA_HISTORY_ERROR" } };
                }
                store.histories.push(payload);
                store.events.push("history:complete");
                return { error: null };
              }
              if (table === "audit_logs" && operation === "insert") {
                store.events.push("audit:started");
                if (options.auditGate) await options.auditGate.promise;
                if (options.auditThrow) {
                  store.events.push("audit:threw");
                  throw new Error("QA_AUDIT_THROW");
                }
                if (options.auditReturnedError) {
                  store.events.push("audit:error");
                  return { error: { code: "QA_AUDIT_RETURNED_ERROR" } };
                }
                store.audits.push(payload);
                store.events.push("audit:complete");
                return { error: null };
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

  const updateRepairStatusAction = compileModule(actionSource, {
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
      canUpdateRepairStatus: () => !options.permissionDenied,
    },
    "@/lib/validation/repairs": {
      repairSchema: { safeParse: () => ({ success: false }) },
    },
    "@/lib/audit": {
      logAudit: () => {
        throw new Error("status action must not use the fire-and-forget helper");
      },
    },
    "@/lib/errors/safe-action-error": {
      getSafeActionError: (_error, fallback) => fallback,
    },
  }).updateRepairStatusAction;

  return { store, updateRepairStatusAction };
}

function compileAuditHelper(options = {}) {
  const events = [];
  const logAudit = compileModule(auditSource, {
    "server-only": {},
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: () => ({
          insert: async () => {
            events.push("insert:attempted");
            if (options.throwInsert) throw new Error("QA_AUDIT_THROW");
            return options.returnError
              ? { error: { code: "QA_AUDIT_RETURNED_ERROR" } }
              : { error: null };
          },
        }),
      }),
    },
    "@/lib/auth/session": {
      getCurrentContext: async () => ({
        profile: {
          id: ACTOR_ID,
          organization_id: ORG_ID,
          branch_id: BRANCH_ID,
        },
      }),
    },
  }).logAudit;
  return { events, logAudit };
}

test("successful status change awaits one exact audit after the scoped update and history", async () => {
  const { store, updateRepairStatusAction } = createStatusHarness();
  const result = await updateRepairStatusAction(
    { error: null, success: null },
    statusFormData(),
  );

  assert.deepEqual(result, {
    error: null,
    success: "Status updated successfully.",
    id: undefined,
  });
  assert.equal(store.updates.length, 1);
  assert.equal(store.histories.length, 1);
  assert.equal(store.audits.length, 1);
  assert.deepEqual(store.updateFilters[0], [
    ["id", REPAIR_ID],
    ["organization_id", ORG_ID],
  ]);
  assert.deepEqual(store.histories[0], {
    organization_id: ORG_ID,
    repair_id: REPAIR_ID,
    old_status: "received",
    new_status: "in_progress",
    note: "QA status durability",
    changed_by: ACTOR_ID,
  });
  assert.deepEqual(store.audits[0], {
    organization_id: ORG_ID,
    branch_id: BRANCH_ID,
    actor_id: ACTOR_ID,
    module: "repairs",
    action: "repairs.status_changed",
    details: `Repair ${REPAIR_ID} status: received → in_progress`,
    metadata: {
      repair_id: REPAIR_ID,
      old_status: "received",
      new_status: "in_progress",
    },
  });
  assert.ok(store.events.indexOf("repair:complete") < store.events.indexOf("history:complete"));
  assert.ok(store.events.indexOf("history:complete") < store.events.indexOf("audit:started"));
  assert.equal(store.events.filter((event) => event === "audit:complete").length, 1);
});

test("delayed audit keeps the action pending until the audit completes", async () => {
  const auditGate = deferred();
  const { store, updateRepairStatusAction } = createStatusHarness({ auditGate });
  let settled = false;
  const actionPromise = updateRepairStatusAction(
    { error: null, success: null },
    statusFormData(),
  ).then((result) => {
    settled = true;
    return result;
  });

  await waitFor(() => store.events.includes("audit:started"), "audit start");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(store.updates.length, 1);
  assert.equal(store.histories.length, 1);
  assert.equal(store.audits.length, 0);

  auditGate.resolve();
  const result = await actionPromise;
  assert.equal(result.success, "Status updated successfully.");
  assert.equal(store.audits.length, 1);
});

test("baseline returned and thrown helper failures are caller-invisible", async () => {
  const originalConsoleError = console.error;
  const consoleErrors = [];
  console.error = (...values) => consoleErrors.push(values.map(String).join(" "));
  try {
    const returned = compileAuditHelper({ returnError: true });
    assert.equal(
      await returned.logAudit({
        module: "repairs",
        action: "repairs.status_changed",
        details: "QA",
      }),
      undefined,
    );
    assert.deepEqual(returned.events, ["insert:attempted"]);
    assert.equal(consoleErrors.length, 0);

    const thrown = compileAuditHelper({ throwInsert: true });
    assert.equal(
      await thrown.logAudit({
        module: "repairs",
        action: "repairs.status_changed",
        details: "QA",
      }),
      undefined,
    );
    assert.deepEqual(thrown.events, ["insert:attempted"]);
    assert.equal(consoleErrors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("returned and thrown audit failures return safe partial-save truth without retry", async () => {
  for (const options of [{ auditReturnedError: true }, { auditThrow: true }]) {
    const { store, updateRepairStatusAction } = createStatusHarness(options);
    const result = await updateRepairStatusAction(
      { error: null, success: null },
      statusFormData(),
    );
    assert.deepEqual(result, { error: AUDIT_FAILURE, success: null, id: REPAIR_ID });
    assert.equal(store.updates.length, 1);
    assert.equal(store.histories.length, 1);
    assert.equal(store.audits.length, 0);
    assert.equal(store.events.filter((event) => event === "repair:complete").length, 1);
    assert.equal(store.events.filter((event) => event === "history:complete").length, 1);
    assert.equal(
      store.events.filter((event) => event === "audit:error" || event === "audit:threw")
        .length,
      1,
    );
  }
});

test("history failure preserves current partial-save result and skips audit", async () => {
  const { store, updateRepairStatusAction } = createStatusHarness({ historyError: true });
  const result = await updateRepairStatusAction(
    { error: null, success: null },
    statusFormData(),
  );
  assert.deepEqual(result, { error: HISTORY_FAILURE, success: null });
  assert.equal(store.updates.length, 1);
  assert.equal(store.histories.length, 0);
  assert.equal(store.events.some((event) => event.startsWith("audit:")), false);
});

test("input and permission rejection do not mutate, write history, or audit", async () => {
  const invalid = createStatusHarness();
  const invalidResult = await invalid.updateRepairStatusAction(
    { error: null, success: null },
    statusFormData({ id: "" }),
  );
  assert.equal(invalidResult.error, "Repair ID and status parameters are required.");
  assert.equal(invalid.store.clients, 0);
  assert.equal(invalid.store.updates.length, 0);
  assert.equal(invalid.store.histories.length, 0);
  assert.equal(invalid.store.audits.length, 0);

  const denied = createStatusHarness({ permissionDenied: true });
  const deniedResult = await denied.updateRepairStatusAction(
    { error: null, success: null },
    statusFormData(),
  );
  assert.equal(deniedResult.error, "You do not have permission to update repair statuses.");
  assert.equal(denied.store.clients, 0);
  assert.equal(denied.store.updates.length, 0);
  assert.equal(denied.store.histories.length, 0);
  assert.equal(denied.store.audits.length, 0);
});

test("durable status audit is caller-local without privacy or protected-boundary expansion", () => {
  assert.doesNotMatch(statusSource, /logAudit\s*\(/);
  assert.match(statusSource, /await supabase\.from\("audit_logs"\)\.insert\(\{/);
  assert.match(statusSource, /organization_id: orgId/);
  assert.match(statusSource, /branch_id: profile\.branch_id/);
  assert.match(statusSource, /actor_id: profile\.id/);
  assert.match(statusSource, /action: "repairs\.status_changed"/);
  assert.match(statusSource, /repair_id: id, old_status: oldStatus, new_status: newStatus/);
  assert.doesNotMatch(
    statusSource.slice(statusSource.indexOf('.from("audit_logs")')),
    /customer_phone|serial_imei|problem_description|notes|accessories_received|final_cost|advance_paid/,
  );
  assert.match(
    statusSource,
    /\.from\("repairs"\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", orgId\)/,
  );

  assert.equal(
    digest(auditSource),
    "30e4f40b94d3969a97631ead57e17f4d41b367f3f199b5776bb3a0fd19caeb47",
  );
  assert.equal(
    digest(validationSource),
    "5a2b044a04f7d20e4ee980b3c3201867dd7473199e09dabc2500d8f68a616940",
  );
  assert.equal(
    digest(repairFormSource),
    "fa7e4affa5e29cc16c84069bdf5446bb4dcb819133b8abaea2d566846bb22959",
  );
  assert.equal(
    digest(statusFormSource),
    "9975f77dfaff2f776baa432cb716f8fc0a27069beb017e4998e2085dc78850e1",
  );
  assert.equal(
    digest(permissionSource),
    "2a946839c4babf6b3114de79229c56ba00ec72a65cf2a3528d446a898096b25d",
  );
  assert.equal(
    digest(tenantMigrationSource),
    "7ff005a554c2ce966b600959dcd6ea8e8c0417bae659a679c4f7b1b183a2ce97",
  );
  assert.match(
    permissionSource,
    /REPAIR_STATUS_UPDATERS: Role\[\] = \["owner", "admin", "manager", "technician"\]/,
  );
});
