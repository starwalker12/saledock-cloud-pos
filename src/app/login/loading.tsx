import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-3 py-8">
      {/* Top controls */}
      <div className="mb-3 flex w-full max-w-2xl items-center justify-between sm:mb-4">
        <Skeleton className="h-10 w-32 rounded-xl sm:h-11" />
        <Skeleton className="h-10 w-20 rounded-xl sm:h-11" />
        <Skeleton className="h-10 w-20 rounded-xl sm:h-11" />
      </div>

      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
        <div className="mx-auto max-w-md">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Skeleton className="h-14 w-[180px] rounded-lg sm:h-16" />
        </div>

        <div className="mb-6 space-y-3 text-center">
          <Skeleton className="mx-auto h-3 w-40" />
          <Skeleton className="mx-auto h-7 w-56 sm:h-8" />
        </div>

        {/* Tabs skeleton */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Captcha placeholder */}
          <div className="flex justify-center">
            <Skeleton className="h-16 w-[200px] rounded-lg" />
          </div>

          {/* Submit button */}
          <Skeleton className="h-12 w-full rounded-xl" />

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-slate-200" />
            <Skeleton className="h-3 w-6" />
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* OAuth buttons */}
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Forgot password */}
          <div className="flex justify-center">
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Legal footer */}
        <div className="mt-8 flex justify-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-4" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-4" />
          <Skeleton className="h-3 w-20" />
        </div>
        </div>
      </section>
    </main>
  );
}
