// Disposable LOCAL-database instrumentation. No runtime/migration debug code.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { container, db, docker } from './atomic-import-database.mjs';

export function instrumentFinalizer(sql, run) {
  assert.match(run, /^[a-z0-9_-]+$/);
  sql(`create function backup_private.qa65784_timing(event text, at timestamptz default clock_timestamp()) returns void
    language plpgsql security definer set search_path='' as $$ begin
      perform set_config('log_min_duration_statement','0',false);
      perform set_config('log_parameter_max_length','0',false);
      perform set_config('log_parameter_max_length_on_error','0',false);
      perform set_config('track_functions','all',false);
      raise log 'QA65784|%', jsonb_build_object('run','${run}','event',event,
        'pid',pg_backend_pid(),'at_ms',extract(epoch from at)*1000,
        'transaction_start_ms',extract(epoch from transaction_timestamp())*1000);
    end $$;
    revoke all on function backup_private.qa65784_timing(text,timestamptz) from public;
    grant execute on function backup_private.qa65784_timing(text,timestamptz) to backup_import_executor;`);
  docker(['exec', '-i', container, 'sh', '-c', `PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d ${db} -v ON_ERROR_STOP=1 -f -`],
    { input: 'alter function backup_private.qa65784_timing(text,timestamptz) owner to supabase_admin;' });
  let definition = sql("select pg_get_functiondef('backup_private.finalize_job(uuid,text)'::regprocedure)");
  definition = definition.replace('begin\n', "begin\n  perform backup_private.qa65784_timing('begin');\n");
  const lock = 'v_epoch:=backup_private.lock_identity(j.organization_id);';
  assert(definition.includes(lock));
  definition = definition.replace('v_locked timestamptz;', 'v_locked timestamptz; v_qa_wait timestamptz;');
  definition = definition.replace(lock, `v_qa_wait:=clock_timestamp();\n  ${lock}`);
  definition = definition.replace('v_locked:=clock_timestamp();', "v_locked:=clock_timestamp();\n  perform backup_private.qa65784_timing('lock_wait',v_qa_wait);\n  perform backup_private.qa65784_timing('lock_acquired',v_locked);");
  for (const name of ['verify_seal', 'check_references', 'check_collisions', 'insert_snapshot']) {
    const statement = `perform backup_private.${name}(p_job);`;
    assert(definition.includes(statement));
    definition = definition.replace(statement, `perform backup_private.qa65784_timing('${name}_start');\n  ${statement}\n  perform backup_private.qa65784_timing('${name}_end');`);
  }
  definition = definition.replace('insert into backup_private.mappings', "perform backup_private.qa65784_timing('mappings_start');\n  insert into backup_private.mappings");
  definition = definition.replace('select jsonb_object_agg(t,', "perform backup_private.qa65784_timing('mappings_end');\n  select jsonb_object_agg(t,");
  definition = definition.replace("return jsonb_build_object('ok',true,'replayed',false", "perform backup_private.qa65784_timing('return');\n  return jsonb_build_object('ok',true,'replayed',false");
  sql(definition);
  const snapshot = sql("select pg_get_functiondef('backup_private.insert_snapshot(uuid)'::regprocedure)");
  let relations = 0;
  const profiled = snapshot.replace(/  insert into public\.(\w+)[\s\S]*?;\n/g, (statement, table) => {
    relations++;
    return `  perform backup_private.qa65784_timing('relation_${table}_start');\n${statement}  perform backup_private.qa65784_timing('relation_${table}_end');\n`;
  });
  assert.equal(relations, 23, 'All business-truth backup relations must be profiled');
  sql(profiled);
  return new Date().toISOString();
}

export function collectTiming(since, run) {
  assert.equal(typeof since, 'string');
  // Correlate by a unique run tag and backend PID. A host-clock --since cutoff
  // can omit early database markers; do not compare those clock domains.
  const result = spawnSync('docker', ['logs', container], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  assert.equal(result.status, 0);
  const lines = (result.stdout + result.stderr).split('\n');
  const events = lines.filter(line => line.includes('QA65784|{')).map(line => JSON.parse(line.slice(line.indexOf('QA65784|') + 8))).filter(e => e.run === run);
  const acquired = events.find(e => e.event === 'lock_acquired');
  assert(acquired, 'Every performance run must emit lock acquisition');
  const commit = lines.find(line => line.includes(`[${acquired.pid}]`) && /duration:.*(?:statement:|execute [^:]+:) COMMIT/.test(line));
  assert(commit, 'COMMIT completion must be logged, rather than inferred from HTTP duration');
  const match = /(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) UTC/.exec(commit);
  assert(match, 'Postgres log must expose its UTC COMMIT completion timestamp');
  // Log timestamps truncate sub-milliseconds. Add 1ms for conservative bounds.
  const end = Date.parse(match[1].replace(' ', 'T') + 'Z') + 1;
  const wait = events.find(e => e.event === 'lock_wait');
  return {
    databaseTransactionMs: end - acquired.transaction_start_ms,
    identityLockWaitMs: acquired.at_ms - wait.at_ms,
    identityLockAcquiredAt: new Date(acquired.at_ms).toISOString(),
    identityLockReleaseTransactionEndAt: new Date(end).toISOString(),
    identityLockHeldMs: end - acquired.at_ms,
    commitResult: 'COMMIT completed; authenticated HTTP receipt verified',
    commitTimestampResolutionMs: 1,
    commitTimestampUpperBoundPaddingMs: 1,
    phaseMs: Object.fromEntries(events.filter(e => e.event.endsWith('_end')).map(e => [e.event.slice(0, -4),
      e.at_ms - events.find(start => start.event === e.event.replace(/_end$/, '_start')).at_ms])),
    events,
  };
}
