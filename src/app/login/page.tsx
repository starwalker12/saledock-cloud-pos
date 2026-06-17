import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { ThemeImage } from "@/components/theme-image";

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

            {/* Onboarding-themed illustration */}
            <div className="my-auto py-6 flex items-center justify-center">
              <ThemeImage
                lightSrc="/onboarding-ecosystem-light.png"
                darkSrc="/onboarding-ecosystem-dark.png"
                lightWidth={533}
                lightHeight={800}
                darkWidth={640}
                darkHeight={800}
                alt="Shop setup with checklist, location pin, branding, and secure login"
                className="w-full max-w-[320px] h-auto drop-shadow-2xl"
                priority
              />
            </div>

            {/* Bottom info section */}
            <div className="space-y-2">
              <h4 className="text-base font-bold text-white">Set up your shop in minutes</h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Create your shop profile, set your location, add your branding, and start selling securely from any device.
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
