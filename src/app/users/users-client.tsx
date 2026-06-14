"use client";

import { useActionState, useState, useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
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
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  manager: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  cashier: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  technician: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 text-sm outline-none focus:border-blue-600 dark:focus:border-blue-500";
const compactInputClass =
  "h-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 text-xs outline-none focus:border-blue-600 dark:focus:border-blue-500";

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
function SortableHeader({
  label,
  columnKey,
  currentSortKey,
  direction,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  columnKey: string;
  currentSortKey: string;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const isSorted = currentSortKey === columnKey;
  const alignClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
      ? "justify-center text-center"
      : "justify-start text-left";

  return (
    <th className={`${className} p-0 select-none border-b border-slate-200 dark:border-white/[0.07]`}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex items-center gap-1 px-4 py-3 font-bold uppercase transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer w-full ${alignClass}`}
      >
        <span>{label}</span>
        {isSorted && (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          )
        )}
      </button>
    </th>
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

  const [sortBy, setSortBy] = useState<string>("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    sorted.sort((rowA, rowB) => {
      const a = rowA[sortBy as keyof StaffUser];
      const b = rowB[sortBy as keyof StaffUser];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (sortBy === "last_sign_in_at") {
        const valA = new Date(a as string).getTime();
        const valB = new Date(b as string).getTime();
        cmp = valA - valB;
      } else if (typeof a === "boolean" && typeof b === "boolean") {
        cmp = (a ? 1 : 0) - (b ? 1 : 0);
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, sortBy, sortDir]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-slate-100">Invite staff</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Send a Supabase invite email and create the staff profile with the selected role and branch.
          </p>
        </div>
        {inviteState.error && (
          <p className="mt-4 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-400">
            {inviteState.error}
          </p>
        )}
        {inviteState.success && (
          <p className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {inviteState.success}
          </p>
        )}
        <form action={inviteFormAction} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_220px_auto] xl:items-end">
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Full name</span>
            <input name="fullName" required className={inputClass} placeholder="Staff member name" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</span>
            <input name="email" required type="email" className={inputClass} placeholder="staff@example.com" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</span>
            <RoleSelect defaultValue="cashier" />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</span>
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-black text-slate-950 dark:text-slate-100">Staff accounts</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update roles, branch assignment, and active status. The last active owner/admin is protected.
          </p>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <SortableHeader label="Staff" columnKey="full_name" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Role" columnKey="role" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Branch" columnKey="branch_name" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" columnKey="is_active" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Last sign-in" columnKey="last_sign_in_at" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 dark:border-slate-800/60 align-top">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950 dark:text-slate-100">{user.full_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user.email ?? "No email found"}</p>
                    {user.id === currentProfileId && (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">You</p>
                    )}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.branch_name ?? "No branch"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${user.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-205 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user.invite_status}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{fmtDate(user.last_sign_in_at)}</td>
                  <td className="px-4 py-3">
                    <StaffActions user={user} branches={branches} currentProfileId={currentProfileId} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 p-3 xl:hidden">
          {sortedUsers.map((user) => (
            <article key={user.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-black text-slate-950 dark:text-slate-100 text-sm sm:text-base">{user.full_name}</p>
                  <p className="break-words text-xs text-slate-500 dark:text-slate-400">{user.email ?? "No email found"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <RoleBadge role={user.role} />
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${user.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    {user.id === currentProfileId && (
                      <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 dark:text-blue-400">You</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 sm:text-right">
                  <p className="font-semibold">{user.branch_name ?? "No branch"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Sign-in: {fmtDate(user.last_sign_in_at)}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Invite: {user.invite_status}</p>
                </div>
              </div>
              <div className="mt-3">
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
      <details className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">Edit profile</summary>
        <form action={updateUserProfileAction} className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          <input type="hidden" name="profileId" value={user.id} />
          <input name="fullName" defaultValue={user.full_name} className={compactInputClass} />
          <RoleSelect defaultValue={user.role} className={compactInputClass} />
          <BranchSelect branches={branches} defaultValue={user.branch_id} className={compactInputClass} />
          <button type="submit" className="min-h-9 rounded-md bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 text-xs font-bold text-white">
            Save
          </button>
        </form>
      </details>

      <div className="flex flex-wrap justify-end gap-2">
        {user.invite_status === "pending" && user.email && (
          <form action={resendInviteAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button type="submit" className="min-h-9 rounded-md border border-blue-200 dark:border-blue-900/30 px-3 text-xs font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20">
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
              className="min-h-9 rounded-md border border-red-200 dark:border-red-900/30 px-3 text-xs font-bold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:cursor-not-allowed disabled:opacity-50"
              title={isSelfOwner ? "Owners cannot deactivate their own active owner account." : "Deactivate user"}
            >
              Deactivate
            </button>
          </form>
        ) : (
          <form action={reactivateUserAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button type="submit" className="min-h-9 rounded-md border border-emerald-200 dark:border-emerald-900/30 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
              Reactivate
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
