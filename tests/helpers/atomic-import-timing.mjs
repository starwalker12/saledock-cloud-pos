// Disposable LOCAL-database instrumentation. No runtime/migration debug code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { container, db, docker } from "./atomic-import-database.mjs";

// Keep transaction-end logging outside the transaction being measured, so a
// ROLLBACK cannot undo the diagnostic GUC and erase its own release evidence.
export function performanceLogging() {
  assert.match(container, /^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
  const admin = (query) =>
    docker(
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -',
      ],
      { input: query },
    ).trim();
  const names = [
    "log_min_duration_statement",
    "log_parameter_max_length",
    "log_parameter_max_length_on_error",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, admin("show " + name + ";")]),
  );
  const set = (values) => {
    for (const name of names) {
      assert.match(values[name], /^-?[0-9]+(?:ms|s|min|h)?$/);
      admin("alter system set " + name + "='" + values[name] + "';");
    }
    admin("select pg_reload_conf();");
  };
  set(Object.fromEntries(names.map((name) => [name, "0"])));
  return () => set(saved);
}

export function instrumentFinalizer(sql, run) {
  assert.match(run, /^[a-z0-9_-]+$/);
  sql(`create function backup_private.qa61954_timing(event text, at timestamptz default clock_timestamp()) returns void
    language plpgsql security definer set search_path='' as $$ begin
      perform set_config('log_min_duration_statement','0',false);
      perform set_config('log_parameter_max_length','0',false);
      perform set_config('log_parameter_max_length_on_error','0',false);
      perform set_config('track_functions','all',false);
      raise log 'QA61954|%', jsonb_build_object('run','${run}','event',event,
        'pid',pg_backend_pid(),'at_ms',extract(epoch from at)*1000,
        'transaction_start_ms',extract(epoch from transaction_timestamp())*1000);
    end $$;
    revoke all on function backup_private.qa61954_timing(text,timestamptz) from public;
    grant execute on function backup_private.qa61954_timing(text,timestamptz) to backup_import_executor,backup_identity_executor;`);
  docker(
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      `PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d ${db} -v ON_ERROR_STOP=1 -f -`,
    ],
    {
      input:
        "alter function backup_private.qa61954_timing(text,timestamptz) owner to supabase_admin;",
    },
  );
  let definition = sql(
    "select pg_get_functiondef('backup_private.finalize_job(uuid,text)'::regprocedure)",
  );
  definition = definition.replace(
    "begin\n",
    "begin\n  perform backup_private.qa61954_timing('begin');\n",
  );
  const lock = "v_epoch:=backup_private.lock_identity(j.organization_id);";
  assert(definition.includes(lock));
  // Timestamp inside the reviewed mutex helper immediately after FOR UPDATE,
  // before returning to the finalizer. Reentrant NOWAIT identity callbacks do
  // not emit extra acquisitions or add per-row diagnostic overhead.
  const identity = sql(
    "select pg_get_functiondef('backup_private.lock_identity(uuid,boolean)'::regprocedure)",
  );
  const profiledIdentity = identity
    .replace(
      "  else\n    select epoch into v_epoch",
      "  else\n    perform backup_private.qa61954_timing('lock_wait');\n    select epoch into v_epoch",
    )
    .replace(
      "  return v_epoch;",
      "  if not p_nowait then perform backup_private.qa61954_timing('lock_acquired'); end if;\n  return v_epoch;",
    );
  assert.notEqual(profiledIdentity, identity);
  sql(profiledIdentity);
  for (const name of [
    "verify_seal",
    "check_references",
    "check_collisions",
    "insert_snapshot",
  ]) {
    const statement = `perform backup_private.${name}(p_job);`;
    assert(definition.includes(statement));
    definition = definition.replace(
      statement,
      `perform backup_private.qa61954_timing('${name}_start');\n  ${statement}\n  perform backup_private.qa61954_timing('${name}_end');`,
    );
  }
  definition = definition.replace(
    "insert into backup_private.mappings",
    "perform backup_private.qa61954_timing('mappings_start');\n  insert into backup_private.mappings",
  );
  definition = definition.replace(
    "select jsonb_object_agg(t,",
    "perform backup_private.qa61954_timing('mappings_end');\n  select jsonb_object_agg(t,",
  );
  definition = definition.replace(
    "return jsonb_build_object('ok',true,'replayed',false",
    "perform backup_private.qa61954_timing('return');\n  return jsonb_build_object('ok',true,'replayed',false",
  );
  sql(definition);
  const snapshot = sql(
    "select pg_get_functiondef('backup_private.insert_snapshot(uuid)'::regprocedure)",
  );
  let relations = 0;
  const profiled = snapshot.replace(
    /  insert into public\.(\w+)[\s\S]*?;\n/g,
    (statement, table) => {
      relations++;
      return `  perform backup_private.qa61954_timing('relation_${table}_start');\n${statement}  perform backup_private.qa61954_timing('relation_${table}_end');\n`;
    },
  );
  assert.equal(
    relations,
    21,
    "All business-truth backup relations must be profiled",
  );
  sql(profiled);
  return new Date().toISOString();
}

export function collectTiming(since, run) {
  assert.equal(typeof since, "string");
  // Correlate by a unique run tag and backend PID. A host-clock --since cutoff
  // can omit early database markers; do not compare those clock domains.
  const result = spawnSync("docker", ["logs", container], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(result.status, 0);
  const lines = (result.stdout + result.stderr).split("\n");
  const tagged = lines.flatMap((line, index) => {
    if (!line.includes("QA61954|{")) return [];
    const event = JSON.parse(line.slice(line.indexOf("QA61954|") + 8));
    return event.run === run ? [{ event, line: index }] : [];
  });
  const events = tagged.map((row) => row.event);
  const acquisition = tagged.find((row) => row.event.event === "lock_acquired");
  assert(acquisition, "Every performance run must emit lock acquisition");
  const acquired = acquisition.event;
  const commit = lines
    .slice(acquisition.line + 1)
    .find(
      (line) =>
        line.includes(`[${acquired.pid}]`) &&
        /duration:.*(?:statement:|execute [^:]+:) (?:COMMIT|ROLLBACK|ABORT)/i.test(
          line,
        ),
    );
  assert(
    commit,
    "Transaction-end completion must be logged, rather than inferred from HTTP duration",
  );
  const rawCommand = /(?:statement:|execute [^:]+:) (COMMIT|ROLLBACK|ABORT)/i
    .exec(commit)[1]
    .toUpperCase();
  const command = rawCommand === "ABORT" ? "ROLLBACK" : rawCommand;
  const match = /(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) UTC/.exec(commit);
  assert(match, "Postgres log must expose its UTC transaction-end timestamp");
  // Log timestamps truncate sub-milliseconds. Add 1ms for conservative bounds.
  const end = Date.parse(match[1].replace(" ", "T") + "Z") + 1;
  const wait = events.find((e) => e.event === "lock_wait");
  return {
    databaseTransactionMs: end - acquired.transaction_start_ms,
    identityLockWaitMs: acquired.at_ms - wait.at_ms,
    identityLockWaitIncludesSelectOverhead: true,
    identityLockAcquisitionMeasurement:
      "Server clock immediately after the mutex FOR UPDATE succeeds; excluded pre-lock preparation; held through logged transaction end",
    identityLockAcquiredAt: new Date(acquired.at_ms).toISOString(),
    identityLockReleaseTransactionEndAt: new Date(end).toISOString(),
    identityLockHeldMs: end - acquired.at_ms,
    commitResult:
      command + " completed; authenticated response recorded separately",
    transactionEndCommand: command,
    rawTransactionEndCommand: rawCommand,
    commitTimestampResolutionMs: 1,
    commitTimestampUpperBoundPaddingMs: 1,
    phaseMs: Object.fromEntries(
      events
        .filter((e) => e.event.endsWith("_end"))
        .map((e) => [
          e.event.slice(0, -4),
          e.at_ms -
            events.find(
              (start) => start.event === e.event.replace(/_end$/, "_start"),
            ).at_ms,
        ]),
    ),
    events,
  };
}
