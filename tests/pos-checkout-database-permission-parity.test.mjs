import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const migrationPath = 'supabase/migrations/20260907110844_pos_checkout_database_permission_parity.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const previous = fs.readFileSync('supabase/migrations/20260630000000_pos_checkout_service_total_charged.sql', 'utf8');
const action = fs.readFileSync('src/app/pos/actions.ts', 'utf8');
const body = text => text.split('as $$')[1].split('$$;')[0];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function loadTs(path, imports) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, console });
  return loaded.exports;
}

const shared = loadTs('src/lib/staff-permissions-shared.ts', {});
let overrideRow = null;
const permissions = loadTs('src/lib/staff-permissions.ts', {
  'server-only': {}, react: { cache: fn => fn }, './staff-permissions-shared': shared,
  '@/lib/supabase/server': { createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: overrideRow }) }) }) }) }) }) },
});

test('checkout remains one invoker operation with the same public contract and no privileged helper', () => {
  assert.equal(migration.match(/create or replace function/g)?.length, 1);
  assert.match(migration, /security invoker\s+set search_path = public/);
  assert.doesNotMatch(migration, /security definer|create role|create policy|alter table|posting_sequence|ledger_trust/i);
  const signature = text => text.slice(text.indexOf('create or replace function'), text.indexOf('as $$'));
  assert.equal(signature(migration), signature(previous));
  assert.match(migration, /from public, anon;/);
});

test('identity and effective permission checks precede all business insertion', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /sp\.profile_id = p\.id and sp\.organization_id = p\.organization_id/);
  assert.match(migration, /where p\.id = v_user_id and p\.is_active = true/);
  assert.match(migration, /v_role is null or v_role not in \('owner', 'admin', 'manager', 'cashier', 'technician'\)/);
  assert.ok(migration.indexOf('v_can_sell is not true') < migration.indexOf('perform 1 from public.organizations'));
  assert.ok(migration.indexOf('You do not have permission to apply discounts.') < migration.indexOf('insert into public.invoices'));
  assert.ok(migration.indexOf('v_unit_price < v_product.sale_price - 0.001') < migration.indexOf('insert into public.invoices'));
  assert.match(action, /item\.unit_price < p\.sale_price - 0\.001|item\.unit_price < p\.price - 0\.001/);
});

test('loss parameter cannot grant authority, including NULL, and loss audit uses effective authority', () => {
  assert.match(migration, /v_effective_loss_override := coalesce\(p_allow_loss_override, false\) and v_can_sell_at_loss/);
  const lossBody = body(migration).slice(body(migration).indexOf('-- Loss-override check:'));
  assert.doesNotMatch(lossBody, /p_allow_loss_override/);
  assert.match(lossBody, /not v_product\.allow_sell_at_loss and not v_effective_loss_override/);
  assert.match(lossBody, /'staff_permission_override', v_effective_loss_override/);
});

test('checkout math, FIFO, idempotency and service sections are unchanged apart from authorization', () => {
  const old = body(previous), current = body(migration);
  const parts = [
    ['  -- \u2500\u2500 Idempotency guard', '  select coalesce('],
    ["    if v_product.type = 'service' then", 'end;\n'],
  ];
  for (const [start, end] of parts) {
    const a = old.slice(old.indexOf(start), old.lastIndexOf(end));
    const b = current.slice(current.indexOf(start), current.lastIndexOf(end));
    assert.equal(b.replaceAll('v_effective_loss_override', 'p_allow_loss_override'), a);
  }
  assert.match(migration, /p_branch_id is distinct from v_branch_id/);
  assert.match(migration, /c\.id = p_customer_id and c\.organization_id = v_org_id/);
  assert.match(action, /p_branch_id: profile\.branch_id/);
});

test('actual checkout action still denies default Technician before any database operation', async () => {
  overrideRow = null;
  let rpcClients = 0;
  const exports = loadTs('src/app/pos/actions.ts', {
    'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect() { throw new Error('unexpected redirect'); } },
    '@/lib/supabase/server': { createClient() { rpcClients++; throw new Error('RPC reached'); } },
    '@/lib/auth/session': { getCurrentContext: async () => ({ user: { id: 'synthetic' }, profile: { id: 'synthetic', organization_id: 'synthetic', role: 'technician' } }) },
    '@/lib/permissions': {}, '@/lib/staff-permissions': permissions,
    '@/lib/audit': { logAudit() {} }, '@/lib/errors/safe-action-error': {}, '@/lib/validation/pos': {},
  });
  const result = await exports.checkoutAction({});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'You do not have permission to sell.');
  assert.equal(rpcClients, 0);
});

const physical = (price = 100, discount = 0, quantity = 1) => [{ product_id: '82951000-0000-4000-8000-000000000201', quantity, unit_price: price, discount }];
const service = [{ product_id: '82951000-0000-4000-8000-000000000202', quantity: 1, unit_price: 0, service_transaction_amount: 1000, service_commission: 50, service_total_charged: 1050 }];
const local = process.env.RUN_LOCAL_POS_PERMISSION_DB === '1';
function sql(text) {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER || 'supabase_db_gadget-zone-online-pos';
  assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: text, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('local direct RPC role/override parity, atomic denial and accounting regression matrix', { skip: !local }, async () => {
  const current = sql("select prosrc from pg_proc where oid='public.pos_checkout(uuid,uuid,jsonb,numeric,public.payment_method,numeric,text,text,boolean,text)'::regprocedure;");
  assert.equal(current.trim(), body(previous).trim(), 'Local baseline must be exact pre-migration implementation');
  const cases = [];
  for (const role of ['owner', 'admin', 'manager', 'cashier', 'technician']) {
    for (const permission of ['can_sell', 'can_discount', 'can_sell_at_loss']) {
      for (const value of ['absent', null, true, false]) {
        const overrides = value === 'absent' ? undefined : { can_sell: null, can_discount: null, can_sell_at_loss: null, [permission]: value };
        if (permission !== 'can_sell' && overrides) overrides.can_sell = true;
        if (permission === 'can_sell_at_loss' && overrides) overrides.can_discount = true;
        overrideRow = overrides ?? null;
        const profile = { id: 'synthetic', organization_id: 'synthetic', role };
        const sell = await permissions.canSellNew(profile);
        const discount = await permissions.canDiscountNew(profile);
        const loss = await permissions.canSellAtLossNew(profile);
        const c = { name: `${role}/${permission}/${value}`, role, overrides, loss: false, expected: sell };
        if (permission === 'can_discount') { c.billDiscount = 5; c.expected = sell && discount; }
        if (permission === 'can_sell_at_loss') { c.cart = physical(50); c.loss = true; c.expected = sell && discount && loss; }
        cases.push(c);
      }
    }
  }
  for (const enabled of [false, true]) {
    for (const [kind, options] of [['bill', { billDiscount: 5 }], ['line', { cart: physical(100, 5) }], ['below-list', { cart: physical(99) }]]) {
      cases.push({ name: `discount/${kind}/${enabled}`, role: 'cashier', overrides: { can_discount: enabled }, expected: enabled, ...options });
    }
  }
  cases.push(
    { name: 'discount-denied/full-price', role: 'cashier', overrides: { can_discount: false }, expected: true },
    { name: 'discount-denied/price-tolerance', role: 'cashier', overrides: { can_discount: false }, cart: physical(99.999), expected: true },
    { name: 'discount-denied/service-price-independent', role: 'cashier', overrides: { can_discount: false }, cart: [{ ...service[0], service_transaction_amount: 40, service_commission: 10, service_total_charged: 50 }], expected: true },
    { name: 'physical/cash-change-replay', role: 'cashier', paid: 150, replay: true, expected: true },
    { name: 'physical/credit', role: 'cashier', paid: 0, expected: true },
    { name: 'physical/fifo-two-lots', role: 'cashier', cart: physical(100, 0, 12), paid: 1200, expected: true },
    { name: 'service/zero-price', role: 'cashier', cart: service, paid: 1050, expected: true },
    { name: 'service/fallback', role: 'cashier', cart: [{ ...service[0], service_total_charged: null }], paid: 1050, expected: true },
    { name: 'loss/null-is-not-authority', role: 'cashier', cart: physical(50), loss: null, expected: false },
    { name: 'loss/permission-not-requested', role: 'cashier', overrides: { can_sell_at_loss: true }, cart: physical(50), loss: false, expected: false },
    { name: 'loss/product-exemption', role: 'cashier', cart: physical(50), loss: true, productLoss: true, expected: true },
    { name: 'inactive-profile', role: 'cashier', inactive: true, expected: false },
    { name: 'unauthenticated', role: 'owner', claim: null, expected: false },
    { name: 'missing-profile', role: 'owner', claim: '82951000-0000-4000-8000-000000000999', expected: false },
    { name: 'anon-execute', role: 'owner', dbRole: 'anon', expected: false },
    { name: 'service-role/no-user', role: 'owner', dbRole: 'service_role', claim: null, expected: false },
    { name: 'service-role/owner-context', role: 'owner', dbRole: 'service_role', expected: true },
    { name: 'branch/null-default', role: 'cashier', branch: null, expected: true },
    { name: 'branch/profile-unassigned', role: 'cashier', branch: null, profileBranch: null, expected: false },
    { name: 'branch/profile-foreign-context', role: 'cashier', branch: null, profileBranch: '82951000-0000-4000-8000-000000000002', expected: false },
    { name: 'branch/same-org-unassigned', role: 'owner', branch: '82951000-0000-4000-8000-000000000003', expected: false },
    { name: 'branch/foreign', role: 'cashier', branch: '82951000-0000-4000-8000-000000000002', expected: false },
    { name: 'branch/missing', role: 'cashier', branch: '82951000-0000-4000-8000-000000000999', expected: false },
    { name: 'customer/foreign-paid', role: 'cashier', customer: '82951000-0000-4000-8000-000000000102', expected: false },
    { name: 'customer/foreign-credit', role: 'cashier', customer: '82951000-0000-4000-8000-000000000102', paid: 0, expected: false },
    { name: 'product/foreign', role: 'cashier', cart: [{ ...physical()[0], product_id: '82951000-0000-4000-8000-000000000203' }], expected: false },
  );
  const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const fixture = fs.readFileSync('tests/helpers/pos-checkout-permission-fixture.sql', 'utf8');
  const baselineCase = { name: 'baseline/technician-direct', role: 'technician', cart: [{ ...service[0], service_total_charged: 50, service_transaction_amount: 40, service_commission: 10 }], paid: 0, loss: false };
  cases.push({ ...baselineCase, expected: false });
  const regressions = cases.filter(c => ['physical/cash-change-replay', 'physical/credit', 'physical/fifo-two-lots', 'service/zero-price', 'service/fallback'].includes(c.name));
  const query = `BEGIN;\n${fixture}\nselect 'BASELINE:' || pg_temp.parity_case(${quote(baselineCase)})::text;\n` +
    regressions.map(c => `select 'OLDMATH:' || pg_temp.parity_case(${quote(c)})::text;`).join('\n') +
    `\n${migration}\n` +
    cases.map(c => `select 'CASE:' || pg_temp.parity_case(${quote(c)})::text;`).join('\n') +
    "\nDO $$ BEGIN BEGIN PERFORM 'unsupported_checkout_role'::public.user_role; RAISE EXCEPTION 'Invalid role was accepted'; EXCEPTION WHEN invalid_text_representation THEN NULL; END; END $$;\n" +
    "\nselect 'CATALOG:' || json_build_object('invoker',not prosecdef,'owner',pg_get_userbyid(proowner),'config',proconfig,'anon',has_function_privilege('anon',oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),'serviceRole',has_function_privilege('service_role',oid,'EXECUTE'),'publicExecute',exists(select from aclexplode(proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'),'overloads',(select count(*) from pg_proc where proname='pos_checkout' and pronamespace='public'::regnamespace)) from pg_proc where oid='public.pos_checkout(uuid,uuid,jsonb,numeric,public.payment_method,numeric,text,text,boolean,text)'::regprocedure;\nROLLBACK;";
  const output = sql(query).split('\n');
  const baseline = JSON.parse(output.find(l => l.startsWith('BASELINE:')).slice(9));
  assert.equal(baseline.accepted, true, 'Exact old Technician bypass must reproduce');
  const results = output.filter(l => l.startsWith('CASE:')).map(l => JSON.parse(l.slice(5)));
  assert.equal(results.length, cases.length);
  const failures = results.filter((r, i) => r.accepted !== cases[i].expected);
  const beforeMath = output.filter(l => l.startsWith('OLDMATH:')).map(l => JSON.parse(l.slice(8)));
  assert.equal(beforeMath.length, regressions.length);
  for (const old of beforeMath) {
    assert.equal(old.accepted, true);
    assert.deepEqual(results.find(r => r.name === old.name).result, old.result, `Money/FIFO changed for ${old.name}`);
  }
  if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/rpc-matrix-${process.env.QA_RUN_LABEL || 'run'}.json`, JSON.stringify({ baseline, cases, results, failures, beforeMath, accountingBeforeAfterEqual: true, unsupportedRoleRejectedByEnum: true }, null, 2), { flag: 'wx' });
  assert.deepEqual(failures, []);
  const exactOldInvocation = results.find(r => r.name === baselineCase.name);
  assert.equal(exactOldInvocation.accepted, false);
  assert.equal(exactOldInvocation.sqlstate, '42501');
  for (const r of results) assert.equal(r.zeroPersistentMutation, true);
  const byName = name => results.find(r => r.name === name).result;
  const cash = byName('physical/cash-change-replay');
  assert.equal(cash.invoice.grand_total, 100); assert.equal(cash.invoice.amount_paid, 100);
  assert.equal(cash.invoice.amount_tendered, 150); assert.equal(cash.invoice.change_due, 50);
  assert.equal(cash.paymentTotal, 100); assert.equal(cash.stock, 19); assert.deepEqual(cash.lots, [9, 10]);
  assert.equal(cash.fifoCost, 60); assert.equal(cash.idempotentReplay, true);
  const credit = byName('physical/credit');
  assert.equal(credit.customerBalance, 200); assert.equal(credit.paymentTotal, 0);
  assert.deepEqual(credit.ledger, [{ direction: 'debit', amount: 100, balance: 200 }]);
  const fifo = byName('physical/fifo-two-lots');
  assert.equal(fifo.fifoCost, 760); assert.equal(fifo.allocatedQty, 12); assert.equal(fifo.stock, 8); assert.deepEqual(fifo.lots, [0, 8]);
  for (const name of ['service/zero-price', 'service/fallback']) {
    const svc = byName(name); assert.equal(svc.invoice.grand_total, 1050); assert.equal(svc.paymentTotal, 1050);
    assert.equal(svc.items[0].principal, 1000); assert.equal(svc.items[0].commission, 50); assert.equal(svc.items[0].charged, 1050);
    assert.equal(svc.allocatedQty, 0); assert.equal(svc.movements, 0);
  }
  assert.equal(byName('loss/product-exemption').lossAudit[0].staffOverride, false);
  assert.equal(byName('cashier/can_sell_at_loss/true').lossAudit[0].staffOverride, true);
  const catalog = JSON.parse(output.find(l => l.startsWith('CATALOG:')).slice(8));
  assert.deepEqual(catalog, { invoker: true, owner: 'postgres', config: ['search_path=public'], anon: false, authenticated: true, serviceRole: true, publicExecute: false, overloads: 1 });
  assert.equal(sql("select prosrc from pg_proc where oid='public.pos_checkout(uuid,uuid,jsonb,numeric,public.payment_method,numeric,text,text,boolean,text)'::regprocedure;").trim(), current.trim());
  if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/rpc-validation-${process.env.QA_RUN_LABEL || 'run'}.json`, JSON.stringify({ cases: cases.length, passed: results.length, denials: results.filter(r => !r.accepted).length, catalog, migrationSha256: hash(migration), originalFunctionRestoredByRollback: true }, null, 2), { flag: 'wx' });
});
