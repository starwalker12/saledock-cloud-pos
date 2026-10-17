import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

test(
  "real authenticated FINAL-byte 50k finalizer: ledger x3 / sales x10 / supplier x3 / mixed x3",
  {
    skip: process.env.RUN_LOCAL_ATOMIC_IMPORT_QUALIFY !== "1",
    timeout: 900000,
  },
  async (t) => {
    const { isolated, org, work } =
      await import("./helpers/atomic-import-database.mjs");
    const { instrumentFinalizer, collectTiming, performanceLogging } =
      await import("./helpers/atomic-import-timing.mjs");
    const { payload, tables, countsFor, loadFixtureCatalog } =
      await import("./helpers/atomic-import-fixtures.mjs");
    const hash = () => {
      const files = execFileSync(
        "git",
        ["ls-files", "-c", "-o", "--exclude-standard", "-z"],
        { cwd: work },
      )
        .toString()
        .split("\0")
        .filter(Boolean)
        .sort();
      const h = crypto.createHash("sha256");
      for (const file of files) {
        h.update(file + "\0");
        h.update(fs.readFileSync(work + "/" + file));
      }
      return h.digest("hex");
    };
    const campaign = crypto.randomBytes(6).toString("hex");
    const expected = hash(),
      accepted = [];
    async function run(shape) {
      const runId =
        "qa61954_" + campaign + "_" + shape + "_" + (accepted.length + 1);
      assert.equal(
        hash(),
        expected,
        "Migration must remain unchanged during qualification",
      );
      await isolated(async ({ sql, rpc, result }) => {
        loadFixtureCatalog(sql);
        sql(`insert into public.customers(id,organization_id,name,phone)
    select md5('qa77126-existing-customer-'||n)::uuid,'${org}','Existing customer '||n,'existing-phone-'||n from generate_series(1,10000) n;
    insert into public.suppliers(id,organization_id,name)
    select md5('qa77126-existing-supplier-'||n)::uuid,'${org}','Existing supplier '||n from generate_series(1,10000) n;
    analyze public.customers;analyze public.suppliers;`);
        const counts = countsFor(50000, shape);
        const start = await rpc("start_job", {
          p_format: "native",
          p_version: "3",
          p_ancillary: {},
        });
        assert.equal(start.status, 200);
        const job = start.data.job_id;
        let uploaded = 0;
        for (const table of tables) {
          const rows = JSON.parse(
            sql(
              `select jsonb_agg(to_jsonb(r)) from (${payload(table, counts, 32)}) r`,
            ),
          );
          let chunk = [],
            index = 0;
          const send = async () => {
            if (!chunk.length) return;
            const args = {
              p_job: job,
              p_table: table,
              p_index: index,
              p_rows: chunk,
            };
            assert(Buffer.byteLength(JSON.stringify(args)) <= 524288);
            const r = await rpc("stage_chunk", args);
            assert.equal(r.status, 200, JSON.stringify(r));
            assert.equal(r.data.ok, true);
            uploaded += chunk.length;
            index++;
            chunk = [];
          };
          for (const row of rows) {
            const item = { source_id: row.id, payload: row };
            if (
              chunk.length === 500 ||
              Buffer.byteLength(
                JSON.stringify({
                  p_job: job,
                  p_table: table,
                  p_index: index,
                  p_rows: [...chunk, item],
                }),
              ) > 524288
            )
              await send();
            chunk.push(item);
          }
          await send();
        }
        assert.equal(uploaded, 50000);
        const get = await rpc("get_job", { p_job: job });
        assert.equal(get.status, 200);
        assert(get.data.bytes <= 33554432);
        const sealed = await rpc("seal_job", {
          p_job: job,
          p_manifest: get.data.manifest,
        });
        assert.equal(sealed.status, 200);
        const valid = await rpc("validate_job", { p_job: job });
        assert.equal(valid.data.ok, true, JSON.stringify(valid));
        const since = instrumentFinalizer(sql, runId);
        const final = await rpc("finalize_job", {
          p_job: job,
          p_digest: sealed.data.digest,
        });
        Object.assign(result, collectTiming(since, runId), {
          runId,
          shape,
          requestTotalMs: final.ms,
          normalizedRows: uploaded,
          canonicalBytes: get.data.bytes,
          relationDistribution: counts,
          candidateSha256: expected,
          httpStatus: final.status,
          receiptTransactionMs: final.data?.receipt?.transaction_ms ?? null,
          receiptIdentityMs: final.data?.receipt?.identity_ms ?? null,
        });
        // Record every completed run BEFORE checking the hard limits. A failed run is retained.
        accepted.push(result);
        if (process.env.IMPORT_EVIDENCE_DIR)
          fs.writeFileSync(
            process.env.IMPORT_EVIDENCE_DIR + "/final-importer-runs.json",
            JSON.stringify(accepted, null, 2) + "\n",
          );
        t.diagnostic(JSON.stringify(result));
        assert(
          result.databaseTransactionMs <= 5000,
          "Finalizer transaction exceeded 5 seconds: STOP",
        );
        assert(
          result.identityLockHeldMs <= 3000,
          "Identity-held critical section exceeded 3 seconds: STOP",
        );
        assert.equal(final.status, 200, JSON.stringify(final));
        assert.equal(result.transactionEndCommand, "COMMIT");
        const committed = JSON.parse(
          sql(
            `select jsonb_build_object('rows',${tables.map((table) => `(select count(*)${["customers", "suppliers"].includes(table) ? "-10000" : ""} from public.${table})`).join("+")},'mappings',(select count(*) from backup_private.mappings where job_id='${job}'),'receipts',(select count(*) from backup_private.receipts where job_id='${job}'))`,
          ),
        );
        assert.deepEqual(committed, {
          rows: 50000,
          mappings: 50000,
          receipts: 1,
        });
      });
    }
    const restoreLogging = performanceLogging();
    try {
      for (const [shape, count] of [
        ["ledger", 3],
        ["sales", 10],
        ["supplier", 3],
        ["mixed", 3],
      ])
        for (let i = 0; i < count; i++) await run(shape);
    } finally {
      restoreLogging();
    }
    assert.equal(accepted.length, 19);
    for (const [shape, count] of [
      ["ledger", 3],
      ["sales", 10],
      ["supplier", 3],
      ["mixed", 3],
    ])
      assert.equal(accepted.filter((r) => r.shape === shape).length, count);
    assert.equal(hash(), expected);
    t.diagnostic(
      JSON.stringify({ candidateSha256: expected, acceptedRuns: 19 }),
    );
  },
);
