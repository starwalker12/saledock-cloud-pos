import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export function returnSql(query: string): string {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER;
  if (!/^supabase_db_qa[0-9]+-[a-z0-9-]+$/.test(container ?? "")) throw new Error("Task-local database required");
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export async function returnFixture({ paid = 400, quantity = 5, price = 200, cost = 120, lines = 1,
  lots = null as Array<{ quantity: number; cost: number }> | null } = {}) {
  const raw = execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const config = JSON.parse(raw.slice(raw.indexOf("{")));
  if (config.API_URL !== process.env.NEXT_PUBLIC_SUPABASE_URL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(config.API_URL)) throw new Error("Only explicit local API allowed");
  const org = randomUUID(), branch = randomUUID(), customer = randomUUID(), product = randomUUID();
  const email = `return-v1-${org}@saledock.local`, password = randomUUID();
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user) throw new Error("Local synthetic user creation failed");
  const actor = user.data.user.id;
  const stock = lots ? lots.reduce((sum, lot) => sum + lot.quantity, 0) : Math.max(10, lines);
  const cart = Array.from({ length: lines }, () => ({ product_id: product, quantity: lines > 1 ? 1 : quantity, unit_price: price, discount: 0 }));
  const auth = `set local request.jwt.claim.sub='${actor}';set local request.jwt.claim.role='authenticated';set local role authenticated;`;
  returnSql(`begin;
    insert into public.organizations(id,name,onboarding_completed)values('${org}','Synthetic Return Workshop',true);
    insert into public.branches(id,organization_id,name)values('${branch}','${org}','Synthetic branch');
    insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active,onboarding_completed)values('${actor}','${org}','${branch}','Synthetic Owner','owner',true,true);
    insert into public.customers(id,organization_id,branch_id,name,outstanding_balance)values('${customer}','${org}','${branch}','Synthetic customer',0);
    insert into public.products(id,organization_id,branch_id,name,type,sale_price,purchase_price,stock_quantity,is_active)values('${product}','${org}','${branch}','Synthetic product','product',${price},${cost},${stock},true);
    ${(lots ?? [{ quantity: stock, cost }]).map((lot, index) => `insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date)values('${org}','${branch}','${product}',${lot.quantity},${lot.quantity},${lot.cost},current_date-${lots ? lots.length - index : 0});`).join("\n")}
    ${auth}select public.pos_checkout('${branch}','${customer}','${JSON.stringify(cart)}',0,'${paid === 0 ? "customer_credit" : "cash"}',${paid},null,null,false,'${randomUUID()}');commit;`);
  const invoice = returnSql(`select id from public.invoices where organization_id='${org}'`);
  const login = await owner.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error("Synthetic local authentication failed");
  const state = () => JSON.parse(returnSql(`select jsonb_build_object(
    'returns',(select count(*)from public.returns where organization_id='${org}'),
    'credit',(select coalesce(sum(subtotal),0)from public.returns where organization_id='${org}'),
    'debt',(select coalesce(sum(debt_relief),0)from public.returns where organization_id='${org}'),
    'refund',(select coalesce(sum(refund_amount),0)from public.returns where organization_id='${org}'),
    'stock',(select stock_quantity from public.products where id='${product}'),
    'consumed',(select coalesce(sum(quantity),0)from public.return_item_source_allocations where organization_id='${org}'),
    'restocked',(select coalesce(sum(restock_quantity),0)from public.return_item_source_allocations where organization_id='${org}'),
    'balance',(select outstanding_balance from public.customers where id='${customer}'),
    'audit',(select count(*)from public.audit_logs where organization_id='${org}' and action='return.completed'))`));
  const cleanup = async () => {
    returnSql(`begin;${auth}select public.reset_organization_to_factory_defaults('${org}','${actor}',false);reset role;
      delete from public.profiles where id='${actor}';delete from public.branches where organization_id='${org}';delete from public.organizations where id='${org}';commit;`);
    const deleted = await admin.auth.admin.deleteUser(actor);
    if (deleted.error) throw new Error("Synthetic authentication cleanup failed");
    if (returnSql(`select count(*)from public.returns where organization_id='${org}'`) !== "0") throw new Error("Return fixture residue");
  };
  return { org, branch, customer, product, actor, email, password, invoice, owner, state, cleanup };
}
