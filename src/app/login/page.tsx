import Link from "next/link";
import { LoginForm } from "./login-form";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { getPublicPlatformSetting } from "@/lib/platform/admin";
import { signOutAction } from "@/app/(auth)/actions";
import { ArrowRight, DoorOpen, LayoutDashboard } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signup?: string }>;
}) {
  const { error, signup } = await searchParams;

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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link
            href={signedInUser ? (signedInUser.needsOnboarding ? "/onboarding" : "/dashboard") : "/"}
            className="inline-block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo.svg"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-4 h-16 w-auto max-w-[200px] object-contain"
            />
          </Link>
        </div>

        {signedInUser ? (
          /* Signed-in card — no redirect, user can choose */
          <div className="space-y-5">
            <div className="rounded-xl bg-blue-50 px-4 py-4 text-center dark:bg-blue-950/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Signed in as {signedInUser.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{signedInUser.email}</p>
            </div>

            {signedInUser.needsOnboarding ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">You are signed in but your shop setup is not complete.</p>
                <p className="mt-1 text-xs">Continue setting up your shop or sign out to use another account.</p>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500">
                You are already signed in and your shop is ready.
              </div>
            )}

            <div className="flex flex-col gap-2">
              {signedInUser.needsOnboarding ? (
                <Link
                  href="/onboarding"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
                >
                  <ArrowRight className="size-4" />
                  Continue setup
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
                >
                  <LayoutDashboard className="size-4" />
                  Go to dashboard
                </Link>
              )}

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <DoorOpen className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Login form for signed-out users */
          <>
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 sm:tracking-[0.28em]">
                SaleDock Cloud POS
              </p>
              <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Sign in to your shop</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {maintenanceMode
                  ? "The system is undergoing scheduled maintenance. Please check back later."
                  : publicSignupEnabled
                    ? "Registration is open for new shops. Sign in or create a new account to get started."
                    : "Sign in to your account."}
              </p>
            </div>
            {maintenanceMode && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Maintenance mode is active. Some features may be unavailable.
              </p>
            )}
            {!env.isSupabaseConfigured && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Supabase is not configured yet. Add credentials to <code>.env.local</code>.
              </p>
            )}
            <LoginForm callbackError={error ?? null} publicSignupEnabled={publicSignupEnabled} initialMode={signup === "1" ? "sign-up" : "sign-in"} />
          </>
        )}

        {/* Legal footer */}
        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          <Link href="/privacy" className="hover:text-blue-700">Privacy Policy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-blue-700">Terms of Service</Link>
        </div>
      </section>
    </main>
  );
}
