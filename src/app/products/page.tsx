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
  type SupplierRow,
} from "@/lib/data/catalog";
import { canWriteCatalog, canManageLossOverride } from "@/lib/permissions";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/formatters";
import {
  archiveCategoryAction,
  archiveSupplierAction,
  unarchiveCategoryAction,
  unarchiveSupplierAction,
} from "./actions";
import { CategoryForm } from "./category-form";
import { ProductsTab } from "./products-tab";
import { SupplierForm } from "./supplier-form";
import { SortableHeader } from "@/components/ui/sortable-header";
import { sortData } from "@/lib/sort";

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

  const [counts, categories, suppliers, products] = await Promise.all([
    catalogCounts(orgId),
    listCategoriesWithCounts(orgId),
    listSuppliers(orgId),
    listProducts(orgId, { includeInactive: true }),
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
              currency={currency}
              params={params}
              initialProducts={products}
              initialCategories={categories}
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
