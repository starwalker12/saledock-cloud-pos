import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <AppShell pageTitle="Settings">
      <div className="max-w-2xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-72" />
          <div className="space-y-4 pt-2 border-t border-slate-100">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-28 rounded-md mt-2" />
        </div>
      </div>
    </AppShell>
  );
}
