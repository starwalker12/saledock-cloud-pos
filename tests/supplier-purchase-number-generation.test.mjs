import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const migrationPath =
  "supabase/migrations/20260720135013_fix_supplier_purchase_number_ambiguity.sql";
const migrationSource = readFileSync(migrationPath, "utf8");
const originalMigrationSource = readFileSync(
  "supabase/migrations/0016_supplier_purchases_ledger.sql",
  "utf8",
);
const actionSource = readFileSync(
  "src/app/suppliers/purchases/actions.ts",
  "utf8",
);

const signatureTables = [
  "suppliers",
  "supplier_purchases",
  "supplier_purchase_items",
  "supplier_payments",
  "supplier_ledger_entries",
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoices",
  "invoice_items",
  "invoice_item_stock_allocations",
  "payments",
  "returns",
  "return_items",
  "expenses",
  "cash_shifts",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
];

function functionBody(source) {
  const start = source.indexOf(
    "create or replace function public.create_supplier_purchase",
  );
  const end = source.indexOf(
    "revoke all on function public.create_supplier_purchase",
  );
  assert.ok(start >= 0 && end > start, "function replacement must be present");
  return source.slice(start, end);
}

test("migration qualifies supplier-purchase numbering without changing its public contract", () => {
  const source = functionBody(migrationSource);
  assert.match(
    source,
    /create or replace function public\.create_supplier_purchase\(\s*p_supplier_id uuid,\s*p_branch_id uuid,\s*p_purchase_date date,\s*p_items jsonb,\s*p_discount_total numeric,\s*p_reference_no text,\s*p_notes text,\s*p_payment_method public\.payment_method,\s*p_amount_paid numeric,\s*p_payment_ref text\s*\)/,
  );
  assert.match(source, /returns table\(purchase_id uuid, purchase_no text\)/);
  assert.match(source, /from public\.supplier_purchases sp/);
  assert.match(source, /regexp_replace\(sp\.purchase_no,/);
  assert.match(source, /where sp\.organization_id = v_org_id/);
  assert.doesNotMatch(source, /regexp_replace\(purchase_no,/);
  assert.match(
    source,
    /from public\.organizations o[\s\S]*where o\.id = v_org_id[\s\S]*for update/,
  );
  assert.match(
    source,
    /v_purchase_no := 'PUR-' \|\| lpad\(v_seq::text, 6, '0'\)/,
  );
  assert.doesNotMatch(source, /\bexecute\b|format\s*\(/i);
});

test("migration matches application permissions and retains invoker security", () => {
  const source = functionBody(migrationSource);
  assert.match(source, /security invoker/);
  assert.match(source, /set search_path = public/);
  assert.match(
    source,
    /v_profile\.role not in \('owner', 'admin', 'manager'\)/,
  );
  assert.match(
    source,
    /from public\.branches b[\s\S]*b\.id = v_branch_id[\s\S]*b\.organization_id = v_org_id[\s\S]*b\.is_active = true/,
  );
  assert.match(
    source,
    /from public\.suppliers s[\s\S]*s\.id = p_supplier_id[\s\S]*s\.organization_id = v_org_id[\s\S]*s\.is_active = true[\s\S]*for update/,
  );
  assert.match(
    source,
    /from public\.products p[\s\S]*p\.organization_id = v_org_id[\s\S]*for update/,
  );
  assert.match(source, /v_product\.type <> 'product'/);
  assert.match(source, /v_product\.is_active/);
  assert.match(source, /Discount cannot be negative/);
  assert.match(migrationSource, /revoke all[\s\S]*from public/);
  assert.match(migrationSource, /revoke all[\s\S]*from anon/);
  assert.match(migrationSource, /revoke all[\s\S]*from service_role/);
  assert.match(migrationSource, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(
    migrationSource,
    /grant execute[\s\S]*to authenticated, service_role/,
  );
});

test("migration retains supplier accounting, FIFO, and safe action-error contracts", () => {
  const source = functionBody(migrationSource);
  for (const contract of [
    /v_grand := greatest\(v_subtotal - coalesce\(p_discount_total, 0\), 0\)/,
    /v_balance := greatest\(v_grand - coalesce\(p_amount_paid, 0\), 0\)/,
    /'purchase_credit', 'credit'/,
    /'payment_debit', 'debit'/,
    /movement_type,[\s\S]*'purchase'/,
    /quantity_received, quantity_remaining, unit_cost/,
    /set stock_quantity = p\.stock_quantity \+ v_qty/,
    /return query select v_purchase_id, v_purchase_no/,
  ]) {
    assert.match(source, contract);
  }
  assert.match(
    originalMigrationSource,
    /v_grand := greatest\(v_subtotal - coalesce\(p_discount_total, 0\), 0\)/,
  );
  assert.match(actionSource, /supabase\.rpc\("create_supplier_purchase"/);
  assert.match(
    actionSource,
    /getSafeActionError\(error, "We couldn't save this purchase\. Please try again\."\)/,
  );
  assert.doesNotMatch(
    actionSource,
    /console\.(?:error|log).*create_supplier_purchase/,
  );
});

function localConfig() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{")));
  const url = status.API_URL ?? status.api_url ?? status.apiUrl;
  const anon =
    status.PUBLISHABLE_KEY ??
    status.ANON_KEY ??
    status.anon_key ??
    status.anonKey;
  const service =
    status.SERVICE_ROLE_KEY ?? status.service_role_key ?? status.serviceRoleKey;
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/);
  assert.ok(anon && service, "complete loopback Supabase status is required");
  return { url, anon, service };
}

function clientFor(key) {
  const { url } = localConfig();
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function adminClient() {
  const { service } = localConfig();
  return clientFor(service);
}

async function signedInClient(email) {
  const { anon } = localConfig();
  const client = clientFor(anon);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "Password123!",
  });
  assert.ifError(error);
  assert.ok(data.user);
  return { client, userId: data.user.id };
}

async function readSignatures(admin) {
  const signatures = {};
  for (const table of signatureTables) {
    const { data, error } = await admin.from(table).select("*").limit(10000);
    assert.ifError(error);
    const rows = [...(data ?? [])].map((row) => JSON.stringify(row)).sort();
    signatures[table] = createHash("sha256")
      .update(rows.join("\n"))
      .digest("hex");
  }
  const { error: absentCashMovements } = await admin
    .from("cash_movements")
    .select("*")
    .limit(1);
  assert.ok(
    absentCashMovements,
    "cash_movements is expected to be absent from this schema",
  );
  signatures.cash_movements = "unavailable-in-current-schema";
  return signatures;
}

function runMarker() {
  return `QA-SP-${randomUUID().slice(0, 8)}`;
}

function productArgs(marker, overrides = {}) {
  return {
    p_product_id: randomUUID(),
    p_name: `${marker} product`,
    p_sku: marker.replaceAll("-", ""),
    p_barcode: null,
    p_category_id: null,
    p_supplier_id: null,
    p_product_type: "product",
    p_purchase_price: 100,
    p_sale_price: 150,
    p_opening_stock: 5,
    p_minimum_stock: 1,
    p_allow_sell_at_loss: false,
    p_sell_at_loss_reason: "",
    p_image_path: null,
    p_notes: marker,
    p_is_active: true,
    ...overrides,
  };
}

function purchaseArgs({
  supplierId,
  branchId = null,
  items,
  marker,
  ...overrides
}) {
  return {
    p_supplier_id: supplierId,
    p_branch_id: branchId,
    p_purchase_date: "2026-07-20",
    p_items: items,
    p_discount_total: 0,
    p_reference_no: marker,
    p_notes: marker,
    p_payment_method: null,
    p_amount_paid: 0,
    p_payment_ref: null,
    ...overrides,
  };
}

async function createSupplier(
  admin,
  state,
  organizationId,
  marker,
  overrides = {},
) {
  const id = randomUUID();
  const { error } = await admin.from("suppliers").insert({
    id,
    organization_id: organizationId,
    name: `${marker} supplier`,
    notes: marker,
    ...overrides,
  });
  assert.ifError(error);
  state.supplierIds.push(id);
  return id;
}

async function createProduct(owner, state, marker, overrides = {}) {
  const args = productArgs(marker, overrides);
  const { data, error } = await owner.rpc(
    "create_product_with_opening_stock",
    args,
  );
  assert.ifError(error);
  assert.equal(data?.[0]?.product_id, args.p_product_id);
  state.productIds.push(args.p_product_id);
  return args.p_product_id;
}

async function successfulPurchase(client, state, args) {
  const { data, error } = await client.rpc("create_supplier_purchase", args);
  assert.ifError(error);
  assert.equal(data?.length, 1);
  assert.match(data[0].purchase_no, /^PUR-\d{6,}$/);
  state.purchaseIds.push(data[0].purchase_id);
  return data[0];
}

async function rejectedPurchase(client, args, pattern) {
  const { data, error } = await client.rpc("create_supplier_purchase", args);
  assert.equal(data, null);
  assert.ok(error, "RPC must reject invalid input");
  assert.match(
    `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`,
    pattern,
  );
}

async function purchaseArtifacts(admin, purchaseId) {
  const { data: purchase, error: purchaseError } = await admin
    .from("supplier_purchases")
    .select("*")
    .eq("id", purchaseId)
    .single();
  assert.ifError(purchaseError);
  const queries = await Promise.all([
    admin
      .from("supplier_purchase_items")
      .select("*")
      .eq("purchase_id", purchaseId),
    admin.from("supplier_payments").select("*").eq("purchase_id", purchaseId),
    admin
      .from("supplier_ledger_entries")
      .select("*")
      .eq("purchase_id", purchaseId),
    admin
      .from("product_stock_lots")
      .select("*")
      .eq("lot_number", purchase.purchase_no),
    admin.from("stock_movements").select("*").eq("reference_id", purchaseId),
  ]);
  for (const query of queries) assert.ifError(query.error);
  return {
    purchase,
    items: queries[0].data ?? [],
    payments: queries[1].data ?? [],
    ledger: queries[2].data ?? [],
    lots: queries[3].data ?? [],
    movements: queries[4].data ?? [],
  };
}

async function row(admin, table, id, columns = "*") {
  const { data, error } = await admin
    .from(table)
    .select(columns)
    .eq("id", id)
    .single();
  assert.ifError(error);
  return data;
}

async function assertSingleProductPurchase(admin, result, expected) {
  const artifacts = await purchaseArtifacts(admin, result.purchase_id);
  assert.deepEqual(
    {
      status: artifacts.purchase.status,
      subtotal: Number(artifacts.purchase.subtotal),
      discount: Number(artifacts.purchase.discount_total),
      grand: Number(artifacts.purchase.grand_total),
      paid: Number(artifacts.purchase.amount_paid),
      due: Number(artifacts.purchase.balance_due),
    },
    expected.purchase,
  );
  assert.equal(artifacts.items.length, 1);
  assert.equal(artifacts.lots.length, 1);
  assert.equal(artifacts.movements.length, 1);
  assert.equal(artifacts.movements[0].movement_type, "purchase");
  assert.equal(artifacts.payments.length, expected.paymentCount);
  assert.deepEqual(
    artifacts.ledger
      .map((entry) => [entry.entry_type, entry.direction, Number(entry.amount)])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [...expected.ledger].sort((left, right) => left[0].localeCompare(right[0])),
  );
  const product = await row(
    admin,
    "products",
    expected.productId,
    "stock_quantity",
  );
  const supplier = await row(
    admin,
    "suppliers",
    expected.supplierId,
    "outstanding_balance",
  );
  assert.equal(product.stock_quantity, 5 + expected.quantity);
  assert.equal(Number(supplier.outstanding_balance), expected.outstanding);
  assert.equal(Number(artifacts.lots[0].quantity_received), expected.quantity);
  assert.equal(Number(artifacts.lots[0].quantity_remaining), expected.quantity);
}

async function cleanup(admin, state, marker) {
  const del = async (table, apply) => {
    const query = apply(admin.from(table).delete());
    const { error } = await query;
    assert.ifError(error);
  };
  await del("audit_logs", (query) => query.ilike("details", `%${marker}%`));
  if (state.supplierIds.length > 0) {
    await del("supplier_ledger_entries", (query) =>
      query.in("supplier_id", state.supplierIds),
    );
    await del("supplier_payments", (query) =>
      query.in("supplier_id", state.supplierIds),
    );
  }
  if (state.productIds.length > 0) {
    await del("stock_movements", (query) =>
      query.in("product_id", state.productIds),
    );
  }
  if (state.purchaseIds.length > 0) {
    await del("supplier_purchase_items", (query) =>
      query.in("purchase_id", state.purchaseIds),
    );
    await del("supplier_purchases", (query) =>
      query.in("id", state.purchaseIds),
    );
  }
  if (state.productIds.length > 0) {
    await del("product_stock_lots", (query) =>
      query.in("product_id", state.productIds),
    );
    await del("products", (query) => query.in("id", state.productIds));
  }
  if (state.supplierIds.length > 0) {
    await del("suppliers", (query) => query.in("id", state.supplierIds));
  }
  for (const organizationId of state.foreignOrganizationIds) {
    await del("organizations", (query) => query.eq("id", organizationId));
  }
}

function dbContainer() {
  const name = execFileSync(
    "sh",
    ["-c", "docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1"],
    { encoding: "utf8" },
  ).trim();
  assert.ok(name, "running local Supabase database container is required");
  return name;
}

test(
  "local RPC matrix preserves accounting, FIFO, authorization, numbering, and atomicity",
  { timeout: 180_000 },
  async () => {
    const admin = adminClient();
    const { client: owner, userId: ownerId } = await signedInClient(
      "owner@saledock.local",
    );
    const { client: adminRole } = await signedInClient("admin@saledock.local");
    const { client: manager } = await signedInClient("manager@saledock.local");
    const { client: cashier } = await signedInClient("cashier@saledock.local");
    const { client: technician } = await signedInClient(
      "technician@saledock.local",
    );
    const { anon, service } = localConfig();
    const anonymous = clientFor(anon);
    const serviceRole = clientFor(service);
    const marker = runMarker();
    const state = {
      purchaseIds: [],
      productIds: [],
      supplierIds: [],
      foreignOrganizationIds: [],
    };
    const before = await readSignatures(admin);

    const ownerProfile = await row(
      admin,
      "profiles",
      ownerId,
      "organization_id, branch_id, role, is_active",
    );
    assert.deepEqual(
      { role: ownerProfile.role, active: ownerProfile.is_active },
      { role: "owner", active: true },
    );
    assert.ok(ownerProfile.organization_id && ownerProfile.branch_id);

    try {
      const runSingle = async ({
        label,
        quantity,
        cost,
        discount = 0,
        paid = 0,
        method = null,
      }) => {
        const caseMarker = `${marker}-${label}`;
        const supplierId = await createSupplier(
          admin,
          state,
          ownerProfile.organization_id,
          caseMarker,
        );
        const productId = await createProduct(owner, state, caseMarker);
        const result = await successfulPurchase(
          owner,
          state,
          purchaseArgs({
            supplierId,
            marker: caseMarker,
            items: [
              {
                product_id: productId,
                quantity,
                unit_cost: cost,
                notes: caseMarker,
              },
            ],
            p_discount_total: discount,
            p_amount_paid: paid,
            p_payment_method: method,
            p_payment_ref: paid > 0 ? caseMarker : null,
          }),
        );
        const subtotal = quantity * cost;
        const grand = Math.max(subtotal - discount, 0);
        const due = grand - paid;
        await assertSingleProductPurchase(admin, result, {
          purchase: {
            status: due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
            subtotal,
            discount,
            grand,
            paid,
            due,
          },
          paymentCount: paid > 0 ? 1 : 0,
          ledger:
            paid > 0
              ? [
                  ["purchase_credit", "credit", grand],
                  ["payment_debit", "debit", paid],
                ]
              : [["purchase_credit", "credit", grand]],
          productId,
          supplierId,
          quantity,
          outstanding: due,
        });
        return { result, supplierId, productId };
      };

      await runSingle({ label: "UNPAID", quantity: 3, cost: 100 });
      await runSingle({
        label: "PAID",
        quantity: 2,
        cost: 100,
        paid: 200,
        method: "card",
      });
      await runSingle({
        label: "PARTIAL",
        quantity: 4,
        cost: 100,
        paid: 100,
        method: "card",
      });
      await runSingle({
        label: "DISCOUNT",
        quantity: 3,
        cost: 100,
        discount: 25,
      });

      const multiMarker = `${marker}-MULTI`;
      const multiSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        multiMarker,
      );
      const multiProductA = await createProduct(
        owner,
        state,
        `${multiMarker}-A`,
      );
      const multiProductB = await createProduct(
        owner,
        state,
        `${multiMarker}-B`,
      );
      const multi = await successfulPurchase(
        owner,
        state,
        purchaseArgs({
          supplierId: multiSupplier,
          marker: multiMarker,
          items: [
            {
              product_id: multiProductA,
              quantity: 2,
              unit_cost: 100,
              notes: multiMarker,
            },
            {
              product_id: multiProductB,
              quantity: 3,
              unit_cost: 50,
              notes: multiMarker,
            },
          ],
        }),
      );
      const multiArtifacts = await purchaseArtifacts(admin, multi.purchase_id);
      assert.deepEqual(
        {
          subtotal: Number(multiArtifacts.purchase.subtotal),
          total: Number(multiArtifacts.purchase.grand_total),
          items: multiArtifacts.items.length,
          lots: multiArtifacts.lots.length,
          movements: multiArtifacts.movements.length,
        },
        { subtotal: 350, total: 350, items: 2, lots: 2, movements: 2 },
      );
      assert.equal(
        (await row(admin, "products", multiProductA, "stock_quantity"))
          .stock_quantity,
        7,
      );
      assert.equal(
        (await row(admin, "products", multiProductB, "stock_quantity"))
          .stock_quantity,
        8,
      );

      const roleMarker = `${marker}-ROLES`;
      const roleSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        roleMarker,
      );
      for (const [roleClient, suffix] of [
        [adminRole, "ADMIN"],
        [manager, "MANAGER"],
      ]) {
        const productId = await createProduct(
          owner,
          state,
          `${roleMarker}-${suffix}`,
        );
        await successfulPurchase(
          roleClient,
          state,
          purchaseArgs({
            supplierId: roleSupplier,
            marker: `${roleMarker}-${suffix}`,
            items: [{ product_id: productId, quantity: 1, unit_cost: 10 }],
          }),
        );
      }
      const restrictedProduct = await createProduct(
        owner,
        state,
        `${roleMarker}-RESTRICTED`,
      );
      const restrictedArgs = purchaseArgs({
        supplierId: roleSupplier,
        marker: `${roleMarker}-RESTRICTED`,
        items: [{ product_id: restrictedProduct, quantity: 1, unit_cost: 10 }],
      });
      await rejectedPurchase(cashier, restrictedArgs, /42501|permission/i);
      await rejectedPurchase(technician, restrictedArgs, /42501|permission/i);
      await rejectedPurchase(
        anonymous,
        restrictedArgs,
        /permission|authenticated|401|403/i,
      );
      await rejectedPurchase(
        serviceRole,
        restrictedArgs,
        /permission|401|403/i,
      );

      const invalidMarker = `${marker}-INVALID`;
      const invalidSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        invalidMarker,
      );
      const invalidProduct = await createProduct(owner, state, invalidMarker);
      const validItem = [
        { product_id: invalidProduct, quantity: 1, unit_cost: 100 },
      ];
      const baseInvalid = {
        supplierId: invalidSupplier,
        marker: invalidMarker,
        items: validItem,
      };
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, items: [] }),
        /at least one item/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [{ ...validItem[0], quantity: 0 }],
        }),
        /quantity/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [{ ...validItem[0], quantity: -1 }],
        }),
        /quantity/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [{ ...validItem[0], unit_cost: -1 }],
        }),
        /cost/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, p_discount_total: -1 }),
        /discount/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, p_amount_paid: -1 }),
        /amount paid/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          p_amount_paid: 101,
          p_payment_method: "card",
        }),
        /exceed/i,
      );

      const serviceProduct = await createProduct(
        owner,
        state,
        `${invalidMarker}-SERVICE`,
        {
          p_product_type: "service",
          p_purchase_price: 0,
          p_opening_stock: 0,
          p_minimum_stock: 0,
        },
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [{ product_id: serviceProduct, quantity: 1, unit_cost: 0 }],
        }),
        /non-product/i,
      );
      const inactiveProduct = await createProduct(
        owner,
        state,
        `${invalidMarker}-INACTIVE`,
      );
      assert.ifError(
        (
          await admin
            .from("products")
            .update({ is_active: false })
            .eq("id", inactiveProduct)
        ).error,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [{ product_id: inactiveProduct, quantity: 1, unit_cost: 100 }],
        }),
        /not available/i,
      );
      const inactiveSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        `${invalidMarker}-SUPPLIER`,
        { is_active: false },
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, supplierId: inactiveSupplier }),
        /supplier.*inactive/i,
      );

      const inactiveBranchId = randomUUID();
      assert.ifError(
        (
          await admin.from("branches").insert({
            id: inactiveBranchId,
            organization_id: ownerProfile.organization_id,
            name: `${marker} inactive branch`,
            is_active: false,
          })
        ).error,
      );
      state.branchIds = [inactiveBranchId];
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, branchId: inactiveBranchId }),
        /active branch/i,
      );

      const foreignOrganizationId = randomUUID();
      const foreignBranchId = randomUUID();
      const foreignSupplierId = randomUUID();
      const foreignProductId = randomUUID();
      state.foreignOrganizationIds.push(foreignOrganizationId);
      assert.ifError(
        (
          await admin
            .from("organizations")
            .insert({
              id: foreignOrganizationId,
              name: `${marker} foreign org`,
            })
        ).error,
      );
      assert.ifError(
        (
          await admin
            .from("branches")
            .insert({
              id: foreignBranchId,
              organization_id: foreignOrganizationId,
              name: `${marker} foreign branch`,
            })
        ).error,
      );
      assert.ifError(
        (
          await admin
            .from("suppliers")
            .insert({
              id: foreignSupplierId,
              organization_id: foreignOrganizationId,
              name: `${marker} foreign supplier`,
            })
        ).error,
      );
      assert.ifError(
        (
          await admin.from("products").insert({
            id: foreignProductId,
            organization_id: foreignOrganizationId,
            branch_id: foreignBranchId,
            name: `${marker} foreign product`,
            type: "product",
            purchase_price: 100,
            sale_price: 150,
            stock_quantity: 5,
          })
        ).error,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, supplierId: foreignSupplierId }),
        /supplier/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({ ...baseInvalid, branchId: foreignBranchId }),
        /active branch/i,
      );
      await rejectedPurchase(
        owner,
        purchaseArgs({
          ...baseInvalid,
          items: [
            { product_id: foreignProductId, quantity: 1, unit_cost: 100 },
          ],
        }),
        /catalog/i,
      );

      const numberMarker = `${marker}-NUMBER`;
      const numberSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        numberMarker,
      );
      const numberProducts = [];
      for (let index = 0; index < 3; index += 1) {
        numberProducts.push(
          await createProduct(owner, state, `${numberMarker}-${index}`),
        );
      }
      const { data: existingNumbers, error: existingNumbersError } = await admin
        .from("supplier_purchases")
        .select("purchase_no")
        .eq("organization_id", ownerProfile.organization_id);
      assert.ifError(existingNumbersError);
      const currentMax = Math.max(
        0,
        ...(existingNumbers ?? []).map(
          (entry) => Number(String(entry.purchase_no).replace(/\D/g, "")) || 0,
        ),
      );
      const seededHighest = currentMax + 100;
      const seededPurchaseId = randomUUID();
      state.purchaseIds.push(seededPurchaseId);
      assert.ifError(
        (
          await admin.from("supplier_purchases").insert({
            id: seededPurchaseId,
            organization_id: ownerProfile.organization_id,
            branch_id: ownerProfile.branch_id,
            supplier_id: numberSupplier,
            purchase_no: `PUR-${String(seededHighest).padStart(6, "0")}`,
            status: "paid",
            subtotal: 0,
            discount_total: 0,
            grand_total: 0,
            amount_paid: 0,
            balance_due: 0,
            reference_no: numberMarker,
            created_by: ownerId,
          })
        ).error,
      );
      const foreignHighId = randomUUID();
      assert.ifError(
        (
          await admin.from("supplier_purchases").insert({
            id: foreignHighId,
            organization_id: foreignOrganizationId,
            branch_id: foreignBranchId,
            supplier_id: foreignSupplierId,
            purchase_no: `PUR-${String(seededHighest + 5000).padStart(6, "0")}`,
            status: "paid",
            subtotal: 0,
            discount_total: 0,
            grand_total: 0,
            amount_paid: 0,
            balance_due: 0,
            reference_no: numberMarker,
          })
        ).error,
      );
      const nextNumber = await successfulPurchase(
        owner,
        state,
        purchaseArgs({
          supplierId: numberSupplier,
          marker: `${numberMarker}-NEXT`,
          items: [
            { product_id: numberProducts[0], quantity: 1, unit_cost: 10 },
          ],
        }),
      );
      assert.equal(
        nextNumber.purchase_no,
        `PUR-${String(seededHighest + 1).padStart(6, "0")}`,
      );
      const concurrent = await Promise.all([
        owner.rpc(
          "create_supplier_purchase",
          purchaseArgs({
            supplierId: numberSupplier,
            marker: `${numberMarker}-CON-A`,
            items: [
              { product_id: numberProducts[1], quantity: 1, unit_cost: 10 },
            ],
          }),
        ),
        owner.rpc(
          "create_supplier_purchase",
          purchaseArgs({
            supplierId: numberSupplier,
            marker: `${numberMarker}-CON-B`,
            items: [
              { product_id: numberProducts[2], quantity: 1, unit_cost: 10 },
            ],
          }),
        ),
      ]);
      concurrent.forEach(({ error }) => assert.ifError(error));
      const concurrentRows = concurrent.flatMap(({ data }) => data ?? []);
      concurrentRows.forEach((entry) =>
        state.purchaseIds.push(entry.purchase_id),
      );
      assert.equal(
        new Set(concurrentRows.map((entry) => entry.purchase_no)).size,
        2,
      );
      assert.deepEqual(
        concurrentRows.map((entry) => entry.purchase_no).sort(),
        [seededHighest + 2, seededHighest + 3].map(
          (value) => `PUR-${String(value).padStart(6, "0")}`,
        ),
      );

      const rollbackMarker = `${marker}-ROLLBACK`;
      const rollbackSupplier = await createSupplier(
        admin,
        state,
        ownerProfile.organization_id,
        rollbackMarker,
      );
      const rollbackProduct = await createProduct(owner, state, rollbackMarker);
      const sql = `
      begin;
      create function pg_temp.qa_reject_purchase_lot() returns trigger
      language plpgsql as $$ begin raise exception 'QA forced purchase lot failure'; end $$;
      create trigger qa_reject_purchase_lot
        before insert on public.product_stock_lots
        for each row when (new.product_id = '${rollbackProduct}'::uuid and new.lot_number like 'PUR-%')
        execute function pg_temp.qa_reject_purchase_lot();
      set local role authenticated;
      set local "request.jwt.claim.sub" = '${ownerId}';
      set local "request.jwt.claims" = '{"sub":"${ownerId}","role":"authenticated"}';
      do $$
      begin
        perform * from public.create_supplier_purchase(
          '${rollbackSupplier}'::uuid, '${ownerProfile.branch_id}'::uuid, current_date,
          '[{"product_id":"${rollbackProduct}","quantity":3,"unit_cost":100}]'::jsonb,
          0, '${rollbackMarker}', '${rollbackMarker}', null, 0, null
        );
        raise exception 'RPC unexpectedly succeeded';
      exception when others then
        if sqlerrm <> 'QA forced purchase lot failure' then raise; end if;
      end $$;
      reset role;
      do $$ begin
        if exists (select 1 from public.supplier_purchases where reference_no = '${rollbackMarker}') then
          raise exception 'purchase survived forced failure';
        end if;
        if (select stock_quantity from public.products where id = '${rollbackProduct}'::uuid) <> 5 then
          raise exception 'product stock changed during forced failure';
        end if;
        if (select outstanding_balance from public.suppliers where id = '${rollbackSupplier}'::uuid) <> 0 then
          raise exception 'supplier balance changed during forced failure';
        end if;
      end $$;
      rollback;
    `;
      const rollback = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          dbContainer(),
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8" },
      );
      assert.equal(rollback.status, 0, rollback.stderr);
    } finally {
      if (state.branchIds?.length) {
        for (const branchId of state.branchIds) {
          assert.ifError(
            (await admin.from("branches").delete().eq("id", branchId)).error,
          );
        }
      }
      await cleanup(admin, state, marker);
    }

    assert.deepEqual(await readSignatures(admin), before);
  },
);
