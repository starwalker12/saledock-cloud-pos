import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In — SaleDock Cloud POS",
  description: "Sign in to your SaleDock Cloud POS account to manage sales, check out, track inventory, coordinate repairs, and view reports.",
};
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { getPublicPlatformSetting } from "@/lib/platform/admin";
import { signOutAction } from "@/app/(auth)/actions";
import { ArrowRight, DoorOpen, LayoutDashboard } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/public-page-header";
import { getServerDict } from "@/lib/i18n/server";
import { Logo } from "@/components/logo";

function friendlyError(errorCode: string | undefined): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "auth_callback_failed":
      return "Sign-in link was invalid or expired. Please try again.";
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signup?: string }>;
}) {
  const { error, signup } = await searchParams;
  const { dict } = await getServerDict();
  const authDict = dict.auth as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => authDict?.[key] || fallback;

  const publicSignupRaw = await getPublicPlatformSetting("public_signup_enabled");
  const publicSignupEnabled = publicSignupRaw !== false && publicSignupRaw !== "false";
  const maintenanceRaw = await getPublicPlatformSetting("maintenance_mode_enabled");
  const maintenanceMode = maintenanceRaw === true || maintenanceRaw === "true";

  let signedInUser: { name: string; email: string; needsOnboarding: boolean } | null = null;

  if (env.isSupabaseConfigured) {
    const { user, profile, organization } = await getCurrentContext();
    if (user) {
      const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
      signedInUser = {
        name: profile?.full_name ?? user.email ?? "User",
        email: user.email ?? "",
        needsOnboarding,
      };
    }
  }

  const authCard = (
    <>
      {/* Logo */}
      <div className="mb-3.5 text-center">
        <Link
          href={signedInUser ? (signedInUser.needsOnboarding ? "/onboarding" : "/dashboard") : "/"}
          className="inline-block"
        >
          <Logo className="mx-auto mb-1.5 h-9 w-auto max-w-[150px]" />
        </Link>
      </div>

      {signedInUser ? (
        /* Signed-in card — no redirect, user can choose */
        <div className="space-y-5">
          <div className="rounded-xl bg-blue-50 px-4 py-4 text-center dark:bg-blue-950/30">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("signedInAs", "Signed in as {name}").replace("{name}", signedInUser.name)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{signedInUser.email}</p>
          </div>

          {signedInUser.needsOnboarding ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">{t("needsOnboarding", "Your shop setup is not complete")}</p>
              <p className="mt-1 text-xs">{t("needsOnboardingDesc", "You started setting up SaleDock but did not finish. You can continue where you left off or restart setup.")}</p>
            </div>
          ) : (
            <div className="text-center text-sm text-slate-500">
              {t("alreadyReady", "You are already signed in and your shop is ready.")}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {signedInUser.needsOnboarding ? (
              <>
                <Link
                  href="/onboarding"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
                >
                  <ArrowRight className="size-4" />
                  {t("continueSetup", "Continue setup")}
                </Link>
                <form action="/api/restart-setup" method="POST">
                  <button
                    type="button"
                    onClick={async () => {
                      const { restartSetupAction } = await import("@/app/(auth)/actions");
                      await restartSetupAction();
                    }}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {t("restartSetup", "Restart setup")}
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/dashboard"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
              >
                <LayoutDashboard className="size-4" />
                {t("goToDashboard", "Go to dashboard")}
              </Link>
            )}

            <form action={signOutAction}>
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <DoorOpen className="size-4" />
                {t("signOut", "Sign out")}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Login form for signed-out users */
        <>
          <div className="mb-3.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700 sm:tracking-[0.2em]">
              {t("brand", "SaleDock Cloud POS")}
            </p>
            <h1 className="mt-1 text-lg font-black text-slate-950 dark:text-white sm:text-xl">{t("signInTitle", "Sign in to your shop")}</h1>
            {maintenanceMode && (
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                {t("maintenanceDesc", "The system is undergoing scheduled maintenance. Please check back later.")}
              </p>
            )}
          </div>
          {maintenanceMode && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              {t("maintenanceActive", "Maintenance mode is active. Some features may be unavailable.")}
            </p>
          )}
          {!env.isSupabaseConfigured && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Supabase is not configured yet. Add credentials to <code>.env.local</code>.
            </p>
          )}
          {friendlyError(error) && (
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              {friendlyError(error)}
            </div>
          )}
          <LoginForm callbackError={error ?? null} publicSignupEnabled={publicSignupEnabled} initialMode={signup === "1" ? "sign-up" : "sign-in"} />
        </>
      )}

      {/* Legal footer */}
      <div className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        <Link href="/privacy" className="hover:text-blue-700">Privacy Policy</Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-blue-700">Terms of Service</Link>
        <span className="mx-2">·</span>
        <Link href="/data-deletion" className="hover:text-blue-700">Data Deletion</Link>
      </div>
    </>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950 sm:p-6 md:p-8 lg:p-12">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-[#fff] shadow-2xl dark:border-slate-800 dark:bg-slate-900 flex-col lg:flex-row min-h-[600px] lg:h-[650px]">
        {/* Left Column - Abstract Visual Banner */}
        <div className="relative hidden w-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white lg:flex lg:w-[45%] flex-col justify-between overflow-hidden border-r border-slate-200 dark:border-slate-800">
          {/* Subtle design grid/accents in background */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,var(--color-blue-500),transparent_60%)] pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

          {/* Banner content */}
          <div className="relative z-10 flex flex-col h-full justify-between">
            {/* Top brand space (badge removed) */}
            <div className="h-4" />

            {/* SVG Abstract Art Illustration */}
            <div className="my-auto py-6 flex items-center justify-center">
              <svg className="w-full max-w-[280px] h-auto drop-shadow-2xl" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* cash register / POS machine base outline */}
                <rect x="30" y="130" width="180" height="70" rx="16" fill="url(#posGradient)" stroke="#3b82f6" strokeWidth="2.5" className="opacity-90" />
                {/* register screen base */}
                <rect x="50" y="60" width="140" height="80" rx="12" fill="#020617" stroke="#3b82f6" strokeWidth="2.5" />
                {/* screen grid pattern */}
                <path d="M 60 70 L 180 70 M 60 90 L 180 90 M 60 110 L 180 110" stroke="#1e293b" strokeWidth="1" />
                {/* stylized sales bar chart on screen */}
                <rect x="70" y="110" width="16" height="20" rx="3" fill="#14b8a6" className="animate-pulse" />
                <rect x="94" y="95" width="16" height="35" rx="3" fill="#3b82f6" />
                <rect x="118" y="80" width="16" height="50" rx="3" fill="#06b6d4" />
                <rect x="142" y="70" width="16" height="60" rx="3" fill="#10b981" />
                {/* interactive check / transaction path line */}
                <path d="M 70 110 L 94 95 L 118 80 L 142 70" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" />
                
                {/* stylized receipt rolling out */}
                <path d="M 150 140 C 150 140, 165 155, 160 175 C 155 195, 175 200, 175 200" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 3" />
                <path d="M 148 145 H 172 M 153 155 H 177 M 150 165 H 174" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />

                {/* stylized floating coins / PKR shapes */}
                <circle cx="205" cy="80" r="14" fill="url(#coinGradient)" stroke="#0d9488" strokeWidth="2" />
                <path d="M 205 73 V 87 M 201 77 H 209 M 201 83 H 209" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="215" cy="115" r="10" fill="url(#coinGradient)" stroke="#0d9488" strokeWidth="1.5" />

                {/* glowing dots / network connectivity */}
                <circle cx="45" cy="50" r="4" fill="#10b981" />
                <circle cx="195" cy="45" r="3" fill="#3b82f6" />
                <circle cx="25" cy="110" r="5" fill="#f59e0b" />

                {/* Gradients */}
                <defs>
                  <linearGradient id="posGradient" x1="30" y1="130" x2="210" y2="200" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1e293b" />
                    <stop offset="0.5" stopColor="#0f172a" />
                    <stop offset="1" stopColor="#020617" />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="70" y1="110" x2="142" y2="70" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#22d3ee" />
                    <stop offset="1" stopColor="#34d399" />
                  </linearGradient>
                  <linearGradient id="coinGradient" x1="191" y1="66" x2="219" y2="94" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#0d9488" />
                    <stop offset="1" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Bottom info section */}
            <div className="space-y-2">
              <h4 className="text-base font-bold text-white">Streamline shop transactions</h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Access your secure checkout, repairs tracking, ledger reconciliation, and business insights from any device.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Login Form */}
        <div className="flex flex-1 flex-col justify-between p-4 sm:p-6 lg:p-7 overflow-y-auto lg:h-full">
          {/* Header controls at the top of the form */}
          <div className="w-full">
            <PublicPageHeader showLanguage={true} compact={true} />
          </div>

          {/* Form in center */}
          <div className="my-auto w-full max-w-md mx-auto py-4">
            {authCard}
          </div>
        </div>
      </div>
    </main>
  );
}
