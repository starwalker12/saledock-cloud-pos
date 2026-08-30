import { Skeleton } from "@/components/ui/skeleton";

export function TopbarLoading({ pageTitle }: { pageTitle?: string }) {
  const title = pageTitle ?? "Dashboard";

  return (
    <header
      aria-hidden="true"
      className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-[#fff]/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
    >
      <div className="flex h-14 items-center justify-between px-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-9 shrink-0" />
          <span className="truncate text-lg font-black text-slate-950 dark:text-slate-50">
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="size-9" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>

      <div className="hidden min-h-20 min-w-0 flex-col gap-3 px-3 py-4 sm:px-6 md:flex lg:flex-row lg:items-center lg:justify-between">
        <span className="truncate text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
          {title}
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <Skeleton className="h-11 w-full max-w-md" />
          <Skeleton className="size-11 shrink-0" />
          <Skeleton className="size-11 shrink-0 rounded-full" />
        </div>
      </div>
    </header>
  );
}
