import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261006054703_forward_trusted_ledger_posting.sql', import.meta.url), 'utf8');
const precision = fs.readFileSync(new URL('../supabase/migrations/20261005100523_reject_sub_paisa_balance_movements.sql', import.meta.url), 'utf8');
const returns = fs.readFileSync(new URL('../supabase/migrations/20260621000000_soften_rpc_error_wording.sql', import.meta.url), 'utf8');
const names = ['pos_checkout', 'record_credit_payment', 'create_invoice_return', 'record_customer_write_off', 'create_supplier_purchase', 'record_supplier_payment', 'record_supplier_write_off'];
function definition(source, schema, name) {
  const begin = source.indexOf(`create or replace function ${schema}.${name}(`);
  assert(begin >= 0, `${schema}.${name}`);
  const rest = source.slice(begin), marker = rest.match(/\bas\s+(\$[a-zA-Z_0-9]*\$)/i);
  assert(marker);
  const start = marker.index + marker[0].length, end = rest.indexOf(marker[1], start);
  assert(end >= start);
  return { header: rest.slice(0, marker.index), body: rest.slice(start, end).trim() };
}
for (const name of names) test(`${name}: exact current business body and public signature retained`, () => {
  const original = definition(name === 'create_invoice_return' ? returns : precision, 'public', name);
  const actual = definition(migration, 'ledger_private', name), wrapper = definition(migration, 'public', name);
  assert.equal(actual.body.replaceAll('ledger_private.actor_id()', 'auth.uid()'), original.body);
  const contract = h => h.slice(h.indexOf('('), h.toLowerCase().indexOf('language')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(contract(wrapper.header), contract(original.header));
  assert.match(actual.header, /security definer\s+set search_path = ''/i);
  assert.match(wrapper.header, /security invoker\s+set search_path = ''/i);
  assert.match(wrapper.body, new RegExp(`ledger_private\\.${name}\\(p_`));
});

test('one transaction captures current balances without legacy rewrite', () => {
  assert.match(migration, /^--[^\n]*\nbegin;/);
  assert(migration.endsWith('commit;\n'));
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.match(migration, /in access exclusive mode nowait;/);
  assert.match(migration, /select id, organization_id, outstanding_balance, effective_at, 1/);
  assert.doesNotMatch(migration, /update public\.(?:customer|supplier)_ledger_entries|set outstanding_balance =.*(?:sum|ledger)/i);
});
test('executor is restricted and never inherits an application or import role', () => {
  assert.match(migration, /create role ledger_posting_executor nologin nosuperuser nobypassrls/);
  assert.doesNotMatch(migration, /grant (?:authenticated|anon|service_role|backup_[a-z_]+) to ledger_posting_executor/);
  assert.doesNotMatch(migration, /grant ledger_posting_executor to (?:authenticated|anon|service_role|backup_[a-z_]+)/);
  assert.doesNotMatch(migration, /execute format\(|set role |set_config\('role'/i);
});
test('separate private CACHE 1 sequences have no public ledger default', () => {
  assert.equal((migration.match(/create sequence ledger_private\.[a-z_]+ as bigint cache 1/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /posting_sequence[^\n]*default|grant.*sequences.*to authenticated/i);
  for (const name of ['guard_customer_posting', 'guard_supplier_posting']) {
    const body = migration.slice(migration.indexOf(`create function ledger_private.${name}`));
    assert(body.indexOf('for update;') < body.indexOf('nextval('));
    assert(body.indexOf('do not agree') < body.indexOf('nextval('));
  }
});
test('ordinary ledger DML, balance forgery, provenance assignment and trusted mutation are closed', () => {
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger/);
  assert.match(migration, /new\.outstanding_balance is distinct from 0::numeric/);
  assert.match(migration, /Outstanding balance can only change through an approved accounting transaction/);
  assert.equal((migration.match(/Trusted accounting history cannot be changed or deleted/g) ?? []).length, 2);
  assert.equal((migration.match(/Accounting provenance is allocated by the database/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /grant (?:update|delete|all).*anchors.*to authenticated/i);
});
test('import uses fresh set-based anchors and drops all source provenance from canonical snapshots', () => {
  assert.equal((migration.match(/referencing new table as new_accounts for each statement/g) ?? []).length, 2);
  assert.match(migration, /return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at'/);
  const adapter = fs.readFileSync(new URL('../src/lib/backup/source-adapter.ts', import.meta.url), 'utf8');
  for (const field of ['posting_sequence', 'posting_trust_version', 'posting_effective_at']) assert(adapter.includes(`delete payload.${field};`));
  assert.doesNotMatch(migration, /create or replace function backup_private\.(?:finalize_job|lock_identity|stage_chunk)/i);
  assert.match(migration, /create or replace function public\.reset_organization_to_factory_defaults[\s\S]*?security invoker set search_path = ''/i);
});

test('account lifecycle denies tenant hard delete; only the private checked reset core owns cleanup', () => {
  assert.match(migration, /create role ledger_reset_executor nologin nosuperuser nobypassrls/);
  assert.doesNotMatch(migration, /grant ledger_reset_executor to (?:authenticated|anon|service_role|backup_[a-z_]+)/);
  assert.match(migration, /create trigger ledger_customer_delete_guard before delete on public.customers/);
  assert.match(migration, /create trigger ledger_supplier_delete_guard before delete on public.suppliers/);
  for(const name of ['guard_customer_posting','guard_supplier_posting']) {
    const body=migration.slice(migration.indexOf(`create function ledger_private.${name}`),migration.indexOf(`alter function ledger_private.${name}`));
    assert.doesNotMatch(body, /current_user (?:not )?in \('postgres', 'supabase_admin'\)/);
    assert.match(body, /tg_op <> 'DELETE' or current_user <> 'ledger_reset_executor'/);
  }
  assert.equal((migration.match(/references public\.(?:customers|suppliers|organizations)\(id\) on delete restrict/g)??[]).length,6);
  assert.match(migration, /revoke all on function ledger_private\.factory_reset_core\(uuid,uuid,boolean\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function ledger_private\.factory_reset_service\(uuid,uuid,boolean\) to service_role/);
  assert.doesNotMatch(migration, /set_config\(|session_user|auth\.role\(\)/);
  const core=migration.slice(migration.indexOf('create function ledger_private.factory_reset_core'),migration.indexOf('alter function ledger_private.factory_reset_core'));
  assert(core.indexOf('prepare_factory_reset')<core.indexOf('delete from public.customer_ledger_entries'));
  assert(core.indexOf('delete from public.customer_ledger_entries')<core.indexOf('delete from public.invoices'));
  assert(core.indexOf('delete from ledger_private.customer_anchors')<core.indexOf('delete from public.customers'));
  assert(core.indexOf('delete from ledger_private.supplier_anchors')<core.indexOf('delete from public.suppliers'));
});
