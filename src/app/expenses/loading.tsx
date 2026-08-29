import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpensesLoading() {
  return (
    <AppShell isLoading pageTitle="Expenses">
      {/* Stats header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-32" />
            <Skeleton className="mt-4 h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Table header + rows */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-5 gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16 justify-self-end" />
            <Skeleton className="h-3 w-12 justify-self-end" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 justify-self-end" />
              <Skeleton className="h-6 w-14 justify-self-end rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
