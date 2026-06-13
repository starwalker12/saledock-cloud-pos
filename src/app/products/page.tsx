import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, Tag, Truck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/auth/session";
import {
  catalogCounts,
  listCategoriesWithCounts,
  listProducts,
  listSuppliers,
  type CategoryRow,
  type ProductRow,
  type SupplierRow,
} from "@/lib/data/catalog";
import { canWriteCatalog, canManageLossOverride } from "@/lib/permissions";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  archiveCategoryAction,
  archiveProductAction,
  archiveSupplierAction,
  unarchiveCategoryAction,
  unarchiveProductAction,
  unarchiveSupplierAction,
} from "./actions";
import { CategoryForm } from "./category-form";
import { ProductForm } from "./product-form";
import { SupplierForm } from "./supplier-form";
import { InventorySection } from "./inventory-section";

type Tab = "products" | "categories" | "suppliers";
const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "suppliers", label: "Suppliers" },
];

type SearchParams = {
  tab?: string;
  q?: string;
  category?: string;
  lowstock?: string;
  inactive?: string;
  edit?: string;
  barcode?: string;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const params = await searchParams;
  const tab: Tab = (TABS.find((t) => t.id === params.tab)?.id ?? "products") as Tab;
  const canWrite = canWriteCatalog(profile.role);
  const canManageOverride = canManageLossOverride(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const [counts, categories, suppliers] = await Promise.all([
    catalogCounts(orgId),
    listCategoriesWithCounts(orgId),
    listSuppliers(orgId),
  ]);

  return (
    <AppShell pageTitle="Catalog">
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Active products"
          value={formatNumber(counts.productsActive)}
          detail={`${formatNumber(counts.productsTotal)} total including archived.`}
          icon={<Boxes className="size-5" />}
        />
        <StatCard
          label="Low stock"
          value={formatNumber(counts.lowStock)}
          detail="At or below reorder level."
          icon={<AlertTriangle className="size-5" />}
        />
        <StatCard
          label="Active categories"
          value={formatNumber(counts.categories)}
          detail="Used to organize the catalog."
          icon={<Tag className="size-5" />}
        />
        <StatCard
          label="Active suppliers"
          value={formatNumber(counts.suppliers)}
          detail="Vendor contacts for restocking."
          icon={<Truck className="size-5" />}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#fff] shadow-sm md:mt-6 md:rounded-2xl">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-2">
          {TABS.map((t) => {
            const active = t.id === tab;
            const href = `/products?tab=${t.id}`;
            return (
              <Link
                key={t.id}
                href={href}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  active ? "bg-[#fff] text-blue-700 shadow" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 md:p-6">
          {!canWrite && (
            <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Your role ({profile.role}) can view the catalog but cannot create or edit items.
            </p>
          )}

          {tab === "products" && (
            <ProductsTab
              orgId={orgId}
              currency={currency}
              params={params}
              categories={categories}
              suppliers={suppliers}
              canWrite={canWrite}
              canManageOverride={canManageOverride}
            />
          )}
          {tab === "categories" && (
            <CategoriesTab
              categories={categories}
              params={params}
              canWrite={canWrite}
            />
          )}
          {tab === "suppliers" && (
            <SuppliersTab
              suppliers={suppliers}
              params={params}
              canWrite={canWrite}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────── Products tab ───────────────────────────

async function ProductsTab({
  orgId,
  currency,
  params,
  categories,
  suppliers,
  canWrite,
  canManageOverride,
}: {
  orgId: string;
  currency: string;
  params: SearchParams;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  canWrite: boolean;
  canManageOverride: boolean;
}) {
  const filters = {
    search: params.q,
    categoryId: params.category,
    lowStockOnly: params.lowstock === "1",
    includeInactive: params.inactive === "1",
  };
  const products = await listProducts(orgId, filters);
  const editing = params.edit ? products.find((p) => p.id === params.edit) : undefined;
  const isEdit = Boolean(editing);
  const prefillBarcode = params.barcode?.trim();
  const showForm = isEdit || Boolean(prefillBarcode);
  const hasProductFilters = Boolean(params.q || params.category || params.lowstock || params.inactive);
  const createInitial = prefillBarcode && !isEdit ? { barcode: prefillBarcode } as Partial<ProductRow> : editing;

  return (
    <div className="space-y-3 md:space-y-5">
      {canWrite && (
        <details id="product-form" open={showForm} className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-[var(--primary-accent-bg)] px-3 py-2 text-sm font-black text-[var(--primary-accent-text)] outline-none md:min-h-0 md:bg-transparent md:px-0 md:py-0 md:text-slate-800 [&::-webkit-details-marker]:hidden">
            <span>{isEdit ? `Edit product: ${editing!.name}` : "Add product"}</span>
            <span className="text-[11px] font-bold opacity-80 md:hidden">Tap to open</span>
          </summary>
          <div className="mt-4">
            <ProductForm
              key={editing?.id ?? (prefillBarcode ? `new-${prefillBarcode}` : "new")}
              initialValues={createInitial}
              categories={categories}
              suppliers={suppliers}
              canWrite={canWrite}
              canManageOverride={canManageOverride}
            />
            {isEdit && (
              <Link href="/products?tab=products" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline">
                Cancel edit
              </Link>
            )}
          </div>
        </details>
      )}

      <form className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden" action="/products">
        <input type="hidden" name="tab" value="products" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block min-w-0">
            <span className="sr-only">Search products</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search products"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-600"
            />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white">
            Apply
          </button>
        </div>
        <details open={hasProductFilters} className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600">
            Filters
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <select
                name="category"
                defaultValue={params.category ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600"
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3">
                <input type="checkbox" name="lowstock" value="1" defaultChecked={params.lowstock === "1"} className="size-4" />
                <span className="text-sm font-semibold text-slate-700">Low stock only</span>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3">
                <input type="checkbox" name="inactive" value="1" defaultChecked={params.inactive === "1"} className="size-4" />
                <span className="text-sm font-semibold text-slate-700">Show archived</span>
              </label>
            </div>
          </div>
        </details>
        {hasProductFilters && (
          <Link href="/products?tab=products" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline">
            Reset filters
          </Link>
        )}
      </form>

      <form className="hidden gap-3 md:grid md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" action="/products">
        <input type="hidden" name="tab" value="products" />
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, SKU, barcode"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-64"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-48"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="lowstock" value="1" defaultChecked={params.lowstock === "1"} className="size-4" />
          <span className="text-sm font-semibold text-slate-700">Low stock only</span>
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="inactive" value="1" defaultChecked={params.inactive === "1"} className="size-4" />
          <span className="text-sm font-semibold text-slate-700">Show archived</span>
        </label>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">
          Apply
        </button>
        {(params.q || params.category || params.lowstock || params.inactive) && (
          <Link href="/products?tab=products" className="self-center text-xs font-semibold text-slate-600 underline">
            Reset filters
          </Link>
        )}
      </form>

      {products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            hasProductFilters
              ? "No products matched your search or filters. Try adjusting your query or resetting filters."
              : "Get started by adding your first product using the form above."
          }
          searchQuery={params.q}
          resetHref={hasProductFilters ? "/products?tab=products" : undefined}
          type={hasProductFilters ? "search" : "empty"}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">SKU / Barcode</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3 text-right">Cost</th>
                  <th className="px-3 py-3 text-right">Sale</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right">Reorder</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <ProductRowDesktop
                    key={p.id}
                    p={p}
                    currency={currency}
                    canWrite={canWrite}
                    suppliers={suppliers}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} currency={currency} canWrite={canWrite} suppliers={suppliers} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function lowStockBadge(p: ProductRow) {
  if (p.type === "service") return null;
  if (p.stock_quantity <= p.minimum_stock) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 md:ml-2">
        Low
      </span>
    );
  }
  return null;
}

function lossAllowedBadge(p: ProductRow) {
  if (p.allow_sell_at_loss) {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 md:ml-2" title={`Override Reason: ${p.sell_at_loss_reason}`}>
        Loss Allowed
      </span>
    );
  }
  return null;
}

function ProductRowDesktop({
  p,
  currency,
  canWrite,
  suppliers,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
}) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="px-3 py-3">
        <div className="font-bold text-slate-900">{p.name} {lossAllowedBadge(p)}</div>
        <div className="text-xs text-slate-500">
          {p.type === "service" ? "Service" : "Product"}
          {!p.is_active && " · Archived"}
        </div>
        {p.type === "product" && p.is_active && (
          <InventorySection
            productId={p.id}
            productName={p.name}
            suppliers={suppliers}
            currency={currency}
            canWrite={canWrite}
          />
        )}
      </td>
      <td className="px-3 py-3 text-xs text-slate-600">
        <div>{p.sku ?? "—"}</div>
        <div className="text-slate-400">{p.barcode ?? "—"}</div>
      </td>
      <td className="px-3 py-3 text-sm text-slate-700">{p.category_name ?? "—"}</td>
      <td className="px-3 py-3 text-sm text-slate-700">{p.supplier_name ?? "—"}</td>
      <td className="px-3 py-3 text-right text-sm text-slate-700">{formatCurrency(p.purchase_price, currency)}</td>
      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(p.sale_price, currency)}</td>
      <td className="px-3 py-3 text-right text-sm">
        {p.type === "service" ? "—" : formatNumber(p.stock_quantity)}
        {lowStockBadge(p)}
      </td>
      <td className="px-3 py-3 text-right text-sm text-slate-600">
        {p.type === "service" ? "—" : formatNumber(p.minimum_stock)}
      </td>
      <td className="px-3 py-3">
        {p.is_active ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Active</span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">Archived</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <ProductActions p={p} canWrite={canWrite} />
      </td>
    </tr>
  );
}

function ProductCard({
  p,
  currency,
  canWrite,
  suppliers,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-bold leading-snug text-slate-900">
            <span className="min-w-0 break-words">{p.name}</span>
            {lowStockBadge(p)}
            {lossAllowedBadge(p)}
          </div>
          <div className="text-xs text-slate-500">
            {p.type === "service" ? "Service" : "Product"}
            {!p.is_active && " · Archived"}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            p.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {p.is_active ? "Active" : "Archived"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Sale</dt>
          <dd className="break-words font-bold leading-tight text-slate-900">{formatCurrency(p.sale_price, currency)}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Cost</dt>
          <dd className="break-words leading-tight">{formatCurrency(p.purchase_price, currency)}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Stock</dt>
          <dd className="break-words leading-tight">{p.type === "service" ? "—" : formatNumber(p.stock_quantity)}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Reorder</dt>
          <dd className="break-words leading-tight">{p.type === "service" ? "—" : formatNumber(p.minimum_stock)}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Category</dt>
          <dd className="truncate">{p.category_name ?? "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Supplier</dt>
          <dd className="truncate">{p.supplier_name ?? "—"}</dd>
        </div>
      </dl>
      {p.type === "product" && p.is_active && (
        <InventorySection
          productId={p.id}
          productName={p.name}
          suppliers={suppliers}
          currency={currency}
          canWrite={canWrite}
        />
      )}
      <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
        <ProductActions p={p} canWrite={canWrite} />
      </div>
    </div>
  );
}

function ProductActions({ p, canWrite }: { p: ProductRow; canWrite: boolean }) {
  if (!canWrite) return <span className="text-xs text-slate-400">View only</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/products?tab=products&edit=${p.id}`}
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 bg-[#fff] px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Edit
      </Link>
      {p.is_active ? (
        <ConfirmForm action={archiveProductAction} message="Archive this product? You can restore it later.">
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-red-200 bg-[#fff] px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveProductAction}>
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-emerald-200 bg-[#fff] px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            Restore
          </button>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────── Categories tab ───────────────────────────

function CategoriesTab({
  categories,
  params,
  canWrite,
}: {
  categories: CategoryRow[];
  params: SearchParams;
  canWrite: boolean;
}) {
  const editing = params.edit ? categories.find((c) => c.id === params.edit) : undefined;
  const isEdit = Boolean(editing);
  return (
    <div className="space-y-5">
      {canWrite && (
        <details open={isEdit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">
            {isEdit ? `Edit category: ${editing!.name}` : "Add a new category"}
          </summary>
          <div className="mt-4">
            <CategoryForm key={editing?.id ?? "new"} initialValues={editing} canWrite={canWrite} />
            {isEdit && (
              <Link href="/products?tab=categories" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline">
                Cancel edit
              </Link>
            )}
          </div>
        </details>
      )}

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories help group your products (e.g. Phones, Accessories). Use the form above to add one."
          type="empty"
        />
      ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 text-right">Products</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-3 font-bold text-slate-900">{c.name}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{c.description ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{formatNumber(c.product_count ?? 0)}</td>
                  <td className="px-3 py-3">
                    {c.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">Archived</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/products?tab=categories&edit=${c.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
{c.is_active ? (
  <ConfirmForm action={archiveCategoryAction} message="Archive this category? Products in this category won't be affected.">
    <input type="hidden" name="id" value={c.id} />
    <button type="submit" className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
      Archive
    </button>
  </ConfirmForm>
) : (
                          <form action={unarchiveCategoryAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="rounded-md border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                              Restore
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} canWrite={canWrite} />
          ))}
        </div>
        </>
      )}
    </div>
  );
}

function CategoryCard({ category, canWrite }: { category: CategoryRow; canWrite: boolean }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-[#fff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black text-slate-950">{category.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{category.description ?? "No description"}</p>
        </div>
        {category.is_active ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            Active
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
            Archived
          </span>
        )}
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
        {formatNumber(category.product_count ?? 0)} products
      </div>
      <div className="mt-3">
        <CategoryActions category={category} canWrite={canWrite} />
      </div>
    </article>
  );
}

function CategoryActions({ category, canWrite }: { category: CategoryRow; canWrite: boolean }) {
  if (!canWrite) return <span className="text-xs text-slate-400">View only</span>;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link
        href={`/products?tab=categories&edit=${category.id}`}
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Edit
      </Link>
      {category.is_active ? (
        <ConfirmForm action={archiveCategoryAction} message="Archive this category? Products in this category won't be affected.">
          <input type="hidden" name="id" value={category.id} />
          <button type="submit" className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveCategoryAction}>
          <input type="hidden" name="id" value={category.id} />
          <button type="submit" className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            Restore
          </button>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────── Suppliers tab ───────────────────────────

function SuppliersTab({
  suppliers,
  params,
  canWrite,
}: {
  suppliers: SupplierRow[];
  params: SearchParams;
  canWrite: boolean;
}) {
  const editing = params.edit ? suppliers.find((s) => s.id === params.edit) : undefined;
  const isEdit = Boolean(editing);
  return (
    <div className="space-y-5">
      {canWrite && (
        <details open={isEdit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">
            {isEdit ? `Edit supplier: ${editing!.name}` : "Add a new supplier"}
          </summary>
          <div className="mt-4">
            <SupplierForm key={editing?.id ?? "new"} initialValues={editing} canWrite={canWrite} />
            {isEdit && (
              <Link href="/products?tab=suppliers" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline">
                Cancel edit
              </Link>
            )}
          </div>
        </details>
      )}

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Suppliers are contacts you purchase inventory from. Use the form above to add your first supplier."
          type="empty"
        />
      ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-3 font-bold text-slate-900">{s.name}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{s.company ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{s.phone ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{s.email ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{s.address ?? "—"}</td>
                  <td className="px-3 py-3">
                    {s.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">Archived</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/products?tab=suppliers&edit=${s.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
{s.is_active ? (
  <ConfirmForm action={archiveSupplierAction} message="Archive this supplier? Their purchase history will be preserved.">
    <input type="hidden" name="id" value={s.id} />
    <button type="submit" className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
      Archive
    </button>
  </ConfirmForm>
) : (
                          <form action={unarchiveSupplierAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="rounded-md border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                              Restore
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {suppliers.map((s) => (
            <SupplierCard key={s.id} supplier={s} canWrite={canWrite} />
          ))}
        </div>
        </>
      )}
    </div>
  );
}

function SupplierCard({ supplier, canWrite }: { supplier: SupplierRow; canWrite: boolean }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-[#fff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black text-slate-950">{supplier.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{supplier.company ?? "No company"}</p>
        </div>
        {supplier.is_active ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            Active
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
            Archived
          </span>
        )}
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[380px]:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-400">Phone</dt>
          <dd className="break-words text-slate-700">{supplier.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-400">Email</dt>
          <dd className="break-words text-slate-700">{supplier.email ?? "—"}</dd>
        </div>
        <div className="min-[380px]:col-span-2">
          <dt className="text-xs font-semibold uppercase text-slate-400">Address</dt>
          <dd className="break-words text-slate-700">{supplier.address ?? "—"}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <SupplierActions supplier={supplier} canWrite={canWrite} />
      </div>
    </article>
  );
}

function SupplierActions({ supplier, canWrite }: { supplier: SupplierRow; canWrite: boolean }) {
  if (!canWrite) return <span className="text-xs text-slate-400">View only</span>;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link
        href={`/products?tab=suppliers&edit=${supplier.id}`}
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Edit
      </Link>
      {supplier.is_active ? (
        <ConfirmForm action={archiveSupplierAction} message="Archive this supplier? Their purchase history will be preserved.">
          <input type="hidden" name="id" value={supplier.id} />
          <button type="submit" className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveSupplierAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <button type="submit" className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            Restore
          </button>
        </form>
      )}
    </div>
  );
}
