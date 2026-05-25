import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";

export default async function HomePage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  redirect(profile?.organization_id ? "/dashboard" : "/setup");
}
