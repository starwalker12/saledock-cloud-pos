import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
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
function record(name, facts) {
  evidence.push({ name, ...facts });
  if (process.env.CASH_SHIFT_EVIDENCE_DIR)
    fs.writeFileSync(
      process.env.CASH_SHIFT_EVIDENCE_DIR + "/repair-advance-observations.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
}
const literal = (x) =>
  x === null ? "null" : "'" + String(x).replaceAll("'", "''") + "'";
const data = (amount = 100, method = "cash", extra = {}) => ({
  customer_name: "Synthetic receipt customer",
  device_type: "Other",
  problem_description: "Synthetic issue",
  estimated_cost: "200",
  advance_paid: String(amount),
  payment_method: method,
  status: "received",
  ...extra,
});
const save = (body = data(), id = null, revision = 0, key = randomUUID()) =>
  `select public.save_cash_shift_repair(${literal(id)},'${key}',${revision},${literal(JSON.stringify(body))}::jsonb);`;
const execute = (f, query) => sql("begin;" + f.auth + query + ";commit;");
const row = (id) =>
  lastJSON(sql(`select to_jsonb(r) from public.repairs r where id='${id}';`));
const snap = (f) =>
  lastJSON(execute(f, `select public.get_cash_shift_snapshot('${f.shift}');`));
async function denied(f, query, state = "PT409") {
  const s = await Session.create();
  try {
    await s.ok("begin;" + f.auth);
    const r = await s.run(query);
    assert.equal(r.state, state, r.text);
    await s.ok("rollback;");
    return r.state;
  } finally {
    await s.close();
  }
}

for (const method of ["cash", "card", "easypaisa", "jazzcash", "bank_transfer"])
  test(
    "repair advance " +
      method +
      " exact cash classification and closed workflow",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      try {
        const key = randomUUID(),
          body = data(100, method),
          receipt = lastJSON(execute(f, save(body, null, 0, key))),
          r = row(receipt.id);
        assert.equal(r.advance_cash_shift_id, f.shift);
        assert(r.advance_cash_shift_assignment_xid);
        assert.equal(r.advance_received_by, f.actor);
        assert(r.advance_received_at);
        assert.equal(r.payment_method, method);
        assert.equal(
          lastJSON(execute(f, save(body, null, 0, key))).replayed,
          true,
        );
        const before = snap(f);
        assert.equal(Number(before.repairAdvancesTotal), 100);
        assert.equal(
          Number(before.repairAdvancesCash),
          method === "cash" ? 100 : 0,
        );
        assert.equal(Number(before.expectedCash), method === "cash" ? 100 : 0);
        assert.equal(before.sourceCounts.repair_advances, "1");
        assert.equal(before.invoicesCount, "0");
        assert.equal(Number(before.paymentsTotal), 0);
        assert.equal(before.repairAdvancesByStaff[0].user_id, f.actor);
        execute(f, f.close(method === "cash" ? "100" : "0"));
        const closed = read(f);
        assert.equal(closed.shift.cash_difference, 0);
        await denied(f, save(data(120, method), receipt.id, 1));
        await denied(
          f,
          save(data(100, method === "cash" ? "card" : "cash"), receipt.id, 1),
        );
        await denied(
          f,
          `update public.repairs set advance_paid=120 where id='${receipt.id}';`,
          "42501",
        );
        await denied(
          f,
          `update public.repairs set advance_cash_shift_id=null where id='${receipt.id}';`,
          "42501",
        );
        execute(
          f,
          `update public.repairs set diagnosis='Diagnosed',notes='Operational note',status='completed',final_cost=250 where id='${receipt.id}';update public.repairs set status='delivered',delivered_at=clock_timestamp() where id='${receipt.id}';`,
        );
        assert.equal(row(receipt.id).status, "delivered");
        assert.deepEqual(snap(f), closed.shift.close_snapshot);
        record("classification-" + method, {
          sameMembership: true,
          expected: closed.shift.expected_cash,
          variance: 0,
          closedFreeze: true,
          workflowAfterClose: true,
        });
      } finally {
        cleanup(f);
      }
    },
  );

test(
  "zero receipt is assigned only on later financial posting; Outside stays Outside",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      const id = lastJSON(execute(f, save(data(0)))).id;
      assert.equal(row(id).advance_cash_shift_assignment_xid, null);
      execute(f, f.close("0"));
      f.openKey = randomUUID();
      open(f);
      const posted = lastJSON(execute(f, save(data(100), id, 1)));
      const assigned = row(id);
      assert.equal(assigned.advance_cash_shift_id, f.shift);
      assert.equal(posted.revision, 2);
      execute(f, save(data(120), id, 2));
      execute(f, save(data(120, "card"), id, 3));
      assert.equal(row(id).advance_cash_shift_id, f.shift);
      assert.equal(
        row(id).advance_cash_shift_assignment_xid,
        assigned.advance_cash_shift_assignment_xid,
      );
      assert.equal(row(id).advance_received_at, assigned.advance_received_at);
      assert.equal(Number(snap(f).expectedCash), 0);
      assert.equal(Number(snap(f).repairAdvancesByMethod.card), 120);
      execute(f, f.close("0", randomUUID()));
      const outside = lastJSON(execute(f, save(data(100)))).id;
      assert.equal(row(outside).advance_cash_shift_id, null);
      assert(row(outside).advance_cash_shift_assignment_xid);
      f.openKey = randomUUID();
      open(f);
      assert.equal(Number(snap(f).repairAdvancesTotal), 0);
      assert.equal(row(outside).advance_cash_shift_id, null);
      record("zero-later-outside", {
        zeroUnassigned: true,
        laterShiftAssignment: true,
        openAmountAndMethodEdit: true,
        outsidePermanent: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

for (const commit of [true, false])
  test(
    "repair admitted first close drains " + (commit ? "commit" : "rollback"),
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
        const closing = closer.run(f.close(commit ? "100" : "0"));
        const wait = await observeBlocked(closer, writer);
        await writer.ok(commit ? "commit;" : "rollback;");
        assert.equal((await closing).state, "00000");
        await closer.ok("commit;");
        assert.equal(read(f).shift.expected_cash, commit ? 100 : 0);
        record("repair-first-" + commit, {
          wait,
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
  "close first blocks repair before insertion then resolves Outside",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const barrier = await Session.create(),
      closer = await Session.create(),
      writer = await Session.create();
    try {
      await barrier.ok(
        `begin;select id from public.cash_shifts where id='${f.shift}' for update;`,
      );
      await closer.ok("begin;" + f.auth);
      const closing = closer.run(f.close("0"));
      const cw = await observeBlocked(closer, barrier);
      await writer.ok("begin;" + f.auth);
      const creating = writer.run(save());
      const ww = await observeBlocked(writer, closer);
      assert.equal(
        Number(
          sql(
            `select count(*) from public.repairs where organization_id='${f.org}';`,
          ),
        ),
        0,
      );
      await barrier.ok("commit;");
      assert.equal((await closing).state, "00000");
      await closer.ok("commit;");
      const result = await creating;
      assert.equal(result.state, "00000", result.text);
      await writer.ok("commit;");
      const r = row(lastJSON(result.text).id);
      assert.equal(r.advance_cash_shift_id, null);
      assert(r.advance_cash_shift_assignment_xid);
      record("repair-close-first", { cw, ww, outside: true });
    } finally {
      await barrier.close();
      await closer.close();
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "concurrent financial edits use CAS; edit first close includes final value",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const id = lastJSON(execute(f, save())).id;
    const a = await Session.create(),
      b = await Session.create(),
      c = await Session.create();
    try {
      await a.ok("begin;" + f.auth + save(data(120), id, 1));
      await b.ok("begin;" + f.auth);
      const second = b.run(save(data(130), id, 1));
      const bw = await observeBlocked(b, a);
      await c.ok("begin;" + f.auth);
      const closing = c.run(f.close("120"));
      const cw = await observeBlocked(c, [a, b]);
      await a.ok("commit;");
      assert.equal((await second).state, "PT409");
      await b.ok("rollback;");
      assert.equal((await closing).state, "00000");
      await c.ok("commit;");
      assert.equal(row(id).advance_paid, 120);
      assert.equal(read(f).shift.expected_cash, 120);
      record("repair-edit-close", { bw, cw, casConflict: true, expected: 120 });
    } finally {
      await a.close();
      await b.close();
      await c.close();
      cleanup(f);
    }
  },
);

test(
  "close admitted before edit freezes financial edit after waiting",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const id = lastJSON(execute(f, save())).id;
    const closer = await Session.create(),
      writer = await Session.create();
    try {
      await closer.ok("begin;" + f.auth + f.close("100"));
      await writer.ok("begin;" + f.auth);
      const edit = writer.run(save(data(120), id, 1));
      const wait = await observeBlocked(writer, closer);
      await closer.ok("commit;");
      const result = await edit;
      assert.equal(result.state, "PT409", result.text);
      await writer.ok("rollback;");
      assert.equal(row(id).advance_paid, 100);
      record("repair-edit-after-close", { wait, denied: true });
    } finally {
      await closer.close();
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "1001 protected repair producers aggregate completely",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      let queries = "";
      for (let i = 0; i < 1001; i++) queries += save();
      execute(f, queries);
      const live = snap(f);
      assert.equal(live.sourceCounts.repair_advances, "1001");
      assert.equal(Number(live.repairAdvancesCash), 100100);
      execute(f, f.close("100100"));
      assert.equal(read(f).shift.cash_difference, 0);
      record("repair-1001", { count: 1001, cash: 100100, variance: 0 });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "repair containment, authority forgery, legacy and lost-response conflict",
  { skip: !enabled },
  async () => {
    const f = fixture(),
      other = fixture();
    seed(f);
    seed(other);
    open(f);
    try {
      for (const field of [
        "advance_cash_shift_id",
        "advance_cash_shift_assignment_xid",
        "advance_received_at",
        "advance_received_by",
        "repair_revision",
        "repair_request_key",
        "repair_request_payload",
        "accounting_version",
        "cash_shift_id",
      ]) {
        await denied(f, save(data(100, "cash", { [field]: f.shift })), "22023");
      }
      await denied(
        f,
        `insert into public.repairs(organization_id,branch_id,job_no,customer_name,device_type,problem_description,advance_paid) values('${f.org}','${f.branch}','RAW','Synthetic','Other','Issue',100)`,
        "42501",
      );

      await denied(
        f,
        save(data(100, "cash", { customer_id: other.customer })),
        "42501",
      );
      const id = lastJSON(execute(f, save())).id;
      await denied(other, save(data(), id, 1), "42501");
      const branch = randomUUID();
      sql(
        `insert into public.branches(id,organization_id,name) values('${branch}','${f.org}','Other synthetic branch');`,
      );
      await denied(
        f,
        `update public.repairs set branch_id='${branch}' where id='${id}';`,
        "42501",
      );
      const legacy = randomUUID();
      sql(
        `insert into public.repairs(id,organization_id,branch_id,job_no,customer_name,device_type,problem_description,advance_paid) values('${legacy}','${f.org}','${f.branch}','LEGACY','Legacy','Other','Issue',100);`,
      );
      assert.equal(row(legacy).advance_cash_shift_assignment_xid, null);
      await denied(f, save(data(120), legacy, 0));
      execute(f, save(data(100), legacy, 0));
      assert.equal(row(legacy).advance_cash_shift_assignment_xid, null);
      const key = randomUUID();
      execute(f, save(data(), null, 0, key));
      await denied(f, save(data(101), null, 0, key));
      record("repair-security", {
        legacyUnassigned: true,
        forgeryDenied: true,
        crossOrgDenied: true,
        branchReparentDenied: true,
        replayConflict: true,
      });
    } finally {
      cleanup(f);
      cleanup(other);
    }
  },
);

test(
  "mixed six-source cash plus repair deposits remain separate from sales and credit",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      execute(f, f.sale());
      const invoice = sql(
          `select id from public.invoices where organization_id='${f.org}'`,
        ),
        item = sql(
          `select id from public.invoice_items where invoice_id='${invoice}'`,
        );
      execute(f, save(data(100)));
      execute(f, save(data(100, "card")));
      execute(
        f,
        `select public.save_cash_shift_expense(null,'${randomUUID()}',null,'Rent','20','cash',null,null,null,'save');`,
      );
      execute(
        f,
        `select public.create_invoice_return('${invoice}','[{"invoice_item_id":"${item}","quantity":1,"restock":true}]',10,'cash',null,null,'${randomUUID()}');`,
      );
      execute(
        f,
        `select public.record_credit_payment('${f.customer}',30,'cash',null,null,'${randomUUID()}');`,
      );
      const live = snap(f);
      assert.equal(Number(live.expectedCash), 200);
      assert.equal(Number(live.paymentsTotal), 100);
      assert.equal(Number(live.repairAdvancesTotal), 200);
      assert.equal(Number(live.creditCollectionCash), 30);
      assert.equal(Number(live.grossSales), 100);
      execute(f, f.close("200"));
      assert.equal(read(f).shift.cash_difference, 0);
      record("repair-mixed", {
        POS: 100,
        repairCash: 100,
        repairCard: 100,
        expense: 20,
        refund: 10,
        collection: 30,
        expected: 200,
        variance: 0,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "later advance actor/time differ from job creator; existing receipt attribution is immutable",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const id = lastJSON(execute(f, save(data(0)))).id,
      receiver = randomUUID();
    try {
      sql(
        `insert into auth.users(id) values('${receiver}');insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('${receiver}','${f.org}','${f.branch}','Synthetic receiving manager','manager',true);`,
      );
      const other = { ...f, auth: f.auth.replace(f.actor, receiver) };
      execute(other, save(data(100), id, 1));
      const r = row(id);
      assert.equal(r.created_by, f.actor);
      assert.equal(r.advance_received_by, receiver);
      assert(new Date(r.advance_received_at) >= new Date(r.created_at));
      execute(f, save(data(120), id, 2));
      assert.equal(row(id).advance_received_by, receiver);
      record("repair-receiving-actor", {
        firstReceiptActorExact: true,
        jobCreatorNotUsed: true,
        editRetainsReceiptActor: true,
      });
    } finally {
      cleanup(f);
      sql(`delete from auth.users where id='${receiver}';`);
    }
  },
);

test(
  "Reset first rejects stale waiting repair create before any receipt can reappear",
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
      const writing = writer.run(save());
      const wait = await observeBlocked(writer, resetter);
      await resetter.ok("commit;");
      assert.equal((await writing).state, "55000");
      await writer.ok("rollback;");
      assert.equal(
        sql(
          `select count(*) from public.repairs where organization_id='${f.org}'`,
        ),
        "0",
      );
      record("repair-reset-first", { wait, staleRejected: true });
    } finally {
      await resetter.close();
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "repair first holds Reset coordination; Reset later cleans advance before shift",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const writer = await Session.create();
    try {
      await writer.ok("begin;" + f.auth + save());
      await denied(
        f,
        `select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`,
      );
      await writer.ok("commit;");
      execute(
        f,
        `select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`,
      );
      assert.equal(
        sql(
          `select count(*) from public.repairs where organization_id='${f.org}'`,
        ),
        "0",
      );
      assert.equal(
        sql(
          `select count(*) from public.cash_shifts where organization_id='${f.org}'`,
        ),
        "0",
      );
      record("repair-reset-drain", { busyResetRejected: true, noOrphan: true });
    } finally {
      await writer.close();
      cleanup(f);
    }
  },
);

for (const role of ["owner", "admin", "manager", "cashier", "technician"])
  test(
    "repair DB authority mirrors existing " + role + " permissions",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      try {
        sql(`update public.profiles set role='${role}' where id='${f.actor}';`);
        const id = lastJSON(execute(f, save())).id;
        if (["owner", "admin", "manager"].includes(role))
          execute(f, save(data(120), id, 1));
        else await denied(f, save(data(120), id, 1), "42501");
        if (role === "cashier")
          await denied(
            f,
            `update public.repairs set diagnosis='work' where id='${id}'`,
            "42501",
          );
        else
          execute(
            f,
            `update public.repairs set diagnosis='work' where id='${id}'`,
          );
        sql(`update public.profiles set role='owner' where id='${f.actor}';`);
        record("repair-role-" + role, {
          create: true,
          financialEdit: ["owner", "admin", "manager"].includes(role),
          status: role !== "cashier",
        });
      } finally {
        sql(`update public.profiles set role='owner' where id='${f.actor}'`);
        cleanup(f);
      }
    },
  );

test(
  "repair lost-response create replay crosses shift boundary without new receipt; exact edit replay is a no-op",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const originalShift = f.shift,
      key = randomUUID(),
      body = data();
    try {
      const first = lastJSON(execute(f, save(body, null, 0, key)));
      execute(f, save(data(120), first.id, 1));
      const replay = lastJSON(execute(f, save(data(120), first.id, 1)));
      assert.equal(replay.replayed, true);
      assert.equal(row(first.id).repair_revision, 2);
      execute(f, f.close("120"));
      f.openKey = randomUUID();
      open(f);
      const lostResponseReplay = lastJSON(execute(f, save(body, null, 0, key)));
      assert.equal(lostResponseReplay.id, first.id);
      assert.equal(lostResponseReplay.replayed, true);
      assert.equal(row(first.id).advance_cash_shift_id, originalShift);
      assert.equal(Number(snap(f).expectedCash), 0);
      assert.equal(
        sql(
          `select count(*) from public.repairs where organization_id='${f.org}'`,
        ),
        "1",
      );
      assert.equal(
        sql(
          `select count(*) from public.audit_logs where organization_id='${f.org}' and action='repairs.updated'`,
        ),
        "1",
      );
      record("repair-replay-across-shift", {
        originalMembershipPreserved: true,
        noDuplicate: true,
        editReplayNoAudit: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "repair advance money validation rejects sub-cent, negative and out-of-domain values",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    try {
      for (const [value, state] of [
        ["0.001", "22023"],
        ["-0.01", "22003"],
        ["10000000000", "22003"],
        ["NaN", "22023"],
      ])
        await denied(f, save(data(value)), state);
      const tiny = lastJSON(execute(f, save(data("0.01"))));
      assert.equal(row(tiny.id).advance_paid, 0.01);
      assert(row(tiny.id).advance_cash_shift_assignment_xid);
      assert.equal(row(tiny.id).advance_cash_shift_id, null);
      record("repair-money-domain", {
        subcentDenied: true,
        negativeDenied: true,
        overflowDenied: true,
        nanDenied: true,
        paisaExact: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "same-organization cross-branch repair financial edit is denied",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    const id = lastJSON(execute(f, save())).id,
      branch = randomUUID(),
      actor = randomUUID();
    try {
      sql(
        `insert into public.branches(id,organization_id,name) values('${branch}','${f.org}','Synthetic other branch');insert into auth.users(id) values('${actor}');insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('${actor}','${f.org}','${branch}','Synthetic other branch owner','owner',true);`,
      );
      await denied(
        { ...f, auth: f.auth.replace(f.actor, actor) },
        save(data(120), id, 1),
        "42501",
      );
      assert.equal(row(id).advance_paid, 100);
      record("repair-cross-branch", { denied: true, unchanged: true });
    } finally {
      cleanup(f);
      sql(`delete from auth.users where id='${actor}'`);
    }
  },
);
