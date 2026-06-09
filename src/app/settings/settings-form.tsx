"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import type { BrandingSettings } from "@/lib/data/settings";
import { updateSettingsAction, updateProfilePictureAction, type SettingsActionState, type SettingsIntent } from "./actions";
import { ImageUpload } from "@/components/shared/image-upload";
import { Check, ImageIcon, RotateCcw } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";
import {
  COLOR_THEME_OPTIONS,
  COLOR_THEME_STORAGE_KEY,
  CUSTOM_THEME_CSS_VARIABLES,
  CUSTOM_THEME_FIELDS,
  CUSTOM_THEME_STORAGE_KEY,
  DEFAULT_CUSTOM_THEME_COLORS,
  DEFAULT_COLOR_THEME,
  type ColorTheme,
  type CustomThemeColors,
  type CustomThemeFieldKey,
  isColorTheme,
  isHexColor,
  normalizeCustomThemeColors,
} from "@/lib/color-theme";

const initialState: SettingsActionState = { error: null, success: null };

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-500";
const textareaClass =
  "mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass = "block min-w-0";
const labelTextClass = "text-xs font-bold uppercase tracking-wide text-slate-500";
const MINIMUM_CONTRAST_RATIO = 4.5;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BlockSaveButton({
  pending,
  canEdit,
  label = "Save",
}: {
  pending: boolean;
  canEdit: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={!canEdit || pending}
      className="mt-4 h-10 rounded-lg bg-[var(--primary-accent-bg)] px-5 text-sm font-bold text-[var(--primary-accent-text)] transition hover:bg-[var(--primary-accent-hover)] disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function BlockMessage({ state }: { state: SettingsActionState }) {
  return (
    <>
      {state.success && (
        <p className="mt-3 text-xs font-semibold text-emerald-600">{state.success}</p>
      )}
      {state.error && (
        <p className="mt-3 text-xs font-semibold text-red-600">{state.error}</p>
      )}
    </>
  );
}

function readStoredCustomThemeColors(): CustomThemeColors | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return null;
    return normalizeCustomThemeColors(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readStoredColorTheme(): ColorTheme {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  try {
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    if (!isColorTheme(stored)) return DEFAULT_COLOR_THEME;
    if (stored === "custom" && !readStoredCustomThemeColors()) return DEFAULT_COLOR_THEME;
    return stored;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function mixHex(hex: string, targetHex: string, amount: number): string {
  const color = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  return `#${toHex(color.r + (target.r - color.r) * amount)}${toHex(
    color.g + (target.g - color.g) * amount,
  )}${toHex(color.b + (target.b - color.b) * amount)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const color = hexToRgb(hex);
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

function getCustomThemeVariables(colors: CustomThemeColors): Record<string, string> {
  return {
    "--sidebar-bg": colors.sidebarBg,
    "--sidebar-inactive": colors.sidebarInactive,
    "--sidebar-active-bg": colors.sidebarActiveBg,
    "--sidebar-active-text": colors.sidebarActiveText,
    "--sidebar-active-accent": colors.sidebarActiveAccent,
    "--primary-accent-bg": colors.primaryAccentBg,
    "--primary-accent-text": colors.primaryAccentText,
    "--sidebar-popover-bg": mixHex(colors.sidebarBg, "#FFFFFF", 0.06),
    "--sidebar-count-bg": hexToRgba(colors.sidebarActiveAccent, 0.22),
    "--sidebar-confirm-text": colors.sidebarBg,
    "--primary-accent-hover": mixHex(colors.primaryAccentBg, "#000000", 0.16),
    "--primary-accent-soft": hexToRgba(colors.primaryAccentBg, 0.12),
  };
}

function clearCustomThemeVariables() {
  if (typeof document === "undefined") return;
  for (const variable of CUSTOM_THEME_CSS_VARIABLES) {
    document.documentElement.style.removeProperty(variable);
  }
}

function applyCustomThemeVariables(colors: CustomThemeColors) {
  if (typeof document === "undefined") return;
  const variables = getCustomThemeVariables(colors);
  for (const [variable, value] of Object.entries(variables)) {
    document.documentElement.style.setProperty(variable, value);
  }
}

function applyColorTheme(theme: ColorTheme, customColors: CustomThemeColors) {
  if (typeof document === "undefined") return;
  if (theme === "custom") {
    document.documentElement.setAttribute("data-color-theme", theme);
    applyCustomThemeVariables(customColors);
    return;
  }

  clearCustomThemeVariables();
  document.documentElement.setAttribute("data-color-theme", theme);
}

function getContrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function formatContrastRatio(ratio: number): string {
  return ratio.toFixed(1);
}

function ColorThemePicker() {
  const { dict } = useLanguage();
  const colorThemeDict = dict.colorTheme as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => colorThemeDict?.[key] || fallback;
  const [mounted, setMounted] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [customColors, setCustomColors] = useState<CustomThemeColors>(DEFAULT_CUSTOM_THEME_COLORS);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const storedTheme = readStoredColorTheme();
      const storedCustomColors = readStoredCustomThemeColors() ?? DEFAULT_CUSTOM_THEME_COLORS;
      setCustomColors(storedCustomColors);
      setColorTheme(storedTheme);
      applyColorTheme(storedTheme, storedCustomColors);
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const activeTheme = mounted ? colorTheme : DEFAULT_COLOR_THEME;
  const contrastChecks = [
    {
      key: "sidebar",
      label: t("contrastSidebar", "Sidebar text vs background"),
      ratio: getContrastRatio(customColors.sidebarInactive, customColors.sidebarBg),
    },
    {
      key: "active",
      label: t("contrastActive", "Active text vs background"),
      ratio: getContrastRatio(customColors.sidebarActiveText, customColors.sidebarActiveBg),
    },
    {
      key: "button",
      label: t("contrastButton", "Button text vs background"),
      ratio: getContrastRatio(customColors.primaryAccentText, customColors.primaryAccentBg),
    },
  ];
  const contrastWarnings = contrastChecks.filter((check) => check.ratio < MINIMUM_CONTRAST_RATIO);

  function chooseTheme(theme: ColorTheme) {
    const nextCustomColors = theme === "custom" ? customColors : DEFAULT_CUSTOM_THEME_COLORS;
    setColorTheme(theme);
    applyColorTheme(theme, nextCustomColors);
    try {
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
      if (theme === "custom") {
        window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customColors));
      }
    } catch {}
  }

  function resetTheme() {
    setColorTheme(DEFAULT_COLOR_THEME);
    setCustomColors(DEFAULT_CUSTOM_THEME_COLORS);
    applyColorTheme(DEFAULT_COLOR_THEME, DEFAULT_CUSTOM_THEME_COLORS);
    try {
      window.localStorage.removeItem(COLOR_THEME_STORAGE_KEY);
      window.localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
    } catch {}
  }

  function updateCustomColor(key: CustomThemeFieldKey, value: string) {
    if (!isHexColor(value)) return;
    const nextColors = {
      ...customColors,
      [key]: value.toUpperCase(),
    };

    setCustomColors(nextColors);
    setColorTheme("custom");
    applyColorTheme("custom", nextColors);

    try {
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, "custom");
      window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(nextColors));
    } catch {}
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 dark:border-slate-700 dark:bg-[#0f172a]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">
            {t("title", "Color theme")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t("description", "Choose the sidebar and accent color theme. This is separate from Light, Dark, and System mode.")}
          </p>
        </div>
        <button
          type="button"
          onClick={resetTheme}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-[#eef2f7] px-3 text-xs font-bold text-slate-600 transition hover:bg-[#e2e8f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-[#1f2937]"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {t("reset", "Reset to default")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {COLOR_THEME_OPTIONS.map((option) => {
          const isActive = option.value === activeTheme;
          const label = t(option.labelKey, option.value);
          const preview = option.value === "custom"
            ? {
                sidebarBg: customColors.sidebarBg,
                activeBg: customColors.sidebarActiveBg,
                accent: customColors.sidebarActiveAccent,
                primaryBg: customColors.primaryAccentBg,
              }
            : option;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => chooseTheme(option.value)}
              aria-pressed={isActive}
              className={`min-h-24 rounded-2xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] ${
                isActive
                  ? "border-[var(--primary-accent-bg)] bg-[var(--primary-accent-soft)] shadow-sm"
                  : "border-slate-200 bg-[#f8fafc] hover:border-slate-300 hover:bg-[#eef2f7] dark:border-slate-700 dark:bg-[#111827] dark:hover:border-slate-600 dark:hover:bg-[#1f2937]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-12 overflow-hidden rounded-lg border border-black/10 shadow-sm dark:border-white/10"
                    aria-hidden="true"
                  >
                    <span className="h-full flex-1" style={{ backgroundColor: preview.sidebarBg }} />
                    <span className="h-full w-3" style={{ backgroundColor: preview.activeBg }} />
                    <span className="h-full w-1.5" style={{ backgroundColor: preview.accent }} />
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{label}</span>
                </span>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-accent-bg)] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--primary-accent-text)]">
                    <Check className="size-3" aria-hidden="true" />
                    {t("current", "Current")}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-2 flex-1 rounded-full" style={{ backgroundColor: preview.sidebarBg }} />
                <span className="h-2 flex-1 rounded-full" style={{ backgroundColor: preview.activeBg }} />
                <span className="h-2 flex-1 rounded-full" style={{ backgroundColor: preview.primaryBg }} />
              </div>
            </button>
          );
        })}
      </div>

      {activeTheme === "custom" && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-[#eef2f7] p-4 dark:border-slate-700 dark:bg-[#111827]">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-slate-50">
                {t("customPanelTitle", "Custom colors")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {t(
                  "customPanelDescription",
                  "Pick your own sidebar and accent colors. Changes preview and save instantly on this browser.",
                )}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {CUSTOM_THEME_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3 dark:border-slate-700 dark:bg-[#0f172a]"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {t(field.labelKey, field.labelKey)}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {customColors[field.key]}
                      </span>
                    </span>
                    <input
                      type="color"
                      value={customColors[field.key]}
                      onChange={(event) => updateCustomColor(field.key, event.target.value)}
                      aria-label={t(field.labelKey, field.labelKey)}
                      className="mt-3 h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-[#f8fafc] p-1 dark:border-slate-700 dark:bg-[#0f172a]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("preview", "Live preview")}
              </p>
              <div
                className="mt-3 rounded-2xl p-3 shadow-sm"
                style={{ backgroundColor: customColors.sidebarBg }}
              >
                <div
                  className="relative flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold"
                  style={{
                    backgroundColor: customColors.sidebarActiveBg,
                    color: customColors.sidebarActiveText,
                  }}
                >
                  <span
                    className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full"
                    style={{ backgroundColor: customColors.sidebarActiveAccent }}
                    aria-hidden="true"
                  />
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: customColors.sidebarActiveAccent }}
                    aria-hidden="true"
                  />
                  {t("activeItem", "Active item")}
                </div>
                <div
                  className="mt-2 flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
                  style={{ color: customColors.sidebarInactive }}
                >
                  <span
                    className="size-3 rounded-full border"
                    style={{ borderColor: customColors.sidebarInactive }}
                    aria-hidden="true"
                  />
                  {t("inactiveItem", "Inactive item")}
                </div>
                <div
                  className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
                  style={{ color: customColors.sidebarInactive }}
                >
                  <span
                    className="size-3 rounded-full border"
                    style={{ borderColor: customColors.sidebarInactive }}
                    aria-hidden="true"
                  />
                  {t("inactiveItemTwo", "Another item")}
                </div>
              </div>
              <button
                type="button"
                className="mt-3 h-10 w-full rounded-lg text-sm font-black transition"
                style={{
                  backgroundColor: customColors.primaryAccentBg,
                  color: customColors.primaryAccentText,
                }}
              >
                {t("sampleButton", "Sample button")}
              </button>

              <div className="mt-3 space-y-2">
                {contrastWarnings.length === 0 ? (
                  <p className="rounded-xl border border-emerald-200 bg-[#ecfdf5] px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {t("contrastOk", "Readability looks good for the checked pairs.")}
                  </p>
                ) : (
                  contrastWarnings.map((warning) => (
                    <p
                      key={warning.key}
                      className="rounded-xl border border-amber-200 bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      {warning.label}: {t("contrastWarning", "Hard to read")} (
                      {formatContrastRatio(warning.ratio)}:1)
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsForm({
  settings,
  canEdit,
  organizationId,
  userId,
  profilePictureUrl,
}: {
  settings: BrandingSettings;
  canEdit: boolean;
  organizationId: string;
  branchId: string | null;
  userId: string;
  profilePictureUrl?: string | null;
}) {
  const [bpState, bpAction, bpPending] = useActionState(updateSettingsAction, initialState);
  const [logoState, logoAction, logoPending] = useActionState(updateSettingsAction, initialState);
  const [brState, brAction, brPending] = useActionState(updateSettingsAction, initialState);
  const [invState, invAction, invPending] = useActionState(updateSettingsAction, initialState);
  const [, thAction] = useActionState(updateSettingsAction, initialState);
  const [regState, regAction, regPending] = useActionState(updateSettingsAction, initialState);
  const [ppState, ppAction] = useActionState(updateProfilePictureAction, initialState);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState(settings.logoUrl ?? "");
  const [appLogoUrlInput, setAppLogoUrlInput] = useState(settings.appLogoUrl ?? "");

  const DEFAULT_LOGO = "/saledock-logo-full.png";
  const effectiveLogoUrl = logoPreview || settings.logoUrl || DEFAULT_LOGO;
  const isDefaultLogo = !logoPreview && (!settings.logoUrl || settings.logoUrl === DEFAULT_LOGO);

  function handleLogoUpload(url: string) {
    setLogoPreview(url);
    setLogoError(false);
    setLogoUrlInput(url);
  }

  function handleLogoRemove() {
    setLogoPreview(null);
    setLogoError(false);
    setLogoUrlInput("");
  }

  function handleLogoError() {
    if (!logoError) setLogoError(true);
  }

  function handleAppLogoUpload(url: string) {
    setAppLogoUrlInput(url);
  }

  function handleAppLogoRemove() {
    setAppLogoUrlInput("");
  }

  function makeAction(intent: SettingsIntent) {
    return (formData: FormData) => {
      formData.set("intent", intent);
      const actions: Record<SettingsIntent, typeof bpAction> = {
        business_profile: bpAction,
        app_logo: logoAction,
        branch_profile: brAction,
        invoice_branding: invAction,
        theme: thAction,
        regional: regAction,
      };
      actions[intent](formData);
    };
  }

  return (
    <div className="space-y-5">
      {/* Business Profile */}
      <Section
        title="Business Profile"
        description="Primary shop details used in app headers, print documents, and future sharing."
      >
        <form action={makeAction("business_profile")}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Shop name</span>
              <input name="shopName" required defaultValue={settings.shopName} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Owner name</span>
              <input name="ownerName" defaultValue={settings.ownerName} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Phone</span>
              <input name="phone" defaultValue={settings.phone} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>WhatsApp support</span>
              <input name="whatsappSupport" defaultValue={settings.whatsappSupport} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Email</span>
              <input name="email" type="email" defaultValue={settings.email} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Address</span>
              <textarea name="address" defaultValue={settings.address} disabled={!canEdit || bpPending} className={textareaClass} />
            </label>
          </div>
          <BlockSaveButton pending={bpPending} canEdit={canEdit} label="Save business profile" />
          <BlockMessage state={bpState} />
        </form>

        {/* App / Shop Logo — inline sub-form inside same section */}
        <div className="mt-6 border-t border-slate-100 pt-6">
          <form action={makeAction("app_logo")}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">App / Shop Logo</p>
            <p className="mt-1 text-xs text-slate-400">Shown in the app sidebar/header next to the SaleDock logo.</p>
            <input type="hidden" name="appLogoUrl" value={appLogoUrlInput} />
            <div className="mt-3">
              <ImageUpload
                key={`app-logo-${settings.appLogoUrl || 'empty'}`}
                bucket="public-branding"
                folderPath={`orgs/${organizationId}/app-logo`}
                currentUrl={settings.appLogoUrl || null}
                onUploadComplete={handleAppLogoUpload}
                onRemove={handleAppLogoRemove}
                aspectRatio="landscape"
                uploadingText="Uploading logo..."
                removeLabel="Remove shop logo"
              />
            </div>
            <BlockSaveButton pending={logoPending} canEdit={canEdit} label="Save shop logo" />
            <BlockMessage state={logoState} />
          </form>
        </div>
      </Section>

      {/* Branch Profile */}
      <Section
        title="Branch Profile"
        description="Branch-level name and contact details shown on invoices, repair receipts, and reports."
      >
        <form action={makeAction("branch_profile")}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Branch name</span>
              <input name="branchName" required defaultValue={settings.branchName} disabled={!canEdit || brPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Branch phone</span>
              <input name="branchPhone" defaultValue={settings.branchPhone} disabled={!canEdit || brPending} className={inputClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Branch address</span>
              <textarea name="branchAddress" defaultValue={settings.branchAddress} disabled={!canEdit || brPending} className={textareaClass} />
            </label>
          </div>
          <BlockSaveButton pending={brPending} canEdit={canEdit} label="Save branch profile" />
          <BlockMessage state={brState} />
        </form>
      </Section>

      {/* Invoice & Receipt Branding */}
      <Section
        title="Invoice & Receipt Branding"
        description="Branding fields used by invoice prints, repair receipts, and reports."
      >
        <form action={makeAction("invoice_branding")}>
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex aspect-square items-center justify-center rounded-xl bg-white p-5">
                {logoError ? (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="size-10 text-slate-300" />
                    <span className="text-xs text-slate-400">Preview unavailable</span>
                    <span className="text-[10px] text-slate-400 text-center leading-tight">Upload a new image or remove it.</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={effectiveLogoUrl}
                    src={effectiveLogoUrl}
                    alt="Invoice logo preview"
                    className="h-auto max-h-28 w-auto object-contain"
                    onError={handleLogoError}
                  />
                )}
              </div>
              {isDefaultLogo && (
                <p className="mt-2 text-center text-[10px] text-slate-400">
                  Using default SaleDock logo
                </p>
              )}
              <div className="mt-3 space-y-2">
                <ImageUpload
                  key={`invoice-logo-${logoUrlInput || 'empty'}`}
                  bucket="public-branding"
                  folderPath={`orgs/${organizationId}/logo`}
                  currentUrl={null}
                  onUploadComplete={handleLogoUpload}
                  onRemove={handleLogoRemove}
                  aspectRatio="landscape"
                  uploadingText="Uploading logo..."
                  removeLabel="Remove logo"
                />
              </div>
            </div>
            <div className="grid gap-4">
              <label className={labelClass}>
                <span className={labelTextClass}>Logo URL or path</span>
                <input name="logoUrl" value={logoUrlInput} onChange={(e) => setLogoUrlInput(e.target.value)} disabled={!canEdit || invPending} className={inputClass} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Invoice footer / note</span>
                <textarea name="invoiceFooter" defaultValue={settings.invoiceFooter} disabled={!canEdit || invPending} className={textareaClass} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Repair receipt terms</span>
                <textarea name="receiptTerms" defaultValue={settings.receiptTerms} disabled={!canEdit || invPending} className={textareaClass} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Default print format</span>
                <select name="printFormat" defaultValue={settings.printFormat} disabled={!canEdit || invPending} className={inputClass}>
                  <option value="a4">A4 default</option>
                  <option value="80mm_planned">80mm planned / deferred</option>
                </select>
              </label>
            </div>
          </div>
          <BlockSaveButton pending={invPending} canEdit={canEdit} label="Save invoice branding" />
          <BlockMessage state={invState} />
        </form>
      </Section>

      {/* Theme & Appearance */}
      <Section
        title="Theme & Appearance"
        description="Choose the sidebar and accent color theme for the app."
      >
        <ColorThemePicker />
      </Section>

      {/* Profile Picture */}
      <Section
        title="Profile Picture"
        description="Your profile photo shown in the app header and staff list."
      >
        <form
          action={(formData: FormData) => {
            ppAction(formData);
          }}
        >
          <input type="hidden" name="profilePictureUrl" value="" />
          <div className="flex items-start gap-4">
            <ImageUpload
              key={`profile-pic-${profilePictureUrl || 'none'}`}
              bucket="profile-pictures"
              folderPath={`users/${userId}/profile-picture`}
              currentUrl={profilePictureUrl || null}
              onUploadComplete={(url) => {
                const fd = new FormData();
                fd.append("profilePictureUrl", url);
                ppAction(fd);
              }}
              onRemove={() => {
                const fd = new FormData();
                fd.append("profilePictureUrl", "");
                ppAction(fd);
              }}
              label="Profile picture"
              aspectRatio="square"
              removeLabel="Remove photo"
            />
          </div>
          {ppState.success && (
            <p className="mt-3 text-xs font-semibold text-emerald-600">{ppState.success}</p>
          )}
          {ppState.error && (
            <p className="mt-3 text-xs font-semibold text-red-600">{ppState.error}</p>
          )}
        </form>
      </Section>

      {/* Regional / Currency */}
      <Section
        title="Regional / Currency"
        description="Regional defaults for money formatting, reporting, and future branch operations."
      >
        <form action={makeAction("regional")}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Currency</span>
              <input name="currencyCode" defaultValue={settings.currencyCode || "PKR"} disabled={!canEdit || regPending} className={inputClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Timezone</span>
              <input name="timezone" defaultValue={settings.timezone || "Asia/Karachi"} disabled={!canEdit || regPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Low-stock default threshold</span>
              <input
                name="lowStockDefaultThreshold"
                type="number"
                min={0}
                defaultValue={settings.lowStockDefaultThreshold}
                disabled={!canEdit || regPending}
                className={inputClass}
              />
            </label>
          </div>
          <BlockSaveButton pending={regPending} canEdit={canEdit} label="Save regional settings" />
          <BlockMessage state={regState} />
        </form>
      </Section>
    </div>
  );
}
