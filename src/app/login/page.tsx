import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function isRegistrationOpen() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true });
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (env.isSupabaseConfigured) {
    const { user, profile, organization } = await getCurrentContext();
    if (user) {
      const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
      redirect(needsOnboarding ? "/onboarding" : "/dashboard");
    }
  }

  const registrationOpen = env.isSupabaseConfigured ? await isRegistrationOpen() : true;
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gadget-zone-logo.png"
            alt="Gadget Zone Logo"
            className="mx-auto mb-4 h-16 w-auto max-w-[120px] object-contain rounded-2xl"
          />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 sm:tracking-[0.28em]">
            Gadget Zone
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Online POS</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {registrationOpen
              ? "Registration is open for new shops. Sign in or create a new account to get started."
              : "Sign in to your account."}
          </p>
        </div>
        {!env.isSupabaseConfigured && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            Supabase is not configured yet. Add credentials to <code>.env.local</code>.
          </p>
        )}
        <LoginForm registrationOpen={registrationOpen} callbackError={error ?? null} />
      </section>
    </main>
  );
}
