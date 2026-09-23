import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from './helpers/local-supabase';

test.describe.configure({ mode: 'serial', retries: 0 });
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.skip(!isLocalPlaywrightRun(), 'Isolated local Supabase only');

const org = randomUUID(), branch = randomUUID(), product = randomUUID(), customer = randomUUID();
const password = randomUUID();
const users: Array<{ id: string; email: string; role: string }> = [];
let service: SupabaseClient, url = '', anon = '';
const observations: Record<string, unknown> = {};

function checked(error: { message: string } | null) { if (error) throw new Error(error.message); }

async function heldBillBusinessSnapshot() {
  const counts: Record<string, number | null> = {};
  for (const table of ['invoices', 'invoice_items', 'payments', 'stock_movements', 'invoice_item_stock_allocations', 'customer_ledger_entries']) {
    const result = await service.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', org);
    checked(result.error); counts[table] = result.count;
  }
  const stock = await service.from('products').select('stock_quantity').eq('id', product).single();
  checked(stock.error);
  const lots = await service.from('product_stock_lots').select('id,quantity_remaining,unit_cost').eq('product_id', product).order('id');
  checked(lots.error);
  const balance = await service.from('customers').select('outstanding_balance').eq('id', customer).single();
  checked(balance.error);
  return { counts, stock: stock.data, lots: lots.data, customer: balance.data };
}

test.beforeAll(async () => {
  const raw = execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const status = JSON.parse(raw.slice(raw.indexOf('{')));
  url = status.API_URL; anon = status.ANON_KEY;
  if (!url.startsWith('http://127.0.0.1:')) throw new Error('Loopback required');
  service = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  checked((await service.from('organizations').insert({ id: org, name: 'Task 82951 synthetic POS' })).error);
  checked((await service.from('branches').insert({ id: branch, organization_id: org, name: 'Main Branch' })).error);
  for (const role of ['cashier', 'technician']) {
    const email = `pos-parity-${role}-${org}@saledock.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    checked(error);
    if (!data.user) throw new Error('Synthetic auth fixture missing');
    users.push({ id: data.user.id, email, role });
    checked((await service.from('profiles').insert({ id: data.user.id, organization_id: org, branch_id: branch,
      full_name: `Synthetic ${role}`, role, is_active: true, onboarding_completed: true })).error);
  }
  checked((await service.from('customers').insert({ id: customer, organization_id: org, name: 'Synthetic buyer', outstanding_balance: 100 })).error);
  checked((await service.from('products').insert({ id: product, organization_id: org, name: 'Synthetic POS physical',
    type: 'product', sale_price: 100, purchase_price: 60, stock_quantity: 10, is_active: true })).error);
  checked((await service.from('product_stock_lots').insert({ organization_id: org, branch_id: branch, product_id: product,
    quantity_received: 10, quantity_remaining: 10, unit_cost: 60, purchase_date: '2026-01-01' })).error);
});

test.afterAll(async () => {
  if (!service) return;
  for (const table of ['invoice_item_stock_allocations', 'stock_movements', 'customer_ledger_entries', 'payments', 'invoice_items', 'pos_held_bills', 'invoices', 'audit_logs', 'loss_prevention_events', 'product_stock_lots', 'products', 'customers']) {
    checked((await service.from(table).delete().eq('organization_id', org)).error);
  }
  for (const user of users) checked((await service.auth.admin.deleteUser(user.id)).error);
  checked((await service.from('organizations').delete().eq('id', org)).error);
  const { count, error } = await service.from('organizations').select('id', { count: 'exact', head: true }).eq('id', org);
  checked(error); expect(count).toBe(0);
  observations.cleanup = 'Task-owned organization, users and business fixtures removed';
  if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/browser-${process.env.QA_RUN_LABEL || 'run'}.json`, JSON.stringify(observations, null, 2), { flag: 'wx' });
});

test('authenticated REST RPC denies Technician without sell authority and accepts the explicit override', async () => {
  const user = users.find(u => u.role === 'technician')!;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  checked((await client.auth.signInWithPassword({ email: user.email, password })).error);
  const payload = { p_branch_id: branch, p_customer_id: customer,
    p_cart: [{ product_id: product, quantity: 1, unit_price: 100, discount: 0 }],
    p_discount_total: 0, p_payment_method: 'cash', p_amount_paid: 0, p_payment_ref: null,
    p_note: 'Synthetic direct permission proof', p_allow_loss_override: true, p_idempotency_key: randomUUID() };
  const denial = await client.rpc('pos_checkout', payload);
  expect(denial.error?.code).toBe('42501');
  const before = await service.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org);
  checked(before.error); expect(before.count).toBe(0);
  checked((await service.from('staff_permissions').insert({ organization_id: org, profile_id: user.id, can_sell: true })).error);
  const allowed = await client.rpc('pos_checkout', payload);
  checked(allowed.error); expect(allowed.data).toHaveLength(1);
  const { data: balance, error } = await service.from('customers').select('outstanding_balance').eq('id', customer).single();
  checked(error); expect(Number(balance?.outstanding_balance)).toBe(200);
  observations.directRpc = { defaultTechnician: 'denied 42501', afterTrueOverride: 'accepted', customerBalance: 200 };
  await client.auth.signOut({ scope: 'local' });
});

test('real Cashier action preserves held-bill checkout, change due and duplicate protection; explicit sell denial stays actionable', async ({ page }) => {
  test.setTimeout(90_000);
  const user = users.find(u => u.role === 'cashier')!;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginLocalOwnerDirectly(page, user.email, password);
  const reject = page.getByRole('button', { name: 'Reject optional cookies', exact: true });
  await expect(reject).toBeVisible();
  await reject.click();
  await expect(page.getByRole('region', { name: 'Cookie consent', exact: true })).toHaveCount(0);
  await page.goto('/pos');
  const productButton = page.locator(`[data-testid="pos-product-btn"][data-product-id="${product}"]`);
  await expect(productButton).toBeEnabled();
  await productButton.click();
  const beforeHold = await heldBillBusinessSnapshot();
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  const hold = page.getByRole('dialog', { name: 'Hold bill' });
  await hold.getByPlaceholder('e.g. Counter 2 / Umar').fill('Synthetic parity held bill');
  await hold.getByRole('button', { name: 'Hold bill', exact: true }).click();
  await expect(page.getByText('Bill held.', { exact: true })).toBeVisible();
  expect(await heldBillBusinessSnapshot()).toEqual(beforeHold);
  await page.getByRole('button', { name: 'Held bills', exact: true }).click();
  const held = page.getByRole('dialog', { name: 'Held bills' });
  await held.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('dialog', { name: 'Resume held bill' }).getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText('Held bill resumed.', { exact: true })).toBeVisible();
  expect(await heldBillBusinessSnapshot()).toEqual(beforeHold);
  observations.heldBeforeCheckout = { holdBusinessMutation: false, resumeBusinessMutation: false, snapshot: beforeHold };
  await page.locator('[data-testid="pos-amount-tendered-input"]').first().fill('150');
  await page.locator('[data-testid="pos-checkout-btn"]').first().click();
  await expect(page.getByText(/Sale recorded as INV-/).first()).toBeVisible({ timeout: 15000 });
  const { data: invoices, error } = await service.from('invoices').select('id,grand_total,amount_paid,amount_tendered,change_due').eq('organization_id', org).eq('created_by', user.id);
  checked(error); expect(invoices).toHaveLength(1);
  expect(Number(invoices![0].grand_total)).toBe(100); expect(Number(invoices![0].amount_paid)).toBe(100);
  expect(Number(invoices![0].amount_tendered)).toBe(150); expect(Number(invoices![0].change_due)).toBe(50);
  const { data: heldRows, error: heldError } = await service.from('pos_held_bills').select('status,completed_invoice_id').eq('organization_id', org);
  checked(heldError); expect(heldRows).toEqual([{ status: 'completed', completed_invoice_id: invoices![0].id }]);
  checked((await service.from('staff_permissions').insert({ organization_id: org, profile_id: user.id, can_sell: false })).error);
  await page.goto('/pos');
  await productButton.click();
  await page.locator('[data-testid="pos-exact-tender-btn"]').first().click();
  await page.locator('[data-testid="pos-checkout-btn"]').first().click();
  await expect(page.getByText('You do not have permission to sell.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="pos-checkout-btn"]').first()).toBeEnabled();
  const after = await service.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('created_by', user.id);
  checked(after.error); expect(after.count).toBe(1);
  // The identical flow on unchanged main emits one #418. Record that existing
  // local UI finding; any additional or different runtime error is a regression.
  expect(errors.length).toBeLessThanOrEqual(1);
  expect(errors.every(message => message === 'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.')).toBe(true);
  observations.browserAction = { heldBill: 'completed once', grandTotal: 100, payment: 100, change: 50,
    deniedOverride: 'no second invoice; button recovered', knownBaselineFlowErrors: errors,
    runtimeErrorsBeyondExactMainBaseline: 0 };
});
