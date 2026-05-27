"use client";

import { useActionState, useState } from "react";
import { updatePlatformSettingsAction, type PlatformSettingsState } from "./actions";
import { AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

type Props = {
  settingsMap: Record<string, unknown>;
  getBool: (key: string, def?: boolean) => boolean;
  getStr: (key: string, fallback?: string) => string;
};

const initialState: PlatformSettingsState = { success: false };

export function PlatformSettingsForm({ getBool, getStr }: Props) {
  const [state, formAction, isPending] = useActionState(
    updatePlatformSettingsAction,
    initialState,
  );
  const [maintenanceOn, setMaintenanceOn] = useState(getBool("maintenance_mode_enabled"));

  const boolKeys = [
    { key: "public_signup_enabled", label: "Public Signup" },
    { key: "maintenance_mode_enabled", label: "Maintenance Mode" },
    { key: "backup_import_enabled", label: "Backup Import" },
    { key: "demo_data_enabled", label: "Demo Data" },
    { key: "factory_reset_enabled", label: "Factory Reset" },
  ] as const;

  type StrField = { key: string; label: string; placeholder: string; isTextarea?: boolean };
  const strKeys: StrField[] = [
    { key: "maintenance_message", label: "Maintenance Message", placeholder: "Scheduled maintenance in progress...", isTextarea: true },
    { key: "default_currency", label: "Default Currency", placeholder: "PKR" },
    { key: "default_timezone", label: "Default Timezone", placeholder: "Asia/Karachi" },
    { key: "app_name", label: "App Name", placeholder: "SaleDock" },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-black text-slate-950 dark:text-slate-50">Platform Settings</h2>
      <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-6">
          {/* Boolean Toggles */}
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Toggles</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boolKeys.map(({ key, label }) => {
                const isOn = key === "maintenance_mode_enabled"
                  ? maintenanceOn
                  : getBool(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition ${
                      isOn
                        ? key === "maintenance_mode_enabled"
                          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                          : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        name={key}
                        defaultChecked={isOn}
                        onChange={(e) => {
                          if (key === "maintenance_mode_enabled") setMaintenanceOn(e.target.checked);
                        }}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-blue-700 peer-checked:after:translate-x-full dark:bg-slate-600" />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Maintenance Warning */}
          {maintenanceOn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Maintenance mode is ON. Non-platform users will see the maintenance message instead of the dashboard.
            </div>
          )}

          {/* Text Inputs */}
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Values</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {strKeys.map(({ key, label, placeholder, isTextarea }) => (
                <label key={key} className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{label}</span>
                  {isTextarea ? (
                    <textarea
                      name={key}
                      defaultValue={getStr(key) || ""}
                      placeholder={placeholder}
                      rows={2}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
                    />
                  ) : (
                    <input
                      type="text"
                      name={key}
                      defaultValue={getStr(key) || ""}
                      placeholder={placeholder}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Save Button & Status */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </button>

            {state.success && !isPending && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle className="size-4" />
                Settings saved
              </div>
            )}

            {state.error && !isPending && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="size-4" />
                {state.error}
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
