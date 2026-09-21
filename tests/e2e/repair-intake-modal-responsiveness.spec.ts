import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from './helpers/local-supabase';

test.describe.configure({ mode: 'serial', retries: 0 });
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.skip(!isLocalPlaywrightRun(), 'Local synthetic fixtures only');
const org = randomUUID(), branch = randomUUID(), customer = randomUUID(), repair = randomUUID();
const password = randomUUID(), email = `modal-${org}@saledock.local`;
let admin: SupabaseClient, userId: string;
const evidence: Record<string, unknown> = {};
let pageErrors: string[] = [];
const dir = process.env.QA_EVIDENCE_DIR;
function checked(error: { message: string } | null) { if (error) throw new Error(error.message); }
const dialog = (page: Page) => page.getByRole('dialog', { name: /New Repair Intake|Edit Job Details/ });

test.beforeAll(async () => {
  const raw = execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  const status = JSON.parse(raw.slice(raw.indexOf('{')));
  if (!status.API_URL.startsWith('http://127.0.0.1:')) throw new Error('Loopback required');
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  checked((await admin.from('organizations').insert({ id: org, name: 'Synthetic modal QA' })).error);
  checked((await admin.from('branches').insert({ id: branch, organization_id: org, name: 'Main Branch' })).error);
  const account = await admin.auth.admin.createUser({ email, password, email_confirm: true }); checked(account.error);
  userId = account.data.user!.id;
  checked((await admin.from('profiles').insert({ id: userId, organization_id: org, branch_id: branch, full_name: 'Synthetic Owner', role: 'owner', is_active: true, onboarding_completed: true })).error);
  checked((await admin.from('customers').insert({ id: customer, organization_id: org, name: 'Modal Registered Customer', phone: '03000000000' })).error);
  checked((await admin.from('repairs').insert({ id: repair, organization_id: org, branch_id: branch, job_no: 'RPR-55831', customer_name: 'Modal Existing Customer', device_type: 'Mobile', problem_description: 'Synthetic fixture', estimated_cost: 0, advance_paid: 0, status: 'received', created_by: userId, created_at: '2026-09-07T00:00:00Z' })).error);
});

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await loginLocalOwnerDirectly(page, email, password);
  await expect(page.locator('[data-active-workspace-state="active"]')).toBeVisible();
  await page.getByRole('button', { name: 'Reject optional cookies', exact: true }).click();
  await page.goto('/repairs');
  await expect(page.getByRole('button', { name: 'Intake Repair', exact: true }).first()).toBeVisible();
});

test.afterEach(async () => {
  expect(pageErrors).toEqual([]);
  evidence.pageErrors = pageErrors;
});

test.afterAll(async () => {
  if (!admin) return;
  for (const table of ['repair_status_history','repairs','audit_logs','customers']) checked((await admin.from(table).delete().eq('organization_id', org)).error);
  if (userId) checked((await admin.auth.admin.deleteUser(userId)).error);
  checked((await admin.from('organizations').delete().eq('id', org)).error);
  const remaining = await admin.from('organizations').select('id', { count: 'exact', head: true }).eq('id', org);
  checked(remaining.error); expect(remaining.count).toBe(0);
  evidence.cleanup = 'All task-owned local fixtures removed';
  if (dir) fs.writeFileSync(`${dir}/focused-${process.env.QA_RUN_LABEL || 'run'}.json`, JSON.stringify(evidence, null, 2), { flag: 'wx' });
});

test('open, Cancel, X, Escape and backdrop are local; filters, focus and shell stay stable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const contextUrl = '/repairs?q=Modal&status=received&from=2026-09-01&to=2026-09-30&sort=job_no&dir=asc';
  await page.goto(contextUrl);
  const trigger = page.getByRole('button', { name: 'Intake Repair', exact: true }).first();
  await expect(trigger).toBeVisible();
  await page.waitForLoadState('networkidle');
  const tableBefore = await page.locator('table').innerText();
  const sidebar = await page.locator('[data-sidebar-state]').elementHandle();
  const requests: { method: string; path: string; prefetch: string | undefined; segment: string | undefined }[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/repairs' && (request.isNavigationRequest() || request.headers().rsc || request.headers()['next-action'])) {
      requests.push({ method: request.method(), path: new URL(request.url()).pathname + new URL(request.url()).search,
        prefetch: request.headers()['next-router-prefetch'], segment: request.headers()['next-router-segment-prefetch'] }); await route.abort();
    } else await route.continue();
  });
  const timings = [];
  const historyLength = await page.evaluate(() => history.length);
  for (const method of ['Cancel','Close','Escape']) {
    if (method === 'Escape') await trigger.focus();
    const start = Date.now();
    if (method === 'Escape') await page.keyboard.press('Enter'); else await trigger.click();
    await expect(dialog(page)).toBeVisible();
    const openMs = Date.now() - start;
    await expect.poll(() => dialog(page).evaluate(d => d.contains(document.activeElement))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    const structure = await dialog(page).evaluate(d => ({ bodyPortal: d.parentElement?.parentElement === document.body, outsideShell: !d.closest('[data-app-shell-root]'), top: d.getBoundingClientRect().top }));
    expect(structure.bodyPortal).toBe(true); expect(structure.outsideShell).toBe(true); expect(structure.top).toBeGreaterThanOrEqual(0);
    if (method === 'Cancel') {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog(page).evaluate(d => d.contains(document.activeElement))).toBe(true);
      const covered = await dialog(page).evaluate(d => {
        const h = document.querySelector('[data-app-shell-root] header')!.getBoundingClientRect();
        const hit = document.elementFromPoint(h.right - 8, h.top + 8);
        return { covered: d.parentElement!.contains(hit),
          header: { x: h.x, y: h.y, width: h.width, height: h.height }, hit: hit?.outerHTML.slice(0, 250) };
      });
      evidence.topbarHitTest = covered;
      if (dir) await page.screenshot({ path: `${dir}/desktop-modal.png` });
      expect(covered.covered).toBe(true);
    }
    const closing = Date.now();
    if (method === 'Escape') await page.keyboard.press('Escape'); else await dialog(page).getByRole('button', { name: method, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    timings.push({ method, openMs, closeMs: Date.now() - closing });
    await expect(trigger).toBeFocused();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(contextUrl);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  }
  await trigger.click(); await expect(dialog(page)).toBeVisible();
  await page.mouse.click(1430, 20); await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  evidence.localInteractions = { timings, repairsRequests: requests };
  expect(requests).toEqual([]);
  expect(await page.locator('table').innerText()).toBe(tableBefore);
  expect(await sidebar!.evaluate(node => node.isConnected)).toBe(true);
  evidence.localInteractions = { timings, repairsRequests: requests, portalAboveNavbar: true, tableUnchanged: true, sidebarSameNode: true, focusTrapAndReturn: true, keyboardOpenAndClose: true };
});

test('Back and Forward restore modal URL state without navigation or duplicate history entries', async ({ page }) => {
  await page.goto('/repairs?q=Modal&sort=job_no&dir=asc#previous');
  await page.waitForLoadState('networkidle');
  // A same-document prior entry makes traversal deterministic without leaving the loaded list.
  await page.evaluate(() => history.pushState(null, '', location.pathname + location.search + '#current'));
  const length = await page.evaluate(() => history.length);
  let requests = 0;
  await page.route('**/repairs**', async route => {
    const request = route.request();
    if (request.isNavigationRequest() || request.headers().rsc || request.headers()['next-action']) {
      requests++; await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Intake Repair', exact: true }).first().click();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#previous');
  await page.goForward();
  await expect(dialog(page)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#current');
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.goBack();
  await page.goForward();
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('?q=Modal&sort=job_no&dir=asc');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(requests).toBe(0);
  evidence.history = { backForward: true, cancelledModalNotResurrected: true, noHistoryGrowth: true, repairsRequests: requests };
});

test('deep links, responsive/light/dark modal and customer selection remain usable', async ({ page }) => {
  test.setTimeout(60_000);
  const results = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const dark of [false,true]) {
      await page.goto('/repairs?add=1');
      await page.evaluate(d => document.documentElement.classList.toggle('dark', d), dark);
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
      await expect(dialog(page).getByRole('heading', { name: 'New Repair Intake' })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const search = dialog(page).getByPlaceholder('Search by name or phone...');
      await search.fill('Registered');
      await dialog(page).getByRole('button', { name: /Modal Registered Customer/ }).click();
      await expect(dialog(page).locator('[name="customer_name"]')).toHaveValue('Modal Registered Customer');
      await expect(dialog(page).locator('[name="customer_name"]')).toHaveAttribute('readonly', '');
      await dialog(page).getByRole('button', { name: 'Clear selection' }).click();
      await expect(dialog(page).locator('[name="customer_id"]')).toHaveValue('');
      await expect(dialog(page).locator('[name="customer_name"]')).toHaveValue('');
      if (dir) await page.screenshot({ path: `${dir}/modal-${viewport.width}-${dark ? 'dark' : 'light'}.png` });
      await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
      results.push({ ...viewport, dark, deepLink: true, accessibleActions: true, customerSearchSelectClear: true });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Intake Repair', exact: true }).first().click(); await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  evidence.responsive = results;
});

test('validation, pending, failed save, successful intake and edit keep their action semantics', async ({ page }) => {
  test.setTimeout(60_000);
  const actionResponses: { status: number; created: boolean; updated: boolean }[] = [];
  await page.getByRole('button', { name: 'Intake Repair', exact: true }).first().click();
  let posts = 0, reads = 0, release: () => void = () => {}, hold = true;
  let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/repairs**', async route => {
    if (route.request().headers()['next-action']) {
      posts++; if (hold) await gate;
      const response = await route.fetch({ maxRetries: 0 });
      const body = await response.body();
      actionResponses.push({ status: response.status(), created: body.includes('Repair job created.'), updated: body.includes('Repair job updated.') });
      await route.fulfill({ response, body });
      return;
    }
    else if (route.request().headers().rsc && !route.request().headers()['next-router-prefetch']) reads++;
    await route.continue();
  });
  await dialog(page).getByRole('button', { name: 'Record Intake', exact: true }).click();
  expect(posts).toBe(0);
  await dialog(page).locator('[name="customer_name"]').fill(' ');
  await dialog(page).locator('[name="problem_description"]').fill('Synthetic validation');
  await dialog(page).getByRole('button', { name: 'Record Intake', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Saving...' })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Saving...' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => posts).toBe(1); release(); hold = false;
  await expect(dialog(page).getByRole('alert')).toBeVisible();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Record Intake', exact: true })).toBeEnabled();
  const noWrite = await admin.from('repairs').select('id', { count: 'exact', head: true }).eq('organization_id', org);
  checked(noWrite.error); expect(noWrite.count).toBe(1);
  await dialog(page).locator('[name="customer_name"]').fill('Modal Saved Customer');
  await dialog(page).locator('[name="problem_description"]').fill('Synthetic valid intake');
  gate = new Promise<void>(resolve => { release = resolve; }); hold = true;
  await dialog(page).getByRole('button', { name: 'Record Intake', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('button', { name: 'Saving...' })).toBeDisabled();
  release(); hold = false; await expect(dialog(page)).toHaveCount(0);
  const saved = await admin.from('repairs').select('id,estimated_cost,advance_paid').eq('organization_id', org).eq('customer_name', 'Modal Saved Customer');
  checked(saved.error); expect(saved.data).toHaveLength(1); expect(Number(saved.data![0].advance_paid)).toBe(0);
  const savedHistory = await admin.from('repair_status_history').select('id,old_status,new_status').eq('repair_id', saved.data![0].id);
  const savedAudit = await admin.from('audit_logs').select('id,action').contains('metadata', { repair_id: saved.data![0].id });
  checked(savedHistory.error); checked(savedAudit.error);
  expect(savedHistory.data).toHaveLength(1);
  expect(savedHistory.data![0]).toMatchObject({ old_status: null, new_status: 'received' });
  expect(savedAudit.data).toHaveLength(1);
  expect(savedAudit.data![0].action).toBe('repairs.created');
  expect(posts).toBe(2); // One rejected validation request, one successful intake.
  await expect(page.getByText('Modal Saved Customer', { exact: true }).first()).toBeVisible();
  expect(reads).toBe(1);
  await expect.poll(() => actionResponses.some(r => r.created && r.status === 200)).toBe(true);
  evidence.createSettlement = { savePosts: 1, correctableValidationPosts: 1, pendingVisible: true,
    repairs: 1, history: 1, audit: 1, duplicateSave: 0, successResponse: true,
    modalClosed: true, freshReconciliations: reads, savedRowVisible: true, keyboardSubmit: true };
  await page.goto(`/repairs?edit=${repair}&sort=job_no&dir=asc`);
  await expect(dialog(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(dialog(page).locator('[name="advance_paid"]')).toHaveAttribute('readonly','');
  await dialog(page).locator('[name="notes"]').fill('Synthetic edited note');
  await dialog(page).getByRole('button', { name: 'Update Details', exact: true }).click();
  try {
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    const persisted = await admin.from('repairs').select('notes').eq('id', repair).single(); checked(persisted.error);
    evidence.editSettlement = { actionPosts: posts, actionResponses, notePersisted: persisted.data?.notes === 'Synthetic edited note',
      dialogVisible: await dialog(page).isVisible(), savingVisible: await page.getByRole('button', { name: 'Saving...', exact: true }).isVisible(),
      inlineErrors: await dialog(page).getByRole('alert').allTextContents() };
  }
  expect(posts).toBe(3);
  const edited = await admin.from('repairs').select('notes').eq('id', repair).single(); checked(edited.error); expect(edited.data?.notes).toBe('Synthetic edited note');
  const editUrl = new URL(page.url());
  expect(editUrl.searchParams.get('repairsavestate')).toMatch(/^[0-9a-f-]{36}$/);
  editUrl.searchParams.delete('repairsavestate');
  expect(editUrl.search).toBe('?sort=job_no&dir=asc');
  evidence.submissions = { nativeValidationNoRequest: true, serverValidationInlineError: true, savingDisabled: true, successfulIntakes: 1, duplicateSubmissions: 0, edit: true, actionPosts: posts };
});

for (const run of [1, 2, 3]) test(`edit save clean run ${run}: one mutation, settled success, one reconciliation`, async ({ page }) => {
  const id = randomUUID(), marker = `Modal Edit Run ${run}`, model = `Reviewed model ${run}`;
  checked((await admin.from('repairs').insert({
    id, organization_id: org, branch_id: branch, created_by: userId, job_no: `QA-${id.slice(0,8)}`,
    customer_name: marker, device_type: 'Mobile', device_model: 'Original model',
    problem_description: 'Synthetic zero-financial edit', status: 'received', estimated_cost: 0,
    advance_paid: 0, final_cost: 0,
  })).error);
  await page.goto(`/repairs?edit=${id}&q=Modal&status=received&sort=job_no&dir=asc`);
  await expect(dialog(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await dialog(page).locator('[name="device_model"]').fill(model);
  let posts = 0, reconciliations = 0, actionResponseComplete = false;
  let releaseAction!: () => void, releaseRead!: () => void;
  const actionGate = new Promise<void>(resolve => { releaseAction = resolve; });
  const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/repairs**', async route => {
    const request = route.request();
    if (request.headers()['next-action']) {
      posts++;
      await actionGate;
      const response = await route.fetch({ maxRetries: 0 });
      expect(response.status()).toBe(200);
      const body = await response.body();
      expect(body.toString()).toContain('Repair job updated.');
      actionResponseComplete = true;
      await route.fulfill({ response, body });
    } else {
      if (request.headers().rsc && !request.headers()['next-router-prefetch']) {
        reconciliations++;
        await readGate;
      }
      await route.continue();
    }
  });
  try {
    await dialog(page).getByRole('button', { name: 'Update Details', exact: true }).click();
    await expect(dialog(page).locator('form')).toHaveAttribute('aria-busy', 'true');
    await expect(dialog(page).getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog(page).evaluate(d => d.parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await expect(dialog(page)).toBeVisible();
    // An accidental duplicate DOM submit is blocked even before the network response.
    await dialog(page).locator('form').evaluate(f => (f as HTMLFormElement).requestSubmit());
    expect(posts).toBe(1);
    releaseAction();
    await expect(dialog(page).getByRole('status')).toHaveText('Repair job updated.');
    await expect(dialog(page).locator('form')).toHaveAttribute('aria-busy', 'false');
    await expect(dialog(page).getByRole('button', { name: 'Update Details', exact: true })).toBeDisabled();
    await expect.poll(() => reconciliations).toBe(1);
    expect(actionResponseComplete).toBe(true);
    const persisted = await admin.from('repairs').select('device_model,status,estimated_cost,advance_paid,final_cost').eq('id', id).single();
    const audits = await admin.from('audit_logs').select('id,action').contains('metadata', { repair_id: id });
    const history = await admin.from('repair_status_history').select('id').eq('repair_id', id);
    checked(persisted.error); checked(audits.error); checked(history.error);
    expect(persisted.data).toMatchObject({ device_model: model, status: 'received', estimated_cost: 0, advance_paid: 0, final_cost: 0 });
    expect(audits.data).toHaveLength(1); expect(audits.data![0].action).toBe('repairs.updated');
    expect(history.data).toHaveLength(0);
    releaseRead();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(`(${model})`, { exact: true }).first()).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('repairsavestate')).toMatch(/^[0-9a-f-]{36}$/);
    url.searchParams.delete('repairsavestate');
    expect(url.search).toBe('?q=Modal&status=received&sort=job_no&dir=asc');
    expect(posts).toBe(1); expect(reconciliations).toBe(1); expect(errors).toEqual([]);
    evidence[`editRun${run}`] = { posts, reconciliations, actionResponseComplete, pendingVisible: true,
      dismissalGuardedWhileSaving: true, successBeforeReconciliation: true, modalClosed: true,
      updatedModelVisible: true, updates: 1, audits: 1, newHistory: 0, duplicates: 0 };
  } finally { releaseAction(); releaseRead(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('edit Cancel and X are local and retain list context', async ({ page }) => {
  for (const method of ['Cancel', 'Close']) {
    await page.goto(`/repairs?edit=${repair}&sort=job_no&dir=asc`);
    await expect(dialog(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    let requests = 0;
    await page.route('**/repairs**', async route => {
      const request = route.request();
      if (request.isNavigationRequest() || request.headers().rsc || request.headers()['next-action']) {
        requests++; await route.abort();
      } else await route.continue();
    });
    await dialog(page).getByRole('button', { name: method, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('?sort=job_no&dir=asc');
    expect(requests).toBe(0);
    await page.unrouteAll();
  }
  evidence.editDismissal = { cancel: true, close: true, repairsRequests: 0, filtersRetained: true };
});

test('existing shared catalog modals retain focus, dirty dismissal and footer form association', async ({ page }) => {
  test.setTimeout(60_000);
  let posts = 0;
  page.on('request', request => { if (request.headers()['next-action']) posts++; });
  for (const item of [
    { tab: 'products', title: 'Add product', form: null },
    { tab: 'categories', title: 'Add category', form: 'category-form' },
    { tab: 'suppliers', title: 'Add supplier', form: 'supplier-form' },
  ]) {
    await page.goto(`/products?tab=${item.tab}`);
    await page.getByRole('button', { name: item.title, exact: true }).first().click();
    const modal = page.getByRole('dialog', { name: item.title, exact: true });
    await expect(modal).toBeVisible();
    await expect.poll(() => modal.evaluate(d => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await modal.evaluate(d => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await modal.evaluate(d => d.contains(document.activeElement))).toBe(true);
    if (item.form) {
      expect(await modal.getByRole('button', { name: item.title, exact: true }).evaluate((button: HTMLButtonElement) => button.form?.id)).toBe(item.form);
      await page.keyboard.press('Escape');
    } else {
      await modal.locator('[name="name"]').fill('Unsaved local modal check');
      await page.keyboard.press('Escape');
      await expect(modal).toBeVisible(); // Existing dirty-product preventDismiss contract.
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await expect(modal).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  }
  expect(posts).toBe(0);
  evidence.sharedConsumers = { productCategorySupplier: true, externalSubmitAssociation: true, dirtyPreventDismiss: true, actionPosts: posts };
});
