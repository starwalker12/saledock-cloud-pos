import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { canManageSettings } from "@/lib/permissions";
import { SettingsForm } from "./settings-form";
import { DemoTab } from "./demo-tab";
import { BackupTab } from "./backup-tab";
import { AlertTriangle, Settings, Database, Archive } from "lucide-react";

type SearchParams = {
  tab?: string;
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

  const settings = await getBrandingSettings(profile.organization_id, profile.branch_id);
  const canEdit = canManageSettings(profile.role);
  const isPrivileged = profile.role === "owner" || profile.role === "admin";

  // Tab configurations
  const tabs = [
    { id: "general", label: "Shop Profile", icon: Settings },
    ...(isPrivileged ? [
      { id: "demo-data", label: "Demo Data", icon: Database },
      { id: "backup", label: "Backup & Restore", icon: Archive }
    ] : [])
  ];

  return (
    <AppShell pageTitle="Settings">
      <div className="mx-auto max-w-5xl space-y-6">
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
                      ? "border-blue-700 text-blue-700 bg-blue-50/50 rounded-t-xl"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
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
          />
        )}

        {currentTab === "demo-data" && (
          isPrivileged ? (
            <DemoTab />
          ) : (
            <AccessDeniedView />
          )
        )}

        {currentTab === "backup" && (
          isPrivileged ? (
            <BackupTab />
          ) : (
            <AccessDeniedView />
          )
        )}
      </div>
    </AppShell>
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
