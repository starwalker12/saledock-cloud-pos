import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadMoneyModule } from './helpers/load-money-module.mjs';

const currency = loadMoneyModule('src/lib/currency.ts');
const { formatCurrency } = loadMoneyModule('src/lib/formatters.ts');
const expected = { PKR:'₨', INR:'₹', USD:'$', GBP:'£', EUR:'€', AUD:'A$', CAD:'C$', AED:'\u20C3', SAR:'\u20C1', QAR:'QAR' };

test('one bounded ten-currency registry: names, codes and unambiguous symbols', () => {
  assert.deepEqual(Object.fromEntries(currency.SUPPORTED_CURRENCIES.map(c=>[c.code,c.symbol])), expected);
  assert.equal(new Set(currency.SUPPORTED_CURRENCIES.map(c=>c.code)).size,10);
  for (const {code,name,symbol} of currency.SUPPORTED_CURRENCIES) {
    assert.ok(name.length>3);
    assert.equal(currency.currencySymbol(code),symbol);
    const marker=currency.currencyDisplayMarker(code);
    assert.equal(currency.currencyOptions().find(o=>o.value===code).label, `${name} — ${code}${marker===code?'':` (${marker})`}`);
    assert.equal(currency.isSupportedCurrency(code),true);
  }
  for (const code of ['KWD','JOD','BHD','OMR','JPY','XYZ','']) assert.equal(currency.isSupportedCurrency(code),false);
});
for (const code of Object.keys(expected)) {
  test(`${code} presentation changes only the prefix, including negative/decimal/zero`, () => {
    for (const amount of [1250,1250.02,0,-1250.02,NaN,Infinity]) {
      const safe=Number.isFinite(amount)?amount:0;
      const marker=['AED','SAR'].includes(code)?code:expected[code];
      assert.equal(formatCurrency(amount,code),`${marker} ${safe.toLocaleString('en-PK',{minimumFractionDigits:0,maximumFractionDigits:2})}`);
    }
  });
}
test('legacy fallback is readable, selectable only as existing, never coerced to PKR', () => {
  assert.equal(formatCurrency(1250,'KWD'),'KWD 1,250');
  assert.equal(formatCurrency(1250,'XYZ'),'XYZ 1,250');
  assert.deepEqual(currency.currencyOptions('KWD')[0],{value:'KWD',label:'KWD (existing currency)',disabled:true});
  assert.equal(currency.currencyOptions('PKR').length,10);
});
test('official preferred signs use exact codepoints; portable device-font surfaces use deterministic ISO fallback', () => {
  assert.equal(currency.currencySymbol('AED').codePointAt(0),0x20C3);
  assert.equal(currency.currencySymbol('SAR').codePointAt(0),0x20C1);
  assert.equal(currency.currencySymbol('AED').length,1);
  assert.equal(currency.currencySymbol('SAR').length,1);
  for(const code of ['AED','SAR','QAR']) {
    assert.equal(currency.currencyDisplayMarker(code),code);
    assert.equal(formatCurrency(1250.02,code),`${code} 1,250.02`);
    assert.equal(currency.currencyOptions().find(o=>o.value===code).label,`${currency.SUPPORTED_CURRENCIES.find(c=>c.code===code).name} — ${code}`);
  }
});
test('runtime markers and labels contain no prohibited abbreviations, generic Rial sign or obsolete directional controls', () => {
  const prohibited=['\u062f.\u0625','\u0631.\u0633','\u0631.\u0642','\uFDFC'];
  const strings=[...currency.SUPPORTED_CURRENCIES.map(c=>c.symbol),...currency.currencyOptions().map(o=>o.label),...Object.keys(expected).map(c=>formatCurrency(1250,c))];
  for(const value of strings) {
    for(const marker of prohibited) assert.equal(value.includes(marker),false);
    assert.doesNotMatch(value,/[\u0600-\u06ff\u200e\u2066-\u2069]/);
  }
  assert.doesNotMatch(readFileSync('src/lib/formatters.ts','utf8'),/0600|06ff|200e|2066|00a0/);
});
test('invoice amounts cannot split in shared images; nonfinancial service details still wrap', () => {
  const css=readFileSync('src/app/globals.css','utf8');
  assert.match(css,/\.customer-invoice :is\(\.invoice-summary dd, \.invoice-payments dd, \.invoice-balance-due dd, \.invoice-service-money\) \{ white-space: nowrap; \}/);
  const invoice=readFileSync('src/app/invoices/[id]/invoice-document.tsx','utf8');
  assert.match(invoice,/label === "Principal" \|\| label === "Commission" \? "invoice-service-money" : undefined/);
});
test('timezone defaults remain supported, including legacy Kolkata alias', () => {
  const cases={'Asia/Karachi':'PKR','Asia/Kolkata':'INR','Asia/Calcutta':'INR','Asia/Dubai':'AED','Asia/Riyadh':'SAR','Asia/Qatar':'QAR','Europe/London':'GBP','Europe/Paris':'EUR','America/New_York':'USD','America/Los_Angeles':'USD','Australia/Sydney':'AUD','America/Toronto':'CAD','Asia/Kuwait':'PKR','Asia/Dhaka':'PKR'};
  for(const [zone,code] of Object.entries(cases))assert.equal(currency.currencyForTimezone(zone),code);
});
test('Settings and onboarding consume shared options; new unsupported choices fail server validation', () => {
  const settings=readFileSync('src/app/settings/settings-form.tsx','utf8');
  assert.match(settings,/options=\{currencyOptions\(settings.currencyCode\)\}/);
  assert.match(settings,/disabled=\{!canEdit \|\| regPending \|\| settings.currencyLocked\}/);
  assert.doesNotMatch(settings,/<input name="currencyCode"/);
  const wizard=readFileSync('src/app/onboarding/onboarding-wizard.tsx','utf8');
  assert.match(wizard,/const CURRENCY_OPTIONS = currencyOptions\(\)/);
  assert.doesNotMatch(wizard,/const CURRENCIES =/);
  const onboarding=loadMoneyModule('src/app/onboarding/actions.ts',{
    'next/navigation':{},'next/cache':{},'@/lib/supabase/server':{},'@/lib/auth/session':{},
    '@/lib/onboarding/draft':{},'@/lib/onboarding/finalize':{},'@/lib/onboarding/finalize-error':{},
  },'\nexport { onboardingSchema };');
  const schema=onboarding.onboardingSchema.shape.currencyCode;
  for(const code of Object.keys(expected)) assert.equal(schema.safeParse(code).success,true);
  for(const code of ['KWD','BHD','JOD','XYZ']) {
    const result=schema.safeParse(code);assert.equal(result.success,false);assert.equal(result.error.issues[0].message,currency.UNSUPPORTED_CURRENCY_MESSAGE);
  }
});

test('Settings Action: authorization, supported changes, legacy no-op, lock preflight and DB race error',async()=>{
  let permitted=true,current={currency_code:'PKR',currency_locked_at:null},updates=[],dbError=null;
  const db={from(table){return {select(){return this;},eq(){return this;},single:async()=>({data:current,error:null}),update(value){updates.push({table,value});return {eq:async()=>({error:dbError})};},returns:async()=>({data:[],error:null})};}};
  const actions=loadMoneyModule('src/app/settings/actions.ts',{
    'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>db},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/auth/session':{getCurrentContext:async()=>({user:{id:'owner'},profile:{role:'owner',organization_id:'shop',branch_id:null}})},
    '@/lib/staff-permissions':{canChangeSettingsNew:async()=>permitted},'@/lib/audit':{logAudit(){}},
  });
  const save=async code=>{const f=new FormData();for(const [k,v] of Object.entries({intent:'regional',currencyCode:code,timezone:'Asia/Karachi',lowStockDefaultThreshold:'5'}))f.set(k,v);return actions.updateSettingsAction({},f);};
  permitted=false;assert.match((await save('USD')).error,/Only owners and admins/);assert.equal(updates.length,0);permitted=true;
  assert.equal((await save('USD')).success,'Regional settings saved.');assert.deepEqual(updates.at(-1),{table:'organizations',value:{currency_code:'USD',timezone:'Asia/Karachi'}});
  current={currency_code:'USD',currency_locked_at:null};assert.equal((await save('EUR')).error,null);
  updates=[];assert.equal((await save('KWD')).error,currency.UNSUPPORTED_CURRENCY_MESSAGE);assert.equal(updates.length,0);
  current={currency_code:'KWD',currency_locked_at:null};assert.equal((await save('KWD')).error,null);
  current={currency_code:'PKR',currency_locked_at:'2026-10-11T00:00:00Z'};updates=[];
  assert.equal((await save('USD')).error,currency.CURRENCY_LOCK_MESSAGE);assert.equal(updates.length,0);
  current={currency_code:'PKR',currency_locked_at:null};dbError={code:'P0001',message:currency.CURRENCY_LOCK_MESSAGE};
  assert.equal((await save('USD')).error,currency.CURRENCY_LOCK_MESSAGE);
});

test('migration only adds safety metadata and private triggers, never edits financial writer bodies or money',()=>{
  const m=readFileSync('supabase/migrations/20261010221542_lock_shop_currency_after_financial_activity.sql','utf8');
  assert.match(m,/add column currency_locked_at timestamptz/);
  assert.match(m,/in access exclusive mode nowait/);
  assert.match(m,/referencing new table as financial_rows/);
  assert.doesNotMatch(m,/create or replace|round\(|alter.*numeric|set outstanding_balance|set source_trust_version|set posting_sequence/i);
});
