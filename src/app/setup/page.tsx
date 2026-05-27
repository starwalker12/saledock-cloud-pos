import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth/session";
import { env } from "@/lib/env";

export default async function SetupPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");

  const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
  if (needsOnboarding) redirect("/onboarding");

  if (profile?.organization_id) redirect("/dashboard");
  redirect("/onboarding");
}
