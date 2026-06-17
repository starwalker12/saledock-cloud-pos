import { redirect } from "next/navigation";
import { ShieldCheck, UserCheck, UserCog, UserX, Mail } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { getUserManagementData } from "@/lib/data/users";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/formatters";
import { canManageUsers } from "@/lib/permissions";
import { UserManagementClient } from "./users-client";

export default async function UsersPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const canManage = canManageUsers(profile.role);

  if (!canManage) {
    return (
      <AppShell pageTitle="Users">
        <div className="w-full rounded-2xl border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
            Restricted area
          </p>
          <h2 className="mt-2 text-2xl font-black text-amber-950 dark:text-amber-100">User management</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-300">
            Only owners and admins can invite staff, assign roles, or activate and
            deactivate users. Your current role can continue using the other POS
            areas allowed by your permissions.
          </p>
        </div>
      </AppShell>
    );
  }

  const data = await getUserManagementData(profile.organization_id);

  return (
    <AppShell pageTitle="Users">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-3 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-400">
                Staff access
              </p>
              <h2 className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black text-slate-950 dark:text-slate-100">
                User Management
              </h2>
              <p className="mt-1 sm:mt-2 max-w-3xl text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500 dark:text-slate-400">
                Invite staff, assign roles, choose branches, and safely deactivate
                accounts without losing the last active owner/admin.
              </p>
            </div>
            <a
              href="/settings/permissions"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 dark:border-blue-900/30 px-4 text-sm font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
            >
              Permissions
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-5">
          <StatCard
            label="Active users"
            value={formatNumber(data.stats.activeUsers)}
            detail="Profiles that are not blocked."
            icon={<UserCheck className="size-5" />}
          />
          <StatCard
            label="Owners/admins"
            value={formatNumber(data.stats.privilegedUsers)}
            detail="Active management users."
            icon={<ShieldCheck className="size-5" />}
          />
          <StatCard
            label="Staff"
            value={formatNumber(data.stats.staffUsers)}
            detail="All non-owner/admin profiles."
            icon={<UserCog className="size-5" />}
          />
          <StatCard
            label="Inactive users"
            value={formatNumber(data.stats.inactiveUsers)}
            detail="Profiles currently blocked."
            icon={<UserX className="size-5" />}
          />
          <StatCard
            label="Pending invites"
            value={formatNumber(data.stats.pendingInvites)}
            detail="Invitations waiting for acceptance."
            icon={<Mail className="size-5" />}
          />
        </div>

        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm leading-6 text-blue-950 dark:text-blue-300">
          Staff can join only from invite emails. A new staff member stays Pending
          until they open the email and click Accept on the invite page.
        </div>

        <UserManagementClient
          users={data.users}
          invitations={data.invitations}
          branches={data.branches}
          currentProfileId={profile.id}
        />
      </div>
      <div className="h-20 md:hidden" />
    </AppShell>
  );
}
