import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

export default function SupplierPurchaseDetailLoading() {
  return (
    <AppShell pageTitle="Purchase details" isLoading>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton
                    className={`h-4 ${index % 2 === 0 ? "w-36" : "w-28"}`}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <Skeleton className="mb-4 h-5 w-36" />
            <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 md:block">
              <div className="grid grid-cols-[minmax(0,1fr)_80px_110px_110px] gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-3 w-16" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_80px_110px_110px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0 dark:border-slate-800"
                >
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <div className="space-y-3 md:hidden">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <Skeleton className="mb-4 h-5 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <Skeleton className="mb-4 h-5 w-20" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton
                    className={`h-4 ${index === 2 ? "w-24" : "w-20"}`}
                  />
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
