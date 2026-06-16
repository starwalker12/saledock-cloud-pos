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
      className={`flex items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950 ${
        fullScreen ? "min-h-screen" : "min-h-[320px]"
      }`}
    >
      <div className="flex w-full max-w-md flex-col items-center rounded-[2rem] border border-slate-200 bg-[#fff] px-6 py-8 text-center shadow-2xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 sm:px-8 sm:py-10">
        <Logo className="h-20 w-auto max-w-[250px] object-contain sm:h-24 sm:max-w-[320px]" />
        <div className="mt-7 flex size-16 items-center justify-center rounded-full bg-blue-50 text-blue-700 shadow-inner dark:bg-white/10 dark:text-white sm:size-20">
          <Loader2 className="size-10 animate-spin sm:size-12" aria-hidden="true" />
        </div>
        <p className="mt-5 text-base font-black text-slate-900 dark:text-white sm:text-lg">{title}</p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}
