import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewReplenishment } from "@/lib/permissions";
import { env } from "@/lib/env";
import { getReplenishmentSuggestions } from "@/lib/data/replenishment";
import { ReplenishmentUI } from "./replenishment-ui";

export default async function ReplenishmentPage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");
  if (!canViewReplenishment(profile.role)) redirect("/dashboard");

  const orgId = profile.organization_id;
  const currency = organization?.currency_code ?? "PKR";

  const summary = await getReplenishmentSuggestions(orgId);

  return (
    <AppShell pageTitle="Replenishment">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-base font-black text-slate-950 dark:text-white">Inventory Replenishment</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Products that need reordering, grouped by supplier
              </p>
            </div>
          </div>
        </div>

        <ReplenishmentUI summary={summary} currency={currency} />
      </div>
    </AppShell>
  );
}
