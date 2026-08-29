import { Skeleton } from "@/components/ui/skeleton";

export function SidebarLoading() {
  return (
    <aside
      aria-hidden="true"
      className="hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-800 bg-[#07152b] px-3 py-4 lg:flex"
    >
      <div className="flex h-14 items-center gap-3 px-2">
        <Skeleton className="size-10 shrink-0 rounded-full bg-white/15 dark:bg-white/15" />
        <Skeleton className="h-6 w-32 bg-white/15 dark:bg-white/15" />
      </div>
      <div className="mt-4 flex items-center justify-between border-y border-white/10 py-3">
        <Skeleton className="h-9 w-28 bg-white/10 dark:bg-white/10" />
        <Skeleton className="size-9 bg-white/10 dark:bg-white/10" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="flex h-11 items-center gap-3 px-3">
            <Skeleton className="size-5 shrink-0 bg-white/10 dark:bg-white/10" />
            <Skeleton
              className={`h-3 bg-white/10 dark:bg-white/10 ${index % 3 === 0 ? "w-24" : "w-32"}`}
            />
          </div>
        ))}
      </div>
      <Skeleton className="mt-auto h-11 w-full bg-white/10 dark:bg-white/10" />
    </aside>
  );
}

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
