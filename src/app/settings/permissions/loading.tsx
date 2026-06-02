import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaffPermissionsLoading() {
  return (
    <AppShell pageTitle="Staff Permissions">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1 h-3 w-56" />
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                    <Skeleton className="size-5 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4">
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
