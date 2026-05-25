"use client";

import { useActionState } from "react";
import {
  deactivateUserAction,
  inviteUserAction,
  reactivateUserAction,
  resendInviteAction,
  updateUserProfileAction,
  type UserActionState,
} from "./actions";
import type { StaffBranch, StaffUser } from "@/lib/data/users";
import { STAFF_ROLES, type StaffRole } from "@/lib/validation/users";

const initialState: UserActionState = { error: null, success: null };

const roleLabels: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  technician: "Technician",
};

const roleClasses: Record<StaffRole, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  manager: "bg-emerald-100 text-emerald-800",
  cashier: "bg-amber-100 text-amber-800",
  technician: "bg-slate-200 text-slate-800",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-600";
const compactInputClass =
  "h-9 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-600";

function fmtDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleClasses[role]}`}>
      {roleLabels[role]}
    </span>
  );
}

function BranchSelect({
  branches,
  defaultValue,
  className = inputClass,
}: {
  branches: StaffBranch[];
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <select name="branchId" defaultValue={defaultValue ?? ""} className={className}>
      <option value="">No branch</option>
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}

function RoleSelect({
  defaultValue,
  className = inputClass,
}: {
  defaultValue: StaffRole;
  className?: string;
}) {
  return (
    <select name="role" defaultValue={defaultValue} className={className}>
      {STAFF_ROLES.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </select>
  );
}

export function UserManagementClient({
  users,
  branches,
  currentProfileId,
}: {
  users: StaffUser[];
  branches: StaffBranch[];
  currentProfileId: string;
}) {
  const [inviteState, inviteFormAction, invitePending] = useActionState(
    inviteUserAction,
    initialState,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-black text-slate-950">Invite staff</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Send a Supabase invite email and create the staff profile with the selected role and branch.
          </p>
        </div>
        {inviteState.error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {inviteState.error}
          </p>
        )}
        {inviteState.success && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {inviteState.success}
          </p>
        )}
        <form action={inviteFormAction} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_220px_auto] xl:items-end">
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Full name</span>
            <input name="fullName" required className={inputClass} placeholder="Staff member name" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
            <input name="email" required type="email" className={inputClass} placeholder="staff@example.com" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Role</span>
            <RoleSelect defaultValue="cashier" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Branch</span>
            <BranchSelect branches={branches} defaultValue={branches[0]?.id} />
          </label>
          <button
            type="submit"
            disabled={invitePending}
            className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {invitePending ? "Inviting..." : "Invite"}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-black text-slate-950">Staff accounts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Update roles, branch assignment, and active status. The last active owner/admin is protected.
          </p>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-white text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{user.full_name}</p>
                    <p className="text-xs text-slate-500">{user.email ?? "No email found"}</p>
                    {user.id === currentProfileId && (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">You</p>
                    )}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3 text-slate-700">{user.branch_name ?? "No branch"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${user.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">{user.invite_status}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(user.last_sign_in_at)}</td>
                  <td className="px-4 py-3">
                    <StaffActions user={user} branches={branches} currentProfileId={currentProfileId} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 xl:hidden">
          {users.map((user) => (
            <article key={user.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-black text-slate-950">{user.full_name}</p>
                  <p className="break-words text-sm text-slate-500">{user.email ?? "No email found"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RoleBadge role={user.role} />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${user.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    {user.id === currentProfileId && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">You</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p>{user.branch_name ?? "No branch"}</p>
                  <p className="text-xs">Last sign-in: {fmtDate(user.last_sign_in_at)}</p>
                  <p className="text-xs">Invite: {user.invite_status}</p>
                </div>
              </div>
              <div className="mt-4">
                <StaffActions user={user} branches={branches} currentProfileId={currentProfileId} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function StaffActions({
  user,
  branches,
  currentProfileId,
  compact = false,
}: {
  user: StaffUser;
  branches: StaffBranch[];
  currentProfileId: string;
  compact?: boolean;
}) {
  const isSelfOwner = user.id === currentProfileId && user.role === "owner" && user.is_active;
  return (
    <div className="space-y-2">
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">Edit profile</summary>
        <form action={updateUserProfileAction} className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          <input type="hidden" name="profileId" value={user.id} />
          <input name="fullName" defaultValue={user.full_name} className={compactInputClass} />
          <RoleSelect defaultValue={user.role} className={compactInputClass} />
          <BranchSelect branches={branches} defaultValue={user.branch_id} className={compactInputClass} />
          <button type="submit" className="min-h-9 rounded-md bg-slate-950 px-3 text-xs font-bold text-white">
            Save
          </button>
        </form>
      </details>

      <div className="flex flex-wrap justify-end gap-2">
        {user.invite_status === "pending" && user.email && (
          <form action={resendInviteAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button type="submit" className="min-h-9 rounded-md border border-blue-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">
              Resend invite
            </button>
          </form>
        )}
        {user.is_active ? (
          <form action={deactivateUserAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button
              type="submit"
              disabled={isSelfOwner}
              className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={isSelfOwner ? "Owners cannot deactivate their own active owner account." : "Deactivate user"}
            >
              Deactivate
            </button>
          </form>
        ) : (
          <form action={reactivateUserAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button type="submit" className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
              Reactivate
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
