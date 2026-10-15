import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  fixture,
  seed,
  open,
  sql,
  read,
  cleanup,
  lastJSON,
} from "./helpers/cash-shift-database.mjs";
const enabled = process.env.RUN_LOCAL_CASH_SHIFT_DB === "1";
const rows = [];
function save(result) {
  rows.push(result);
  if (process.env.CASH_SHIFT_EVIDENCE_DIR)
    fs.writeFileSync(
      process.env.CASH_SHIFT_EVIDENCE_DIR + "/scale-observations.json",
      JSON.stringify(rows, null, 2) + "\n",
    );
}
const batch = (f, count, lastLarge = false) =>
  "do $$ declare n int; begin for n in 1.." +
  count +
  " loop perform public.pos_checkout('" +
  f.branch +
  "','" +
  f.customer +
  "',jsonb_build_array(jsonb_build_object('product_id','" +
  f.product +
  "','quantity',1,'unit_price',case when " +
  lastLarge +
  " and n=" +
  count +
  " then 1000000 else 100 end,'discount',0)),0,'cash',case when " +
  lastLarge +
  " and n=" +
  count +
  " then 1000000 else 100 end,null,null,false,gen_random_uuid()::text);end loop;end $$;";
test(
  "P06 1001 real POS receipts total 1,100,000 with the true top staff after row 1000",
  { skip: !enabled, timeout: 120000 },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const late = randomUUID();
    try {
      sql(
        "insert into auth.users(id) values('" +
          late +
          "');insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('" +
          late +
          "','" +
          f.org +
          "','" +
          f.branch +
          "','Synthetic late winner','cashier',true);",
      );
      sql("begin;" + f.auth + batch(f, 1000) + "commit;");
      sql(
        "begin;set local request.jwt.claim.sub='" +
          late +
          "';set local request.jwt.claim.role='authenticated';set local role authenticated;" +
          batch(f, 1, true) +
          "commit;",
      );
      const live = lastJSON(
        sql(
          "begin;" +
            f.auth +
            "select public.get_cash_shift_snapshot('" +
            f.shift +
            "');commit;",
        ),
      );
      assert.equal(live.paymentsTotal, "1100000.00");
      assert.equal(live.sourceCounts.payments, "1001");
      assert.equal(live.staff[0].user_id, late);
      assert.equal(live.staff[0].paymentsTotal, "1000000.00");
      sql("begin;" + f.auth + f.close("1100000") + "commit;");
      const proof = read(f);
      assert.equal(proof.shift.expected_cash, 1100000);
      assert.equal(proof.shift.cash_difference, 0);
      assert.deepEqual(proof.shift.close_snapshot.staff, live.staff);
      save({
        case: "RC-16427-01",
        realProducerReceipts: 1001,
        expected: "1100000.00",
        variance: "0.00",
        lateTopStaff: true,
        capDependency: false,
      });
    } finally {
      cleanup(f);
      sql("delete from auth.users where id='" + late + "';");
    }
  },
);
for (const count of [1000, 5000, 10000])
  test(
    "complete close aggregate " + count + " real receipts",
    { skip: !enabled, timeout: 180000 },
    async () => {
      const f = fixture();
      seed(f);
      open(f);
      try {
        const { profileClose } =
          await import("./helpers/cash-shift-timing.mjs");
        const t = performance.now();
        sql("begin;" + f.auth + batch(f, count) + "commit;");
        const producerMs = performance.now() - t;
        const liveStart = performance.now();
        const live = lastJSON(
          sql(
            "begin;" +
              f.auth +
              "select public.get_cash_shift_snapshot('" +
              f.shift +
              "');commit;",
          ),
        );
        const aggregateRequestMs = performance.now() - liveStart;
        assert.equal(live.paymentsTotal, String(count * 100) + ".00");
        assert.equal(live.sourceCounts.payments, String(count));
        const closeStart = performance.now();
        const phaseTiming = await profileClose(
          sql,
          "cash_profile_" + count,
          () =>
            sql("begin;" + f.auth + f.close(String(count * 100)) + "commit;"),
        );
        const closeRequestMs = phaseTiming.requestTotalMs;
        const instrumentationOverheadMs =
          performance.now() - closeStart - closeRequestMs;
        assert.equal(read(f).shift.cash_difference, 0);
        save({
          case: "close-scale",
          realPOSReceipts: count,
          phaseTiming,
          instrumentationOverheadMs,
          producerBatchCommitMs: producerMs,
          liveAggregateRequestMs: aggregateRequestMs,
          closeRequestTotalMs: closeRequestMs,
          closeCommitted: true,
          measurement:
            "Host request including docker/psql startup and COMMIT; separate DB phase profile retained in task-local benchmark",
          newSla: false,
        });
      } finally {
        cleanup(f);
      }
    },
  );
test(
  "P06 more than 1000 refunds, expenses and credit receipts remain complete independent aggregates",
  { skip: !enabled, timeout: 120000 },
  () => {
    const f = fixture();
    seed(f);
    open(f);
    const collectionCustomer = randomUUID();
    try {
      sql(
        "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('" +
          collectionCustomer +
          "','" +
          f.org +
          "','" +
          f.branch +
          "','Synthetic independent collections',2000);",
      );
      sql(
        "begin;" +
          f.auth +
          batch(f, 1001) +
          "do $$ declare item record; n int; begin for item in select ii.id,ii.invoice_id from public.invoice_items ii where ii.organization_id='" +
          f.org +
          "' loop perform public.create_invoice_return(item.invoice_id,jsonb_build_array(jsonb_build_object('invoice_item_id',item.id,'quantity',1,'restock',true)),100,'cash',null,null,gen_random_uuid()::text);end loop;for n in 1..1001 loop perform public.save_cash_shift_expense(null,gen_random_uuid(),null,'Rent','1','cash',null,null,null,'save');perform public.record_credit_payment('" +
          collectionCustomer +
          "',1,'cash',null,null,gen_random_uuid());end loop;end $$;" +
          f.close("0") +
          "commit;",
      );
      const snap = read(f).shift.close_snapshot;
      for (const relation of [
        "invoices",
        "payments",
        "returns",
        "expenses",
        "credit_payments",
      ])
        assert.equal(snap.sourceCounts[relation], "1001");
      assert.equal(snap.refundsTotal, "100100.00");
      assert.equal(snap.expensesCash, "1001.00");
      assert.equal(snap.creditCollectionCash, "1001.00");
      assert.equal(read(f).shift.cash_difference, 0);
      save({
        case: "P06-independent-vectors",
        counts: snap.sourceCounts,
        refunds: snap.refundsTotal,
        expenses: snap.expensesCash,
        collections: snap.creditCollectionCash,
        variance: "0.00",
      });
    } finally {
      cleanup(f);
    }
  },
);
