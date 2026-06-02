import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatementLoading() {
  return (
    <AppShell pageTitle="Supplier Statement">
      <div className="print-hidden mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>

      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-6 dark:border-slate-800 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-14 w-[180px]" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="space-y-2 sm:text-right">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800 sm:grid-cols-2 sm:px-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-6 py-5 sm:px-8">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                {[...Array(6)].map((_, i) => (
                  <th key={i} className={`pb-3 ${i >= 3 ? "px-2 text-right" : i >= 1 ? "px-2" : "pr-3"}`}>
                    <Skeleton className={`h-3 ${i === 0 ? "w-12" : i === 5 ? "w-14" : "w-10"}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(6)].map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-100 dark:border-slate-800">
                  {[...Array(6)].map((_, colIdx) => (
                    <td key={colIdx} className={`py-3 ${colIdx >= 3 ? "px-2 text-right" : colIdx >= 1 ? "px-2" : "pr-3"}`}>
                      <Skeleton className={`h-4 ${colIdx === 0 ? "w-24" : colIdx === 5 ? "w-16" : "w-14"}`} />
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
