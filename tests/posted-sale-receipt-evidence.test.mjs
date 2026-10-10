import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const migration=read('supabase/migrations/20261010091144_protect_posted_sale_receipt_evidence.sql');
const previous=read('supabase/migrations/20261006054703_forward_trusted_ledger_posting.sql');
function load(path,mocks={}) {
  const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),loaded,loaded.exports);
  return loaded.exports;
}
test('one forward cutover closes raw writes without backfilling or changing a financial writer',()=>{
  assert.match(migration,/^--[^]*\bbegin;/);
  assert.match(migration,/in access exclusive mode nowait;/);
  assert.match(migration,/\ncommit;\s*$/);
  assert.doesNotMatch(migration,/create (?:or replace )?function (?:public|ledger_private)\.(?:pos_checkout|record_credit_payment|create_invoice_return|record_customer_write_off|create_supplier_purchase|record_supplier_payment|record_supplier_write_off)\b/i);
  assert.doesNotMatch(migration,/update public\.(?:invoices|invoice_items|payments|credit_payments|customer_write_offs|invoice_item_stock_allocations)\b/i);
  assert.doesNotMatch(migration,/create role|grant .* to authenticated|default 1|created_at\s*>=/i);
  assert.match(migration,/revoke insert, update, delete, truncate, references, trigger/);
  assert.match(migration,/revoke insert \(%s\), update \(%s\), references \(%s\)/);
  assert.equal((migration.match(/for select to authenticated/g)??[]).length,6);
});
test('database producer authority and same-transaction initialization are explicit; reset/import exceptions do not confer trust',()=>{
  assert.match(migration,/security invoker set search_path = ''/);
  assert.match(migration,/current_user <> 'ledger_posting_executor'/);
  assert.match(migration,/current_user <> 'ledger_reset_executor'/);
  assert.match(migration,/current_user = 'backup_import_executor'[^]*?new.source_trust_version := null/);
  assert.match(migration,/source_trust_version is not null and source_trust_version = 1/);
  assert.match(migration,/old.source_transaction_id = pg_catalog.pg_current_xact_id\(\)/);
  assert.match(migration,/v_invoice.source_transaction_id is distinct from pg_catalog.pg_current_xact_id\(\)/);
  assert.match(migration,/grant update \(amount_paid,balance_due,status\) on public.invoices/);
  assert.match(migration,/new.source_effective_at := pg_catalog.clock_timestamp\(\)/);
  assert.match(migration,/new.source_trust_version := 1/);
});
test('typed database import normalization differs only by local source-metadata stripping',()=>{
  const body=text=>text.slice(text.indexOf('CREATE OR REPLACE FUNCTION backup_private.normalize_row('),text.indexOf('end; $function$;',text.indexOf('CREATE OR REPLACE FUNCTION backup_private.normalize_row('))+'end; $function$;'.length);
  const expected=body(previous).replace("('posting_sequence','posting_trust_version','posting_effective_at')","('posting_sequence','posting_trust_version','posting_effective_at',\n      'source_trust_version','source_effective_at','source_transaction_id')")
    .replace("return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at';","return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at'\n    - 'source_trust_version' - 'source_effective_at' - 'source_transaction_id';");
  assert.equal(body(migration),expected);
});
test('native adapter accepts missing/forged source fields but never transfers their authority or changes business payload',()=>{
  const core=load('src/lib/backup/accounting-import.ts');
  const schema=load('src/lib/backup/source-schema.ts');
  const adapter=load('src/lib/backup/source-adapter.ts',{'./accounting-import':core,'./source-schema':schema});
  const id='64185000-0000-4000-8000-000000000101';
  for(const table of ['invoices','invoice_items','payments','credit_payments','customer_write_offs','invoice_item_stock_allocations']) {
    const row={id,product_type:'service',amount:'100.00',invoice_no:'QA',source_trust_version:99,source_effective_at:'1900-01-01',source_transaction_id:'forged'};
    const old={...row};delete old.source_trust_version;delete old.source_effective_at;delete old.source_transaction_id;
    const a=adapter.prepareRestore({[table]:[row]},'native',{actorId:id,branchId:id},false);
    const b=adapter.prepareRestore({[table]:[old]},'native',{actorId:id,branchId:id},false);
    assert.deepEqual(a,b);
    assert.deepEqual(a[table][0].payload,old);
  }
});
