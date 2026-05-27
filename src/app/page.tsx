import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";

export default async function HomePage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
  redirect(needsOnboarding ? "/onboarding" : "/dashboard");
}
