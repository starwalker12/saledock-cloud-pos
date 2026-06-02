"use client";

import { useActionState } from "react";
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No staff members found. Invite staff from the Users page to manage permissions.
        </div>
      )}
    </div>
  );
}

function StaffPermissionCard({ member }: { member: PermissionEditorStaff }) {
  const [state, formAction, pending] = useActionState(updateStaffPermissionsAction, initialState);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-black text-slate-950">{member.full_name}</p>
            <p className="text-sm text-slate-500">{member.email ?? "No email"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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

      <form action={formAction} className="p-4 sm:p-6">
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
              effective={member.effective[perm]}
              hasOverride={member.overrides[perm] !== null}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save permissions"}
          </button>
          <p className="text-xs text-slate-400">
            Toggle permissions above, then save.
          </p>
        </div>
      </form>
    </div>
  );
}

function PermissionToggle({
  permission,
  effective,
  hasOverride,
}: {
  permission: Permission;
  effective: boolean;
  hasOverride: boolean;
}) {
  const label = permissionLabels[permission];
  const fieldName = permission;

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-blue-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500">
      <div className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          name={fieldName}
          value="true"
          defaultChecked={effective}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-700" />
        <span className="absolute left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        <input type="hidden" name={fieldName} value="false" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-slate-950">{label}</span>
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
