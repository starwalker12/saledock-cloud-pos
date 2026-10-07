import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from './helpers/local-supabase';
import { seedLocalAccountingAccount, resetLocalAccountingFixture } from './helpers/local-accounting-fixture';

test.describe.configure({mode:'serial', retries:0});
test.use({trace:'off',video:'off',screenshot:'off'});
test.skip(!isLocalPlaywrightRun(),'Isolated local Supabase only');
const org=randomUUID(), branch=randomUUID(), product=randomUUID(), customer=randomUUID(), supplier=randomUUID();
const password=randomUUID(), email=`money-${org}@saledock.local`;
let actor='';
const observations: Record<string, unknown>={};
let service:SupabaseClient;
const admin=()=>service;
function checked(error:{message:string}|null){if(error)throw new Error(error.message);}
test.beforeAll(async()=>{
 const output=execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const status=JSON.parse(output.slice(output.indexOf('{')));
 if(!status.API_URL.startsWith('http://127.0.0.1:'))throw new Error('Loopback required');
 service=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 checked((await admin().from('organizations').insert({id:org,name:'QA35806 decimal money',onboarding_completed:true})).error);
 checked((await admin().from('branches').insert({id:branch,organization_id:org,name:'QA branch'})).error);
 const user=await admin().auth.admin.createUser({email,password,email_confirm:true});checked(user.error);actor=user.data.user!.id;
 checked((await admin().from('profiles').insert({id:actor,organization_id:org,branch_id:branch,role:'owner',full_name:'Synthetic Owner',is_active:true,onboarding_completed:true})).error);
 checked((await admin().from('products').insert({id:product,organization_id:org,name:'QA decimal service',type:'service',sale_price:0,purchase_price:0,stock_quantity:0,is_active:true,requires_provider:false,requires_account_number:false,requires_reference:false})).error);
 await seedLocalAccountingAccount(admin(),'customers',{id:customer,organization_id:org,branch_id:branch,name:'QA decimal customer',outstanding_balance:100});
 await seedLocalAccountingAccount(admin(),'suppliers',{id:supplier,organization_id:org,name:'QA decimal supplier',outstanding_balance:100});
});
test.afterAll(async()=>{
 if(!await resetLocalAccountingFixture(admin(),org)) for(const table of ['invoice_item_stock_allocations','stock_movements','customer_ledger_entries','payments','invoice_items','pos_held_bills','invoices','credit_payments','customer_write_offs','supplier_ledger_entries','supplier_payments','supplier_write_offs','audit_logs','loss_prevention_events','products','customers','suppliers']) checked((await admin().from(table).delete().eq('organization_id',org)).error);
 if(actor)checked((await admin().auth.admin.deleteUser(actor)).error);
 checked((await admin().from('organizations').delete().eq('id',org)).error);
 observations.cleanup='Exact task organization, auth and all dependent fixture rows removed';
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/browser-${process.env.QA_RUN_LABEL}.json`,JSON.stringify(observations,null,2),{flag:'wx'});
});

for(const mode of ['cash','customer_credit'] as const){
 test(`decimal service ${mode}: add, hold, resume, switch tabs and checkout remain exact`,async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await loginLocalOwnerDirectly(page,email,password);
  const reject=page.getByRole('button',{name:'Reject optional cookies',exact:true});await expect(reject).toBeVisible();await reject.click();
  await expect(page.getByRole('region',{name:'Cookie consent',exact:true})).toHaveCount(0);
  await page.goto('/pos');
  await page.locator(`[data-testid="pos-product-btn"][data-product-id="${product}"]`).click();
  await page.getByRole('spinbutton',{name:'Principal (pass-through)',exact:true}).fill('500.10');
  await page.getByRole('spinbutton',{name:'Commission (shop income)',exact:true}).fill('50.20');
  await page.getByRole('spinbutton',{name:/^Total charged/}).fill('');
  await expect(page.locator('[data-testid="pos-checkout-btn"]')).toHaveText(/550\.30?$/);
  await page.getByRole('button',{name:'Hold',exact:true}).click();
  const hold=page.getByRole('dialog',{name:'Hold bill'});
  await hold.getByPlaceholder('e.g. Counter 2 / Umar').fill(`QA decimal ${mode}`);
  await hold.getByRole('button',{name:'Hold bill',exact:true}).click();
  await expect(page.getByText('Bill held.',{exact:true})).toBeVisible();
  const held=await admin().from('pos_held_bills').select('cart,totals_snapshot').eq('organization_id',org).eq('label',`QA decimal ${mode}`).single();checked(held.error);
  expect(held.data!.cart[0].unit_price).toBe(550.3);
  expect(held.data!.cart[0].service_total_charged).toBe(550.3);
  expect(held.data!.totals_snapshot.grand_total).toBe(550.3);
  expect(JSON.stringify(held.data)).not.toContain('550.3000000000001');
  await page.reload();
  await page.getByRole('button',{name:'Held bills',exact:true}).click();
  await page.getByRole('dialog',{name:'Held bills'}).getByRole('button',{name:'Resume',exact:true}).click();
  await page.getByRole('dialog',{name:'Resume held bill'}).getByRole('button',{name:'Resume',exact:true}).click();
  await expect(page.getByText('Held bill resumed.',{exact:true})).toBeVisible();
  await page.locator('[data-testid="pos-bill-label"]:not([readonly])').first().fill(`QA retained ${mode}`);
  await page.getByRole('button',{name:'+ New bill',exact:true}).first().click();
  await page.locator('[data-testid="pos-bill-tab"]').filter({has:page.locator(`input[value="QA retained ${mode}"]`)}).first().click();
  await expect(page.locator('[data-testid="pos-checkout-btn"]')).toHaveText(/550\.30?$/);
  if(mode==='customer_credit'){
   await page.getByRole('button',{name:'Customer',exact:true}).click();
   await page.getByRole('option',{name:'QA decimal customer',exact:true}).click();
   await page.getByRole('button',{name:'Payment method',exact:true}).click();
   await page.getByRole('option',{name:'Customer credit',exact:true}).click();
  }else await page.locator('[data-testid="pos-amount-tendered-input"]').fill('550.30');
  let posts=0, checkoutPosts=0;page.on('request',r=>{
   if(r.method()==='POST'&&r.headers()['next-action']){
    posts++;
    if(r.postData()?.includes('idempotency_key'))checkoutPosts++;
   }
  });
  await page.locator('[data-testid="pos-note-input"]').fill(`QA decimal checkout ${mode}`);
  await page.locator('[data-testid="pos-checkout-btn"]').click();
  await expect(page.getByText(/Sale recorded as INV-/).first()).toBeVisible({timeout:20000});
  const invoice=await admin().from('invoices').select('id,grand_total,amount_paid,balance_due').eq('organization_id',org).eq('note',`QA decimal checkout ${mode}`).single();checked(invoice.error);
  expect(invoice.data!.grand_total).toBe(550.3);expect(invoice.data!.amount_paid).toBe(mode==='cash'?550.3:0);expect(invoice.data!.balance_due).toBe(mode==='cash'?0:550.3);
  const item=await admin().from('invoice_items').select('unit_price,line_total,service_transaction_amount,service_commission,service_total_charged').eq('invoice_id',invoice.data!.id).single();checked(item.error);
  expect(item.data).toEqual({unit_price:550.3,line_total:550.3,service_transaction_amount:500.1,service_commission:50.2,service_total_charged:550.3});
  for(const table of ['stock_movements','invoice_item_stock_allocations']){
   const count=await admin().from(table).select('id',{count:'exact',head:true}).eq('organization_id',org);checked(count.error);expect(count.count).toBe(0);
  }
  expect(checkoutPosts).toBe(1);expect(posts).toBe(2);expect(errors).toEqual([]);
  observations[mode]={held:held.data,invoice:invoice.data,item:item.data,checkoutPosts,actionPosts:posts,heldCompletionPosts:posts-checkoutPosts,pageErrors:errors};
 });
}

test('customer and supplier amount forms reject sub-paisa without a financial write',async({page})=>{
 test.setTimeout(90000);
 await loginLocalOwnerDirectly(page,email,password);
 const reject=page.getByRole('button',{name:'Reject optional cookies',exact:true});await expect(reject).toBeVisible();await reject.click();
 await expect(page.getByRole('region',{name:'Cookie consent',exact:true})).toHaveCount(0);
 await page.goto(`/customers/${customer}`);
 await page.locator('summary:has-text("Receive Settlement Payment")').click();
 const amount=page.getByRole('spinbutton',{name:'Amount (PKR)',exact:true});
 await amount.fill('0.015');
 await amount.evaluate(input=>{(input.closest('form') as HTMLFormElement).noValidate=true;});
 await page.getByRole('button',{name:'Confirm & Save Settlement',exact:true}).click();
 await expect(page.getByText('Amount must have no more than 2 decimal places.',{exact:true})).toBeVisible();
 const counts=await admin().from('credit_payments').select('id',{count:'exact',head:true}).eq('organization_id',org);checked(counts.error);expect(counts.count).toBe(0);
 await page.goto(`/suppliers/${supplier}/ledger`);
 const write=page.getByRole('button',{name:'Write off balance',exact:true});
 const form=page.locator('form').filter({has:write});
 await form.locator('input[type="number"]').fill('0.015');
 await form.locator('textarea').fill('QA invalid precision');
 await form.evaluate(el=>{(el as HTMLFormElement).noValidate=true;});
 await write.click();
 await expect(page.getByText('Amount must have no more than 2 decimal places.',{exact:true})).toBeVisible();
 const off=await admin().from('supplier_write_offs').select('id',{count:'exact',head:true}).eq('organization_id',org);checked(off.error);expect(off.count).toBe(0);
 observations.validation={customerPayment:'friendly error, no payment',supplierWriteOff:'friendly error, no write-off'};
});
