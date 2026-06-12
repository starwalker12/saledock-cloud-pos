import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DailyClosingLoading() {
  return (
    <AppShell pageTitle="Daily Closing">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02] space-y-2">
                <Skeleton className="h-4.5 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
            <Skeleton className="h-5 w-36" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
