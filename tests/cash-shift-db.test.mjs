import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  Session,
  sql,
  fixture,
  seed,
  open,
  read,
  cleanup,
  observeBlocked,
  lastJSON,
} from "./helpers/cash-shift-database.mjs";

const enabled = process.env.RUN_LOCAL_CASH_SHIFT_DB === "1";
const observations = [];
async function sessions(count) {
  return Promise.all(Array.from({ length: count }, () => Session.create()));
}
function record(name, facts) {
  observations.push({ name, ...facts });
  if (process.env.CASH_SHIFT_EVIDENCE_DIR)
    fs.writeFileSync(
      process.env.CASH_SHIFT_EVIDENCE_DIR + "/real-session-observations.json",
      JSON.stringify(observations, null, 2) + "\n",
    );
}

for (const commit of [true, false])
  test(
    "writer first: closer drains outer " + (commit ? "COMMIT" : "ROLLBACK"),
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const [writer, closer] = await sessions(2);
      try {
        await writer.ok("begin;" + f.auth + f.sale());
        await closer.ok("begin;" + f.auth);
        const pending = closer.run(f.close(commit ? "100" : "0"));
        const wait = await observeBlocked(closer, writer);
        await writer.ok(commit ? "commit;" : "rollback;");
        const closed = await pending;
        assert.equal(closed.state, "00000", closed.text);
        await closer.ok("commit;");
        const proof = read(f);
        assert.equal(proof.shift.expected_cash, commit ? 100 : 0);
        assert.equal(proof.shift.cash_difference, 0);
        assert.equal(proof.audits, 1);
        record(commit ? "C01" : "C08", {
          wait,
          requestMsIncludingWait: closed.ms,
          expected: proof.shift.expected_cash,
          closeAudits: proof.audits,
        });
      } finally {
        await Promise.all([writer.close(), closer.close()]);
        cleanup(f);
      }
    },
  );

test(
  "close first: actual closer owns admission before blocked target row, later POS cannot join",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [barrier, closer, writer] = await sessions(3);
    try {
      await barrier.ok(
        "begin;select id from public.cash_shifts where id='" +
          f.shift +
          "' for update;",
      );
      await closer.ok("begin;" + f.auth);
      const closing = closer.run(f.close("0"));
      const closeWait = await observeBlocked(closer, barrier);
      await writer.ok("begin;" + f.auth);
      const writing = writer.run(f.sale());
      const writerWait = await observeBlocked(writer, closer);
      await barrier.ok("commit;");
      assert.equal((await closing).state, "00000");
      await closer.ok("commit;");
      assert.equal((await writing).state, "00000");
      await writer.ok("commit;");
      const proof = read(f);
      assert.equal(proof.shift.expected_cash, 0);
      assert.equal(proof.invoices.length, 1);
      assert.equal(proof.invoices[0].cash_shift_id, null);
      assert(proof.invoices[0].cash_shift_assignment_xid);
      record("C02", {
        closeWait,
        writerWait,
        outsideAfterClose: true,
        expected: proof.shift.expected_cash,
      });
    } finally {
      await Promise.all([barrier.close(), closer.close(), writer.close()]);
      cleanup(f);
    }
  },
);

for (const identical of [false, true])
  test(
    "two independent closers: " +
      (identical ? "same key replay" : "distinct key conflict"),
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const [first, second] = await sessions(2);
      try {
        await first.ok("begin;" + f.auth + f.close("0"));
        await second.ok("begin;" + f.auth);
        const competing = second.run(
          f.close("0", identical ? f.closeKey : randomUUID()),
        );
        const wait = await observeBlocked(second, first);
        await first.ok("commit;");
        const result = await competing;
        assert.equal(result.state, identical ? "00000" : "PT409", result.text);
        if (identical) assert.equal(lastJSON(result.text).replayed, true);
        await second.ok(identical ? "commit;" : "rollback;");
        assert.equal(read(f).audits, 1);
        record(identical ? "C05" : "C04", {
          wait,
          state: result.state,
          businessCloses: 1,
        });
      } finally {
        await Promise.all([first.close(), second.close()]);
        cleanup(f);
      }
    },
  );

for (const count of [1, 8, 32])
  test(
    count +
      " different-account writers coexist under shared admission and close drains all",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const customers = Array.from({ length: count }, () => randomUUID());
      sql(
        "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values " +
          customers
            .map(
              (id) =>
                "('" +
                id +
                "','" +
                f.org +
                "','" +
                f.branch +
                "','Synthetic concurrent customer',100)",
            )
            .join(",") +
          ";",
      );
      const writers = await sessions(count),
        closer = await Session.create();
      try {
        const started = performance.now();
        await Promise.all(
          writers.map((s, i) =>
            s.ok(
              "begin;" +
                f.auth +
                "select public.record_credit_payment('" +
                customers[i] +
                "',5,'cash',null,null,'" +
                randomUUID() +
                "');",
            ),
          ),
        );
        const admittedMs = performance.now() - started;
        await closer.ok("begin;" + f.auth);
        const pending = closer.run(f.close(String(count * 5)));
        const wait = await observeBlocked(closer, writers);
        await Promise.all(writers.map((s) => s.ok("commit;")));
        const closed = await pending;
        assert.equal(closed.state, "00000", closed.text);
        await closer.ok("commit;");
        const proof = read(f);
        assert.equal(proof.shift.expected_cash, count * 5);
        assert.equal(proof.shift.cash_difference, 0);
        assert.equal(
          proof.shift.close_snapshot.sourceCounts.credit_payments,
          String(count),
        );
        record("C03-" + count, {
          simultaneousCompletedBodiesHoldingAdmission: count,
          admittedMs,
          wait,
          closeMsIncludingWait: closed.ms,
          expected: proof.shift.expected_cash,
        });
      } finally {
        await Promise.all([...writers.map((s) => s.close()), closer.close()]);
        cleanup(f);
      }
    },
  );

test(
  "C09 close rollback releases admission with no snapshot, audit or request receipt",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [closer, writer] = await sessions(2);
    try {
      await closer.ok("begin;" + f.auth + f.close("0"));
      await writer.ok("begin;" + f.auth);
      const pending = writer.run(f.sale());
      const wait = await observeBlocked(writer, closer);
      await closer.ok("rollback;");
      assert.equal((await pending).state, "00000");
      await writer.ok("commit;");
      let proof = read(f);
      assert.equal(proof.shift.status, "open");
      assert.equal(proof.shift.close_snapshot, null);
      assert.equal(proof.audits, 0);
      assert.equal(proof.invoices[0].cash_shift_id, f.shift);
      sql("begin;" + f.auth + f.close("100") + "commit;");
      proof = read(f);
      assert.equal(proof.shift.expected_cash, 100);
      assert.equal(proof.audits, 1);
      record("C09", {
        wait,
        rolledBackSnapshotAbsent: true,
        waitingWriterJoinsStillOpenShift: true,
      });
    } finally {
      await Promise.all([closer.close(), writer.close()]);
      cleanup(f);
    }
  },
);

test(
  "C10 a long-begun transaction's payment timestamp never determines membership",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    const writer = await Session.create();
    try {
      await writer.ok("begin;" + f.auth);
      open(f);
      await writer.ok(f.sale());
      await writer.ok("commit;");
      sql("begin;" + f.auth + f.close("100") + "commit;");
      const proof = lastJSON(
        sql(
          "select jsonb_build_object('beforeOpen',(select paid_at<s.opened_at from public.payments p join public.cash_shifts s on s.id=p.cash_shift_id where p.organization_id='" +
            f.org +
            "'),'expected',(select expected_cash from public.cash_shifts where id='" +
            f.shift +
            "'));",
        ),
      );
      assert.equal(proof.beforeOpen, true);
      assert.equal(proof.expected, 100);
      record("C10", proof);
    } finally {
      await writer.close();
      cleanup(f);
    }
  },
);

test(
  "C11 protected Outside shift admission blocks opening and is never adopted",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    const [writer, opener] = await sessions(2);
    try {
      await writer.ok("begin;" + f.auth + f.sale());
      await opener.ok("begin;" + f.auth);
      const pending = opener.run(f.open());
      const wait = await observeBlocked(opener, writer);
      await writer.ok("commit;");
      const result = await pending;
      assert.equal(result.state, "00000", result.text);
      f.shift = lastJSON(result.text).id;
      await opener.ok("commit;");
      const proof = read(f);
      assert.equal(proof.invoices[0].cash_shift_id, null);
      assert(proof.invoices[0].cash_shift_assignment_xid);
      record("C11", { wait, outsidePermanent: true });
    } finally {
      await Promise.all([writer.close(), opener.close()]);
      cleanup(f);
    }
  },
);

test(
  "C07/C12 POS replay after close and rollover preserves original receipt, stock and membership",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const key = randomUUID();
    try {
      const original = sql(
        "begin;" + f.auth + f.sale("cash", 100, key) + "commit;",
      );
      sql("begin;" + f.auth + f.close("100") + "commit;");
      const old = f.shift;
      f.openKey = randomUUID();
      open(f);
      const replay = sql(
        "begin;" + f.auth + f.sale("cash", 100, key) + "commit;",
      );
      const proof = read(f);
      assert.equal(proof.invoices.length, 1);
      assert.equal(proof.invoices[0].cash_shift_id, old);
      assert(replay.includes("|t"), replay);
      assert.equal(
        Number(
          sql(
            "select stock_quantity from public.products where id='" +
              f.product +
              "';",
          ),
        ),
        19999,
      );
      record("C07/C12", {
        originalInvoiceRetained: true,
        originalMembershipRetained: true,
        noNewStockEffect: true,
        originalResultPresent: Boolean(original),
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "C06 changed close payload conflicts and saved replay never recalculates",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      const first = lastJSON(sql("begin;" + f.auth + f.close("0") + "commit;"));
      const replay = lastJSON(
        sql("begin;" + f.auth + f.close("0") + "commit;"),
      );
      assert.equal(replay.replayed, true);
      assert.equal(first.audit_id, replay.audit_id);
      assert.equal(first.closed_at, replay.closed_at);
      await s.ok("begin;" + f.auth);
      const changed = await s.run(f.close("1"));
      assert.equal(changed.state, "PT409");
      await s.ok("rollback;");
      assert.equal(read(f).audits, 1);
      record("C06-payload", {
        savedReplay: true,
        changedState: changed.state,
        closeAudits: 1,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

for (const isolation of ["repeatable read", "serializable"])
  test(
    "C13 unsupported writer isolation fails before business mutation: " +
      isolation,
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const s = await Session.create();
      try {
        await s.ok("begin isolation level " + isolation + ";" + f.auth);
        const result = await s.run(f.sale());
        assert.equal(result.state, "25000", result.text);
        await s.ok("rollback;");
        assert.equal(read(f).invoices, null);
        record("C13-" + isolation, {
          state: result.state,
          noBusinessMutation: true,
        });
      } finally {
        await s.close();
        cleanup(f);
      }
    },
  );

test(
  "C14 source savepoint rollback leaves neither a retained event nor a lost admission effect",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [writer, closer] = await sessions(2);
    try {
      await writer.ok(
        "begin;" +
          f.auth +
          "savepoint source_attempt;" +
          f.sale() +
          "rollback to source_attempt;",
      );
      await closer.ok("begin;" + f.auth + f.close("0") + "commit;");
      await writer.ok("commit;");
      const proof = read(f);
      assert.equal(proof.invoices, null);
      assert.equal(proof.shift.expected_cash, 0);
      record("C14", {
        sourceRolledBack: true,
        closeCompleteWithoutTentativeSource: true,
      });
    } finally {
      await Promise.all([writer.close(), closer.close()]);
      cleanup(f);
    }
  },
);

for (const method of ["cash", "card", "bank_transfer", "customer_credit"])
  test(
    "P01/P07 POS Outside shift and coherent header/receipt: " + method,
    { skip: !enabled },
    () => {
      const f = fixture();
      seed(f);
      try {
        sql(
          "begin;" +
            f.auth +
            f.sale(method, method === "customer_credit" ? 0 : 100) +
            "commit;",
        );
        const proof = lastJSON(
          sql(
            "select jsonb_build_object('invoiceOutside',(select cash_shift_id is null and cash_shift_assignment_xid is not null from public.invoices where organization_id='" +
              f.org +
              "'),'receiptCoherent',coalesce((select bool_and(p.cash_shift_id is not distinct from i.cash_shift_id and p.cash_shift_assignment_xid=i.cash_shift_assignment_xid) from public.payments p join public.invoices i on i.id=p.invoice_id where i.organization_id='" +
              f.org +
              "'),true),'receipts',(select count(*) from public.payments where organization_id='" +
              f.org +
              "'));",
          ),
        );
        assert.equal(proof.invoiceOutside, true);
        assert.equal(proof.receiptCoherent, true);
        assert.equal(proof.receipts, method === "customer_credit" ? 0 : 1);
        open(f);
        assert.equal(read(f).invoices[0].cash_shift_id, null);
        record("P01-outside-" + method, proof);
      } finally {
        cleanup(f);
      }
    },
  );

for (const method of ["cash", "card", "bank_transfer"])
  test(
    "P04 keyed credit receipt stays Outside shift and replays exactly once: " +
      method,
    { skip: !enabled },
    () => {
      const f = fixture();
      seed(f);
      const key = randomUUID();
      const pay =
        "select public.record_credit_payment('" +
        f.customer +
        "',10,'" +
        method +
        "',null,null,'" +
        key +
        "');";
      try {
        const first = lastJSON(sql("begin;" + f.auth + pay + "commit;"));
        open(f);
        const replay = lastJSON(sql("begin;" + f.auth + pay + "commit;"));
        assert.equal(first.id, replay.id);
        assert.equal(replay.replayed, true);
        assert.equal(replay.cash_shift_id, null);
        assert.equal(
          Number(
            sql(
              "select outstanding_balance from public.customers where id='" +
                f.customer +
                "'",
            ),
          ),
          990,
        );
        assert.equal(
          Number(
            sql(
              "select count(*) from public.credit_payments where organization_id='" +
                f.org +
                "'",
            ),
          ),
          1,
        );
        record("P04-outside-" + method, {
          originalReceipt: true,
          outsideRetained: true,
          oneFinancialEffect: true,
        });
      } finally {
        cleanup(f);
      }
    },
  );

test(
  "P05 keyed forgiveness is operationally assigned but never contributes cash",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const key = randomUUID();
    const write =
      "select public.record_customer_write_off('" +
      f.customer +
      "',10,'Synthetic forgiveness','" +
      key +
      "');";
    try {
      const first = lastJSON(sql("begin;" + f.auth + write + "commit;"));
      const replay = lastJSON(sql("begin;" + f.auth + write + "commit;"));
      assert.equal(first.id, replay.id);
      assert.equal(replay.replayed, true);
      assert.equal(first.cash_shift_id, f.shift);
      sql("begin;" + f.auth + f.close("0") + "commit;");
      const proof = read(f);
      assert.equal(proof.shift.expected_cash, 0);
      assert.equal(proof.shift.close_snapshot.creditWriteOffs, "10.00");
      record("P05", {
        membership: true,
        zeroCash: true,
        forgivenessReplayedOnce: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "P03 expense open edits retain membership; close freezes economics but permits existing notes",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const key = randomUUID();
    const s = await Session.create();
    const create =
      "select public.save_cash_shift_expense(null,'" +
      key +
      "',null,'Rent','5','cash',null,null,'2026-10-14T00:00:00Z','save');";
    try {
      const receipt = lastJSON(sql("begin;" + f.auth + create + "commit;"));
      const update = (
        amount,
        method,
        revision,
        notes = "null",
        operation = "save",
      ) =>
        "select public.save_cash_shift_expense('" +
        receipt.id +
        "',null," +
        revision +
        ",'Rent','" +
        amount +
        "','" +
        method +
        "',null," +
        notes +
        ",'2026-10-14T00:00:00Z','" +
        operation +
        "');";
      sql("begin;" + f.auth + update("6", "cash", 1) + "commit;");
      assert.equal(
        sql(
          "select cash_shift_id from public.expenses where id='" +
            receipt.id +
            "'",
        ),
        f.shift,
      );
      sql("begin;" + f.auth + f.close("0") + "commit;");
      assert.equal(read(f).shift.expected_cash, -6);
      const failures = [];
      for (const [amount, method, op] of [
        ["7", "cash", "save"],
        ["6", "card", "save"],
        ["6", "cash", "void"],
      ]) {
        await s.ok("begin;" + f.auth);
        const r = await s.run(update(amount, method, 2, "null", op));
        assert.equal(r.state, "PT409", r.text);
        failures.push({ operation: op, amount, method, state: r.state });
        await s.ok("rollback;");
      }
      sql(
        "begin;" +
          f.auth +
          update("6", "cash", 2, "'Nonfinancial annotation'") +
          "commit;",
      );
      assert.equal(read(f).shift.expected_cash, -6);
      record("P03", {
        openEdit: true,
        failures,
        notesAllowed: true,
        snapshotStable: true,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

test(
  "P03 closed archived expense cannot be restored into saved economics",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      const expense = lastJSON(
        sql(
          "begin;" +
            f.auth +
            "select public.save_cash_shift_expense(null,'" +
            randomUUID() +
            "',null,'Rent','5','cash',null,null,null,'save');commit;",
        ),
      );
      sql(
        "begin;" +
          f.auth +
          "select public.save_cash_shift_expense('" +
          expense.id +
          "',null,1,null,null,null,null,null,null,'void');commit;",
      );
      sql("begin;" + f.auth + f.close("0") + "commit;");
      await s.ok("begin;" + f.auth);
      const r = await s.run(
        "select public.save_cash_shift_expense('" +
          expense.id +
          "',null,2,null,null,null,null,null,null,'restore');",
      );
      assert.equal(r.state, "PT409");
      await s.ok("rollback;");
      assert.equal(read(f).shift.expected_cash, 0);
      record("P03-restore", {
        state: r.state,
        closedArchivedExpenseFrozen: true,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

test(
  "P03 Outside-shift expense stays outside through later open edit and keyed create replay",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    const key = randomUUID();
    const create =
      "select public.save_cash_shift_expense(null,'" +
      key +
      "',null,'Rent','5','card',null,null,null,'save');";
    try {
      const expense = lastJSON(sql("begin;" + f.auth + create + "commit;"));
      open(f);
      sql(
        "begin;" +
          f.auth +
          "select public.save_cash_shift_expense('" +
          expense.id +
          "',null,1,'Rent','6','card',null,null,null,'save');commit;",
      );
      const replay = lastJSON(sql("begin;" + f.auth + create + "commit;"));
      assert.equal(replay.id, expense.id);
      assert.equal(replay.replayed, true);
      const proof = lastJSON(
        sql(
          "select jsonb_build_object('outside',cash_shift_id is null and cash_shift_assignment_xid is not null,'amount',amount) from public.expenses where id='" +
            expense.id +
            "';",
        ),
      );
      assert.equal(proof.outside, true);
      assert.equal(proof.amount, 6);
      record("P03-outside", {
        outsideAfterEdit: true,
        creationReplayDoesNotUndoEdit: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "P08 exact cash lexical values and scalar overflow roll back the whole close",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      for (const value of ["NaN", "Infinity", "-1", "0.001", "10000000000"]) {
        await s.ok("begin;" + f.auth);
        const r = await s.run(f.close(value));
        assert(["22023", "22003"].includes(r.state), r.text);
        await s.ok("rollback;");
        assert.equal(read(f).shift.status, "open");
      }
      const receipt = lastJSON(
        sql("begin;" + f.auth + f.close("0.000") + "commit;"),
      );
      assert.equal(receipt.cash_difference, "0.00");
      assert.equal(receipt.counted_cash, "0.00");
      const replay = lastJSON(
        sql("begin;" + f.auth + f.close("0.00") + "commit;"),
      );
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay, { ...receipt, replayed: true });
      assert.equal(read(f).audits, 1);
      record("P08-input", {
        invalidInputs: 5,
        zeroWithInsignificantTrailingZerosValid: true,
        noPartialClose: true,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

test(
  "X06 cashier and technician can retain safe shift reads but cannot open or close",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      for (const role of ["cashier", "technician"]) {
        sql(
          "update public.profiles set role='" +
            role +
            "' where id='" +
            f.actor +
            "';",
        );
        const snapshot = lastJSON(
          sql(
            "begin;" +
              f.auth +
              "select public.get_cash_shift_snapshot('" +
              f.shift +
              "');commit;",
          ),
        );
        assert.equal(snapshot.version, 2);
        await s.ok("begin;" + f.auth);
        const r = await s.run(f.close("0"));
        assert.equal(r.state, "42501");
        await s.ok("rollback;");
      }
      sql(
        "update public.profiles set role='owner' where id='" + f.actor + "';",
      );
      record("X06-reader-parity", {
        cashierRead: true,
        technicianRead: true,
        writerDenied: true,
      });
    } finally {
      await s.close();
      sql(
        "update public.profiles set role='owner' where id='" + f.actor + "';",
      );
      cleanup(f);
    }
  },
);

test(
  "X07 raw assignment, snapshot, expense and exact-version writes are denied",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      sql("begin;" + f.auth + f.sale() + "commit;");
      const statements = [
        "update public.invoices set cash_shift_id=null where organization_id='" +
          f.org +
          "'",
        "update public.invoices set cash_shift_assignment_xid=null where organization_id='" +
          f.org +
          "'",
        "update public.cash_shifts set accounting_version=null where id='" +
          f.shift +
          "'",
        "update public.cash_shifts set expected_cash=1 where id='" +
          f.shift +
          "'",
        "insert into public.expenses(organization_id,branch_id,amount,created_by) values('" +
          f.org +
          "','" +
          f.branch +
          "',1,'" +
          f.actor +
          "')",
        "select cash_private.boundary('" + f.org + "','" + f.branch + "',true)",
      ];
      for (const query of statements) {
        await s.ok("begin;" + f.auth);
        const r = await s.run(query);
        assert.equal(r.state, "42501", query + " " + r.text);
        await s.ok("rollback;");
      }
      record("X07", {
        deniedMutations: statements.length,
        membershipUnchanged: true,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

test(
  "X01 Reset drains an admitted expense writer and removes its source before the shift parent",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [writer, resetter] = await sessions(2);
    try {
      await writer.ok(
        "begin;" +
          f.auth +
          "select public.save_cash_shift_expense(null,'" +
          randomUUID() +
          "',null,'Rent','5','cash',null,null,null,'save');",
      );
      await resetter.ok("begin;" + f.auth);
      const pending = resetter.run(
        "select public.reset_organization_to_factory_defaults('" +
          f.org +
          "','" +
          f.actor +
          "',false);",
      );
      const wait = await observeBlocked(resetter, writer);
      await writer.ok("commit;");
      const result = await pending;
      assert.equal(result.state, "00000", result.text);
      await resetter.ok("commit;");
      assert.equal(
        Number(
          sql(
            "select count(*) from public.expenses where organization_id='" +
              f.org +
              "'",
          ),
        ),
        0,
      );
      assert.equal(
        Number(
          sql(
            "select count(*) from public.cash_shifts where organization_id='" +
              f.org +
              "'",
          ),
        ),
        0,
      );
      record("X01-writer-first", {
        wait,
        noOrphans: true,
        sourceAndParentRemoved: true,
      });
    } finally {
      await Promise.all([writer.close(), resetter.close()]);
      cleanup(f);
    }
  },
);

test(
  "X01 Reset first invalidates an old pending expense before any business mutation",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    const [resetter, writer] = await sessions(2);
    try {
      await resetter.ok(
        "begin;" +
          f.auth +
          "select public.reset_organization_to_factory_defaults('" +
          f.org +
          "','" +
          f.actor +
          "',false);",
      );
      await writer.ok("begin;" + f.auth);
      const pending = writer.run(
        "select public.save_cash_shift_expense(null,'" +
          randomUUID() +
          "',null,'Rent','5','cash',null,null,null,'save');",
      );
      const wait = await observeBlocked(writer, resetter);
      await resetter.ok("commit;");
      const result = await pending;
      assert.equal(result.state, "55000", result.text);
      await writer.ok("rollback;");
      assert.equal(
        Number(
          sql(
            "select count(*) from public.expenses where organization_id='" +
              f.org +
              "'",
          ),
        ),
        0,
      );
      record("X01-reset-first", {
        wait,
        pendingState: result.state,
        noStaleSource: true,
      });
    } finally {
      await Promise.all([resetter.close(), writer.close()]);
      cleanup(f);
    }
  },
);

test(
  "X09 later collections and profile changes do not rewrite closed snapshot truth",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      sql(
        "begin;" +
          f.auth +
          f.sale("customer_credit", 0) +
          f.close("0") +
          "commit;",
      );
      const before = sql(
        "select close_snapshot::text from public.cash_shifts where id='" +
          f.shift +
          "';",
      );
      sql(
        "begin;" +
          f.auth +
          "select public.record_credit_payment('" +
          f.customer +
          "',20,'cash',null,null,'" +
          randomUUID() +
          "');commit;",
      );
      sql(
        "update public.profiles set full_name='Synthetic renamed owner' where id='" +
          f.actor +
          "';",
      );
      const after = sql(
        "select close_snapshot::text from public.cash_shifts where id='" +
          f.shift +
          "';",
      );
      assert.equal(after, before);
      const display = lastJSON(
        sql(
          "begin;" +
            f.auth +
            "select public.get_cash_shift_snapshot('" +
            f.shift +
            "');commit;",
        ),
      );
      assert.equal(display.creditPending, "100.00");
      record("X09", {
        snapshotBytesStable: true,
        pendingAtCloseRetained: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

function producer(f, kind, method = "cash") {
  if (kind === "credit_payments")
    return (
      "select public.record_credit_payment('" +
      f.customer +
      "',10,'" +
      method +
      "',null,null,'" +
      randomUUID() +
      "');"
    );
  if (kind === "customer_write_offs")
    return (
      "select public.record_customer_write_off('" +
      f.customer +
      "',10,'Synthetic forgiveness','" +
      randomUUID() +
      "');"
    );
  if (kind === "expenses")
    return (
      "select public.save_cash_shift_expense(null,'" +
      randomUUID() +
      "',null,'Rent','10','" +
      method +
      "',null,null,null,'save');"
    );
  const source = lastJSON(
    sql(
      "select jsonb_build_object('invoice',i.id,'item',ii.id,'paid',i.amount_paid) from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id where i.organization_id='" +
        f.org +
        "' order by i.created_at desc limit 1;",
    ),
  );
  return (
    "select * from public.create_invoice_return('" +
    source.invoice +
    '\',\'[{"invoice_item_id":"' +
    source.item +
    '","quantity":1,"restock":true}]\',' +
    source.paid +
    ",'" +
    method +
    "',null,null,'" +
    randomUUID() +
    "');"
  );
}
for (const kind of [
  "returns",
  "expenses",
  "credit_payments",
  "customer_write_offs",
])
  for (const order of ["writer-commit", "writer-rollback", "close-first"]) {
    test(
      "C01/C02/C08 producer " + kind + " " + order,
      { skip: !enabled },
      async () => {
        const f = fixture();
        seed(f);
        if (kind === "returns") sql("begin;" + f.auth + f.sale() + "commit;");
        open(f);
        const [writer, closer] = await sessions(2);
        try {
          const statement = producer(f, kind);
          let pending, wait;
          if (order === "close-first") {
            await closer.ok("begin;" + f.auth + f.close("0"));
            await writer.ok("begin;" + f.auth);
            pending = writer.run(statement);
            wait = await observeBlocked(writer, closer);
            assert.equal(
              sql(
                "select count(*) from public." +
                  kind +
                  " where organization_id='" +
                  f.org +
                  "';",
              ),
              "0",
            );
            await closer.ok("commit;");
            assert.equal((await pending).state, "00000");
            await writer.ok("commit;");
            assert.equal(
              sql(
                "select cash_shift_id is null and cash_shift_assignment_xid is not null from public." +
                  kind +
                  " where organization_id='" +
                  f.org +
                  "';",
              ),
              "t",
            );
          } else {
            await writer.ok("begin;" + f.auth + statement);
            await closer.ok("begin;" + f.auth);
            const expected =
              order === "writer-rollback"
                ? 0
                : kind === "returns" || kind === "expenses"
                  ? -10 * (kind === "returns" ? 10 : 1)
                  : kind === "credit_payments"
                    ? 10
                    : 0;
            pending = closer.run(f.close(String(Math.max(0, expected))));
            wait = await observeBlocked(closer, writer);
            await writer.ok(
              order === "writer-commit" ? "commit;" : "rollback;",
            );
            assert.equal((await pending).state, "00000");
            await closer.ok("commit;");
            const proof = read(f);
            assert.equal(proof.shift.expected_cash, expected);
            assert.equal(
              proof.shift.close_snapshot.sourceCounts[kind],
              order === "writer-commit" ? "1" : "0",
            );
          }
          record("producer-" + kind + "-" + order, {
            wait,
            oneBusinessEffect: true,
            deadlock: false,
          });
        } finally {
          await Promise.all([writer.close(), closer.close()]);
          cleanup(f);
        }
      },
    );
  }
for (const method of ["cash", "card", "bank_transfer", "easypaisa", "jazzcash"])
  test(
    "P02 current Return method " + method + " and replay across close",
    { skip: !enabled },
    () => {
      const f = fixture();
      seed(f);
      sql("begin;" + f.auth + f.sale(method) + "commit;");
      open(f);
      try {
        const statement = producer(f, "returns", method);
        const first = sql("begin;" + f.auth + statement + "commit;");
        sql("begin;" + f.auth + f.close("0") + "commit;");
        const replay = sql("begin;" + f.auth + statement + "commit;");
        assert.match(replay, /t$/);
        assert.equal(first.split("|")[0], replay.split("|")[0]);
        const snapshot = read(f).shift.close_snapshot;
        assert.equal(snapshot.refundsByMethod[method], "100.00");
        assert.equal(read(f).shift.expected_cash, method === "cash" ? -100 : 0);
        assert.equal(
          sql(
            "select count(*) from public.return_stock_allocations where organization_id='" +
              f.org +
              "';",
          ),
          "1",
        );
        record("P02-" + method, {
          membership: true,
          oneRestock: true,
          keyedReplay: true,
          cashEffect: method === "cash" ? -100 : 0,
        });
      } finally {
        cleanup(f);
      }
    },
  );
test(
  "P02 unpaid current Return joins processing shift with zero cash",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    sql("begin;" + f.auth + f.sale("customer_credit", 0) + "commit;");
    open(f);
    try {
      sql(
        "begin;" + f.auth + producer(f, "returns") + f.close("0") + "commit;",
      );
      assert.equal(read(f).shift.expected_cash, 0);
      assert.equal(read(f).shift.close_snapshot.sourceCounts.returns, "1");
      record("P02-unpaid", { zeroCash: true, operationalMember: true });
    } finally {
      cleanup(f);
    }
  },
);
test(
  "P03 concurrent edits serialize on expense revision without lost economics",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const id = lastJSON(
      sql("begin;" + f.auth + producer(f, "expenses") + "commit;"),
    ).id;
    const [a, b] = await sessions(2);
    const edit = (amount) =>
      "select public.save_cash_shift_expense('" +
      id +
      "',null,1,'Rent','" +
      amount +
      "','cash',null,null,null,'save');";
    try {
      await a.ok("begin;" + f.auth + edit(20));
      await b.ok("begin;" + f.auth);
      const pending = b.run(edit(30));
      const wait = await observeBlocked(b, a);
      await a.ok("commit;");
      const loser = await pending;
      assert.equal(loser.state, "PT409");
      await b.ok("rollback;");
      sql("begin;" + f.auth + f.close("0") + "commit;");
      assert.equal(read(f).shift.expected_cash, -20);
      record("P03-revision", { wait, loser: loser.state, oneEdit: true });
    } finally {
      await Promise.all([a.close(), b.close()]);
      cleanup(f);
    }
  },
);
test(
  "X06 tenant, branch, inactive, anonymous and service callers cannot manufacture a close",
  { skip: !enabled },
  async () => {
    const f = fixture(),
      g = fixture();
    seed(f);
    seed(g);
    open(f);
    open(g);
    const s = await Session.create();
    try {
      for (const [name, auth, query] of [
        ["tenant", g.auth, f.close("0")],
        ["anonymous", "set local role anon;", f.close("0")],
        ["service", "set local role service_role;", f.close("0")],
      ]) {
        await s.ok("begin;" + auth);
        const r = await s.run(query);
        assert(["42501", "28000"].includes(r.state), r.text);
        await s.ok("rollback;");
        record("X06-" + name, { state: r.state });
      }
      const branch = randomUUID();
      sql(
        "insert into public.branches(id,organization_id,name) values('" +
          branch +
          "','" +
          f.org +
          "','Second branch');update public.profiles set branch_id='" +
          branch +
          "' where id='" +
          f.actor +
          "';",
      );
      await s.ok("begin;" + f.auth);
      assert.equal((await s.run(f.close("0"))).state, "42501");
      await s.ok("rollback;");
      sql(
        "update public.profiles set branch_id='" +
          f.branch +
          "',is_active=false where id='" +
          f.actor +
          "';",
      );
      await s.ok("begin;" + f.auth);
      assert.equal((await s.run(f.close("0"))).state, "42501");
      await s.ok("rollback;");
      sql(
        "update public.profiles set is_active=true where id='" + f.actor + "';",
      );
      assert.equal(read(f).shift.status, "open");
    } finally {
      await s.close();
      sql(
        "update public.profiles set branch_id='" +
          f.branch +
          "',is_active=true where id='" +
          f.actor +
          "';",
      );
      cleanup(f);
      cleanup(g);
    }
  },
);
test(
  "X07 referenced close audit and saved snapshot reject privileged raw tampering",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    sql("begin;" + f.auth + f.close("0") + "commit;");
    const before = read(f);
    const s = await Session.create();
    try {
      for (const query of [
        "delete from public.audit_logs where id='" +
          before.shift.close_audit_id +
          "'",
        "update public.audit_logs set details='Tamper' where id='" +
          before.shift.close_audit_id +
          "'",
        "update public.cash_shifts set close_snapshot='{}' where id='" +
          f.shift +
          "'",
      ]) {
        await s.ok("begin;");
        const r = await s.run(query);
        assert.equal(r.state, "42501", r.text);
        await s.ok("rollback;");
      }
      assert.deepEqual(read(f), before);
      record("X07-audit", { denied: 3, snapshotStable: true });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

test(
  "C06 actual HTTP response loss after committed close returns the original receipt",
  { skip: !enabled, timeout: 60000 },
  async () => {
    const { isolated } = await import("./helpers/atomic-import-database.mjs");
    await isolated(async ({ request, loseResponseRpc, sql: local }) => {
      const start = await request("rpc/open_cash_shift", {
        p_request_key: randomUUID(),
        p_starting_cash: "0",
        p_notes: null,
      });
      assert.equal(start.status, 200);
      const args = {
        p_shift_id: start.data.id,
        p_request_key: randomUUID(),
        p_counted_cash: "0",
        p_notes: "Synthetic close",
      };
      const lost = await loseResponseRpc(
        "close_cash_shift",
        args,
        "close_cash_shift",
      );
      const committed = JSON.parse(
        local(
          "select jsonb_build_object('closed_at',closed_at,'audit_id',close_audit_id,'expected_cash',expected_cash::text) from public.cash_shifts where id='" +
            start.data.id +
            "'",
        ),
      );
      const replay = await request("rpc/close_cash_shift", args);
      assert.equal(replay.status, 200);
      assert.equal(replay.data.replayed, true);
      assert.equal(replay.data.audit_id, committed.audit_id);
      assert.equal(
        Date.parse(replay.data.closed_at),
        Date.parse(committed.closed_at),
      );
      assert.equal(replay.data.expected_cash, committed.expected_cash);
      assert.equal(
        local(
          "select count(*) from public.audit_logs where action='cash_shift.closed'",
        ),
        "1",
      );
      assert.equal(
        (
          await request("rpc/close_cash_shift", {
            ...args,
            p_counted_cash: "1",
          })
        ).status,
        409,
      );
      record("C06-http", {
        ...lost,
        oneCloseAudit: true,
        sameReceipt: true,
        changedPayloadConflict: true,
      });
    });
  },
);

test(
  "C03 eight shared writers include four commits and exclude four rollbacks",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const writers = await sessions(8),
      closer = await Session.create();
    try {
      const customers = Array.from({ length: 8 }, () => randomUUID());
      sql(
        "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values " +
          customers
            .map(
              (id) =>
                "('" +
                id +
                "','" +
                f.org +
                "','" +
                f.branch +
                "','Synthetic shared writer',100)",
            )
            .join(",") +
          ";",
      );
      await Promise.all(
        writers.map((s, i) =>
          s.ok(
            "begin;" +
              f.auth +
              "select public.record_credit_payment('" +
              customers[i] +
              "',5,'cash',null,null,'" +
              randomUUID() +
              "');",
          ),
        ),
      );
      await closer.ok("begin;" + f.auth);
      const pending = closer.run(f.close("20"));
      const wait = await observeBlocked(closer, writers);
      await Promise.all(
        writers.map((s, i) => s.ok(i % 2 ? "rollback;" : "commit;")),
      );
      assert.equal((await pending).state, "00000");
      await closer.ok("commit;");
      assert.equal(read(f).shift.expected_cash, 20);
      assert.equal(
        read(f).shift.close_snapshot.sourceCounts.credit_payments,
        "4",
      );
      record("C03-mixed", {
        wait,
        sharedWriters: 8,
        committed: 4,
        rolledBack: 4,
      });
    } finally {
      await Promise.all([...writers.map((s) => s.close()), closer.close()]);
      cleanup(f);
    }
  },
);
test(
  "X10 independent organizations and branches admit concurrent normal writers",
  { skip: !enabled },
  async () => {
    const f = fixture(),
      g = fixture();
    seed(f);
    seed(g);
    open(f);
    open(g);
    const [a, b] = await sessions(2);
    try {
      const results = await Promise.all([
        a.ok("begin;" + f.auth + producer(f, "expenses")),
        b.ok("begin;" + g.auth + producer(g, "expenses")),
      ]);
      assert(results.every((r) => r.state === "00000"));
      await Promise.all([a.ok("commit;"), b.ok("commit;")]);
      record("X10", {
        concurrentBodiesHoldingAdmission: 2,
        independentOrganizationBranchGates: true,
      });
    } finally {
      await Promise.all([a.close(), b.close()]);
      cleanup(f);
      cleanup(g);
    }
  },
);
for (const method of ["easypaisa", "jazzcash"])
  test(
    "P01 wallet POS and partial receipt membership " + method,
    { skip: !enabled },
    () => {
      const f = fixture();
      seed(f);
      open(f);
      try {
        sql("begin;" + f.auth + f.sale(method, 40) + f.close("0") + "commit;");
        const snap = read(f).shift.close_snapshot;
        assert.equal(snap.paymentsByMethod[method], "40.00");
        assert.equal(snap.creditPending, "60.00");
        assert.equal(read(f).shift.expected_cash, 0);
        record("P01-partial-" + method, {
          pending: "60.00",
          payment: "40.00",
          cash: 0,
        });
      } finally {
        cleanup(f);
      }
    },
  );
test(
  "P01 existing service and walk-in POS retain coherent exact membership",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      sql(
        "insert into public.products(organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('" +
          f.org +
          "','Synthetic service','service',100,0,0,true);",
      );
      const service = sql(
        "select id from public.products where organization_id='" +
          f.org +
          "' and type='service'",
      );
      const statement = f
        .sale()
        .replace("'" + f.customer + "'", "null")
        .replace(f.product, service);
      sql("begin;" + f.auth + statement + f.close("100") + "commit;");
      const proof = read(f);
      assert.equal(proof.shift.expected_cash, 100);
      assert.equal(proof.invoices[0].cash_shift_id, f.shift);
      assert.equal(
        sql(
          "select count(*) from public.invoice_item_stock_allocations where organization_id='" +
            f.org +
            "'",
        ),
        "0",
      );
      record("P01-service-walk-in", {
        service: true,
        noInventory: true,
        coherentMembership: true,
      });
    } finally {
      cleanup(f);
    }
  },
);

test(
  "P08 aggregate overflow rejects the entire close while preserving committed sources",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const s = await Session.create();
    try {
      const sale = () =>
        f
          .sale("cash", 9999999999.99)
          .replace('"unit_price":100', '"unit_price":9999999999.99');
      sql("begin;" + f.auth + sale() + sale() + "commit;");
      await s.ok("begin;" + f.auth);
      const r = await s.run(f.close("0"));
      assert.equal(r.state, "22003", r.text);
      assert.match(r.text, /This shift was not closed/);
      await s.ok("rollback;");
      const proof = read(f);
      assert.equal(proof.shift.status, "open");
      assert.equal(proof.shift.close_snapshot, null);
      assert.equal(proof.audits, 0);
      assert.equal(proof.invoices.length, 2);
      record("P08-overflow", {
        state: r.state,
        sourcesRetained: 2,
        partialClose: false,
      });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);
test(
  "X01 Reset drains a tentative close, removes its receipt and retains the existing audit policy",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [closer, resetter] = await sessions(2);
    try {
      await closer.ok("begin;" + f.auth + f.close("0"));
      await resetter.ok("begin;" + f.auth);
      const pending = resetter.run(
        "select public.reset_organization_to_factory_defaults('" +
          f.org +
          "','" +
          f.actor +
          "',false);",
      );
      const wait = await observeBlocked(resetter, closer);
      await closer.ok("commit;");
      assert.equal((await pending).state, "00000");
      await resetter.ok("commit;");
      assert.equal(
        sql(
          "select count(*) from public.cash_shifts where organization_id='" +
            f.org +
            "'",
        ),
        "0",
      );
      assert.equal(
        sql(
          "select count(*) from public.audit_logs where organization_id='" +
            f.org +
            "' and action='cash_shift.closed'",
        ),
        "1",
      );
      record("X01-close-first", {
        wait,
        noOrphans: true,
        historicalAuditRetained: true,
      });
    } finally {
      await Promise.all([closer.close(), resetter.close()]);
      cleanup(f);
    }
  },
);

async function secondBranch(f) {
  const other = {
    ...f,
    branch: randomUUID(),
    actor: randomUUID(),
    customer: randomUUID(),
    openKey: randomUUID(),
    closeKey: randomUUID(),
  };
  other.auth =
    "set local request.jwt.claim.sub='" +
    other.actor +
    "';set local request.jwt.claim.role='authenticated';set local role authenticated;";
  sql(
    "insert into public.branches(id,organization_id,name) values('" +
      other.branch +
      "','" +
      f.org +
      "','Synthetic second branch');insert into auth.users(id) values('" +
      other.actor +
      "');insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('" +
      other.actor +
      "','" +
      f.org +
      "','" +
      other.branch +
      "','Synthetic second owner','owner',true);insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('" +
      other.customer +
      "','" +
      f.org +
      "','" +
      other.branch +
      "','Synthetic second account',1000);",
  );
  other.open = () =>
    "select public.open_cash_shift('" + other.openKey + "','0',null);";
  other.close = (counted = "0", key = other.closeKey) =>
    "select public.close_cash_shift('" +
    other.shift +
    "','" +
    key +
    "','" +
    counted +
    "',null);";
  return other;
}
test(
  "X10 same-organization different branches retain simultaneous shared admission",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    const g = await secondBranch(f);
    open(f);
    open(g);
    const [a, b] = await sessions(2);
    try {
      await Promise.all([
        a.ok("begin;" + f.auth + producer(f, "credit_payments")),
        b.ok("begin;" + g.auth + producer(g, "credit_payments")),
      ]);
      await Promise.all([a.ok("commit;"), b.ok("commit;")]);
      sql("begin;" + f.auth + f.close("10") + "commit;");
      sql("begin;" + g.auth + g.close("10") + "commit;");
      assert.equal(read(f).shift.expected_cash, 10);
      assert.equal(read(g).shift.expected_cash, 10);
      record("X10-same-org", {
        simultaneousBodies: 2,
        independentBranchGates: true,
      });
    } finally {
      await Promise.all([a.close(), b.close()]);
      cleanup(f);
      sql("delete from auth.users where id='" + g.actor + "';");
    }
  },
);
for (const operation of ["open", "close"])
  test(
    "organization-scoped " +
      operation +
      " key collision across branches returns conflict and rolls back loser",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      const g = await secondBranch(f);
      const key = randomUUID();
      if (operation === "close") {
        open(f);
        open(g);
      } else {
        f.openKey = key;
        g.openKey = key;
      }
      const [a, b] = await sessions(2);
      try {
        await a.ok(
          "begin;" +
            f.auth +
            (operation === "open" ? f.open() : f.close("0", key)),
        );
        await b.ok("begin;" + g.auth);
        const pending = b.run(
          operation === "open" ? g.open() : g.close("0", key),
        );
        const wait = await observeBlocked(b, a);
        await a.ok("commit;");
        const conflict = await pending;
        assert.equal(conflict.state, "PT409", conflict.text);
        await b.ok("rollback;");
        assert.equal(
          sql(
            "select count(*) from public.cash_shifts where organization_id='" +
              f.org +
              "' and " +
              operation +
              "_request_key='" +
              key +
              "'",
          ),
          "1",
        );
        if (operation === "close") {
          assert.equal(read(g).shift.status, "open");
          assert.equal(
            sql(
              "select count(*) from public.audit_logs where organization_id='" +
                f.org +
                "' and action='cash_shift.closed'",
            ),
            "1",
          );
        }
        record("global-key-" + operation, {
          wait,
          conflict: conflict.state,
          oneCommittedOperation: true,
        });
      } finally {
        await Promise.all([a.close(), b.close()]);
        cleanup(f);
        sql("delete from auth.users where id='" + g.actor + "';");
      }
    },
  );

test(
  "existing POS organization counter lock remains distinct from shared cash admission",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    open(f);
    const [a, b] = await sessions(2),
      otherCustomer = randomUUID();
    sql(
      "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('" +
        otherCustomer +
        "','" +
        f.org +
        "','" +
        f.branch +
        "','Synthetic second POS customer',0);",
    );
    try {
      const first = await a.ok("begin;" + f.auth + f.sale());
      await b.ok("begin;" + f.auth);
      const pending = b.run(f.sale().replace(f.customer, otherCustomer));
      const wait = await observeBlocked(b, a);
      const locks = JSON.parse(
        sql(
          "select coalesce(jsonb_agg(jsonb_build_object('relation',relation::regclass::text,'type',locktype,'mode',mode,'granted',granted)),'[]') from pg_locks where pid=" +
            b.pid +
            " and relation in('public.organizations'::regclass,'cash_private.branch_boundaries'::regclass)",
        ),
      );
      assert(
        locks.some(
          (l) =>
            ["organizations", "public.organizations"].includes(l.relation) &&
            l.type === "tuple",
        ),
      );
      assert(
        locks.some(
          (l) => l.relation === "cash_private.branch_boundaries" && l.granted,
        ),
      );
      await a.ok("commit;");
      const second = await pending;
      assert.equal(second.state, "00000", second.text);
      await b.ok("commit;");
      sql("begin;" + f.auth + f.close("200") + "commit;");
      assert.equal(read(f).shift.expected_cash, 200);
      record("POS-existing-O", {
        firstBodyMs: first.ms,
        secondBodyMsIncludingControlledOrganizationWait: second.ms,
        wait,
        locks,
        newExclusiveCashMutex: false,
      });
    } finally {
      await Promise.all([a.close(), b.close()]);
      cleanup(f);
    }
  },
);
test(
  "P07 stale missing-key producers reject before source or account mutation",
  { skip: !enabled },
  async () => {
    const f = fixture();
    seed(f);
    sql("begin;" + f.auth + f.sale() + "commit;");
    open(f);
    const s = await Session.create();
    try {
      const returnWithKey = producer(f, "returns");
      const noReturnKey = returnWithKey.replace(/,'[0-9a-f-]{36}'\);$/, ");");
      const statements = [
        "select public.record_credit_payment('" +
          f.customer +
          "',5,'cash',null,null);",
        "select public.record_customer_write_off('" +
          f.customer +
          "',5,'Synthetic forgiveness');",
        noReturnKey,
        "select public.save_cash_shift_expense(null,null,null,'Rent','5','cash',null,null,null,'save');",
      ];
      for (const statement of statements) {
        await s.ok("begin;" + f.auth);
        const r = await s.run(statement);
        assert.equal(r.state, "22023", r.text);
        await s.ok("rollback;");
      }
      assert.equal(
        sql(
          "select (select count(*) from public.credit_payments where organization_id='" +
            f.org +
            "')+(select count(*) from public.customer_write_offs where organization_id='" +
            f.org +
            "')+(select count(*) from public.returns where organization_id='" +
            f.org +
            "')+(select count(*) from public.expenses where organization_id='" +
            f.org +
            "')",
        ),
        "0",
      );
      assert.equal(
        sql(
          "select outstanding_balance::text from public.customers where id='" +
            f.customer +
            "'",
        ),
        "1000.00",
      );
      record("P07-missing-key", { denied: 4, sourceEffects: 0 });
    } finally {
      await s.close();
      cleanup(f);
    }
  },
);

for (const table of ["audit_logs", "cash_shifts"])
  test(
    "close fault at " +
      table +
      " rolls back snapshot, receipt, epoch and authoritative audit",
    { skip: !enabled },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      const s = await Session.create(),
        name = "qa61954_close_" + randomUUID().replaceAll("-", "");
      const before = sql(
        "select epoch from cash_private.branch_boundaries where organization_id='" +
          f.org +
          "' and branch_id='" +
          f.branch +
          "'",
      );
      try {
        sql(
          "create function public." +
            name +
            "() returns trigger language plpgsql set search_path='' as $$ begin if new.organization_id='" +
            f.org +
            "' and " +
            (table === "audit_logs"
              ? "new.action='cash_shift.closed'"
              : "new.status='closed'") +
            " then raise exception 'Injected close boundary failure' using errcode='P0001';end if;return new;end $$;revoke all on function public." +
            name +
            "() from public,anon,authenticated,service_role;create trigger " +
            name +
            " before " +
            (table === "audit_logs" ? "insert" : "update") +
            " on public." +
            table +
            " for each row execute function public." +
            name +
            "();",
        );
        await s.ok("begin;" + f.auth);
        const r = await s.run(f.close("0"));
        assert.equal(r.state, "P0001", r.text);
        await s.ok("rollback;");
        const proof = read(f);
        assert.equal(proof.shift.status, "open");
        assert.equal(proof.shift.close_snapshot, null);
        assert.equal(proof.shift.close_request_key, null);
        assert.equal(proof.audits, 0);
        assert.equal(
          sql(
            "select epoch from cash_private.branch_boundaries where organization_id='" +
              f.org +
              "' and branch_id='" +
              f.branch +
              "'",
          ),
          before,
        );
        sql(
          "drop trigger " +
            name +
            " on public." +
            table +
            ";drop function public." +
            name +
            "();",
        );
        sql("begin;" + f.auth + f.close("0") + "commit;");
        assert.equal(read(f).audits, 1);
        record("close-fault-" + table, {
          injectedState: r.state,
          partialEffects: 0,
          epochUnchanged: true,
          oneSubsequentClose: true,
        });
      } finally {
        await s.close();
        sql(
          "drop trigger if exists " +
            name +
            " on public." +
            table +
            ";drop function if exists public." +
            name +
            "();",
        );
        cleanup(f);
      }
    },
  );

test(
  "approved branchless collection and forgiveness retain protected Outside shift without inventing a branch",
  { skip: !enabled },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    try {
      sql(
        "update public.profiles set branch_id=null where id='" + f.actor + "';",
      );
      sql(
        "begin;" +
          f.auth +
          producer(f, "credit_payments") +
          producer(f, "customer_write_offs") +
          "commit;",
      );
      for (const table of ["credit_payments", "customer_write_offs"])
        assert.equal(
          sql(
            "select branch_id is null and cash_shift_id is null and cash_shift_assignment_xid is not null from public." +
              table +
              " where organization_id='" +
              f.org +
              "'",
          ),
          "t",
        );
      sql(
        "update public.profiles set branch_id='" +
          f.branch +
          "' where id='" +
          f.actor +
          "';",
      );
      sql("begin;" + f.auth + f.close("0") + "commit;");
      assert.equal(read(f).shift.expected_cash, 0);
      assert.equal(
        read(f).shift.close_snapshot.sourceCounts.credit_payments,
        "0",
      );
      assert.equal(
        read(f).shift.close_snapshot.sourceCounts.customer_write_offs,
        "0",
      );
      record("branchless-existing-producers", {
        protectedOutside: true,
        defaultBranchInvented: false,
        laterAssignmentAdoption: false,
      });
    } finally {
      sql(
        "update public.profiles set branch_id='" +
          f.branch +
          "' where id='" +
          f.actor +
          "';",
      );
      cleanup(f);
    }
  },
);
