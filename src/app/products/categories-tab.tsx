"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Search, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { SortableHeader } from "@/components/ui/sortable-header";
import { AddCategoryModal } from "./add-category-modal";
import { archiveCategoryAction, saveCategoryAction, unarchiveCategoryAction } from "./actions";
import type { CategoryRow } from "@/lib/data/catalog";
import { formatNumber } from "@/lib/formatters";
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

function normalizeSearch(value: string) {
  return value.replace(/[,()]/g, " ").trim().toLowerCase();
}

export function CategoriesTab({
  categories: initialCategories,
  params,
  canWrite,
}: {
  categories: CategoryRow[];
  params: SearchParams;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const categories = initialCategories;
  const [search, setSearch] = useState(params.q ?? "");
  const [addOpen, setAddOpen] = useState(false);

  const filteredCategories = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return categories;
    return categories.filter((c) => {
      const haystack = [c.name, c.description ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [categories, search]);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedCategories = sortData(filteredCategories, sort || "name", sort ? dir : "asc", {
    name: "string",
    description: "string",
    product_count: "number",
    is_active: "string",
  });

  const editing = params.edit ? categories.find((c) => c.id === params.edit) : undefined;
  const isEdit = Boolean(editing);

  function handleSaved() {
    startTransition(() => {
      router.refresh();
    });
    setAddOpen(false);
  }

  function handleArchive(formData: FormData) {
    startTransition(async () => {
      await archiveCategoryAction(formData);
      router.refresh();
    });
  }

  function handleUnarchive(formData: FormData) {
    startTransition(async () => {
      await unarchiveCategoryAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950 dark:text-slate-100">Categories</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(filteredCategories.length)} matching{" "}
            {filteredCategories.length === 1 ? "category" : "categories"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search categories</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or description"
              className="h-11 w-full rounded-lg border border-slate-200 bg-[#fff] py-2 pl-9 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 sm:w-72 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear category search"
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          {canWrite && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              <Plus className="size-4" />
              Add category
            </button>
          )}
        </div>
      </div>

      {canWrite && addOpen && (
        <AddCategoryModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={handleSaved}
          canWrite={canWrite}
        />
      )}

      {isEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Edit category: {editing!.name}
          </h3>
          <div className="mt-3">
            <CategoryFormEmbedded initialValues={editing} canWrite={canWrite} onSaved={handleSaved} />
          </div>
          <Link
            href="/products?tab=categories"
            className="mt-3 inline-block text-xs font-semibold text-slate-600 underline dark:text-slate-400"
          >
            Cancel edit
          </Link>
        </div>
      )}

      {sortedCategories.length === 0 ? (
        <EmptyState
          title={search ? "No matching categories" : "No categories yet"}
          description={
            search
              ? "Try another name or description, or clear the search."
              : "Categories help group your products (e.g. Phones, Accessories). Add one to get started."
          }
          type={search ? "search" : "empty"}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
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
                            className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Edit
                          </Link>
                          {c.is_active ? (
                            <ConfirmForm action={handleArchive} message="Archive this category? Products in this category won't be affected.">
                              <input type="hidden" name="id" value={c.id} />
                              <button type="submit" className="min-h-10 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                                Archive
                              </button>
                            </ConfirmForm>
                          ) : (
                            <form action={handleUnarchive}>
                              <input type="hidden" name="id" value={c.id} />
                              <button type="submit" className="min-h-10 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
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
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleArchive(formData: FormData) {
    startTransition(async () => {
      await archiveCategoryAction(formData);
      router.refresh();
    });
  }

  function handleUnarchive(formData: FormData) {
    startTransition(async () => {
      await unarchiveCategoryAction(formData);
      router.refresh();
    });
  }

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
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {canWrite ? (
          <>
            <Link
              href={`/products?tab=categories&edit=${category.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Edit
            </Link>
            {category.is_active ? (
              <ConfirmForm action={handleArchive} message="Archive this category? Products in this category won't be affected.">
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className="min-h-11 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                  Archive
                </button>
              </ConfirmForm>
            ) : (
              <form action={handleUnarchive}>
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className="min-h-11 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950">
                  Restore
                </button>
              </form>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">View only</span>
        )}
      </div>
    </article>
  );
}

function CategoryFormEmbedded({
  initialValues,
  canWrite,
  onSaved,
}: {
  initialValues?: Partial<CategoryRow>;
  canWrite: boolean;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, { error: null, success: null });

  useEffect(() => {
    if (state.success) onSaved?.();
  }, [onSaved, state.success]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></span>
        <input
          required
          name="name"
          defaultValue={initialValues?.name ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Description (optional)</span>
        <textarea
          name="description"
          defaultValue={initialValues?.description ?? ""}
          rows={2}
          disabled={!canWrite || pending}
          className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={initialValues?.is_active ?? true}
          disabled={!canWrite || pending}
          className="size-4"
        />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Active</span>
      </label>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : initialValues?.id ? (
            "Update category"
          ) : (
            "Add category"
          )}
        </button>
      </div>
    </form>
  );
}
