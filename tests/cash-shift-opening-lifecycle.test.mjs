import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { cashShiftOpeningScope } from "../src/lib/cash-shift-opening-scope.ts";
import {
  fixture,
  seed,
  cleanup,
  sql,
  lastJSON,
  Session,
} from "./helpers/cash-shift-database.mjs";

const enabled = process.env.RUN_LOCAL_CASH_SHIFT_DB === "1";
const records = [];
function record(name, facts) {
  records.push({ name, ...facts });
  if (process.env.CASH_SHIFT_EVIDENCE_DIR)
    fs.writeFileSync(
      process.env.CASH_SHIFT_EVIDENCE_DIR + "/opening-lifecycle.json",
      JSON.stringify(records, null, 2) + "\n",
    );
}

function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  const require = createRequire(import.meta.url);
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const localRequire = (name) =>
      overrides[name] ??
      (name.startsWith("@/")
        ? load(new URL("../src/" + name.slice(2) + ".ts", import.meta.url))
        : name.startsWith(".")
          ? load(new URL(name + ".ts", file))
          : require(name));
    vm.runInNewContext("(function(require,module,exports){" + code + "\n})", {
      FormData,
      crypto: globalThis.crypto,
      queueMicrotask,
      ...globals,
    })(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

// Runs the actual hook/effect and shared settlement helper, with deterministic
// mount/unmount scheduling. The real React/browser lifecycle is covered in E2E.
function clientKeys() {
  const storage = new Map();
  let effect, key, cancel;
  const load = loader(
    {
      react: {
        useState: () => [
          "",
          (value) => {
            key = value;
          },
        ],
        useEffect: (fn) => {
          effect = fn;
        },
      },
    },
    {
      sessionStorage: {
        getItem: (name) => storage.get(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.delete(name),
      },
    },
  );
  const helper = load(
    new URL("../src/lib/hooks/use-operation-request-key.ts", import.meta.url),
  );
  return {
    helper,
    storage,
    async mount(scope) {
      cancel?.();
      key = "";
      helper.useOperationRequestKey(scope, null);
      cancel = effect();
      await new Promise((resolve) => queueMicrotask(resolve));
      return key;
    },
  };
}
const form = (key, cash) => {
  const data = new FormData();
  data.set("request_key", key);
  data.set("starting_cash", cash);
  return data;
};

// Only framework/context/client wiring is substituted. Every mutation and read
// runs the actual protected DB function/query in an authenticated transaction.
function application(f) {
  const calls = [];
  const query = (filters) => {
    const clauses = filters
      .map(([k, v]) => k + "='" + String(v).replaceAll("'", "''") + "'")
      .join(" and ");
    return " from public.cash_shifts where " + clauses;
  };
  const execute = (statement) => sql("begin;" + f.auth + statement + "commit;");
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, "open_cash_shift");
      calls.push(args);
      const s = await Session.create();
      try {
        await s.ok("begin;" + f.auth);
        const r = await s.run(
          `select public.open_cash_shift('${args.p_request_key}','${args.p_starting_cash}',null);`,
        );
        await s.ok(r.state === "00000" ? "commit;" : "rollback;");
        return r.state === "00000"
          ? { data: lastJSON(r.text), error: null }
          : { data: null, error: { code: r.state, message: r.text } };
      } finally {
        await s.close();
      }
    },
    from: (name) => {
      assert.equal(name, "cash_shifts");
      const filters = [];
      const builder = {
        select: (columns, options) => {
          assert.equal(columns, "id");
          builder.options = options;
          return builder;
        },
        eq: (key, value) => {
          assert(
            [
              "organization_id",
              "branch_id",
              "accounting_version",
              "status",
            ].includes(key),
          );
          filters.push([key, value]);
          return builder;
        },
        maybeSingle: async () => {
          const data = execute(
            "select jsonb_build_object('id',id)" + query(filters) + ";",
          )
            .split("\n")
            .find((x) => x.startsWith("{"));
          return { data: data ? JSON.parse(data) : null, error: null };
        },
        then: (resolve) => {
          assert.deepEqual(JSON.parse(JSON.stringify(builder.options)), {
            count: "exact",
            head: true,
          });
          return Promise.resolve({
            count: Number(execute("select count(*)" + query(filters) + ";")),
            error: null,
          }).then(resolve);
        },
      };
      return builder;
    },
  };
  const load = loader({
    "server-only": {},
    "next/navigation": { redirect: () => assert.fail("Unexpected redirect") },
    "@/lib/auth/session": {
      getCurrentContext: async () => ({
        user: { id: f.actor },
        profile: {
          id: f.actor,
          organization_id: f.org,
          branch_id: f.branch,
          role: "owner",
        },
      }),
    },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  return {
    action: load(
      new URL("../src/app/daily-closing/shift-actions.ts", import.meta.url),
    ).openShiftAction,
    scope: () =>
      load(
        new URL("../src/lib/data/shifts.ts", import.meta.url),
      ).getShiftOpeningScope(f.org, f.branch),
    calls,
    client,
    execute,
  };
}

test("opening scope is stable without new exact openings and isolates branches/organizations", () => {
  assert.equal(
    cashShiftOpeningScope("o", "b", 3),
    cashShiftOpeningScope("o", "b", 3),
  );
  assert.notEqual(
    cashShiftOpeningScope("o", "b", 3),
    cashShiftOpeningScope("o", "b", 4),
  );
  assert.notEqual(
    cashShiftOpeningScope("o", "b", 3),
    cashShiftOpeningScope("o", "other", 3),
  );
  assert.notEqual(
    cashShiftOpeningScope("o", "b", 3),
    cashShiftOpeningScope("other", "b", 3),
  );
  for (const n of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => cashShiftOpeningScope("o", "b", n));
});

test("unknown/failure remount retains key; an old completion cannot clear a newer lifecycle", async () => {
  const c = clientKeys(),
    oldScope = cashShiftOpeningScope("o", "b", 0),
    newScope = cashShiftOpeningScope("o", "b", 1);
  const k = await c.mount(oldScope);
  await assert.rejects(
    c.helper.confirmingOperationAction(oldScope, async () => {
      throw Error("Lost response");
    })({}, form(k, "100")),
  );
  assert.equal(await c.mount(oldScope), k);
  await c.helper.confirmingOperationAction(oldScope, async () => ({
    success: null,
    error: "Retry",
  }))({}, form(k, "100"));
  assert.equal(await c.mount(oldScope), k);
  const next = await c.mount(newScope);
  assert.notEqual(next, k);
  c.helper.confirmOperationRequestKey(oldScope, form(k, "100"));
  assert.equal(await c.mount(newScope), next);
});

test("unmount cancels an older queued key effect before a newer lifecycle mounts", async () => {
  const c = clientKeys();
  const oldScope = cashShiftOpeningScope("o", "b", 0);
  const newScope = cashShiftOpeningScope("o", "b", 1);
  const older = c.mount(oldScope);
  const newer = c.mount(newScope);
  await older;
  const key = await newer;
  assert.equal(c.storage.has("cash-operation-v2:" + oldScope), false);
  assert.equal(c.storage.get("cash-operation-v2:" + newScope), key);
});

for (const secondFloat of ["100.00", "175.25"])
  test(
    "ACS-20261017-01 recovered opening lifecycle / second float " + secondFloat,
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      try {
        const app = application(f),
          c = clientKeys(),
          firstScope = await app.scope(),
          k1 = await c.mount(firstScope);
        // DB commits the actual action; outer response is deliberately discarded,
        // so the confirming wrapper never gets success and K1 remains pending.
        const first = await app.action({}, form(k1, "100.00"));
        assert(first.success);
        assert.equal(await c.mount(firstScope), k1);
        // Before any authoritative newer read, same original key safely replays.
        const replay = await app.action({}, form(k1, "100.00"));
        assert(replay.success);
        const a = JSON.parse(
          sql(
            `select to_jsonb(s) from public.cash_shifts s where organization_id='${f.org}';`,
          ),
        );
        assert.equal(
          Number(
            sql(
              `select count(*) from public.cash_shifts where organization_id='${f.org}';`,
            ),
          ),
          1,
        );
        const observedScope = await app.scope();
        assert.notEqual(observedScope, firstScope);
        assert.equal(a.status, "open");
        app.execute(
          `select public.close_cash_shift('${a.id}','${randomUUID()}','100.00',null);`,
        );
        assert.equal(await app.scope(), observedScope);
        const originalDbReceipt = await app.client.rpc("open_cash_shift", {
          p_request_key: k1,
          p_starting_cash: "100.00",
          p_notes: null,
        });
        assert.equal(originalDbReceipt.data.id, a.id);
        assert.equal(originalDbReceipt.data.replayed, true);
        // A stale page still addressing K1 must never report a new-open success.
        const stale = await app.action({}, form(k1, "100.00"));
        assert.equal(stale.success, null);
        assert.equal(stale.refresh, true);
        const changedStale = await app.action({}, form(k1, "175.25"));
        assert.equal(changedStale.success, null);
        assert.equal(changedStale.refresh, true);
        const k2 = await c.mount(observedScope);
        assert.notEqual(k1, k2);
        const second = await c.helper.confirmingOperationAction(
          observedScope,
          app.action,
        )({}, form(k2, secondFloat));
        assert(second.success);
        const b = JSON.parse(
          sql(
            `select to_jsonb(s) from public.cash_shifts s where organization_id='${f.org}' and status='open';`,
          ),
        );
        assert.notEqual(a.id, b.id);
        assert.equal(Number(b.starting_cash), Number(secondFloat));
        assert.equal(
          Number(
            sql(
              `select count(*) from public.cash_shifts where organization_id='${f.org}' and status='open';`,
            ),
          ),
          1,
        );
        app.execute(f.sale());
        const membership = JSON.parse(
          sql(
            `select jsonb_build_object('payment_shift',p.cash_shift_id,'payment_xid',p.cash_shift_assignment_xid::text,'invoice_shift',i.cash_shift_id,'invoice_xid',i.cash_shift_assignment_xid::text,'amount',p.amount::text) from public.payments p join public.invoices i on i.id=p.invoice_id where p.organization_id='${f.org}';`,
          ),
        );
        assert.equal(membership.payment_shift, b.id);
        assert.equal(membership.invoice_shift, b.id);
        assert(membership.payment_xid && membership.invoice_xid);
        const expected = secondFloat === "100.00" ? "200.00" : "275.25";
        app.execute(
          `select public.close_cash_shift('${b.id}','${randomUUID()}','${expected}',null);`,
        );
        const close = JSON.parse(
          sql(
            `select jsonb_build_object('expected',expected_cash::text,'counted',counted_cash::text,'variance',cash_difference::text) from public.cash_shifts where id='${b.id}';`,
          ),
        );
        assert.equal(Number(close.expected), Number(expected));
        assert.equal(Number(close.variance), 0);
        record("recovered-" + secondFloat, {
          firstScope,
          observedScope,
          k1,
          k2,
          firstShift: a.id,
          secondShift: b.id,
          unobservedReplaySucceeded: true,
          staleClosedReplayDenied: true,
          originalClosedDbReceiptStillReplays: originalDbReceipt.data,
          changedStaleConflictRefreshed: true,
          secondSuccess: second.success,
          membership,
          close,
        });
      } finally {
        cleanup(f);
      }
    },
  );
