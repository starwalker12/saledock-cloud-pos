import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <AppShell pageTitle="Users">
      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-5 w-44" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
