import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

function FormCard({
  titleWidth,
  children,
}: {
  titleWidth: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className={`mb-4 h-5 ${titleWidth}`} />
      {children}
    </section>
  );
}

function Field({ wide = false }: { wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className={`mt-2 w-full ${wide ? "h-16" : "h-10"}`} />
    </div>
  );
}

export default function NewSupplierPurchaseLoading() {
  return (
    <AppShell pageTitle="Record purchase" isLoading>
      <Skeleton className="mb-3 h-4 w-28" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <FormCard titleWidth="w-20">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field />
              <Field />
              <Field />
              <Field wide />
            </div>
          </FormCard>

          <FormCard titleWidth="w-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full sm:w-24" />
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px] gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-3 w-16" />
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0 dark:border-slate-800"
                >
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-4 w-16 self-center" />
                </div>
              ))}
            </div>
          </FormCard>
        </div>

        <aside className="space-y-5">
          <FormCard titleWidth="w-20">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </FormCard>
          <FormCard titleWidth="w-36">
            <div className="space-y-4">
              <Field />
              <Field />
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </FormCard>
          <Skeleton className="h-11 w-full" />
        </aside>
      </div>
    </AppShell>
  );
}
