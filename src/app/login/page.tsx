import Link from "next/link";
import { LoginForm } from "./login-form";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { getPublicPlatformSetting } from "@/lib/platform/admin";
import { signOutAction } from "@/app/(auth)/actions";
import { ArrowLeft, ArrowRight, DoorOpen, LayoutDashboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { getServerDict } from "@/lib/i18n/server";

function friendlyError(errorCode: string | undefined): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "facebook_invalid_scopes":
      return "Facebook login is almost ready, but the email permission is not enabled in Meta yet. Please contact the platform owner.";
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
      {/* Top controls */}
      <div className="mb-3 flex w-full max-w-md items-center justify-between sm:mb-4">
        <Link
          href="/"
          className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-900 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
          aria-label="Back to home"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="hidden sm:inline">{t("backToHome", "Back to home")}</span>
        </Link>
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link
            href={signedInUser ? (signedInUser.needsOnboarding ? "/onboarding" : "/dashboard") : "/"}
            className="inline-block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-4 h-14 w-auto max-w-[200px] object-contain sm:h-16"
            />
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
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 sm:tracking-[0.28em]">
                {t("brand", "SaleDock Cloud POS")}
              </p>
              <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{t("signInTitle", "Sign in to your shop")}</h1>
              {maintenanceMode && (
                <p className="mt-3 text-sm leading-6 text-slate-500">
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
        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
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
