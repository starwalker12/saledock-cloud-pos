import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
test(
  "X02/X03 native accounting and ancillary restore strips every local cash authority; imported open stays passive",
  {
    skip: process.env.RUN_LOCAL_CASH_SHIFT_DB !== "1",
    timeout: 60000,
  },
  async () => {
    const { isolated, org, branch, actor } =
      await import("./helpers/atomic-import-database.mjs");
    const { payload, countsFor, tables, loadFixtureCatalog } =
      await import("./helpers/atomic-import-fixtures.mjs");
    await isolated(async ({ sql, rpc, request }) => {
      loadFixtureCatalog(sql);
      const counts = countsFor(100, "mixed"),
        donor = randomUUID();
      const forged = {
        advance_cash_shift_id: donor,
        advance_cash_shift_assignment_xid: "42",
        advance_received_at: new Date().toISOString(),
        advance_received_by: actor,
        repair_revision: 42,
        repair_request_key: randomUUID(),
        repair_request_payload: {},
        cash_shift_id: donor,
        cash_shift_assignment_xid: "42",
        accounting_version: 2,
        open_request_key: randomUUID(),
        open_request_payload: {},
        close_request_key: randomUUID(),
        close_request_payload: {},
        close_audit_id: randomUUID(),
        boundary_epoch: 42,
        request_key: randomUUID(),
        request_payload: {},
        idempotency_key: "donor",
        checkout_idempotency_key: "donor",
        create_request_key: randomUUID(),
        create_request_payload: {},
        revision: 42,
      };
      const start = await rpc("start_job", {
        p_format: "native",
        p_version: "3",
        p_ancillary: { cash_shifts: 1, expenses: 1, repairs: 1 },
      });
      assert.equal(start.status, 200);
      const job = start.data.job_id;
      for (const table of tables) {
        const rows = JSON.parse(
          sql(
            "select jsonb_agg(to_jsonb(r)) from (" +
              payload(table, counts, 8) +
              ")r",
          ),
        );
        const stage = await rpc("stage_chunk", {
          p_job: job,
          p_table: table,
          p_index: 0,
          p_rows: rows.map((row) => ({
            source_id: row.id,
            payload: { ...row, ...forged },
          })),
        });
        assert.equal(stage.status, 200, JSON.stringify(stage));
      }
      const get = await rpc("get_job", { p_job: job });
      const seal = await rpc("seal_job", {
        p_job: job,
        p_manifest: get.data.manifest,
      });
      assert.equal((await rpc("validate_job", { p_job: job })).data.ok, true);
      assert.equal(
        (await rpc("finalize_job", { p_job: job, p_digest: seal.data.digest }))
          .status,
        200,
      );
      for (const table of [
        "invoices",
        "payments",
        "returns",
        "credit_payments",
        "customer_write_offs",
      ])
        assert.equal(
          sql(
            "select count(*) from public." +
              table +
              " where cash_shift_id is not null or cash_shift_assignment_xid is not null",
          ),
          "0",
        );
      const now = new Date().toISOString();
      const shift = {
        ...forged,
        id: donor,
        organization_id: org,
        branch_id: branch,
        opened_by: actor,
        opened_at: now,
        status: "open",
        starting_cash: "25",
        expected_cash: "25",
        close_snapshot: { donor_unverified: true },
      };
      const expense = {
        ...forged,
        id: randomUUID(),
        organization_id: org,
        branch_id: branch,
        category: "Rent",
        amount: "5",
        payment_method: "cash",
        status: "active",
        spent_at: now,
      };
      for (const [table, row] of [
        ["cash_shifts", shift],
        ["expenses", expense],
        [
          "repairs",
          {
            ...forged,
            id: randomUUID(),
            organization_id: org,
            branch_id: branch,
            job_no: "IMPORTED-REPAIR",
            customer_name: "Synthetic repair",
            device_type: "Other",
            problem_description: "Synthetic issue",
            advance_paid: "100",
            payment_method: "card",
          },
        ],
      ]) {
        const r = await rpc("restore_ancillary", {
          p_job: job,
          p_table: table,
          p_index: 0,
          p_rows: [{ source_id: row.id, payload: row }],
        });
        assert.equal(r.status, 200, JSON.stringify(r));
        assert.equal(r.data.ok, true, JSON.stringify(r));
      }
      assert.equal(
        sql(
          "select count(*) from public.cash_shifts where accounting_version is not null or close_request_key is not null or open_request_key is not null or close_audit_id is not null or boundary_epoch is not null",
        ),
        "0",
      );
      assert.equal(
        sql(
          "select starting_cash::text||':'||close_snapshot::text from public.cash_shifts",
        ),
        '25.00:{"donor_unverified": true}',
      );
      assert.equal(
        sql(
          "select cash_shift_id is null and cash_shift_assignment_xid is null and create_request_key is null and revision=0 from public.expenses",
        ),
        "t",
      );
      assert.equal(
        sql(
          "select advance_cash_shift_id is null and advance_cash_shift_assignment_xid is null and advance_received_at is null and advance_received_by is null and repair_revision=0 and repair_request_key is null and repair_request_payload is null and advance_paid=100 and payment_method='card' from public.repairs",
        ),
        "t",
      );
      const opened = await request("rpc/open_cash_shift", {
        p_request_key: randomUUID(),
        p_starting_cash: "0",
        p_notes: null,
      });
      assert.equal(opened.status, 200, JSON.stringify(opened));
      assert.notEqual(opened.data.id, donor);
      const exported = await request("rpc/export_cash_shift_history", {});
      assert.equal(exported.status, 200, JSON.stringify(exported));
      assert.equal(exported.data.length, 2);
      assert.equal(
        (
          await request("rpc/reset_organization_to_factory_defaults", {
            p_organization_id: org,
            p_actor_id: actor,
            p_reset_settings: false,
          })
        ).status,
        200,
      );
      assert.equal(sql("select count(*) from public.cash_shifts"), "0");
    });
  },
);

for (const order of ["import-first", "reset-first"])
  test(
    "X01/X02 actual " +
      order +
      " Reset coordination never resurrects imported sources",
    { skip: process.env.RUN_LOCAL_CASH_SHIFT_DB !== "1", timeout: 60000 },
    async () => {
      const { isolated, org, actor, Session } =
        await import("./helpers/atomic-import-database.mjs");
      const { payload, countsFor, tables, loadFixtureCatalog } =
        await import("./helpers/atomic-import-fixtures.mjs");
      await isolated(async ({ sql, rpc }) => {
        loadFixtureCatalog(sql);
        const counts = countsFor(100, "mixed");
        const start = await rpc("start_job", {
          p_format: "native",
          p_version: "3",
          p_ancillary: {},
        });
        assert.equal(start.status, 200);
        const job = start.data.job_id;
        for (const table of tables) {
          const rows = JSON.parse(
            sql(
              "select jsonb_agg(to_jsonb(r)) from (" +
                payload(table, counts, 8) +
                ")r",
            ),
          );
          assert.equal(
            (
              await rpc("stage_chunk", {
                p_job: job,
                p_table: table,
                p_index: 0,
                p_rows: rows.map((row) => ({
                  source_id: row.id,
                  payload: row,
                })),
              })
            ).status,
            200,
          );
        }
        const get = await rpc("get_job", { p_job: job });
        const sealed = await rpc("seal_job", {
          p_job: job,
          p_manifest: get.data.manifest,
        });
        assert.equal((await rpc("validate_job", { p_job: job })).data.ok, true);
        const auth =
          "set local request.jwt.claim.sub='" +
          actor +
          "';set local request.jwt.claim.role='authenticated';set local role authenticated;";
        const finalize =
            "select public.accounting_import_finalize_job('" +
            job +
            "','" +
            sealed.data.digest +
            "');",
          reset =
            "select public.reset_organization_to_factory_defaults('" +
            org +
            "','" +
            actor +
            "',false);";
        const a = new Session(),
          b = new Session();
        try {
          const pid = Number((await a.ok("select pg_backend_pid();")).text),
            other = Number((await b.ok("select pg_backend_pid();")).text);
          await a.ok(
            "begin;" + auth + (order === "import-first" ? finalize : reset),
          );
          await b.ok("begin;" + auth);
          const pending = b.run(order === "import-first" ? reset : finalize);
          const deadline = performance.now() + 5000;
          let blocked = false;
          while (performance.now() < deadline) {
            if (
              sql(
                "select " + pid + "=any(pg_blocking_pids(" + other + "));",
              ) === "t"
            ) {
              blocked = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.equal(blocked, true, "Observed PostgreSQL M wait required");
          await a.ok("commit;");
          const result = await pending;
          assert.equal(
            result.state,
            order === "import-first" ? "00000" : "55000",
            result.text + " " + b.stderr,
          );
          await b.ok(order === "import-first" ? "commit;" : "rollback;");
          assert.equal(sql("select count(*) from public.customers"), "0");
          assert.equal(
            sql(
              "select count(*) from backup_private.jobs where state<>'cancelled'",
            ),
            "0",
          );
          assert.equal(sql("select count(*) from backup_private.chunks"), "0");
          const stale = await rpc("finalize_job", {
            p_job: job,
            p_digest: sealed.data.digest,
          });
          assert.equal(stale.status, 500);
          assert.equal(stale.data.code, "55000");
        } finally {
          await a.close();
          await b.close();
        }
      });
    },
  );
