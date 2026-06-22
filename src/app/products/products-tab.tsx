"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { SortableHeader } from "@/components/ui/sortable-header";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { archiveProductAction, unarchiveProductAction } from "./actions";
import { InventorySection } from "./inventory-section";
import { ProductFormModal } from "./product-form-modal";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { sortData } from "@/lib/sort";

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

type ModalState =
  | { mode: "add"; initial?: Partial<ProductRow> }
  | { mode: "edit"; initial: ProductRow }
  | null;

function normalizeSearch(value: string) {
  return value.replace(/[,()]/g, " ").trim().toLowerCase();
}

export function ProductsTab({
  currency,
  params,
  initialProducts,
  initialCategories,
  suppliers,
  canWrite,
  canManageOverride,
}: {
  currency: string;
  params: SearchParams;
  initialProducts: ProductRow[];
  initialCategories: CategoryRow[];
  suppliers: SupplierRow[];
  canWrite: boolean;
  canManageOverride: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const products = initialProducts;
  const [createdCategories, setCreatedCategories] = useState<CategoryRow[]>([]);
  const categories = useMemo(() => {
    const byId = new Map(initialCategories.map((category) => [category.id, category]));
    createdCategories.forEach((category) => byId.set(category.id, category));
    return Array.from(byId.values());
  }, [createdCategories, initialCategories]);

  const [search, setSearch] = useState(params.q ?? "");
  const [categoryFilter, setCategoryFilter] = useState(params.category ?? "");
  const [lowStockOnly, setLowStockOnly] = useState(params.lowstock === "1");
  const [includeInactive, setIncludeInactive] = useState(params.inactive === "1");

  const [modal, setModal] = useState<ModalState>(() => {
    if (params.edit) {
      const found = initialProducts.find((p) => p.id === params.edit);
      if (found) return { mode: "edit", initial: found };
    }
    if (params.add === "1" || params.barcode) {
      const initial: Partial<ProductRow> = params.barcode ? { barcode: params.barcode.trim() } : {};
      return { mode: "add", initial };
    }
    return null;
  });

  const currentParams = useMemo<SearchParams>(
    () => ({
      tab: "products",
      q: search || undefined,
      category: categoryFilter || undefined,
      lowstock: lowStockOnly ? "1" : undefined,
      inactive: includeInactive ? "1" : undefined,
      sort: params.sort,
      dir: params.dir,
    }),
    [search, categoryFilter, lowStockOnly, includeInactive, params.sort, params.dir],
  );

  const filteredProducts = useMemo(() => {
    const q = normalizeSearch(search);
    return products.filter((p) => {
      if (!includeInactive && !p.is_active) return false;
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (lowStockOnly && (p.type !== "product" || p.stock_quantity > p.minimum_stock)) return false;
      if (q) {
        const haystack = [p.name, p.sku ?? "", p.barcode ?? "", p.category_name ?? "", p.supplier_name ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, categoryFilter, lowStockOnly, includeInactive]);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedProducts = sortData(filteredProducts, sort || "name", sort ? dir : "asc", {
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

  const hasFilters = Boolean(search || categoryFilter || lowStockOnly || includeInactive);

  const categoryOptions = [
    { value: "", label: "All" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  function handleSaved() {
    startTransition(() => {
      router.refresh();
    });
    setModal(null);
  }

  function handleArchive(formData: FormData) {
    startTransition(async () => {
      await archiveProductAction(formData);
      router.refresh();
    });
  }

  function handleUnarchive(formData: FormData) {
    startTransition(async () => {
      await unarchiveProductAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 md:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950 dark:text-slate-100">Product catalog</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(filteredProducts.length)} matching {filteredProducts.length === 1 ? "item" : "items"}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setModal({ mode: "add" })}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            <Plus className="size-4" />
            Add product
          </button>
        )}
      </div>

      {modal && (
        <ProductFormModal
          key={modal.mode === "edit" ? modal.initial.id : "add"}
          initialValues={modal.initial}
          categories={categories}
          suppliers={suppliers}
          canWrite={canWrite}
          canManageOverride={canManageOverride}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onCategoryCreated={(category) =>
            setCreatedCategories((previous) => [...previous, category])
          }
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden dark:border-slate-800 dark:bg-slate-950">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block min-w-0">
            <span className="sr-only">Search products</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </label>
          <button
            type="button"
            onClick={() => setSearch("")}
            disabled={!search}
            className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Clear
          </button>
        </div>
        <details open={hasFilters} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Filters
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Category
              </span>
              <AppSelect
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value)}
                options={categoryOptions}
                ariaLabel="Category"
                searchable={categories.length > 8}
                className="mt-1"
              />
            </label>
            <div className="grid gap-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="size-4"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Low stock only</span>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg bg-[#fff] px-3 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="size-4"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show archived</span>
              </label>
            </div>
          </div>
        </details>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setLowStockOnly(false);
              setIncludeInactive(false);
            }}
            className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline dark:text-slate-400"
          >
            Reset filters
          </button>
        )}
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, SKU, barcode"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-64 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</span>
          <AppSelect
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            options={categoryOptions}
            ariaLabel="Category"
            searchable={categories.length > 8}
            className="mt-1 lg:w-48"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Low stock only</span>
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show archived</span>
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setLowStockOnly(false);
              setIncludeInactive(false);
            }}
            className="self-center text-xs font-semibold text-slate-600 underline dark:text-slate-400"
          >
            Reset filters
          </button>
        )}
      </div>

      {sortedProducts.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            hasFilters
              ? "No products matched your search or filters. Try adjusting your query or resetting filters."
              : "Get started by adding your first product."
          }
          searchQuery={search}
          resetHref={hasFilters ? "/products?tab=products" : undefined}
          type={hasFilters ? "search" : "empty"}
        />
      ) : (
        <>
          <div className="hidden max-h-[70dvh] overflow-auto rounded-lg border border-slate-200 lg:block dark:border-slate-800">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <SortableHeader label="Product" columnKey="name" currentSortKey={sort} direction={dir} currentParams={currentParams} className="w-[24%]" />
                  <SortableHeader label="Category" columnKey="category_name" currentSortKey={sort} direction={dir} currentParams={currentParams} className="w-[12%]" />
                  <SortableHeader label="Supplier" columnKey="supplier_name" currentSortKey={sort} direction={dir} currentParams={currentParams} className="w-[14%]" />
                  <SortableHeader label="Cost" columnKey="purchase_price" align="right" currentSortKey={sort} direction={dir} currentParams={currentParams} />
                  <SortableHeader label="Sale" columnKey="sale_price" align="right" currentSortKey={sort} direction={dir} currentParams={currentParams} />
                  <SortableHeader label="Stock / Reorder" columnKey="stock_quantity" align="right" currentSortKey={sort} direction={dir} currentParams={currentParams} />
                  <SortableHeader label="Status" columnKey="is_active" currentSortKey={sort} direction={dir} currentParams={currentParams} />
                  <th className="w-[22%] px-3 py-3 text-right">Actions</th>
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
                    onEdit={() => setModal({ mode: "edit", initial: p })}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
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
                onEdit={() => setModal({ mode: "edit", initial: p })}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
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
      <span
        className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 md:ml-2 dark:bg-rose-900/30 dark:text-rose-300"
        title={`Override Reason: ${p.sell_at_loss_reason}`}
      >
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
  onEdit,
  onArchive,
  onUnarchive,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
  onEdit: () => void;
  onArchive: (formData: FormData) => void;
  onUnarchive: (formData: FormData) => void;
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
      <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{p.category_name ?? "No category"}</td>
      <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">{p.supplier_name ?? "No supplier"}</td>
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
        <ProductActions p={p} canWrite={canWrite} suppliers={suppliers} currency={currency} onEdit={onEdit} onArchive={onArchive} onUnarchive={onUnarchive} />
      </td>
    </tr>
  );
}

function ProductCard({
  p,
  currency,
  canWrite,
  suppliers,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  p: ProductRow;
  currency: string;
  canWrite: boolean;
  suppliers: SupplierRow[];
  onEdit: () => void;
  onArchive: (formData: FormData) => void;
  onUnarchive: (formData: FormData) => void;
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
        <ProductActions p={p} canWrite={canWrite} suppliers={suppliers} currency={currency} onEdit={onEdit} onArchive={onArchive} onUnarchive={onUnarchive} />
      </div>
    </article>
  );
}

function ProductActions({
  p,
  canWrite,
  suppliers,
  currency,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  p: ProductRow;
  canWrite: boolean;
  suppliers: SupplierRow[];
  currency: string;
  onEdit: () => void;
  onArchive: (formData: FormData) => void;
  onUnarchive: (formData: FormData) => void;
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
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-[#fff] px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </button>
      {p.is_active ? (
        <ConfirmForm action={onArchive} message="Archive this product? You can restore it later.">
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 bg-[#fff] px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950">
            <Archive className="size-3.5" aria-hidden="true" />
            Archive
          </button>
        </ConfirmForm>
      ) : (
        <form action={onUnarchive}>
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
