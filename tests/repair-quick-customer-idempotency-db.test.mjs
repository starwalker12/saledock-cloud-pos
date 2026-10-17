import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  fixture,
  seed,
  open,
  cleanup,
  sql,
  lastJSON,
  Session,
  observeBlocked,
  read,
} from "./helpers/cash-shift-database.mjs";

const enabled = process.env.RUN_LOCAL_CASH_SHIFT_DB === "1";
const evidence = [];
const literal = (x) =>
  x === null ? "null" : "'" + String(x).replaceAll("'", "''") + "'";
const body = (extra = {}) => ({
  customer_id: null,
  customer_name: "QA Replay Customer",
  customer_phone: "07043900001",
  device_type: "Phone",
  problem_description: "Synthetic replay qualification",
  estimated_cost: "200.00",
  advance_paid: "100.00",
  payment_method: "cash",
  status: "received",
  ...extra,
});
const save = (
  data = body(),
  key = randomUUID(),
  quick = true,
  id = null,
  revision = 0,
) =>
  `select public.save_cash_shift_repair(${literal(id)},'${key}',${revision},${quick === null ? "null" : quick},${literal(JSON.stringify(data))}::jsonb);`;
const execute = (f, query) => sql("begin;" + f.auth + query + ";commit;");
function state(f) {
  return lastJSON(
    sql(`select jsonb_build_object(
    'customers',(select count(*) from public.customers where organization_id='${f.org}' and id<>'${f.customer}'),
    'repairs',(select count(*) from public.repairs where organization_id='${f.org}'),
    'history',(select count(*) from public.repair_status_history where organization_id='${f.org}' and old_status is null),
    'audits',(select count(*) from public.audit_logs where organization_id='${f.org}' and action='repairs.created'),
    'assignments',(select count(*) from public.repairs where organization_id='${f.org}' and advance_cash_shift_assignment_xid is not null),
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by job_no) from public.repairs r where organization_id='${f.org}'),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where organization_id='${f.org}' and id<>'${f.customer}'),'[]'::jsonb),
    'ledger',(select count(*) from public.customer_ledger_entries where organization_id='${f.org}'));`),
  );
}
function counts(s, customers = 1, receipts = 1, audits = receipts) {
  assert.deepEqual(
    Object.fromEntries(
      ["customers", "repairs", "history", "audits", "assignments"].map((k) => [
        k,
        s[k],
      ]),
    ),
    {
      customers,
      repairs: receipts,
      history: receipts,
      audits,
      assignments: receipts,
    },
  );
}
function record(name, facts) {
  evidence.push({ name, ...facts });
  if (process.env.CASH_SHIFT_EVIDENCE_DIR)
    fs.writeFileSync(
      process.env.CASH_SHIFT_EVIDENCE_DIR + "/quick-customer-observations.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
}
async function attempt(f, query) {
  const s = await Session.create();
  try {
    await s.ok("begin;" + f.auth);
    const result = await s.run(query);
    await s.ok(result.state === "00000" ? "commit;" : "rollback;");
    return result;
  } finally {
    await s.close();
  }
}

// Executes the actual action, schema, permission functions and safe error mapper.
// Only framework context/client wiring is replaced; each RPC uses the real
// protected function in an independent authenticated PostgreSQL transaction.
function actionHarness(f, loseRpc = false) {
  const cache = new Map(),
    receipts = [],
    calls = [];
  const require = createRequire(import.meta.url);
  const overrides = {
    "next/cache": {
      revalidatePath: () => assert.fail("No split reconciliation"),
    },
    "next/server": { after: () => assert.fail("No split financial audit") },
    "next/navigation": { redirect: () => assert.fail("Unexpected redirect") },
    "@/lib/auth/session": {
      getCurrentContext: async () => ({
        user: { id: f.actor },
        profile: lastJSON(
          sql(
            `select to_jsonb(p) from public.profiles p where id='${f.actor}';`,
          ),
        ),
      }),
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: () =>
          assert.fail("Quick Repair must perform no application customer DML"),
        rpc: async (name, args) => {
          assert.equal(name, "save_cash_shift_repair");
          calls.push(structuredClone(args));
          const result = await attempt(
            f,
            save(
              args.p_data,
              args.p_request_key,
              args.p_create_customer_account,
              args.p_id,
              args.p_revision,
            ),
          );
          if (result.state !== "00000")
            return {
              data: null,
              error: {
                code: result.state,
                message: result.text.replace(/^ERROR:\s*/m, ""),
              },
            };
          const receipt = lastJSON(result.text);
          receipts.push(receipt);
          if (loseRpc) {
            loseRpc = false;
            return {
              data: null,
              error: { message: "Synthetic committed RPC response lost" },
            };
          }
          return { data: receipt, error: null };
        },
      }),
    },
  };
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
        ? load(path.resolve("src", name.slice(2) + ".ts"))
        : name.startsWith(".")
          ? load(path.resolve(path.dirname(file), name) + ".ts")
          : require(name));
    vm.runInThisContext("(function(exports,require,module){" + code + "\n})", {
      filename: file,
    })(loaded.exports, localRequire, loaded);
    return loaded.exports;
  }
  return {
    save: load(path.resolve("src/app/repairs/actions.ts")).saveRepairAction,
    receipts,
    calls,
  };
}

for (const lost of ["outer-action", "RPC"])
  test(
    "actual saveRepairAction unchanged quick-customer replay after " +
      lost +
      " response loss",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      try {
        const h = actionHarness(f, lost === "RPC"),
          form = new FormData(),
          key = randomUUID();
        for (const [k, v] of Object.entries({
          ...body(),
          customer_id: "",
          request_key: key,
          revision: "0",
          create_customer_account: "true",
        }))
          form.set(k, v);
        const first = await h.save({ error: null, success: null }, form);
        if (lost === "RPC") assert(first.error);
        else assert(first.success); // Discard the successful outer response.
        const original = state(f);
        counts(original);
        execute(f, f.close("100"));
        f.openKey = randomUUID();
        open(f);
        const replay = await h.save({ error: null, success: null }, form);
        assert.equal(replay.error, null);
        assert.equal(replay.id, original.rows[0].id);
        assert.deepEqual(state(f), original);
        assert.equal(h.receipts[1].replayed, true);
        for (const field of ["id", "customer_id", "job_no", "revision"])
          assert.equal(h.receipts[1][field], h.receipts[0][field]);
        assert.equal(h.calls[0].p_data.customer_id, null);
        assert.deepEqual(h.calls[1], h.calls[0]);
        assert.equal(
          Number(
            lastJSON(
              execute(
                f,
                `select public.get_cash_shift_snapshot('${f.shift}');`,
              ),
            ).expectedCash,
          ),
          0,
        );
        record("actual-action-" + lost, {
          sameFormData: true,
          sameRequestKey: true,
          originalClientResponseDiscarded: true,
          originalReceipt: h.receipts[0],
          replayReceipt: h.receipts[1],
          after: original,
          replayAfterShiftClose: true,
          rawApplicationCustomerDml: 0,
        });
      } finally {
        cleanup(f);
      }
    },
  );

test(
  "direct RPC original intent survives generated identities and shift rollover",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      const key = randomUUID(),
        first = lastJSON(execute(f, save(body(), key))),
        before = state(f);
      counts(before);
      assert.equal(before.ledger, 0);
      const account = before.accounts[0];
      assert.equal(account.organization_id, f.org);
      assert.equal(account.outstanding_balance, 0);
      assert.equal(account.credit_limit, 0);
      assert.equal(account.is_archived, false);
      assert.equal(
        before.rows[0].repair_request_payload.intent.create_customer_account,
        true,
      );
      assert.equal(
        before.rows[0].repair_request_payload.intent.data.customer_id,
        null,
      );
      assert(
        !JSON.stringify(before.rows[0].repair_request_payload.intent).includes(
          first.customer_id,
        ),
      );
      execute(f, f.close("100"));
      f.openKey = randomUUID();
      open(f);
      const replay = lastJSON(execute(f, save(body(), key)));
      assert.deepEqual({ ...replay, replayed: false }, first);
      assert.equal(replay.replayed, true);
      assert.deepEqual(state(f), before);
      record("direct-rpc-original-intent", {
        first,
        replay,
        after: before,
        generatedIdExcluded: true,
        afterCloseMembershipUnchanged: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "create replay retains original customer identity after a later authorized relink",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      const key = randomUUID(),
        first = lastJSON(execute(f, save(body(), key)));
      execute(
        f,
        save(
          body({ customer_id: f.customer }),
          randomUUID(),
          false,
          first.id,
          1,
        ),
      );
      const afterEdit = state(f),
        replay = lastJSON(execute(f, save(body(), key)));
      assert.equal(replay.customer_id, first.customer_id);
      assert.equal(replay.id, first.id);
      assert.equal(replay.job_no, first.job_no);
      assert.equal(replay.replayed, true);
      assert.deepEqual(state(f), afterEdit);
      assert.equal(afterEdit.rows[0].customer_id, f.customer);
      counts(afterEdit);
      assert.equal(
        afterEdit.rows[0].repair_request_payload.customer_id,
        first.customer_id,
      );
      record("immutable-create-customer-receipt", {
        first,
        replay,
        laterAuthorizedCustomerId: f.customer,
        originalCustomerIdPreserved: true,
        laterEditNotUndone: true,
        customerCount: 1,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "contended importer identity mutex rejects quick create without orphan effects",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const mutex = await Session.create();
    try {
      await mutex.ok(
        `begin;select epoch from backup_private.organization_identity_locks where organization_id='${f.org}' for update;`,
      );
      const key = randomUUID(),
        result = await attempt(f, save(body(), key));
      assert.equal(result.state, "PT409", result.text);
      assert.match(result.text, /Account identity is busy/);
      counts(state(f), 0, 0);
      await mutex.ok("commit;");
      const recovered = lastJSON(execute(f, save(body(), key)));
      counts(state(f));
      assert.equal(recovered.replayed, false);
      record("quick-import-identity-contention", {
        mutexPid: mutex.pid,
        stateWhileBusy: result.state,
        existingNowaitGuardRetained: true,
        noOrphanOnBusy: true,
        sameKeyFirstExecutionAfterRelease: true,
      });
    } finally {
      await mutex.close();
      cleanup(f);
    }
  },
);

for (const [field, value] of [
  ["customer_name", "Different legitimate name"],
  ["customer_phone", "07043900002"],
  ["advance_paid", "120.00"],
  ["payment_method", "card"],
  ["quick_create", false],
])
  test(
    "same-key changed quick-customer intent conflicts without creating: " +
      field,
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      try {
        const key = randomUUID();
        execute(f, save(body(), key));
        const before = state(f);
        const changed = await attempt(
          f,
          save(
            field === "quick_create" ? body() : body({ [field]: value }),
            key,
            field !== "quick_create",
          ),
        );
        assert.equal(changed.state, "PT409", changed.text);
        counts(state(f));
        assert.deepEqual(state(f), before);
        record("changed-" + field, {
          state: changed.state,
          noCustomerCreated: true,
          originalUnchanged: true,
          counts: {
            customers: 1,
            repairs: 1,
            history: 1,
            audits: 1,
            assignments: 1,
          },
        });
      } finally {
        cleanup(f);
      }
    },
  );

test(
  "quick-customer Outside replay stays Outside and a zero advance invents no receipt",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    try {
      const key = randomUUID(),
        first = lastJSON(execute(f, save(body(), key))),
        original = state(f);
      counts(original);
      assert.equal(original.rows[0].advance_cash_shift_id, null);
      assert(original.rows[0].advance_cash_shift_assignment_xid);
      open(f);
      const replay = lastJSON(execute(f, save(body(), key)));
      assert.equal(replay.customer_id, first.customer_id);
      assert.equal(replay.replayed, true);
      assert.deepEqual(state(f), original);
      assert.equal(
        Number(
          lastJSON(
            execute(f, `select public.get_cash_shift_snapshot('${f.shift}');`),
          ).expectedCash,
        ),
        0,
      );
      const zero = lastJSON(execute(f, save(body({ advance_paid: "0" }))));
      const row = state(f).rows.find((x) => x.id === zero.id);
      assert(row.customer_id);
      assert.equal(row.advance_cash_shift_assignment_xid, null);
      record("quick-outside-and-zero", {
        outsidePermanentOnReplay: true,
        sameCustomerId: true,
        zeroCreatesAccountWithoutReceiptAssignment: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "different keys with identical name and blank phone remain distinct explicit operations",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    try {
      const data = body({ customer_phone: "" }),
        a = lastJSON(execute(f, save(data))),
        b = lastJSON(execute(f, save(data)));
      counts(state(f), 2, 2);
      assert.notEqual(a.id, b.id);
      assert.notEqual(a.customer_id, b.customer_id);
      assert.notEqual(a.job_no, b.job_no);
      record("different-key-identical-details", {
        createsTwoLegitimateCustomers: true,
        noGlobalDedup: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

for (const changed of [false, true])
  test(
    "real concurrent quick-customer same key " +
      (changed ? "changed intent" : "identical intent"),
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const a = await Session.create(),
        b = await Session.create();
      try {
        const key = randomUUID(),
          first = lastJSON(
            (await a.ok("begin;" + f.auth + save(body(), key))).text,
          );
        await b.ok("begin;" + f.auth);
        const pending = b.run(
          save(body(changed ? { customer_name: "Conflicting name" } : {}), key),
        );
        const wait = await observeBlocked(b, a);
        assert.notEqual(a.pid, b.pid);
        assert.equal(state(f).customers, 0); // Both customer and repair are still uncommitted.
        await a.ok("commit;");
        const second = await pending;
        assert.equal(second.state, changed ? "PT409" : "00000", second.text);
        await b.ok(changed ? "rollback;" : "commit;");
        counts(state(f));
        if (!changed)
          assert.deepEqual(
            { ...lastJSON(second.text), replayed: false },
            first,
          );
        record("concurrent-" + (changed ? "conflict" : "replay"), {
          independentPids: [a.pid, b.pid],
          wait,
          secondState: second.state,
          customerCount: 1,
          repairCount: 1,
          historyCount: 1,
          auditCount: 1,
          assignmentCount: 1,
          noUniqueViolation: true,
        });
      } finally {
        await a.close();
        await b.close();
        cleanup(f);
      }
    },
  );

for (const target of ["repairs", "repair_status_history", "audit_logs"])
  test(
    "fault after customer creation rolls back every operation effect: " +
      target,
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const fault = "qa_quick_" + randomUUID().replaceAll("-", "");
      try {
        const check =
          target === "repairs"
            ? `if not exists(select 1 from public.customers where id=new.customer_id) then raise exception 'Customer was not created before fault'; end if;`
            : "";
        const filter =
          target === "audit_logs"
            ? "if new.action<>'repairs.created' then return new; end if;"
            : "";
        sql(
          `create function public.${fault}() returns trigger language plpgsql set search_path='' as $$ begin ${filter}${check} raise exception 'Injected after quick customer creation' using errcode='23514'; end $$; create trigger ${fault} before insert on public.${target} for each row execute function public.${fault}();`,
        );
        const failed = await attempt(f, save());
        assert.equal(failed.state, "23514", failed.text);
        assert.match(failed.text, /Injected after quick customer creation/);
        counts(state(f), 0, 0);
        record("rollback-" + target, {
          faultAfterCustomer: true,
          sqlState: failed.state,
          customers: 0,
          repairs: 0,
          history: 0,
          audits: 0,
          assignments: 0,
        });
      } finally {
        sql(
          `drop trigger if exists ${fault} on public.${target};drop function if exists public.${fault}();`,
        );
        cleanup(f);
      }
    },
  );

test(
  "selected existing and unlinked intake never create a quick account; edit quick-create is rejected",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    try {
      const selected = body({ customer_id: f.customer }),
        key = randomUUID(),
        first = lastJSON(execute(f, save(selected, key, false)));
      assert.equal(first.customer_id, f.customer);
      assert.equal(
        lastJSON(execute(f, save(selected, key, false))).replayed,
        true,
      );
      const unlinked = lastJSON(execute(f, save(body(), randomUUID(), false)));
      assert.equal(unlinked.customer_id, null);
      counts(state(f), 0, 2);
      for (const query of [
        save(selected),
        save(body(), randomUUID(), true, first.id, 1),
        save(body(), randomUUID(), null),
      ]) {
        assert.equal((await attempt(f, query)).state, "22023");
        counts(state(f), 0, 2);
      }
      const replay = lastJSON(
        execute(f, save(selected, randomUUID(), false, first.id, 1)),
      );
      assert.equal(replay.replayed, true);
      counts(state(f), 0, 2);
      record("selected-unlinked-and-invalid", {
        selectedOriginalId: true,
        selectedCanonicalId: state(f).rows.find((x) => x.id === first.id)
          .repair_request_payload.intent.data.customer_id,
        unlinkedCustomer: null,
        ambiguousDenied: true,
        editQuickCreateDenied: true,
        editReplayCreatesNone: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "unauthorized/inactive and cross-org selection cannot create customers or repairs",
  { skip: !enabled },
  async () => {
    const f = fixture(),
      other = fixture();
    seed(f);
    seed(other);
    try {
      assert.equal(
        (
          await attempt(
            f,
            save(body({ customer_id: other.customer }), randomUUID(), false),
          )
        ).state,
        "42501",
      );
      assert.equal(
        (await attempt(f, save(body({ organization_id: other.org })))).state,
        "22023",
      );
      assert.equal(
        (await attempt({ ...f, auth: "set local role anon;" }, save())).state,
        "42501",
      );
      sql(`update public.profiles set is_active=false where id='${f.actor}';`);
      assert.equal((await attempt(f, save())).state, "42501");
      counts(state(f), 0, 0);
      record("permissions-containment", {
        unauthorizedCreatesNone: true,
        foreignCustomerDenied: true,
        actorOrganizationOnly: true,
      });
    } finally {
      sql(`update public.profiles set is_active=true where id='${f.actor}';`);
      cleanup(f);
      cleanup(other);
    }
  },
);

for (const commit of [true, false])
  test(
    "quick-customer writer first close drains complete " +
      (commit ? "commit" : "rollback"),
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const writer = await Session.create(),
        closer = await Session.create();
      try {
        await writer.ok("begin;" + f.auth + save());
        await closer.ok("begin;" + f.auth);
        const pending = closer.run(f.close(commit ? "100" : "0"));
        const wait = await observeBlocked(closer, writer);
        counts(state(f), 0, 0);
        await writer.ok(commit ? "commit;" : "rollback;");
        assert.equal((await pending).state, "00000");
        await closer.ok("commit;");
        counts(state(f), commit ? 1 : 0, commit ? 1 : 0);
        assert.equal(read(f).shift.expected_cash, commit ? 100 : 0);
        record("quick-writer-first-" + commit, {
          wait,
          customerAndRepairAtomic: true,
          expected: read(f).shift.expected_cash,
        });
      } finally {
        await writer.close();
        await closer.close();
        cleanup(f);
      }
    },
  );

test(
  "exclusive close first blocks quick customer insertion then commits Outside receipt",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const closer = await Session.create(),
      writer = await Session.create();
    try {
      await closer.ok("begin;" + f.auth + f.close("0"));
      await writer.ok("begin;" + f.auth);
      const pending = writer.run(save());
      const wait = await observeBlocked(writer, closer);
      counts(state(f), 0, 0);
      await closer.ok("commit;");
      const receipt = await pending;
      assert.equal(receipt.state, "00000", receipt.text);
      await writer.ok("commit;");
      const after = state(f);
      counts(after);
      assert.equal(after.rows[0].advance_cash_shift_id, null);
      assert(after.rows[0].advance_cash_shift_assignment_xid);
      record("quick-close-first", {
        wait,
        customerNotCommittedBeforeAdmission: true,
        outsidePermanent: true,
      });
    } finally {
      await closer.close();
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "Reset first invalidates pending quick create before customer insertion",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const resetter = await Session.create(),
      writer = await Session.create();
    try {
      await resetter.ok(
        "begin;" +
          f.auth +
          `select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`,
      );
      await writer.ok("begin;" + f.auth);
      const pending = writer.run(save());
      const wait = await observeBlocked(writer, resetter);
      await resetter.ok("commit;");
      const result = await pending;
      assert.equal(result.state, "55000", result.text);
      await writer.ok("rollback;");
      counts(state(f), 0, 0);
      record("quick-reset-first", {
        wait,
        staleState: result.state,
        customers: 0,
        repairs: 0,
        assignments: 0,
      });
    } finally {
      await resetter.close();
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "quick writer holds Reset coordination and Reset later removes the whole operation",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const writer = await Session.create();
    try {
      await writer.ok("begin;" + f.auth + save());
      const resetting = await attempt(
        f,
        `select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`,
      );
      assert.equal(resetting.state, "PT409", resetting.text);
      await writer.ok("commit;");
      counts(state(f));
      execute(
        f,
        `select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`,
      );
      counts(state(f), 0, 0, 1);
      record("quick-reset-after-writer", {
        busyResetState: resetting.state,
        noOrphanCustomerOrReceipt: true,
        retainedAuditAsRequested: true,
      });
    } finally {
      await writer.close();
      cleanup(f);
    }
  },
);
