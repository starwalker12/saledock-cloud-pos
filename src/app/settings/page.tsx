import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { canManageSettings } from "@/lib/permissions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const settings = await getBrandingSettings(profile.organization_id, profile.branch_id);
  const canEdit = canManageSettings(profile.role);

  return (
    <AppShell pageTitle="Settings">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Shop profile
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Settings & Branding
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Manage the real shop and branch details used across invoices, repair
            receipts, management reports, and future WhatsApp sharing.
          </p>
        </div>

        <SettingsForm
          settings={settings}
          canEdit={canEdit}
          organizationId={profile.organization_id}
          branchId={profile.branch_id}
        />
      </div>
    </AppShell>
  );
}
