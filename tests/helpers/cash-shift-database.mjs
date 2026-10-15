import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const container = process.env.LOCAL_SUPABASE_DB_CONTAINER;
export function sql(query) {
  assert.match(
    container ?? "",
    /^supabase_db_qa[0-9]+-[a-z0-9-]+$/,
    "Task-isolated local DB required",
  );
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-XqAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: query, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
export const lastJSON = (text) =>
  JSON.parse(
    text
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .at(-1),
  );

export class Session {
  constructor() {
    assert.match(container ?? "", /^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
    this.output = "";
    this.pending = null;
    this.process = spawn("docker", [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      "exec psql -XqAt -U postgres -d postgres -v ON_ERROR_STOP=0 2>&1",
    ]);
    this.process.stdout.on("data", (data) => {
      this.output += data.toString();
      this.check();
    });
    this.exited = new Promise((resolve) => this.process.on("exit", resolve));
  }
  static async create() {
    const session = new Session();
    session.pid = Number((await session.ok("select pg_backend_pid();")).text);
    assert(Number.isSafeInteger(session.pid) && session.pid > 0);
    return session;
  }
  check() {
    if (!this.pending) return;
    const start = this.output.indexOf(this.pending.marker + " ");
    const end = start < 0 ? -1 : this.output.indexOf("\n", start);
    if (end < 0) return;
    const p = this.pending;
    this.pending = null;
    clearTimeout(p.timer);
    const text = this.output.slice(0, start).trim();
    const state = this.output.slice(start + p.marker.length + 1, end).trim();
    this.output = this.output.slice(end + 1);
    p.resolve({ state, text, ms: performance.now() - p.started });
  }
  run(query) {
    assert.equal(this.pending, null);
    return new Promise((resolve, reject) => {
      const marker = "CASH_END_" + randomUUID().replaceAll("-", "");
      const timer = setTimeout(
        () => reject(new Error("Independent PostgreSQL session timed out")),
        30000,
      );
      this.pending = { resolve, marker, timer, started: performance.now() };
      const statement = query.trimEnd().endsWith(";") ? query : query + ";";
      this.process.stdin.write(
        statement + "\n\\echo " + marker + " :SQLSTATE\n",
      );
    });
  }
  async ok(query) {
    const r = await this.run(query);
    assert.equal(r.state, "00000", r.text);
    assert(!/(^|\n)ERROR:/.test(r.text), r.text);
    return r;
  }
  async close() {
    if (this.pending) {
      sql("select pg_terminate_backend(" + this.pid + ");");
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
    this.process.stdin.end("rollback;\n\\q\n");
    await this.exited;
  }
}

export async function observeBlocked(waiter, blocker) {
  const blockerPids = (Array.isArray(blocker) ? blocker : [blocker]).map(
    (session) => session.pid,
  );
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const observation = lastJSON(
      sql(
        "select jsonb_build_object('pid'," +
          waiter.pid +
          ",'blockers',pg_blocking_pids(" +
          waiter.pid +
          "),'wait', (select wait_event_type from pg_stat_activity where pid=" +
          waiter.pid +
          "))",
      ),
    );
    if (observation.blockers.some((pid) => blockerPids.includes(pid)))
      return observation;
    await delay(20); // Poll an actual wait edge; not a guessed synchronization sleep.
  }
  throw new Error("Expected PostgreSQL lock wait was not observed");
}

export function fixture() {
  const f = Object.fromEntries(
    [
      "org",
      "branch",
      "actor",
      "customer",
      "product",
      "openKey",
      "closeKey",
    ].map((k) => [k, randomUUID()]),
  );
  f.auth =
    "set local request.jwt.claim.sub='" +
    f.actor +
    "';set local request.jwt.claim.role='authenticated';set local role authenticated;";
  f.sale = (method = "cash", paid = 100, key = randomUUID()) =>
    "select * from public.pos_checkout('" +
    f.branch +
    "','" +
    f.customer +
    '\',\'[{"product_id":"' +
    f.product +
    '","quantity":1,"unit_price":100,"discount":0}]\',0,\'' +
    method +
    "'," +
    paid +
    ",null,null,false,'" +
    key +
    "');";
  f.open = () => "select public.open_cash_shift('" + f.openKey + "','0',null);";
  f.close = (counted = "100", key = f.closeKey, notes = "null") =>
    "select public.close_cash_shift('" +
    f.shift +
    "','" +
    key +
    "','" +
    counted +
    "'," +
    notes +
    ");";
  return f;
}

export function seed(f) {
  sql(
    "begin;insert into public.organizations(id,name) values('" +
      f.org +
      "','QA atomic cash shift');" +
      "insert into public.branches(id,organization_id,name) values('" +
      f.branch +
      "','" +
      f.org +
      "','Synthetic branch');" +
      "insert into auth.users(id) values('" +
      f.actor +
      "');" +
      "insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('" +
      f.actor +
      "','" +
      f.org +
      "','" +
      f.branch +
      "','Synthetic owner','owner',true);" +
      "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('" +
      f.customer +
      "','" +
      f.org +
      "','" +
      f.branch +
      "','Synthetic customer',1000);" +
      "insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('" +
      f.product +
      "','" +
      f.org +
      "','Synthetic product','product',100,30,20000,true);" +
      "insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date) values('" +
      f.org +
      "','" +
      f.branch +
      "','" +
      f.product +
      "',20000,20000,30,current_date);commit;",
  );
}
export function open(f) {
  f.shift = lastJSON(sql("begin;" + f.auth + f.open() + "commit;")).id;
}
export function read(f) {
  return lastJSON(
    sql(
      "select jsonb_build_object('shift',(select to_jsonb(s) from public.cash_shifts s where id='" +
        f.shift +
        "'),'invoices',(select jsonb_agg(to_jsonb(i)) from public.invoices i where organization_id='" +
        f.org +
        "'),'audits',(select count(*) from public.audit_logs where organization_id='" +
        f.org +
        "' and action='cash_shift.closed'));",
    ),
  );
}
export function cleanup(f) {
  sql(
    "begin;" +
      f.auth +
      "select public.reset_organization_to_factory_defaults('" +
      f.org +
      "','" +
      f.actor +
      "',false);reset role;" +
      "delete from public.profiles where organization_id='" +
      f.org +
      "';delete from public.branches where organization_id='" +
      f.org +
      "';delete from public.organizations where id='" +
      f.org +
      "';delete from auth.users where id='" +
      f.actor +
      "';commit;",
  );
}
