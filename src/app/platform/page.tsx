import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlatformAdmin } from "@/lib/platform/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getPlatformOverview,
  getPlatformTenants,
  getPlatformRecentActivity,
  getPlatformSettingsMap,
} from "@/lib/data/platform-analytics";
import { PlatformSettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

async function enforceAdmin() {
  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  return admin;
}

export default async function PlatformPage() {
  const admin = await enforceAdmin();

  const supabase = await createClient();

  const [overview, tenants, activity, settingsMap] = await Promise.all([
    getPlatformOverview().catch(() => null),
    getPlatformTenants().catch(() => []),
    getPlatformRecentActivity().catch(() => []),
    getPlatformSettingsMap().catch(() => ({} as Record<string, unknown>)),
  ]);

  // Privacy requests overview
  let privacyCounts: { total: number; pending: number; deletion: number } | null = null;
  try {
    const [total, pending, deletion] = await Promise.all([
      supabase.from("privacy_requests").select("*", { count: "exact", head: true }),
      supabase.from("privacy_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("privacy_requests").select("*", { count: "exact", head: true }).eq("request_type", "deletion"),
    ]);
    privacyCounts = {
      total: total.count ?? 0,
      pending: pending.count ?? 0,
      deletion: deletion.count ?? 0,
    };
  } catch {
    privacyCounts = null;
  }

  const getBool = (key: string, def = false): boolean => {
    const v = settingsMap[key];
    return v === true || v === "true" || def;
  };

  const getStr = (key: string, fallback = ""): string => {
    const v = settingsMap[key];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950 dark:text-slate-50">Platform Console</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Signed in as {admin.display_name ?? admin.email ?? "Platform Admin"}
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                {admin.role}
              </span>
            </p>
          </div>
        </div>

        {/* Overview Cards */}
        {overview && (
          <section>
            <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">Overview</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card label="Auth Users" value={overview.totalUsers} />
              <Card label="Shops Onboarded" value={overview.onboardedOrganizations} />
              <Card label="Incomplete" value={overview.incompleteOnboarding} warn={overview.incompleteOnboarding > 0} />
              <Card label="Total Orgs" value={overview.totalOrganizations} />
              <Card label="Branches" value={overview.totalBranches} />
              <Card label="Products" value={overview.totalProducts} />
              <Card label="Customers" value={overview.totalCustomers} />
              <Card label="Invoices" value={overview.totalInvoices} />
              <Card label="Backup Imports" value={overview.backupImports} />
              <Card label="Failed Imports" value={overview.backupImportsFailed} warn={overview.backupImportsFailed > 0} />
              <Card label="Today" value={overview.organizationsToday} />
              <Card label="Last 7 Days" value={overview.organizations7d} />
            </div>
          </section>
        )}

        {/* Onboarding Funnel */}
        {overview && (
          <section>
            <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">Onboarding Funnel</h2>
            <div className="grid gap-4 sm:grid-cols-5">
              <FunnelCard label="Signed Up" value={overview.totalProfiles} />
              <FunnelCard label="Shop Created" value={overview.totalOrganizations} />
              <FunnelCard label="Onboarded" value={overview.onboardedOrganizations} />
              <FunnelCard label="Incomplete" value={overview.incompleteOnboarding} warn />
              <FunnelCard label="Orgs / Day" value={overview.organizationsToday} />
            </div>
          </section>
        )}

        {/* Platform Settings (Editable) */}
        <PlatformSettingsForm
          settingsMap={settingsMap as Record<string, unknown>}
          getBool={getBool}
          getStr={getStr}
        />

        {/* System Health */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">System Health</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <HealthItem label="Latest Migration" value="0020 — Platform Console" />
              <HealthItem label="Google OAuth" value="Needs Supabase config" warn />
              <HealthItem label="Apple OAuth" value="Deferred" />
              <HealthItem label="Storage Buckets" value="Not configured" warn />
              <HealthItem label="Leaked Password Protection" value="Supabase handles this" ok />
            </dl>
          </div>
        </section>

        {/* Privacy Requests */}
        {privacyCounts && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Privacy Requests</h2>
              <Link
                href="/platform/privacy-requests"
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-800"
              >
                Manage requests
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card label="Total Requests" value={privacyCounts.total} />
              <Card label="Pending Review" value={privacyCounts.pending} warn={privacyCounts.pending > 0} />
              <Card label="Deletion Requests" value={privacyCounts.deletion} warn={privacyCounts.deletion > 0} />
            </div>
          </section>
        )}

        {/* Tenant Table */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">Tenants</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Onboarded</th>
                  <th className="px-4 py-3">Branches</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                      No tenants found.
                    </td>
                  </tr>
                )}
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-300">
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3">{t.ownerEmail ?? t.ownerName ?? "—"}</td>
                    <td className="px-4 py-3">{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      {t.onboardingCompleted ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Yes</span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{t.branchCount}</td>
                    <td className="px-4 py-3">{t.productCount}</td>
                    <td className="px-4 py-3">{t.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">Recent Activity</h2>
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {activity.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-slate-400">No recent platform activity.</p>
            )}
            {activity.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center justify-between px-6 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {a.action}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {a.orgName ?? "Platform"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-black ${warn ? "text-red-600 dark:text-red-400" : "text-slate-950 dark:text-slate-50"}`}>
        {value}
      </p>
    </div>
  );
}

function FunnelCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-2xl font-black ${warn ? "text-amber-600" : "text-slate-950 dark:text-slate-50"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function HealthItem({ label, value, warn, ok }: { label: string; value: string; warn?: boolean; ok?: boolean }) {
  const color = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-slate-600";
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold ${color} dark:text-slate-200`}>{value}</dd>
    </div>
  );
}
