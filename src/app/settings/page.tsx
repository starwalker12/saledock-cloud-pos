import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { canManageSettings } from "@/lib/permissions";
import { getPublicPlatformSetting } from "@/lib/platform/admin";
import { SettingsForm } from "./settings-form";
import { DemoTab } from "./demo-tab";
import { BackupTab } from "./backup-tab";
import { ConnectedAccounts } from "./connected-accounts";
import { PrivacyCenter } from "./privacy-center";
import { AlertTriangle, Settings, Database, Archive, ShieldCheck, UserCircle, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  link?: string;
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const params = await searchParams;
  const currentTab = params.tab ?? "general";
  const linkParam = params.link ?? null;

  const settings = await getBrandingSettings(profile.organization_id, profile.branch_id);
  const profilePictureUrl = profile?.profile_picture_url ?? profile?.avatar_url ?? null;
  const canEdit = canManageSettings(profile.role);
  const isPrivileged = profile.role === "owner" || profile.role === "admin";

  const demoDataEnabled = (await getPublicPlatformSetting("demo_data_enabled")) !== false;
  const backupImportEnabled = (await getPublicPlatformSetting("backup_import_enabled")) !== false;
  const factoryResetEnabled = (await getPublicPlatformSetting("factory_reset_enabled")) !== false;

  // Tab configurations
  const tabs = [
    { id: "general", label: "Shop Profile", icon: Settings },
    { id: "accounts", label: "Connected Accounts", icon: UserCircle },
    { id: "privacy", label: "Privacy Center", icon: Shield },
    ...(isPrivileged ? [
      { id: "demo-data", label: "Demo Data", icon: Database },
      { id: "backup", label: "Backup & Restore", icon: Archive },
      { id: "security", label: "Security", icon: ShieldCheck }
    ] : [])
  ];

  return (
    <AppShell pageTitle="Settings">
      <div className="w-full space-y-6">
        {/* Page Heading and Tabs Navigation */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Settings</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Configure organizational credentials, manage demonstration databases, or package offline backup archives.
            </p>
          </div>

          {/* Premium Tab bar navigation */}
          <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/settings?tab=${tab.id}`}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition duration-200 shrink-0 ${
                    isActive
                      ? "border-blue-700 text-blue-700 bg-blue-50/50 rounded-t-xl dark:border-slate-100 dark:text-slate-100 dark:bg-slate-900/40"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:border-slate-700"
                  }`}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Tab Render Content */}
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
          isPrivileged ? (
            <DemoTab demoDataEnabled={demoDataEnabled} />
          ) : (
            <AccessDeniedView />
          )
        )}

        {currentTab === "backup" && (
          isPrivileged ? (
            <BackupTab backupImportEnabled={backupImportEnabled} factoryResetEnabled={factoryResetEnabled} />
          ) : (
            <AccessDeniedView />
          )
        )}

        {currentTab === "accounts" && (
          <ConnectedAccounts linkParam={linkParam} />
        )}

        {currentTab === "privacy" && (
          <PrivacyCenter />
        )}

        {currentTab === "security" && (
          isPrivileged ? <SecurityChecklist /> : <AccessDeniedView />
        )}
      </div>
    </AppShell>
  );
}

function SecurityChecklist() {
  const inCode = [
    "RLS enabled on every business table",
    "RPC EXECUTE grants restricted to authenticated + service_role (migration 0012)",
    "Function search_path hardened on set_updated_at, current_organization_id, current_user_role (0010)",
    "Service role key is server-only — never bundled to the browser",
    "POS checkout is atomic, security invoker, server-side total recompute",
    "Strict service required-field enforcement at the database layer (0013)",
    "Loss-prevention events table populated via audit_logs trigger (0013)",
  ];
  const manual = [
    {
      title: "Enable leaked password protection",
      path: "Authentication → Providers → Email → Password security → toggle on",
      explainer: "Blocks newly created or rotated passwords found in breach corpora (HaveIBeenPwned).",
    },
    {
      title: "(Optional) Disable open email signups",
      path: "Authentication → Providers → Email → toggle off",
      explainer: "Belt-and-braces alongside the app's signup lock. Use /users to invite staff instead.",
    },
    {
      title: "(Optional) Configure email templates",
      path: "Authentication → Email Templates",
      explainer: "Required for /users staff invites to actually be delivered.",
    },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="mb-5">
        <h3 className="text-base font-black text-slate-950">Security Checklist</h3>
        <p className="text-xs text-slate-500">
          A snapshot of the security posture. Done items are enforced in code; manual items
          require a one-time Supabase dashboard action by the owner.
        </p>
      </header>

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-700">Done in code</h4>
        <ul className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          {inCode.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-emerald-900">
              <span className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full bg-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-amber-700">Manual dashboard actions</h4>
        <ul className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          {manual.map((m) => (
            <li key={m.title}>
              <p className="text-sm font-semibold text-amber-900">{m.title}</p>
              <p className="text-xs text-amber-700">{m.path}</p>
              <p className="text-xs text-amber-800/80">{m.explainer}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-xs text-slate-500">
        Full write-up in <code>docs/security-hardening.md</code>.
      </p>
    </section>
  );
}

function AccessDeniedView() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
      <AlertTriangle className="mx-auto size-12 text-amber-500" />
      <h3 className="text-lg font-black text-slate-950">Access Denied</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto leading-6">
        This configuration module requires Owner or Administrator permissions.
        Authorized operations like seeder deployment or database restoration are locked.
      </p>
    </div>
  );
}
