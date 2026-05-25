import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function PosLoading() {
  return (
    <AppShell pageTitle="New Sale">
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        {/* Left Side: Search + Product Grid */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-36" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <Skeleton className="h-4.5 w-full" />
                <Skeleton className="h-3 w-24" />
                <div className="flex justify-between items-center pt-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Cart Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 self-start">
          <Skeleton className="h-5 w-24" />
          
          {/* Cart items list placeholder */}
          <div className="space-y-3 border-y border-slate-100 py-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>

          {/* Form blocks */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          {/* Checkout Totals */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex justify-between"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /></div>
            <div className="flex justify-between border-t border-slate-100 pt-1"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-20" /></div>
          </div>

          <Skeleton className="h-11 w-full rounded-xl mt-3" />
        </div>
      </div>
    </AppShell>
  );
}
