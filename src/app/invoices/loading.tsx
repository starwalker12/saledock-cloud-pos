import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesLoading() {
  return (
    <AppShell pageTitle="Invoices">
      {/* Search Filter Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Invoice Table list */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-6 gap-4 pb-2 border-b border-slate-200">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 text-right justify-self-end" />
            <Skeleton className="h-4 w-16 text-right justify-self-end" />
          </div>

          {[...Array(6)].map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 py-2 border-b border-slate-100 last:border-0 items-center">
              <Skeleton className="h-4.5 w-20 font-mono" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4.5 w-36" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4.5 w-20 justify-self-end" />
              <Skeleton className="h-4.5 w-20 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
