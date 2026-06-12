import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <AppShell pageTitle="Settings">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left sidebar settings menu tabs list skeleton */}
            <div className="flex flex-row gap-1 border-b border-slate-100 pb-2 dark:border-slate-800 lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6 lg:w-60">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-20 rounded-xl lg:w-full" />
              ))}
            </div>

            {/* Right main area: settings form fields skeleton */}
            <div className="flex-1 space-y-6">
              <div className="space-y-1">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-72" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-[42px] w-full rounded-xl" />
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                <Skeleton className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
