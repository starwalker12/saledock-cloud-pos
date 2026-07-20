import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const actionSource = readFileSync("src/app/products/actions.ts", "utf8");
const formSource = readFileSync("src/app/products/product-form.tsx", "utf8");
const migrationPath = execFileSync(
  "sh",
  ["-c", "printf '%s' supabase/migrations/*_product_opening_stock_fifo_atomicity.sql"],
  { encoding: "utf8" },
);
const migrationSource = readFileSync(migrationPath, "utf8");

function productActionSection() {
  return actionSource.slice(
    actionSource.indexOf("export async function saveProductAction"),
    actionSource.indexOf("export async function archiveProductAction"),
  );
}

test("new products use one atomic RPC and retain existing post-save contracts", () => {
  const source = productActionSection();
  assert.match(source, /supabase\.rpc\("create_product_with_opening_stock"/);
  assert.doesNotMatch(source, /supabase\.from\("products"\)\.insert/);
  assert.doesNotMatch(source, /add_stock_lot/);
  assert.match(source, /p_opening_stock: isService \? 0 : parsed\.data\.stock_quantity/);
  assert.match(source, /await removeProductImage\(supabase, imagePath\)/);
  assert.match(source, /revalidatePath\("\/products"\)/);
  assert.match(source, /revalidatePath\("\/pos"\)/);
  assert.match(source, /revalidatePath\("\/dashboard"\)/);
  assert.equal((source.match(/action: id \? "product\.updated" : "product\.created"/g) ?? []).length, 1);
  assert.match(source, /canManageLossOverride/);
});

test("metadata edits preserve stored stock and guard unsafe type conversion", () => {
  const source = productActionSection();
  const payloadSource = source.slice(source.indexOf("const payload ="), source.indexOf("if (id)"));
  assert.doesNotMatch(payloadSource, /stock_quantity:/);
  assert.match(source, /oldProduct\.stock_quantity !== 0/);
  assert.match(source, /product_stock_lots/);
  assert.match(source, /stock_movements/);
  assert.match(source, /cannot be converted to services/);
});

test("product form distinguishes opening stock from read-only existing stock", () => {
  assert.match(formSource, />Opening stock</);
  assert.match(formSource, />Current stock</);
  assert.match(formSource, /data-testid="product-current-stock"/);
  assert.match(formSource, /use Inventory Restock or Stock Adjustment/);
  const stockInput = formSource.match(/<input[\s\S]*?name="stock_quantity"[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(stockInput, /defaultValue=\{0\}/);
  assert.match(formSource, /initialValues\?\.id \?/);
});

test("migration defines a scoped invoker RPC with exact opening artifacts", () => {
  assert.match(migrationSource, /create function public\.create_product_with_opening_stock/);
  assert.match(migrationSource, /security invoker/);
  assert.match(migrationSource, /set search_path = public/);
  assert.match(migrationSource, /v_profile\.role not in \('owner', 'admin', 'manager'\)/);
  assert.match(migrationSource, /organization_id = v_profile\.organization_id/);
  assert.match(migrationSource, /and is_active = true/);
  assert.match(migrationSource, /movement_type[\s\S]*'opening_stock'/);
  assert.match(migrationSource, /quantity_received[\s\S]*p_opening_stock/);
  assert.match(migrationSource, /quantity_remaining[\s\S]*p_opening_stock/);
  assert.match(migrationSource, /grant execute[\s\S]*to authenticated/);
  assert.match(migrationSource, /revoke all[\s\S]*from public/);
  assert.match(migrationSource, /revoke all[\s\S]*from anon/);
  assert.match(migrationSource, /revoke all[\s\S]*from service_role/);
  assert.doesNotMatch(migrationSource, /create trigger|update public\.products|delete from|drop table|drop column/i);
});

function localStatus() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.slice(output.indexOf("{")));
}

function localConfig() {
  const status = localStatus();
  const url = status.API_URL ?? status.api_url ?? status.apiUrl;
  const anon = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? status.anon_key ?? status.anonKey;
  const service =
    status.SERVICE_ROLE_KEY ?? status.service_role_key ?? status.serviceRoleKey;
  const dbUrl = status.DB_URL ?? status.db_url ?? status.dbUrl;
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/);
  assert.ok(anon && service && dbUrl, "complete local Supabase status is required");
  return { url, anon, service, dbUrl };
}

async function signedInClient(email) {
  const { url, anon } = localConfig();
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "Password123!",
  });
  assert.ifError(error);
  assert.ok(data.user);
  return { client, userId: data.user.id };
}

function adminClient() {
  const { url, service } = localConfig();
  return createClient(url, service, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function rpcArgs(overrides = {}) {
  const marker = `QA-RPC-${crypto.randomUUID().slice(0, 8)}`;
  return {
    p_product_id: crypto.randomUUID(),
    p_name: marker,
    p_sku: marker.replaceAll("-", ""),
    p_barcode: null,
    p_category_id: null,
    p_supplier_id: null,
    p_product_type: "product",
    p_purchase_price: 100,
    p_sale_price: 150,
    p_opening_stock: 10,
    p_minimum_stock: 3,
    p_allow_sell_at_loss: false,
    p_sell_at_loss_reason: "",
    p_image_path: null,
    p_notes: "Local atomic opening stock test",
    p_is_active: true,
    ...overrides,
  };
}

async function cleanupProducts(admin, ids) {
  if (ids.length === 0) return;
  const { error } = await admin.from("products").delete().in("id", ids);
  assert.ifError(error);
}

test("local RPC preserves product/FIFO invariants and rejects unsafe callers", async () => {
  const admin = adminClient();
  const { client: owner } = await signedInClient("owner@saledock.local");
  const { client: cashier } = await signedInClient("cashier@saledock.local");
  const { client: manager } = await signedInClient("manager@saledock.local");
  const createdIds = [];
  const foreignOrgId = crypto.randomUUID();
  const foreignBranchId = crypto.randomUUID();
  const foreignCategoryId = crypto.randomUUID();
  const foreignSupplierId = crypto.randomUUID();
  let managerBranchId = null;

  try {
    const physical = rpcArgs();
    const { data: physicalResult, error: physicalError } = await owner.rpc(
      "create_product_with_opening_stock",
      physical,
    );
    assert.ifError(physicalError);
    createdIds.push(physical.p_product_id);
    assert.equal(physicalResult?.[0]?.product_id, physical.p_product_id);
    assert.ok(physicalResult?.[0]?.opening_lot_id);
    assert.ok(physicalResult?.[0]?.opening_movement_id);

    const { data: product } = await admin
      .from("products")
      .select("stock_quantity, purchase_price, branch_id")
      .eq("id", physical.p_product_id)
      .single();
    const { data: lots } = await admin
      .from("product_stock_lots")
      .select("quantity_received, quantity_remaining, unit_cost, branch_id, supplier_id")
      .eq("product_id", physical.p_product_id);
    const { data: movements } = await admin
      .from("stock_movements")
      .select("movement_type, quantity, unit_cost, branch_id, stock_lot_id, reference_id")
      .eq("product_id", physical.p_product_id);
    assert.equal(product?.stock_quantity, 10);
    assert.equal(Number(product?.purchase_price), 100);
    assert.equal(lots?.length, 1);
    assert.deepEqual(
      {
        received: lots?.[0]?.quantity_received,
        remaining: lots?.[0]?.quantity_remaining,
        cost: Number(lots?.[0]?.unit_cost),
        branch: lots?.[0]?.branch_id,
      },
      { received: 10, remaining: 10, cost: 100, branch: product?.branch_id },
    );
    assert.equal(movements?.length, 1);
    assert.deepEqual(
      {
        type: movements?.[0]?.movement_type,
        quantity: movements?.[0]?.quantity,
        cost: Number(movements?.[0]?.unit_cost),
        branch: movements?.[0]?.branch_id,
        reference: movements?.[0]?.reference_id,
      },
      {
        type: "opening_stock",
        quantity: 10,
        cost: 100,
        branch: product?.branch_id,
        reference: physical.p_product_id,
      },
    );

    const zero = rpcArgs({ p_opening_stock: 0 });
    const { data: zeroResult, error: zeroError } = await owner.rpc(
      "create_product_with_opening_stock",
      zero,
    );
    assert.ifError(zeroError);
    createdIds.push(zero.p_product_id);
    assert.equal(zeroResult?.[0]?.opening_lot_id, null);
    assert.equal(zeroResult?.[0]?.opening_movement_id, null);

    const service = rpcArgs({
      p_product_type: "service",
      p_purchase_price: 0,
      p_opening_stock: 0,
      p_minimum_stock: 0,
    });
    const { error: serviceError } = await owner.rpc(
      "create_product_with_opening_stock",
      service,
    );
    assert.ifError(serviceError);
    createdIds.push(service.p_product_id);
    const { data: serviceRow } = await admin
      .from("products")
      .select("stock_quantity, type")
      .eq("id", service.p_product_id)
      .single();
    assert.deepEqual(serviceRow, { stock_quantity: 0, type: "service" });

    const managerProduct = rpcArgs({ p_opening_stock: 0 });
    const { error: managerProductError } = await manager.rpc(
      "create_product_with_opening_stock",
      managerProduct,
    );
    assert.ifError(managerProductError);
    createdIds.push(managerProduct.p_product_id);

    const rejectedService = rpcArgs({
      p_product_type: "service",
      p_purchase_price: 0,
      p_opening_stock: 1,
      p_minimum_stock: 0,
    });
    const { error: rejectedServiceError } = await owner.rpc(
      "create_product_with_opening_stock",
      rejectedService,
    );
    assert.match(rejectedServiceError?.message ?? "", /cannot have opening stock/i);

    const unauthorized = rpcArgs();
    const { error: unauthorizedError } = await cashier.rpc(
      "create_product_with_opening_stock",
      unauthorized,
    );
    assert.match(unauthorizedError?.message ?? "", /permission/i);

    await admin.from("organizations").insert({ id: foreignOrgId, name: "QA foreign org" });
    await admin.from("branches").insert({
      id: foreignBranchId,
      organization_id: foreignOrgId,
      name: "QA foreign branch",
      is_active: true,
    });
    await admin.from("product_categories").insert({
      id: foreignCategoryId,
      organization_id: foreignOrgId,
      name: "QA foreign category",
    });
    await admin.from("suppliers").insert({
      id: foreignSupplierId,
      organization_id: foreignOrgId,
      name: "QA foreign supplier",
    });

    const foreignCategory = rpcArgs({ p_category_id: foreignCategoryId });
    const { error: foreignCategoryError } = await owner.rpc(
      "create_product_with_opening_stock",
      foreignCategory,
    );
    assert.match(foreignCategoryError?.message ?? "", /category.*organization/i);
    const foreignSupplier = rpcArgs({ p_supplier_id: foreignSupplierId });
    const { error: foreignSupplierError } = await owner.rpc(
      "create_product_with_opening_stock",
      foreignSupplier,
    );
    assert.match(foreignSupplierError?.message ?? "", /supplier.*organization/i);

    const { data: managerProfile } = await admin
      .from("profiles")
      .select("id, branch_id")
      .eq("username", "demo-manager")
      .single();
    assert.ok(managerProfile);
    managerBranchId = managerProfile.branch_id;
    await admin.from("profiles").update({ branch_id: foreignBranchId }).eq("id", managerProfile.id);
    const foreignBranch = rpcArgs();
    const { error: foreignBranchError } = await manager.rpc(
      "create_product_with_opening_stock",
      foreignBranch,
    );
    assert.match(foreignBranchError?.message ?? "", /active branch/i);
    await admin.from("profiles").update({ branch_id: managerBranchId }).eq("id", managerProfile.id);
    managerBranchId = null;

    const duplicateOne = rpcArgs({ p_barcode: `QA${Date.now()}` });
    const { error: duplicateOneError } = await owner.rpc(
      "create_product_with_opening_stock",
      duplicateOne,
    );
    assert.ifError(duplicateOneError);
    createdIds.push(duplicateOne.p_product_id);
    const duplicateTwo = rpcArgs({ p_barcode: duplicateOne.p_barcode });
    const { error: duplicateTwoError } = await owner.rpc(
      "create_product_with_opening_stock",
      duplicateTwo,
    );
    assert.match(duplicateTwoError?.message ?? "", /barcode/i);
  } finally {
    if (managerBranchId) {
      const { data: managerProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("username", "demo-manager")
        .single();
      if (managerProfile) {
        await admin.from("profiles").update({ branch_id: managerBranchId }).eq("id", managerProfile.id);
      }
    }
    await cleanupProducts(admin, createdIds);
    await admin.from("organizations").delete().eq("id", foreignOrgId);
  }
});

test("a forced opening-movement failure rolls back the product and lot", () => {
  localConfig();
  const admin = adminClient();
  const marker = `QA-ROLLBACK-${crypto.randomUUID().slice(0, 8)}`;
  const productId = crypto.randomUUID();
  const dbContainer = execFileSync(
    "sh",
    ["-c", "docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1"],
    { encoding: "utf8" },
  ).trim();
  assert.ok(dbContainer, "running local Supabase Postgres container is required");

  return signedInClient("owner@saledock.local").then(async ({ userId }) => {
    const sql = `
      begin;
      create function pg_temp.qa_reject_opening_movement() returns trigger
      language plpgsql as $$ begin raise exception 'QA forced opening movement failure'; end $$;
      create trigger qa_reject_opening_movement
        before insert on public.stock_movements
        for each row when (new.movement_type = 'opening_stock')
        execute function pg_temp.qa_reject_opening_movement();
      set local role authenticated;
      set local "request.jwt.claim.sub" = '${userId}';
      set local "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
      do $$
      begin
        perform * from public.create_product_with_opening_stock(
          '${productId}'::uuid, '${marker}', null, null, null, null, 'product',
          100, 150, 10, 3, false, '', null, 'rollback proof', true
        );
        raise exception 'RPC unexpectedly succeeded';
      exception when others then
        if sqlerrm <> 'QA forced opening movement failure' then raise; end if;
      end $$;
      reset role;
      do $$ begin
        if exists (select 1 from public.products where id = '${productId}'::uuid) then
          raise exception 'product survived forced opening failure';
        end if;
        if exists (select 1 from public.product_stock_lots where product_id = '${productId}'::uuid) then
          raise exception 'lot survived forced opening failure';
        end if;
      end $$;
      rollback;
    `;
    const result = spawnSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"],
      {
      input: sql,
      encoding: "utf8",
      },
    );
    const failureText = `${result.error?.message ?? ""}\n${result.stderr ?? ""}`.replaceAll(
      userId,
      "[local-user]",
    );
    assert.equal(result.status, 0, failureText);
    const { data, error } = await admin.from("products").select("id").eq("id", productId);
    assert.ifError(error);
    assert.equal(data?.length, 0);
  });
});
