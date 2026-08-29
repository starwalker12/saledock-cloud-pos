import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierPurchasesLoading() {
  return (
    <AppShell isLoading pageTitle="Supplier Purchases">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="size-5 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-6 w-20" />
            <Skeleton className="mt-1 h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Card header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>

        {/* Filters row */}
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            <div className="block min-w-0">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-1 h-10 w-full rounded-lg lg:w-56" />
            </div>
            <div className="block min-w-0">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-1 h-10 w-full rounded-lg lg:w-56" />
            </div>
            <div className="block min-w-0">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="mt-1 h-10 w-full rounded-lg lg:w-40" />
            </div>
            <div className="block min-w-0">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="mt-1 h-10 w-full rounded-lg lg:w-auto" />
            </div>
            <div className="block min-w-0">
              <Skeleton className="h-3 w-5" />
              <Skeleton className="mt-1 h-10 w-full rounded-lg lg:w-auto" />
            </div>
            <Skeleton className="h-10 w-16 rounded-lg" />
          </div>

          {/* Table skeleton */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {[...Array(8)].map((_, i) => (
                    <th key={i} className="px-3 py-3">
                      <Skeleton className="h-3 w-14" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-slate-100 dark:border-slate-800">
                    {[...Array(8)].map((_, colIdx) => (
                      <td key={colIdx} className={`px-3 py-3 ${colIdx >= 3 && colIdx <= 5 ? "text-right" : ""}`}>
                        <Skeleton className={`h-4 ${colIdx === 1 ? "w-20" : colIdx === 0 ? "w-24" : colIdx === 2 ? "w-28" : colIdx === 7 ? "w-10" : "w-14"}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Supplier dues card skeleton */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-1 h-3 w-56" />
        </div>
        <div className="overflow-x-auto p-5 sm:p-6">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                {[...Array(4)].map((_, i) => (
                  <th key={i} className={`px-3 py-3 ${i === 2 ? "text-right" : ""}`}>
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(3)].map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-100 dark:border-slate-800">
                  {[...Array(4)].map((_, colIdx) => (
                    <td key={colIdx} className={`px-3 py-3 ${colIdx === 2 ? "text-right" : ""}`}>
                      <Skeleton className={`h-4 ${colIdx === 0 ? "w-28" : colIdx === 2 ? "w-16" : "w-20"}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
