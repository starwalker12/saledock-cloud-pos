import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync("src/app/repairs/actions.ts", "utf8");
const id = "00000000-0000-4000-8000-000000000901",
  key = "00000000-0000-4000-8000-000000000902";
function harness(options = {}) {
  const calls = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const form = new FormData();
  form.set("request_key", key);
  form.set("advance_paid", "100.00");
  form.set("estimated_cost", "200.00");
  if (options.edit) {
    form.set("id", id);
    form.set("revision", "4");
  }
  const deps = {
    "next/cache": {
      revalidatePath: () => assert.fail("No reconciliation before RPC receipt"),
    },
    "next/server": { after: () => assert.fail("No split financial audit") },
    "next/navigation": {
      redirect: (p) => {
        throw Error("redirect:" + p);
      },
    },
    "@/lib/auth/session": {
      getCurrentContext: async () => ({
        user: { id: "actor" },
        profile: {
          id: "actor",
          organization_id: "org",
          branch_id: "branch",
          role: "owner",
        },
      }),
    },
    "@/lib/permissions": {
      canCreateRepairs: () => !options.noPermission,
      canEditRepairs: () => !options.noPermission,
    },
    "@/lib/validation/repairs": {
      repairSchema: {
        safeParse: () =>
          options.invalid
            ? {
                success: false,
                error: { issues: [{ message: "Invalid input" }] },
              }
            : {
                success: true,
                data: {
                  customer_name: "Synthetic",
                  device_type: "Other",
                  problem_description: "Issue",
                  advance_paid: 100,
                  estimated_cost: 200,
                  payment_method: "card",
                  status: "received",
                },
              },
      },
    },
    "@/lib/validation/operation-request-key": {
      operationRequestKey: (f) => f.get("request_key") || null,
    },
    "@/lib/errors/cash-shift-action-error": {
      getCashShiftActionError: (_, fallback) => fallback,
    },
    "@/lib/errors/safe-action-error": {
      getSafeActionError: (_, fallback) => fallback,
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: () => assert.fail("No raw repair/history/audit financial write"),
        rpc: async (name, args) => {
          calls.push({ name, args });
          if (options.delayed) await gate;
          return options.error
            ? { data: null, error: { code: "PT409" } }
            : {
                data: options.noReceipt
                  ? null
                  : { id, revision: 5, replayed: !!options.replay },
                error: null,
              };
        },
      }),
    },
  };
  const mod = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(
    (n) => {
      assert(n in deps, n);
      return deps[n];
    },
    mod,
    mod.exports,
  );
  return {
    calls,
    form,
    release,
    save: () =>
      mod.exports.saveRepairAction({ error: null, success: null }, form),
  };
}
test("repair create awaits the atomic DB receipt before confirming success", async () => {
  const h = harness({ delayed: true });
  let settled = false;
  const pending = h.save().then((x) => {
    settled = true;
    return x;
  });
  await new Promise(setImmediate);
  assert.equal(settled, false);
  assert.equal(h.calls.length, 1);
  h.release();
  assert.equal((await pending).id, id);
});
test("cash classification uses the selected method and unrounded money lexemes", async () => {
  const h = harness();
  assert.equal((await h.save()).success, "Repair job created.");
  assert.equal(h.calls[0].name, "save_cash_shift_repair");
  const d = h.calls[0].args.p_data;
  assert.equal(d.payment_method, "card");
  assert.equal(d.advance_paid, "100.00");
  assert.equal(d.estimated_cost, "200.00");
  assert.equal(h.calls[0].args.p_request_key, key);
  assert(!("branch_id" in d));
  assert(!("advance_cash_shift_id" in d));
});
test("financial edit passes target and revision to the same authorized RPC", async () => {
  const h = harness({ edit: true });
  assert.equal((await h.save()).success, "Repair job updated.");
  assert.equal(h.calls[0].args.p_id, id);
  assert.equal(h.calls[0].args.p_revision, 4);
});
for (const option of ["error", "noReceipt"])
  test(
    "an unconfirmed DB outcome has no success or committed id: " + option,
    async () => {
      const h = harness({ [option]: true });
      const r = await h.save();
      assert(r.error);
      assert.equal(r.success, null);
      assert.equal(r.id, undefined);
      assert.equal(h.calls.length, 1);
    },
  );
for (const option of ["invalid", "noPermission"])
  test(
    "precondition rejection cannot call the repair producer: " + option,
    async () => {
      const h = harness({ [option]: true });
      assert((await h.save()).error);
      assert.equal(h.calls.length, 0);
    },
  );
test("missing durable key rejects before the database request", async () => {
  const h = harness();
  h.form.delete("request_key");
  assert((await h.save()).error);
  assert.equal(h.calls.length, 0);
});
test("same-key committed replay confirms the original repair", async () => {
  const h = harness({ replay: true });
  assert.equal((await h.save()).id, id);
  assert.equal(h.calls.length, 1);
});
test("financial audit and initial history belong to the DB transaction", () => {
  const m = fs.readFileSync(
    "supabase/migrations/20261014100309_atomic_cash_shift_boundary.sql",
    "utf8",
  );
  const s = m.slice(
    m.indexOf("create function cash_private.save_repair("),
    m.indexOf("alter function cash_private.save_repair("),
  );
  assert.match(s, /insert into public\.repairs/);
  assert.match(s, /insert into public\.repair_status_history/);
  assert.match(s, /insert into public\.audit_logs/);
  assert.doesNotMatch(s, /exception when others|\bcommit\s*;/i);
});
