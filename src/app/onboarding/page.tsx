import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");

  const onboardingDone = profile?.onboarding_completed && organization?.onboarding_completed && profile?.organization_id;
  if (onboardingDone) redirect("/dashboard");

  const defaultFullName = profile?.full_name ?? ((user.user_metadata as { full_name?: string } | null)?.full_name ?? "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/saledock-logo.svg"
            alt="SaleDock"
            className="mx-auto mb-4 h-10 w-auto max-w-[80px] object-contain rounded-2xl"
          />
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700">
            SaleDock Cloud POS
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Set up your shop</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Complete the steps below to create your organization and start selling.
          </p>
        </div>
        <OnboardingWizard defaultFullName={defaultFullName} userEmail={user.email ?? ""} />
      </section>
    </main>
  );
}
