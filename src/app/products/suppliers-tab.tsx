"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Search, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { SortableHeader } from "@/components/ui/sortable-header";
import { AddSupplierModal } from "./add-supplier-modal";
import { archiveSupplierAction, saveSupplierAction, unarchiveSupplierAction } from "./actions";
import type { SupplierRow } from "@/lib/data/catalog";
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

export function SuppliersTab({
  suppliers: initialSuppliers,
  params,
  canWrite,
}: {
  suppliers: SupplierRow[];
  params: SearchParams;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const suppliers = initialSuppliers;
  const [search, setSearch] = useState(params.q ?? "");
  const [addOpen, setAddOpen] = useState(false);

  const filteredSuppliers = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const haystack = [s.name, s.company ?? "", s.phone ?? "", s.email ?? "", s.address ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [suppliers, search]);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedSuppliers = sortData(filteredSuppliers, sort || "name", sort ? dir : "asc", {
    name: "string",
    company: "string",
    phone: "string",
    email: "string",
    address: "string",
    is_active: "string",
  });

  const editing = params.edit ? suppliers.find((s) => s.id === params.edit) : undefined;
  const isEdit = Boolean(editing);

  function handleSaved() {
    startTransition(() => {
      router.refresh();
    });
    setAddOpen(false);
  }

  function handleArchive(formData: FormData) {
    startTransition(async () => {
      await archiveSupplierAction(formData);
      router.refresh();
    });
  }

  function handleUnarchive(formData: FormData) {
    startTransition(async () => {
      await unarchiveSupplierAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950 dark:text-slate-100">Suppliers</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(filteredSuppliers.length)} matching{" "}
            {filteredSuppliers.length === 1 ? "supplier" : "suppliers"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search suppliers</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier details"
              className="h-11 w-full rounded-lg border border-slate-200 bg-[#fff] py-2 pl-9 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 sm:w-72 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear supplier search"
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
              Add supplier
            </button>
          )}
        </div>
      </div>

      {canWrite && addOpen && (
        <AddSupplierModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={handleSaved}
          canWrite={canWrite}
        />
      )}

      {isEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Edit supplier: {editing!.name}
          </h3>
          <div className="mt-3">
            <SupplierFormEmbedded initialValues={editing} canWrite={canWrite} onSaved={handleSaved} />
          </div>
          <Link
            href="/products?tab=suppliers"
            className="mt-3 inline-block text-xs font-semibold text-slate-600 underline dark:text-slate-400"
          >
            Cancel edit
          </Link>
        </div>
      )}

      {sortedSuppliers.length === 0 ? (
        <EmptyState
          title={search ? "No matching suppliers" : "No suppliers yet"}
          description={
            search
              ? "Try another name, company, phone, email, or address."
              : "Suppliers are contacts you purchase inventory from. Add one to get started."
          }
          type={search ? "search" : "empty"}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
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
                            className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Edit
                          </Link>
                          {s.is_active ? (
                            <ConfirmForm action={handleArchive} message="Archive this supplier? Their purchase history will be preserved.">
                              <input type="hidden" name="id" value={s.id} />
                              <button type="submit" className="min-h-10 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                                Archive
                              </button>
                            </ConfirmForm>
                          ) : (
                            <form action={handleUnarchive}>
                              <input type="hidden" name="id" value={s.id} />
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
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleArchive(formData: FormData) {
    startTransition(async () => {
      await archiveSupplierAction(formData);
      router.refresh();
    });
  }

  function handleUnarchive(formData: FormData) {
    startTransition(async () => {
      await unarchiveSupplierAction(formData);
      router.refresh();
    });
  }

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
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {canWrite ? (
          <>
            <Link
              href={`/products?tab=suppliers&edit=${supplier.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Edit
            </Link>
            {supplier.is_active ? (
              <ConfirmForm action={handleArchive} message="Archive this supplier? Their purchase history will be preserved.">
                <input type="hidden" name="id" value={supplier.id} />
                <button type="submit" className="min-h-11 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                  Archive
                </button>
              </ConfirmForm>
            ) : (
              <form action={handleUnarchive}>
                <input type="hidden" name="id" value={supplier.id} />
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

function SupplierFormEmbedded({
  initialValues,
  canWrite,
  onSaved,
}: {
  initialValues?: Partial<SupplierRow>;
  canWrite: boolean;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveSupplierAction, { error: null, success: null });

  useEffect(() => {
    if (state.success) onSaved?.();
  }, [onSaved, state.success]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></span>
        <input
          required
          name="name"
          defaultValue={initialValues?.name ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Company (optional)</span>
        <input
          name="company"
          defaultValue={initialValues?.company ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Phone (optional)</span>
        <input
          name="phone"
          defaultValue={initialValues?.phone ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email (optional)</span>
        <input
          type="email"
          name="email"
          defaultValue={initialValues?.email ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Address (optional)</span>
        <input
          name="address"
          defaultValue={initialValues?.address ?? ""}
          disabled={!canWrite || pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes (optional)</span>
        <textarea
          name="notes"
          defaultValue={initialValues?.notes ?? ""}
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
            "Update supplier"
          ) : (
            "Add supplier"
          )}
        </button>
      </div>
    </form>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PK").format(value);
}
