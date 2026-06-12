import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";

export default function ConfirmLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-center">
          <Logo className="h-10 w-auto object-contain" />
        </div>
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-white">
          <Loader2 className="size-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Confirming your email...</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Please wait while we verify your secure confirmation link with Supabase.
          </p>
        </div>
      </div>
    </main>
  );
}
