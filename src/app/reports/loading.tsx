import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <AppShell pageTitle="Reports">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-full" />
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
            <Skeleton className="h-9 w-28 rounded-md mt-2" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
