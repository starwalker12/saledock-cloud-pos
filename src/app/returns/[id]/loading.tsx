import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReturnDetailLoading() {
  return (
    <AppShell pageTitle="Return Details">
      <div className="mb-4 flex justify-between print-hidden">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 space-y-6">
        {/* Return Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-44" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-3 w-16 ml-auto" />
            <Skeleton className="h-6 w-36 ml-auto" />
            <Skeleton className="h-3 w-28 ml-auto" />
          </div>
        </div>

        {/* Client & Cashier info */}
        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-3 w-16 ml-auto" />
            <Skeleton className="h-5 w-32 ml-auto" />
          </div>
        </div>

        {/* Return Items Table placeholder */}
        <div className="space-y-3 border-y border-slate-200 py-4">
          <div className="grid grid-cols-5 gap-4 text-xs font-bold text-slate-400">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Restocked</span>
            <span className="text-right">Refund Total</span>
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 items-center py-1">
              <div className="space-y-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-8 justify-self-end" />
              <Skeleton className="h-4 w-16 justify-self-end" />
              <Skeleton className="h-4 w-12 justify-self-end" />
              <Skeleton className="h-4.5 w-20 justify-self-end font-bold" />
            </div>
          ))}
        </div>

        {/* Totals Summary */}
        <div className="ml-auto w-full max-w-sm space-y-2 pt-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
