import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getPermissionEditorData } from "@/lib/data/staff-permissions-data";
import { env } from "@/lib/env";
import { canManageUsers } from "@/lib/permissions";
import { PermissionsEditor } from "./permissions-client";

export default async function StaffPermissionsPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const canManage = canManageUsers(profile.role);

  if (!canManage) {
    return (
      <AppShell pageTitle="Staff Permissions">
        <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
            Restricted area
          </p>
          <h2 className="mt-2 text-2xl font-black text-amber-950">Staff permissions</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Only owners and admins can override staff permissions. Your current role
            cannot access this page.
          </p>
        </div>
      </AppShell>
    );
  }

  const data = await getPermissionEditorData(profile.organization_id);

  return (
    <AppShell pageTitle="Staff Permissions">
      <div className="space-y-6">
        <Link
          href="/users"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-[#fff] px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-950"
        >
          <ArrowLeft className="size-4" />
          Back to Users
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Override access
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Staff permissions
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Fine-tune what each staff member can do. Owners and admins always have
            every permission. For managers, cashiers, and technicians you can toggle
            individual capabilities below.
          </p>
        </div>

        <PermissionsEditor staff={data.staff} />
      </div>
    </AppShell>
  );
}
