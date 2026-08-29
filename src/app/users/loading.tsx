import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <AppShell isLoading pageTitle="Users">
      <div className="space-y-6">
        {/* Header section */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-[#fff] p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="size-6 rounded-lg" />
              </div>
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-1 h-3 w-28" />
            </div>
          ))}
        </div>

        {/* Filter/sort bar */}
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>

        {/* Users table */}
        <div className="rounded-2xl border border-slate-200 bg-[#fff] dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-4 dark:border-slate-800">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-5 gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16 justify-self-end" />
            </div>
            {[...Array(5)].map((_, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 border-b border-slate-100 py-3 last:border-0 items-center dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <div className="flex gap-2 justify-self-end">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="size-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
