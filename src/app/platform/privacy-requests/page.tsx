import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlatformAdmin } from "@/lib/platform/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrivacyRequestTriage, type PrivacyRequest } from "./triage-client";

export const dynamic = "force-dynamic";

async function enforceAdmin() {
  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  return admin;
}

export default async function PlatformPrivacyRequestsPage() {
  const admin = await enforceAdmin();
  const supabase = await createAdminClient();

  const { data: requests } = await supabase
    .from("privacy_requests")
    .select("*")
    .order("requested_at", { ascending: false });

  const requestRows = (requests ?? []) as PrivacyRequest[];

  const orgIds = [...new Set(requestRows.map((r) => r.organization_id).filter(Boolean))] as string[];
  const orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgs) {
      for (const org of orgs) {
        orgNames[org.id] = org.name;
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950 dark:text-slate-50">Privacy Requests</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Signed in as {admin.display_name ?? admin.email ?? "Platform Admin"}
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                {admin.role}
              </span>
            </p>
          </div>
          <Link
            href="/platform"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            &larr; Back to Console
          </Link>
        </div>

        <PrivacyRequestTriage requests={requestRows} orgNames={orgNames} />
      </div>
    </main>
  );
}
