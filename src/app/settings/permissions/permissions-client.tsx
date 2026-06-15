"use client";

import { useActionState, useEffect, useState } from "react";
import { updateStaffPermissionsAction, type PermissionActionState } from "./actions";
import { PERMISSIONS, type Permission } from "@/lib/staff-permissions-shared";
import type { PermissionEditorStaff } from "@/lib/data/staff-permissions-data";
import type { StaffRole } from "@/lib/validation/users";

const initialState: PermissionActionState = { error: null, success: null };

const permissionLabels: Record<Permission, string> = {
  can_sell: "Sell",
  can_discount: "Discount",
  can_return: "Return",
  can_void_invoice: "Void invoice",
  can_view_reports: "View reports",
  can_manage_stock: "Manage stock",
  can_sell_at_loss: "Sell at loss",
  can_change_settings: "Change settings",
};

const roleLabels: Record<string, string> = {
  manager: "Manager",
  cashier: "Cashier",
  technician: "Technician",
};

export function PermissionsEditor({ staff }: { staff: PermissionEditorStaff[] }) {
  return (
    <div className="space-y-4">
      {staff.map((member) => (
        <StaffPermissionCard key={member.id} member={member} />
      ))}
      {staff.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-[#fff] p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No staff members found. Invite staff from the Users page to manage permissions.
        </div>
      )}
    </div>
  );
}

function StaffPermissionCard({ member }: { member: PermissionEditorStaff }) {
  const [state, formAction, pending] = useActionState(updateStaffPermissionsAction, initialState);
  const initialPermissions = () => Object.fromEntries(
    PERMISSIONS.map((perm) => [perm, member.effective[perm]])
  ) as Record<Permission, boolean>;
  const [savedPermissions, setSavedPermissions] = useState<Record<Permission, boolean>>(initialPermissions);
  const [currentPermissions, setCurrentPermissions] = useState<Record<Permission, boolean>>(initialPermissions);
  const isDirty = PERMISSIONS.some((perm) => currentPermissions[perm] !== savedPermissions[perm]);

  useEffect(() => {
    if (!state.success) return;
    const id = window.setTimeout(() => setSavedPermissions(currentPermissions), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-black text-slate-950 dark:text-white">{member.full_name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{member.email ?? "No email"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <RoleBadge role={member.role} />
              <span>{member.branch_name ?? "No branch"}</span>
              {!member.is_active && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <form
        action={formAction}
        className="p-4 sm:p-6"
        onSubmit={(event) => {
          if (!isDirty) event.preventDefault();
        }}
      >
        <input type="hidden" name="profileId" value={member.id} />

        {state.error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {state.success}
          </p>
        )}

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERMISSIONS.map((perm) => (
            <PermissionToggle
              key={perm}
              permission={perm}
              checked={currentPermissions[perm]}
              onCheckedChange={(checked) => {
                setCurrentPermissions((current) => ({ ...current, [perm]: checked }));
              }}
              hasOverride={member.overrides[perm] !== null}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="submit"
            disabled={pending || !isDirty}
            className="min-h-10 rounded-lg bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            title={!isDirty ? "Toggle a permission to enable saving" : undefined}
          >
            {pending ? "Saving..." : "Save permissions"}
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Toggle permissions above, then save.
          </p>
        </div>
      </form>
    </div>
  );
}

function PermissionToggle({
  permission,
  checked,
  onCheckedChange,
  hasOverride,
}: {
  permission: Permission;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hasOverride: boolean;
}) {
  const label = permissionLabels[permission];
  const fieldName = permission;

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-blue-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 dark:border-slate-800 dark:hover:border-blue-500/60">
      <div className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          name={fieldName}
          value="true"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-700" />
        <span className="absolute left-0.5 size-4 rounded-full bg-[#fff] shadow transition-transform peer-checked:translate-x-4" />
        <input type="hidden" name={fieldName} value="false" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-slate-950 dark:text-slate-100">{label}</span>
        {hasOverride && (
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
            (custom)
          </span>
        )}
      </div>
    </label>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  const roleClasses: Record<string, string> = {
    manager: "bg-emerald-100 text-emerald-800",
    cashier: "bg-amber-100 text-amber-800",
    technician: "bg-slate-200 text-slate-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleClasses[role] ?? "bg-slate-200 text-slate-800"}`}>
      {roleLabels[role] ?? role}
    </span>
  );
}
