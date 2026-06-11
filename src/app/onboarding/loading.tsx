import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-3 py-8 sm:px-4 sm:py-10 dark:bg-slate-950">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-[#fff] p-5 shadow-xl sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Skeleton className="h-14 w-[200px] rounded-lg" />
          </div>
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-72" />
        </div>

        {/* Progress steps */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              {i < 3 && <Skeleton className="h-1 w-12" />}
            </div>
          ))}
        </div>

        {/* Form fields */}
        <div className="space-y-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>

        {/* Submit button */}
        <Skeleton className="mt-6 h-12 w-full rounded-xl" />

        {/* Recovery links */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-slate-200 pt-6 dark:border-slate-600">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-3 w-28" />
        </div>

        {/* Legal footer */}
        <div className="mt-6 flex justify-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-4" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </section>
    </main>
  );
}
