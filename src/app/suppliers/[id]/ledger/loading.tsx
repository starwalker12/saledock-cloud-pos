import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierLedgerLoading() {
  return (
    <AppShell isLoading pageTitle="Supplier Details">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
            </div>
          </section>

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-4 dark:border-slate-800">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-none">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
