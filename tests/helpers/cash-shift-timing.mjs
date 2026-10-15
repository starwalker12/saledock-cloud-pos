// Disposable task-local SQL logging only. Always restore the candidate function.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { container } from "./cash-shift-database.mjs";
export async function profileClose(sql, run, close) {
  assert.match(run, /^[a-z0-9_]+$/);
  run += "_" + randomUUID().replaceAll("-", "");
  const original = sql(
    "select pg_get_functiondef('cash_private.close_shift(uuid,uuid,text,text)'::regprocedure)",
  );
  const boundaryOriginal = sql(
    "select pg_get_functiondef('cash_private.boundary(uuid,uuid,boolean)'::regprocedure)",
  );
  const admin = (query) => {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -',
      ],
      { input: query, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
  };
  try {
    admin(`create function cash_private.qa61954_profile(event text, at timestamptz default clock_timestamp()) returns void language plpgsql security definer set search_path='' as $$ begin
   perform set_config('log_min_duration_statement','0',false);
   perform set_config('log_parameter_max_length','0',false);
   perform set_config('log_parameter_max_length_on_error','0',false);
   raise log 'QA61954|%', jsonb_build_object('run','${run}','event',event,'pid',pg_backend_pid(),'at_ms',extract(epoch from at)*1000,'transaction_start_ms',extract(epoch from transaction_timestamp())*1000);
  end $$;revoke all on function cash_private.qa61954_profile(text,timestamptz) from public;grant execute on function cash_private.qa61954_profile(text,timestamptz) to cash_shift_executor,backup_identity_executor;`);
    const boundaryProfile = boundaryOriginal
      .replace(
        "if p_exclusive then",
        "if p_exclusive then\nperform cash_private.qa61954_profile('lock_wait');",
      )
      .replace(
        "-- Fresh post-wait actor/scope validation;",
        "if p_exclusive then perform cash_private.qa61954_profile('lock_acquired'); end if;\n  -- Fresh post-wait actor/scope validation;",
      );
    assert.notEqual(boundaryProfile, boundaryOriginal);
    sql(boundaryProfile);
    const boundary =
      "perform cash_private.boundary(actor.organization_id,actor.branch_id,true);";
    assert(original.includes(boundary));
    const profiled = original.replace(
      "activity:=cash_private.aggregate_shift(s.id);",
      "perform cash_private.qa61954_profile('aggregate_start');\nactivity:=cash_private.aggregate_shift(s.id);\nperform cash_private.qa61954_profile('aggregate_end');",
    );
    assert.notEqual(profiled, original);
    sql(profiled);
    const requestStart = performance.now();
    await close();
    const requestTotalMs = performance.now() - requestStart;
    const { collectTiming } = await import("./atomic-import-timing.mjs");
    const timing = collectTiming(new Date().toISOString(), run);
    const {
      identityLockWaitMs,
      identityLockAcquiredAt,
      identityLockReleaseTransactionEndAt,
      identityLockHeldMs,
      ...rest
    } = timing;
    return {
      ...rest,
      commitResult:
        "COMMIT logged; authenticated SQL receipt and persisted snapshot verified",
      requestTotalMs,
      admissionWaitMs: identityLockWaitMs,
      boundaryAcquiredAt: identityLockAcquiredAt,
      boundaryReleaseTransactionEndAt: identityLockReleaseTransactionEndAt,
      boundaryHeldMs: identityLockHeldMs,
      method:
        "Server log markers bracket exclusive branch acquisition after shared M admission and aggregate; backend-correlated PostgreSQL COMMIT completion includes release; 1ms conservative padding",
    };
  } finally {
    sql(original);
    sql(boundaryOriginal);
    admin(
      "drop function if exists cash_private.qa61954_profile(text,timestamptz);",
    );
    assert.equal(
      sql(
        "select pg_get_functiondef('cash_private.close_shift(uuid,uuid,text,text)'::regprocedure)",
      ),
      original,
    );
  }
}
