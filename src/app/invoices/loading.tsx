import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesLoading() {
  return (
    <AppShell pageTitle="Invoices">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="flex items-center gap-3 justify-between sm:justify-end">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
