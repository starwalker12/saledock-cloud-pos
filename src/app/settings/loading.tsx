import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <AppShell pageTitle="Settings">
      <div className="w-full space-y-5">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <div className="grid gap-4 md:grid-cols-2">
              {[...Array(4)].map((__, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
