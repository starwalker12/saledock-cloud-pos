import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";

type SaleDockLoadingProps = {
  title?: string;
  description?: string;
  fullScreen?: boolean;
};

export function SaleDockLoading({
  title = "Loading SaleDock...",
  description = "Preparing your workspace.",
  fullScreen = true,
}: SaleDockLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
      className={`flex items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950 ${
        fullScreen ? "min-h-dvh" : "min-h-[240px]"
      }`}
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo className="h-12 w-auto max-w-[210px] object-contain sm:h-14" />
        <div className="mt-5 flex items-center gap-2 text-blue-700 dark:text-teal-300">
          <Loader2
            className="size-5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {title}
          </p>
        </div>
        <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}
