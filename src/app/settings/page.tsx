import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext, signProfilePictureUrl } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { canManageSettings } from "@/lib/permissions";
import { getPublicPlatformSetting } from "@/lib/platform/admin";
import { SettingsForm } from "./settings-form";
import { DemoTab } from "./demo-tab";
import { BackupTab } from "./backup-tab";
import { ConnectedAccounts } from "./connected-accounts";
import { PrivacyCenter } from "./privacy-center";
import { HelpCenter } from "./help-center";
import { getLinkedProviders } from "@/lib/auth/identities";
import { createClient } from "@/lib/supabase/server";
import { getServerDict } from "@/lib/i18n/server";
import { AlertTriangle } from "lucide-react";
import { SettingsTabShell, type TabDef } from "@/components/settings/settings-tab-shell";
import { SettingsSecurity } from "./settings-security";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  link?: string;
  provider?: string;
  error_code?: string;
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const params = await searchParams;
  const currentTab = params.tab ?? "general";
  const linkParam = params.link ?? null;
  const { dict } = await getServerDict();

  // Fetch fresh auth user for linked provider detection (server-side has full identities)
  const supabase = await createClient();
  const { data: { user: freshUser } } = await supabase.auth.getUser();
  const linkedProviders = getLinkedProviders(freshUser);

  const settings = await getBrandingSettings(profile.organization_id, profile.branch_id);
  const profilePictureUrl = await signProfilePictureUrl(profile?.profile_picture_url ?? profile?.avatar_url ?? null);
  const canEdit = canManageSettings(profile.role);
  const isPrivileged = profile.role === "owner" || profile.role === "admin";

  const demoDataEnabled = (await getPublicPlatformSetting("demo_data_enabled")) !== false;
  const backupImportEnabled = (await getPublicPlatformSetting("backup_import_enabled")) !== false;
  const factoryResetEnabled = (await getPublicPlatformSetting("factory_reset_enabled")) !== false;

  const SHOW_DEMO_TAB = false; // Set to true to re-enable the Demo Data tab

  // Tab configurations (serializable — icon is a string key)
  const tabs: TabDef[] = [
    { id: "general", label: "Shop Profile", icon: "general" },
    { id: "accounts", label: "Connected Accounts", icon: "accounts" },
    { id: "privacy", label: "Privacy Center", icon: "privacy" },
    { id: "security", label: "Security", icon: "security" },
    { id: "help", label: "Help Center", icon: "help" },
    ...(isPrivileged ? [
      ...(SHOW_DEMO_TAB ? [{ id: "demo-data", label: "Demo Data", icon: "demo-data" }] : []),
      { id: "backup", label: "Backup & Restore", icon: "backup" },
    ] : [])
  ];

  return (
    <AppShell pageTitle="Settings">
      <SettingsTabShell
        currentTab={currentTab}
        tabs={tabs}
        heading="Settings"
        description="Manage shop profile, connected accounts, privacy, security, help, and backups."
      >
        {currentTab === "general" && (
          <SettingsForm
            settings={settings}
            canEdit={canEdit}
            organizationId={profile.organization_id}
            branchId={profile.branch_id}
            userId={user.id}
            profilePictureUrl={profilePictureUrl}
          />
        )}

        {currentTab === "demo-data" && (
          (isPrivileged && SHOW_DEMO_TAB) ? (
            <DemoTab demoDataEnabled={demoDataEnabled} />
          ) : (
            <AccessDeniedView />
          )
        )}

        {currentTab === "backup" && (
          isPrivileged ? (
            <BackupTab
              backupImportEnabled={backupImportEnabled}
              factoryResetEnabled={factoryResetEnabled}
              backupGuardLabels={dict.backupGuard as Record<string, string>}
              hasPassword={linkedProviders.hasPassword}
              shopName={organization?.name || "SaleDock Cloud POS"}
              isOwner={profile.role === "owner"}
            />
          ) : (
            <AccessDeniedView />
          )
        )}

        {currentTab === "accounts" && (
          <ConnectedAccounts
            linkParam={linkParam}
            providerParam={params.provider}
            linkedProviders={linkedProviders}
            userEmail={freshUser?.email ?? null}
          />
        )}

        {currentTab === "privacy" && (
          <PrivacyCenter />
        )}

        {currentTab === "security" && (
          <SettingsSecurity
            linkedProviders={linkedProviders}
            userEmail={freshUser?.email ?? null}
          />
        )}

        {currentTab === "help" && (
          <HelpCenter />
        )}
      </SettingsTabShell>
    </AppShell>
  );
}

function AccessDeniedView() {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-[#fff] p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <AlertTriangle className="mx-auto size-12 text-amber-500" />
      <h3 className="text-lg font-black text-slate-950">Access Denied</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto leading-6">
        This configuration module requires Owner or Administrator permissions.
        Authorized operations like seeder deployment or database restoration are locked.
      </p>
    </div>
  );
}
