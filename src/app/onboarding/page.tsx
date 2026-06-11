import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { signOutAction } from "@/app/(auth)/actions";
import { OnboardingWizard } from "./onboarding-wizard";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function OnboardingPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");

  const onboardingDone = profile?.onboarding_completed && organization?.onboarding_completed && profile?.organization_id;
  if (onboardingDone) redirect("/dashboard");

  const defaultFullName = profile?.full_name ?? ((user.user_metadata as { full_name?: string } | null)?.full_name ?? "");

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-3 py-8 sm:px-4 sm:py-10 dark:bg-slate-950">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6 z-50">
        <ThemeToggle />
      </div>
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-[#fff] p-5 shadow-xl sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-8 text-center">
          <Link href="/onboarding" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-4 h-14 w-auto max-w-[220px] object-contain"
            />
          </Link>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">Set up your shop</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Complete the steps below to create your organization and start selling.
          </p>
        </div>

        <OnboardingWizard defaultFullName={defaultFullName} userEmail={user.email ?? ""} userId={user.id} />

        {/* Recovery buttons */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-slate-200 pt-6 dark:border-slate-600">
          <p className="text-xs text-slate-400 dark:text-slate-500">Need to switch accounts?</p>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-[#fff] text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              Sign out and use another account
            </button>
          </form>
          <Link
            href="/login"
            className="text-xs text-slate-400 underline underline-offset-2 hover:text-blue-700 dark:text-slate-500 dark:hover:text-blue-400"
          >
            Back to login
          </Link>
        </div>

        {/* Legal footer */}
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          <Link href="/privacy" className="hover:text-blue-700">Privacy Policy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-blue-700">Terms of Service</Link>
          <span className="mx-2">·</span>
          <Link href="/data-deletion" className="hover:text-blue-700">Data Deletion</Link>
        </div>
      </section>
    </main>
  );
}
