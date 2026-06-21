import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, AlertTriangle, Boxes, Pencil, Plus, RotateCcw, Tag, Truck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { AppSelect } from "@/components/ui/app-select";
import { getCurrentContext } from "@/lib/auth/session";
import {
  catalogCounts,
  getProductById,
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
import { ProductFormModal } from "./product-form-modal";
import { SupplierForm } from "./supplier-form";
import { InventorySection } from "./inventory-section";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";
import { ProductThumbnail } from "@/components/products/product-thumbnail";

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
  add?: string;
  edit?: string;
  barcode?: string;
  sort?: string;
  dir?: string;
};

function buildProductsHref(
  params: SearchParams,
  changes: Partial<Record<keyof SearchParams, string | null>>,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  next.set("tab", "products");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else if (value !== undefined) next.set(key, value);
  }
  return `/products?${next.toString()}`;
}

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
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
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

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#fff] shadow-sm md:mt-6 md:rounded-2xl dark:border-slate-800 dark:bg-slate-950">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/50">
          {TABS.map((t) => {
            const active = t.id === tab;
            const href = `/products?tab=${t.id}`;
            return (
              <Link
                key={t.id}
                href={href}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  active ? "bg-[#fff] text-blue-700 shadow dark:bg-slate-950 dark:text-blue-400" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 md:p-6">
          {!canWrite && (
            <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
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
  const [products, editing] = await Promise.all([
    listProducts(orgId, filters),
    params.edit ? getProductById(orgId, params.edit) : Promise.resolve(null),
  ]);
  const isEdit = Boolean(editing);
  const prefillBarcode = params.barcode?.trim();
  const showForm = isEdit || params.add === "1" || Boolean(prefillBarcode);
  const hasProductFilters = Boolean(params.q || params.category || params.lowstock || params.inactive);
  const createInitial = prefillBarcode && !isEdit ? { barcode: prefillBarcode } as Partial<ProductRow> : editing;
  const closeFormHref = buildProductsHref(params, { add: null, edit: null, barcode: null });
  const addProductHref = buildProductsHref(params, { add: "1", edit: null });
  const categoryOptions = [
    { value: "", label: "All" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedProducts = sortData(products, sort || "name", sort ? dir : "asc", {
    name: "string",
    sku: "string",
    category_name: "string",
    supplier_name: "string",
    purchase_price: "number",
    sale_price: "number",
    stock_quantity: "number",
    minimum_stock: "number",
    is_active: "string",
  });

  return (
    <div className="space-y-3 md:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950 dark:text-slate-100">Product catalog</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(products.length)} matching {products.length === 1 ? "item" : "items"}
          </p>
        </div>
        {canWrite && (
          <Link
            href={addProductHref}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            <Plus className="size-4" />
            Add product
          </Link>
        )}
      </div>

      {canWrite && showForm && (
        <ProductFormModal
          initialValues={createInitial ?? undefined}
          categories={categories}
          suppliers={suppliers}
          canWrite={canWrite}
          canManageOverride={canManageOverride}
          closeHref={closeFormHref}
        />
      )}

      <form className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden dark:border-slate-800 dark:bg-slate-950" action="/products">
        <input type="hidden" name="tab" value="products" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block min-w-0">
            <span className="sr-only">Search products</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search products"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
            Apply
          </button>
        </div>
        <details open={hasProductFilters} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Filters
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</span>
              <AppSelect
                name="category"
                defaultValue={params.category ?? ""}
                options={categoryOptions}
                ariaLabel="Category"
                searchable={categories.length > 8}
                className="mt-1"
              />
            </label>
            <div className="grid gap-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3 dark:bg-slate-900">
                <input type="checkbox" name="lowstock" value="1" defaultChecked={params.lowstock === "1"} className="size-4" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Low stock only</span>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3 dark:bg-slate-900">
                <input type="checkbox" name="inactive" value="1" defaultChecked={params.inactive === "1"} className="size-4" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show archived</span>
              </label>
            </div>
          </div>
        </details>
        {hasProductFilters && (
          <Link href="/products?tab=products" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline dark:text-slate-400">
            Reset filters
          </Link>
        )}
      </form>

      <form className="hidden gap-3 md:grid md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" action="/products">
        <input type="hidden" name="tab" value="products" />
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, SKU, barcode"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-64 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</span>
          <AppSelect
            name="category"
            defaultValue={params.category ?? ""}
            options={categoryOptions}
            ariaLabel="Category"
            searchable={categories.length > 8}
            className="mt-1 lg:w-48"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="lowstock" value="1" defaultChecked={params.lowstock === "1"} className="size-4" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Low stock only</span>
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="inactive" value="1" defaultChecked={params.inactive === "1"} className="size-4" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show archived</span>
        </label>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
          Apply
        </button>
        {(params.q || params.category || params.lowstock || params.inactive) && (
          <Link href="/products?tab=products" className="self-center text-xs font-semibold text-slate-600 underline dark:text-slate-400">
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
              : "Get started by adding your first product."
          }
          searchQuery={params.q}
          resetHref={hasProductFilters ? "/products?tab=products" : undefined}
          type={hasProductFilters ? "search" : "empty"}
        />
      ) : (
        <>
          <div className="hidden max-h-[70dvh] overflow-auto rounded-lg border border-slate-200 lg:block dark:border-slate-800">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <SortableHeader label="Product" columnKey="name" currentSortKey={sort} direction={dir} currentParams={params} className="w-[27%]" />
                  <SortableHeader label="Category / Supplier" columnKey="category_name" currentSortKey={sort} direction={dir} currentParams={params} className="w-[18%]" />
                  <SortableHeader label="Cost" columnKey="purchase_price" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                  <SortableHeader label="Sale" columnKey="sale_price" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                  <SortableHeader label="Stock / Reorder" columnKey="stock_quantity" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                  <SortableHeader label="Status" columnKey="is_active" currentSortKey={sort} direction={dir} currentParams={params} />
                  <th className="w-[25%] px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p) => (
                  <ProductRowDesktop
                    key={p.id}
                    p={p}
                    currency={currency}
                    canWrite={canWrite}
                    suppliers={suppliers}
                    editHref={buildProductsHref(params, { edit: p.id, add: null })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {sortedProducts.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                currency={currency}
                canWrite={canWrite}
                suppliers={suppliers}
                editHref={buildProductsHref(params, { edit: p.id, add: null })}
              />
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
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 md:ml-2 dark:bg-amber-900/30 dark:text-amber-300">
        Low
      </span>
    );
  }
  return null;
}

function lossAllowedBadge(p: ProductRow) {
  if (p.allow_sell_at_loss) {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 md:ml-2 dark:bg-rose-900/30 dark:text-rose-300" title={`Override Reason: ${p.sell_at_loss_reason}`}>
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
  editHref,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
  editHref: string;
}) {
  return (
    <tr className="border-b border-slate-100 align-middle hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/60">
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductThumbnail imageUrl={p.image_url} productName={p.name} className="size-11" sizes="44px" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
              <span className="break-words">{p.name}</span>
              {lossAllowedBadge(p)}
              {lowStockBadge(p)}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{p.type === "service" ? "Service" : "Product"}</span>
              <span>SKU: {p.sku ?? "-"}</span>
              {p.barcode && <span>Barcode: {p.barcode}</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">
        <div className="font-semibold">{p.category_name ?? "No category"}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.supplier_name ?? "No supplier"}</div>
      </td>
      <td className="px-3 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(p.purchase_price, currency)}</td>
      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(p.sale_price, currency)}</td>
      <td className="px-3 py-3 text-right text-sm dark:text-slate-300">
        <div className="font-semibold">{p.type === "service" ? "-" : formatNumber(p.stock_quantity)}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {p.type === "service" ? "No stock" : `Reorder ${formatNumber(p.minimum_stock)}`}
        </div>
      </td>
      <td className="px-3 py-3">
        {p.is_active ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-400">Archived</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <ProductActions p={p} canWrite={canWrite} suppliers={suppliers} currency={currency} editHref={editHref} />
      </td>
    </tr>
  );
}

function ProductCard({
  p,
  currency,
  canWrite,
  suppliers,
  editHref,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
  editHref: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <ProductThumbnail imageUrl={p.image_url} productName={p.name} className="size-14" sizes="56px" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-bold leading-snug text-slate-900 dark:text-slate-100">
            <span className="min-w-0 break-words">{p.name}</span>
            {lowStockBadge(p)}
            {lossAllowedBadge(p)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{p.type === "service" ? "Service" : "Product"}</span>
            {p.sku && <span>SKU: {p.sku}</span>}
            {p.barcode && <span>Barcode: {p.barcode}</span>}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            p.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {p.is_active ? "Active" : "Archived"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 border-y border-slate-100 py-2 text-sm dark:border-slate-800">
        <div className="min-w-0 border-r border-slate-100 px-2 py-1 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Sale</dt>
          <dd className="break-words font-bold text-slate-900 dark:text-slate-100">{formatCurrency(p.sale_price, currency)}</dd>
        </div>
        <div className="min-w-0 px-2 py-1">
          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Cost</dt>
          <dd className="break-words text-slate-700 dark:text-slate-300">{formatCurrency(p.purchase_price, currency)}</dd>
        </div>
        <div className="min-w-0 border-r border-t border-slate-100 px-2 py-2 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Stock</dt>
          <dd className="text-slate-700 dark:text-slate-300">{p.type === "service" ? "No stock" : `${formatNumber(p.stock_quantity)} / reorder ${formatNumber(p.minimum_stock)}`}</dd>
        </div>
        <div className="min-w-0 border-t border-slate-100 px-2 py-2 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Category</dt>
          <dd className="truncate text-slate-700 dark:text-slate-300">{p.category_name ?? "No category"}</dd>
        </div>
        <div className="col-span-2 min-w-0 border-t border-slate-100 px-2 py-2 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Supplier</dt>
          <dd className="truncate text-slate-700 dark:text-slate-300">{p.supplier_name ?? "No supplier"}</dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end">
        <ProductActions p={p} canWrite={canWrite} suppliers={suppliers} currency={currency} editHref={editHref} />
      </div>
    </article>
  );
}

function ProductActions({
  p,
  canWrite,
  suppliers,
  currency,
  editHref,
}: {
  p: ProductRow;
  canWrite: boolean;
  suppliers: SupplierRow[];
  currency: string;
  editHref: string;
}) {
  if (!canWrite) return <span className="text-xs text-slate-400 dark:text-slate-500">View only</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {p.type === "product" && p.is_active && (
        <InventorySection
          productId={p.id}
          productName={p.name}
          suppliers={suppliers}
          currency={currency}
          canWrite={canWrite}
          compact
        />
      )}
      <Link
        href={editHref}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-[#fff] px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Link>
      {p.is_active ? (
        <ConfirmForm action={archiveProductAction} message="Archive this product? You can restore it later.">
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 bg-[#fff] px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950">
            <Archive className="size-3.5" aria-hidden="true" />
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveProductAction}>
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-[#fff] px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
            <RotateCcw className="size-3.5" aria-hidden="true" />
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

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedCategories = sortData(categories, sort || "name", sort ? dir : "asc", {
    name: "string",
    description: "string",
    product_count: "number",
    is_active: "string",
  });

  return (
    <div className="space-y-5">
      {canWrite && (
        <details open={isEdit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-bold text-slate-800 dark:text-slate-200">
            {isEdit ? `Edit category: ${editing!.name}` : "Add a new category"}
          </summary>
          <div className="mt-4">
            <CategoryForm key={editing?.id ?? "new"} initialValues={editing} canWrite={canWrite} />
            {isEdit && (
              <Link href="/products?tab=categories" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline dark:text-slate-400">
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
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <SortableHeader label="Name" columnKey="name" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Description" columnKey="description" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Products" columnKey="product_count" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Status" columnKey="is_active" currentSortKey={sort} direction={dir} currentParams={params} />
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                  <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">{c.description ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{formatNumber(c.product_count ?? 0)}</td>
                  <td className="px-3 py-3">
                    {c.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-400">Archived</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <Link
                           href={`/products?tab=categories&edit=${c.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Edit
                        </Link>
{c.is_active ? (
  <ConfirmForm action={archiveCategoryAction} message="Archive this category? Products in this category won't be affected.">
    <input type="hidden" name="id" value={c.id} />
    <button type="submit" className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
      Archive
    </button>
  </ConfirmForm>
) : (
                          <form action={unarchiveCategoryAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="rounded-md border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
                              Restore
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {sortedCategories.map((c) => (
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
    <article className="rounded-xl border border-slate-200 bg-[#fff] p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black text-slate-950 dark:text-slate-100">{category.name}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{category.description ?? "No description"}</p>
        </div>
        {category.is_active ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            Active
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Archived
          </span>
        )}
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-300">
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
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Edit
      </Link>
      {category.is_active ? (
        <ConfirmForm action={archiveCategoryAction} message="Archive this category? Products in this category won't be affected.">
          <input type="hidden" name="id" value={category.id} />
          <button type="submit" className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveCategoryAction}>
          <input type="hidden" name="id" value={category.id} />
          <button type="submit" className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
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

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedSuppliers = sortData(suppliers, sort || "name", sort ? dir : "asc", {
    name: "string",
    company: "string",
    phone: "string",
    email: "string",
    address: "string",
    is_active: "string",
  });

  return (
    <div className="space-y-5">
      {canWrite && (
        <details open={isEdit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-bold text-slate-800 dark:text-slate-200">
            {isEdit ? `Edit supplier: ${editing!.name}` : "Add a new supplier"}
          </summary>
          <div className="mt-4">
            <SupplierForm key={editing?.id ?? "new"} initialValues={editing} canWrite={canWrite} />
            {isEdit && (
              <Link href="/products?tab=suppliers" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline dark:text-slate-400">
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
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <SortableHeader label="Name" columnKey="name" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Company" columnKey="company" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Phone" columnKey="phone" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Email" columnKey="email" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Address" columnKey="address" currentSortKey={sort} direction={dir} currentParams={params} />
                <SortableHeader label="Status" columnKey="is_active" currentSortKey={sort} direction={dir} currentParams={params} />
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSuppliers.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">{s.name}</td>
                  <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{s.company ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{s.phone ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{s.email ?? "—"}</td>
                  <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{s.address ?? "—"}</td>
                  <td className="px-3 py-3">
                    {s.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-400">Archived</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/products?tab=suppliers&edit=${s.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Edit
                        </Link>
{s.is_active ? (
  <ConfirmForm action={archiveSupplierAction} message="Archive this supplier? Their purchase history will be preserved.">
    <input type="hidden" name="id" value={s.id} />
    <button type="submit" className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
      Archive
    </button>
  </ConfirmForm>
) : (
                          <form action={unarchiveSupplierAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="rounded-md border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
                              Restore
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {sortedSuppliers.map((s) => (
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
    <article className="rounded-xl border border-slate-200 bg-[#fff] p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black text-slate-950 dark:text-slate-100">{supplier.name}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{supplier.company ?? "No company"}</p>
        </div>
        {supplier.is_active ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            Active
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Archived
          </span>
        )}
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[380px]:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Phone</dt>
          <dd className="break-words text-slate-700 dark:text-slate-300">{supplier.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Email</dt>
          <dd className="break-words text-slate-700 dark:text-slate-300">{supplier.email ?? "—"}</dd>
        </div>
        <div className="min-[380px]:col-span-2">
          <dt className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Address</dt>
          <dd className="break-words text-slate-700 dark:text-slate-300">{supplier.address ?? "—"}</dd>
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
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Edit
      </Link>
      {supplier.is_active ? (
        <ConfirmForm action={archiveSupplierAction} message="Archive this supplier? Their purchase history will be preserved.">
          <input type="hidden" name="id" value={supplier.id} />
          <button type="submit" className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={unarchiveSupplierAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <button type="submit" className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
            Restore
          </button>
        </form>
      )}
    </div>
  );
}
