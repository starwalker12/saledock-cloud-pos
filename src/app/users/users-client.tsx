"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Mail, CheckCircle, XCircle, RefreshCw, UserX } from "lucide-react";
import {
  deactivateUserAction,
  reactivateUserAction,
  updateUserProfileAction,
} from "./actions";
import {
  inviteStaffAction,
  resendStaffInviteAction,
  revokeStaffInviteAction,
  type StaffInviteFormValues,
  type StaffInviteActionState,
} from "./invite-actions";
import type { StaffBranch, StaffUser, StaffInvitation } from "@/lib/data/users";
import { STAFF_ROLES, type StaffRole } from "@/lib/validation/users";
import { AppSelect } from "@/components/ui/app-select";

const initialInviteState: StaffInviteActionState = { error: null, success: null };

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

const statusLabels: Record<StaffInvitation["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  revoked: "Revoked",
  expired: "Expired",
};

const statusClasses: Record<StaffInvitation["status"], string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  declined: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  expired: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
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

function AccessStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      {active ? "Access active" : "Inactive / blocked"}
    </span>
  );
}

function InvitationStatusBadge({ status }: { status: StaffInvitation["status"] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function BranchSelect({
  branches,
  defaultValue,
  value,
  onChange,
  className = inputClass,
}: {
  branches: StaffBranch[];
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const branchOptions = [
    { value: "", label: "No branch" },
    ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
  ];

  return (
    <AppSelect
      name="branchId"
      value={value}
      defaultValue={defaultValue ?? ""}
      options={branchOptions}
      ariaLabel="Branch"
      searchable={branches.length > 8}
      buttonClassName={className}
      onChange={onChange}
    />
  );
}

function RoleSelect({
  defaultValue,
  value,
  onChange,
  className = inputClass,
  disabled = false,
}: {
  defaultValue: StaffRole;
  value?: StaffRole;
  onChange?: (value: StaffRole) => void;
  className?: string;
  disabled?: boolean;
}) {
  const roleOptions = STAFF_ROLES.map((role) => ({ value: role, label: roleLabels[role] }));

  return (
    <AppSelect
      name="role"
      value={value}
      defaultValue={defaultValue}
      options={roleOptions}
      ariaLabel="Role"
      buttonClassName={className}
      disabled={disabled}
      onChange={(nextValue) => onChange?.(nextValue as StaffRole)}
    />
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
  const nextDir = isSorted && direction === "asc" ? "desc" : "asc";
  const ariaLabel = isSorted
    ? `Sort by ${label} ${nextDir === "asc" ? "ascending" : "descending"}`
    : `Sort by ${label} ascending`;

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
        aria-label={ariaLabel}
        className={`group flex items-center gap-1 px-4 py-3 font-bold uppercase transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer w-full ${alignClass}`}
      >
        <span>{label}</span>
        {isSorted ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity text-slate-400 dark:text-slate-500" />
        )}
      </button>
    </th>
  );
}

export function UserManagementClient({
  users,
  invitations,
  branches,
  currentProfileId,
}: {
  users: StaffUser[];
  invitations: StaffInvitation[];
  branches: StaffBranch[];
  currentProfileId: string;
}) {
  const [inviteState, inviteFormAction, invitePending] = useActionState(
    inviteStaffAction,
    initialInviteState,
  );
  const defaultInviteValues = useMemo<StaffInviteFormValues>(() => ({
    fullName: "",
    email: "",
    role: "cashier",
    branchId: branches[0]?.id ?? "",
  }), [branches]);
  const inviteFormDefaults = inviteState.success
    ? defaultInviteValues
    : inviteState.values ?? defaultInviteValues;
  const inviteFormKey = [
    inviteState.success ?? inviteState.error ?? "idle",
    inviteFormDefaults.fullName,
    inviteFormDefaults.email,
    inviteFormDefaults.role,
    inviteFormDefaults.branchId,
  ].join("|");

  const [userSortBy, setUserSortBy] = useState<string>("full_name");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("asc");
  const [inviteSortBy, setInviteSortBy] = useState<string>("created_at");
  const [inviteSortDir, setInviteSortDir] = useState<"asc" | "desc">("desc");

  const handleUserSort = (key: string) => {
    if (userSortBy === key) {
      setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUserSortBy(key);
      setUserSortDir("asc");
    }
  };

  const handleInviteSort = (key: string) => {
    if (inviteSortBy === key) {
      setInviteSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setInviteSortBy(key);
      setInviteSortDir("asc");
    }
  };

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    sorted.sort((rowA, rowB) => {
      const a = rowA[userSortBy as keyof StaffUser];
      const b = rowB[userSortBy as keyof StaffUser];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (userSortBy === "last_sign_in_at") {
        const valA = new Date(a as string).getTime();
        const valB = new Date(b as string).getTime();
        cmp = valA - valB;
      } else if (typeof a === "boolean" && typeof b === "boolean") {
        cmp = (a ? 1 : 0) - (b ? 1 : 0);
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }

      return userSortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, userSortBy, userSortDir]);

  const sortedInvitations = useMemo(() => {
    const sorted = [...invitations];
    sorted.sort((rowA, rowB) => {
      const a = rowA[inviteSortBy as keyof StaffInvitation];
      const b = rowB[inviteSortBy as keyof StaffInvitation];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (["created_at", "sent_at", "expires_at", "accepted_at"].includes(inviteSortBy)) {
        const valA = a ? new Date(a as string).getTime() : 0;
        const valB = b ? new Date(b as string).getTime() : 0;
        cmp = valA - valB;
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }

      return inviteSortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [invitations, inviteSortBy, inviteSortDir]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-slate-100">Invite staff</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Send an invite email. The staff member must open the email and click Accept to join.
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
        <form
          key={inviteFormKey}
          action={inviteFormAction}
          className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_220px_auto] xl:items-end"
        >
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Full name</span>
            <input
              name="fullName"
              required
              className={inputClass}
              placeholder="Staff member name"
              defaultValue={inviteFormDefaults.fullName}
            />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</span>
            <input
              name="email"
              required
              type="email"
              className={inputClass}
              placeholder="staff@example.com"
              defaultValue={inviteFormDefaults.email}
            />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</span>
            <RoleSelect defaultValue={inviteFormDefaults.role} />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</span>
            <BranchSelect branches={branches} defaultValue={inviteFormDefaults.branchId} />
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

      {invitations.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 shadow-sm">
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-4 py-4 sm:px-6">
            <h2 className="text-lg font-black text-slate-950 dark:text-slate-100">Invitations</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Pending, accepted, declined, revoked, and expired staff invites.
            </p>
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <SortableHeader label="Name / Email" columnKey="full_name" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <SortableHeader label="Role" columnKey="role" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <SortableHeader label="Branch" columnKey="branch_name" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <SortableHeader label="Status" columnKey="status" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <SortableHeader label="Sent" columnKey="sent_at" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <SortableHeader label="Expires" columnKey="expires_at" currentSortKey={inviteSortBy} direction={inviteSortDir} onSort={handleInviteSort} />
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvitations.map((invite) => (
                  <tr key={invite.id} className="border-b border-slate-100 dark:border-slate-800/60 align-top">
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-950 dark:text-slate-100">{invite.full_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{invite.email}</p>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={invite.role} /></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{invite.branch_name ?? "No branch"}</td>
                    <td className="px-4 py-3">
                      <InvitationStatusBadge status={invite.status} />
                      {invite.invited_by_name && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Invited by {invite.invited_by_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{fmtDate(invite.sent_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{fmtDate(invite.expires_at)}</td>
                    <td className="px-4 py-3">
                      <InvitationActions invite={invite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-3 xl:hidden">
            {sortedInvitations.map((invite) => (
              <article key={invite.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-3 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-black text-slate-950 dark:text-slate-100 text-sm sm:text-base">{invite.full_name}</p>
                    <p className="break-words text-xs text-slate-500 dark:text-slate-400">{invite.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <RoleBadge role={invite.role} />
                      <InvitationStatusBadge status={invite.status} />
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 sm:text-right">
                    <p className="font-semibold">{invite.branch_name ?? "No branch"}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Sent: {fmtDate(invite.sent_at)}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Expires: {fmtDate(invite.expires_at)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <InvitationActions invite={invite} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

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
                <SortableHeader label="Staff" columnKey="full_name" currentSortKey={userSortBy} direction={userSortDir} onSort={handleUserSort} />
                <SortableHeader label="Role" columnKey="role" currentSortKey={userSortBy} direction={userSortDir} onSort={handleUserSort} />
                <SortableHeader label="Branch" columnKey="branch_name" currentSortKey={userSortBy} direction={userSortDir} onSort={handleUserSort} />
                <SortableHeader label="Status" columnKey="is_active" currentSortKey={userSortBy} direction={userSortDir} onSort={handleUserSort} />
                <SortableHeader label="Last sign-in" columnKey="last_sign_in_at" currentSortKey={userSortBy} direction={userSortDir} onSort={handleUserSort} />
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
                    <div className="flex flex-wrap gap-1.5">
                      <AccessStatusBadge active={user.is_active} />
                    </div>
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
                    <AccessStatusBadge active={user.is_active} />
                    {user.id === currentProfileId && (
                      <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 dark:text-blue-400">You</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 sm:text-right">
                  <p className="font-semibold">{user.branch_name ?? "No branch"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Sign-in: {fmtDate(user.last_sign_in_at)}</p>
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

function InvitationActions({ invite }: { invite: StaffInvitation }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleResend = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await resendStaffInviteAction(invite.id);
      setMessage(result.error ? { type: "error", text: result.error } : { type: "success", text: result.success ?? "Invite resent." });
    });
  };

  const handleRevoke = () => {
    if (!confirm("Are you sure you want to revoke this invite? The link will stop working.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await revokeStaffInviteAction(invite.id);
      setMessage(result.error ? { type: "error", text: result.error } : { type: "success", text: result.success ?? "Invite revoked." });
    });
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {invite.status === "pending" && (
        <>
          <button
            type="button"
            onClick={handleResend}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-900/30 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 disabled:opacity-60"
          >
            <RefreshCw className="size-3.5" />
            {isPending ? "Sending..." : "Resend"}
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-900/30 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-60"
          >
            <XCircle className="size-3.5" />
            Revoke
          </button>
        </>
      )}
      {invite.status !== "pending" && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {invite.status === "accepted" && <CheckCircle className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
          {invite.status === "declined" && <XCircle className="size-3.5 text-slate-500 dark:text-slate-400" />}
          {invite.status === "revoked" && <UserX className="size-3.5 text-red-600 dark:text-red-400" />}
          {invite.status === "expired" && <Mail className="size-3.5 text-orange-600 dark:text-orange-400" />}
          {statusLabels[invite.status]}
        </span>
      )}
      {message && (
        <p className={`w-full text-right text-[11px] font-semibold ${message.type === "error" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          {message.text}
        </p>
      )}
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
  const isCurrentUser = user.id === currentProfileId;
  const isSelfDeactivate = isCurrentUser && user.is_active;
  return (
    <div className="space-y-2">
      <details className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">Edit profile</summary>
        <form action={updateUserProfileAction} className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          <input type="hidden" name="profileId" value={user.id} />
          <input name="fullName" defaultValue={user.full_name} className={compactInputClass} />
          <div className="space-y-1">
            <RoleSelect defaultValue={user.role} className={compactInputClass} disabled={isCurrentUser} />
            {isCurrentUser && (
              <p className="text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                Your own role is locked for safety.
              </p>
            )}
          </div>
          <BranchSelect branches={branches} defaultValue={user.branch_id} className={compactInputClass} />
          <button type="submit" className="min-h-9 rounded-md bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 text-xs font-bold text-white">
            Save
          </button>
        </form>
      </details>

      <div className="flex flex-wrap justify-end gap-2">
        {user.is_active ? (
          <form action={deactivateUserAction}>
            <input type="hidden" name="profileId" value={user.id} />
            <button
              type="submit"
              disabled={isSelfDeactivate}
              className="min-h-9 rounded-md border border-red-200 dark:border-red-900/30 px-3 text-xs font-bold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:cursor-not-allowed disabled:opacity-50"
              title={isSelfDeactivate ? "You cannot deactivate your own account." : "Deactivate user"}
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
