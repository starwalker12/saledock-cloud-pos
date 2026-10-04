import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { getLocalAdminClient, getLocalAuthConfig, isLocalPlaywrightRun } from "./local-supabase";

export function checked(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function createDiscountPrintFixture() {
  if (!isLocalPlaywrightRun()) throw new Error("Isolated local QA only");
  const admin = getLocalAdminClient();
  const { url } = getLocalAuthConfig();
  // Auth administration is only for synthetic local fixture setup, never app routing.
  const raw = execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  if (!status || status.API_URL !== url || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Task-local fixture auth configuration required");
  }
  const authAdmin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const org = randomUUID(), branch = randomUUID(), product = randomUUID(), service = randomUUID();
  const email = `discount-print-${org}@saledock.local`, password = randomUUID();
  let userId: string | undefined;
  async function cleanup() {
    checked((await admin.from("organizations").delete().eq("id", org)).error);
    if (userId) checked((await authAdmin.auth.admin.deleteUser(userId)).error);
    const result = await admin.from("organizations").select("id", { count: "exact", head: true }).eq("id", org);
    checked(result.error);
    if (result.count !== 0) throw new Error("Task-created organization remains");
  }
  try {
  checked((await admin.from("organizations").insert({ id: org, name: "Synthetic QA36149 shop", onboarding_completed: true })).error);
  checked((await admin.from("branches").insert({ id: branch, organization_id: org, name: "Synthetic branch" })).error);
  const user = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  checked(user.error);
  if (!user.data.user) throw new Error("Synthetic user missing");
  userId = user.data.user.id;
  checked((await admin.from("profiles").insert({ id: user.data.user.id, organization_id: org, branch_id: branch, role: "owner", is_active: true, full_name: "Synthetic Owner", onboarding_completed: true })).error);
  checked((await admin.from("products").insert([
    { id: product, organization_id: org, branch_id: branch, name: "Synthetic 999 physical", type: "product", sale_price: 999, purchase_price: 100, stock_quantity: 100, default_commission_amount: 0, is_active: true },
    { id: service, organization_id: org, branch_id: branch, name: "Synthetic zero service", type: "service", sale_price: 0, purchase_price: 0, stock_quantity: 0, default_commission_amount: 0, is_active: true },
  ])).error);
  checked((await admin.from("product_stock_lots").insert({ organization_id: org, branch_id: branch, product_id: product, quantity_received: 100, quantity_remaining: 100, unit_cost: 100, purchase_date: "2026-01-01", is_active: true })).error);
  return {
    admin, org, branch, product, service, email, password,
    cleanup,
  };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
