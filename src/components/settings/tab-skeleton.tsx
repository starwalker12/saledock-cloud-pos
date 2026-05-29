import { Skeleton } from "@/components/ui/skeleton";

export function TabSkeleton({ tabId }: { tabId: string }) {
  switch (tabId) {
    case "general":
      return (
        <div className="space-y-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-64" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "accounts":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-72" />
          <div className="mt-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      );
    case "privacy":
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-56" />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-6 w-12" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-10 w-32 rounded-lg" />
          </div>
        </div>
      );
    case "demo-data":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-48" />
          <Skeleton className="mt-4 h-10 w-full rounded-xl" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
      );
    case "backup":
      return (
        <div className="space-y-5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-2 h-3 w-56" />
              <Skeleton className="mt-4 h-10 w-full rounded-xl" />
              <Skeleton className="mt-3 h-10 w-40 rounded-lg" />
            </div>
          ))}
        </div>
      );
    case "security":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-64" />
          <div className="mt-5 space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
          <div className="mt-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      );
  }
}
