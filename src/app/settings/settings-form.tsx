"use client";

import type { FormEvent, ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { BrandingSettings } from "@/lib/data/settings";
import { updateSettingsAction, updateProfilePictureAction, type SettingsActionState, type SettingsIntent } from "./actions";
import { ImageUpload } from "@/components/shared/image-upload";
import { PhoneNumberInput } from "@/components/forms/phone-number-input";
import { AppSelect } from "@/components/ui/app-select";
import { Check, ImageIcon, RotateCcw, Loader2, MapPin, Crosshair, Link2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";
import { isValidPhoneNumber } from "@/lib/phone-validation";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { buildMapEmbedUrl, buildMapLinkUrl, buildGoogleMapsSearchUrl, hasMapData, hasMapEmbedData, isGoogleMapsSearchUrl, isValidCoordinate, parseCoordinatesFromMapInput, type MapCoordinates } from "@/lib/map-utils";
import { LocationMapPicker } from "@/components/shared/location-map-picker";
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
const PRINT_FORMAT_OPTIONS = [
  { value: "a4", label: "A4 default" },
  { value: "80mm_planned", label: "80mm planned / deferred" },
];

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
    <section className="rounded-2xl border border-slate-200 bg-[#fff] p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      <div>
        <h2 className="break-words text-lg font-black text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BlockSaveButton({
  pending,
  canEdit,
  isDirty,
  label = "Save",
}: {
  pending: boolean;
  canEdit: boolean;
  isDirty: boolean;
  label?: string;
}) {
  const disabled = !canEdit || pending || !isDirty;

  return (
    <button
      type="submit"
      disabled={disabled}
      title={!isDirty && canEdit ? "Make a change to enable saving" : undefined}
      className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary-accent-bg)] px-5 text-sm font-bold text-[var(--primary-accent-text)] transition hover:bg-[var(--primary-accent-hover)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Saving...
        </>
      ) : (
        label
      )}
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

type DirtyFieldValues = Record<string, string | number | null | undefined>;

function normalizeDirtyValue(value: FormDataEntryValue | string | number | null | undefined): string {
  if (typeof File !== "undefined" && value instanceof File) return value.name;
  return String(value ?? "");
}

function normalizeDirtyFields(values: DirtyFieldValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, normalizeDirtyValue(value)])
  );
}

function sameDirtyFields(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? "") !== (b[key] ?? "")) return false;
  }
  return true;
}

function useDirtyForm(formRef: { current: HTMLFormElement | null }, initialValues: DirtyFieldValues) {
  const initialKey = JSON.stringify(normalizeDirtyFields(initialValues));
  const [baseline, setBaseline] = useState<Record<string, string>>(() => normalizeDirtyFields(initialValues));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setBaseline(normalizeDirtyFields(initialValues));
      setIsDirty(false);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function readCurrentValues(nextBaseline = baseline) {
    if (!formRef.current) return nextBaseline;
    const formData = new FormData(formRef.current);
    const current = { ...nextBaseline };
    for (const key of Object.keys(nextBaseline)) {
      current[key] = normalizeDirtyValue(formData.get(key));
    }
    return current;
  }

  function refresh(nextBaseline = baseline) {
    const current = readCurrentValues(nextBaseline);
    setIsDirty(!sameDirtyFields(current, nextBaseline));
  }

  function handleChange() {
    window.requestAnimationFrame(() => refresh());
  }

  function preventCleanSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isDirty) event.preventDefault();
  }

  function markSaved() {
    const current = readCurrentValues();
    setBaseline(current);
    setIsDirty(false);
  }

  return { isDirty, handleChange, preventCleanSubmit, refresh, markSaved };
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
              className={`min-h-28 rounded-2xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] ${
                isActive
                  ? "border-[var(--primary-accent-bg)] bg-[var(--primary-accent-soft)] shadow-sm"
                  : "border-slate-200 bg-[#f8fafc] hover:border-slate-300 hover:bg-[#eef2f7] dark:border-slate-700 dark:bg-[#111827] dark:hover:border-slate-600 dark:hover:bg-[#1f2937]"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between md:flex-col xl:flex-row">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-8 w-12 shrink-0 overflow-hidden rounded-lg border border-black/10 shadow-sm dark:border-white/10"
                    aria-hidden="true"
                  >
                    <span className="h-full flex-1" style={{ backgroundColor: preview.sidebarBg }} />
                    <span className="h-full w-3" style={{ backgroundColor: preview.activeBg }} />
                    <span className="h-full w-1.5" style={{ backgroundColor: preview.accent }} />
                  </span>
                  <span className="min-w-0 break-words font-bold leading-tight text-slate-800 dark:text-slate-100">{label}</span>
                </span>
                {isActive && (
                  <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-[var(--primary-accent-bg)] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--primary-accent-text)]">
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
  const [locState, locAction, locPending] = useActionState(updateSettingsAction, initialState);
  const [ppState, ppAction] = useActionState(updateProfilePictureAction, initialState);

  const { dict } = useLanguage();
  const shellDict = (dict as Record<string, Record<string, string>>).shell;
  const [businessPhone, setBusinessPhone] = useState(settings.phone ?? "");
  const [whatsappSupport, setWhatsappSupport] = useState(settings.whatsappSupport ?? "");
  const [branchPhone, setBranchPhone] = useState(settings.branchPhone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [branchPhoneError, setBranchPhoneError] = useState<string | null>(null);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState(settings.logoUrl ?? "");
  const [appLogoUrlInput, setAppLogoUrlInput] = useState(settings.appLogoUrl ?? "");
  const [googleMapsUrlInput, setGoogleMapsUrlInput] = useState(settings.googleMapsUrl ?? "");
  const [latitudeInput, setLatitudeInput] = useState(settings.latitude ?? "");
  const [longitudeInput, setLongitudeInput] = useState(settings.longitude ?? "");
  const [showMapInput, setShowMapInput] = useState(settings.showMap);
  const [invoiceShowQrInput, setInvoiceShowQrInput] = useState(settings.invoiceShowLocationQr);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [coordinateParseMessage, setCoordinateParseMessage] = useState<string | null>(null);
  const businessFormRef = useRef<HTMLFormElement>(null);
  const appLogoFormRef = useRef<HTMLFormElement>(null);
  const branchFormRef = useRef<HTMLFormElement>(null);
  const invoiceFormRef = useRef<HTMLFormElement>(null);
  const regionalFormRef = useRef<HTMLFormElement>(null);
  const locationFormRef = useRef<HTMLFormElement>(null);
  const businessDirty = useDirtyForm(businessFormRef, {
    shopName: settings.shopName,
    ownerName: settings.ownerName,
    phone: settings.phone,
    whatsappSupport: settings.whatsappSupport,
    email: settings.email,
    address: settings.address,
  });
  const appLogoDirty = useDirtyForm(appLogoFormRef, { appLogoUrl: settings.appLogoUrl ?? "" });
  const branchDirty = useDirtyForm(branchFormRef, {
    branchName: settings.branchName,
    branchPhone: settings.branchPhone,
    branchAddress: settings.branchAddress,
  });
  const invoiceDirty = useDirtyForm(invoiceFormRef, {
    logoUrl: settings.logoUrl ?? "",
    invoiceFooter: settings.invoiceFooter,
    receiptTerms: settings.receiptTerms,
    printFormat: settings.printFormat,
  });
  const regionalDirty = useDirtyForm(regionalFormRef, {
    currencyCode: settings.currencyCode || "PKR",
    timezone: settings.timezone || "Asia/Karachi",
    lowStockDefaultThreshold: settings.lowStockDefaultThreshold,
  });
  const locationDirty = useDirtyForm(locationFormRef, {
    googleMapsUrl: settings.googleMapsUrl ?? "",
    latitude: settings.latitude ?? "",
    longitude: settings.longitude ?? "",
    showMap: settings.showMap ? "true" : "false",
    invoiceShowLocationQr: settings.invoiceShowLocationQr ? "true" : "false",
  });

  useEffect(() => {
    const id = window.setTimeout(() => {
      setBusinessPhone(settings.phone ?? "");
      setWhatsappSupport(settings.whatsappSupport ?? "");
      setBranchPhone(settings.branchPhone ?? "");
      setGoogleMapsUrlInput(settings.googleMapsUrl ?? "");
      setLatitudeInput(settings.latitude ?? "");
      setLongitudeInput(settings.longitude ?? "");
      setShowMapInput(settings.showMap);
      setInvoiceShowQrInput(settings.invoiceShowLocationQr);
      setPhoneError(null);
      setWhatsappError(null);
      setBranchPhoneError(null);
      setLocationError(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [settings.branchPhone, settings.phone, settings.whatsappSupport, settings.googleMapsUrl, settings.latitude, settings.longitude, settings.showMap, settings.invoiceShowLocationQr]);

  useEffect(() => {
    businessDirty.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessPhone, whatsappSupport]);

  useEffect(() => {
    branchDirty.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchPhone]);

  useEffect(() => {
    if (!bpState.success) return;
    const id = window.setTimeout(() => businessDirty.markSaved(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpState]);

  useEffect(() => {
    if (!logoState.success) return;
    const id = window.setTimeout(() => appLogoDirty.markSaved(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoState]);

  useEffect(() => {
    if (!brState.success) return;
    const id = window.setTimeout(() => branchDirty.markSaved(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brState]);

  useEffect(() => {
    if (!invState.success) return;
    const id = window.setTimeout(() => invoiceDirty.markSaved(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invState]);

  useEffect(() => {
    if (!regState.success) return;
    const id = window.setTimeout(() => regionalDirty.markSaved(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regState]);

  useEffect(() => {
    appLogoDirty.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLogoUrlInput]);

  useEffect(() => {
    invoiceDirty.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrlInput]);

  // Safe local draft preservation for the location form only.
  const { draft: locationDraft, discardDraft: discardLocationDraft } = useFormDraft({
    storageKey: `saledock-settings-location-draft-${organizationId}`,
    enabled: true,
    values: {
      googleMapsUrl: googleMapsUrlInput,
      latitude: latitudeInput,
      longitude: longitudeInput,
      showMap: showMapInput,
      invoiceShowLocationQr: invoiceShowQrInput,
    },
  });

  const mapLinkUrl = buildMapLinkUrl(googleMapsUrlInput, latitudeInput, longitudeInput);

  useEffect(() => {
    if (!locState.success) return;
    const id = window.setTimeout(() => {
      locationDirty.markSaved();
      discardLocationDraft();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locState]);

  function syncGoogleMapsLinkFromCoordinates(lat: string, lng: string) {
    const generatedLink = buildGoogleMapsSearchUrl(lat, lng);
    if (!generatedLink) return;
    setGoogleMapsUrlInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || isGoogleMapsSearchUrl(trimmed)) return generatedLink;
      return prev;
    });
  }

  function updateLatitude(value: string) {
    setLatitudeInput(value);
    syncGoogleMapsLinkFromCoordinates(value, longitudeInput);
  }

  function updateLongitude(value: string) {
    setLongitudeInput(value);
    syncGoogleMapsLinkFromCoordinates(latitudeInput, value);
  }

  function applyLocationDraft() {
    if (!locationDraft) return;
    if (locationDraft.googleMapsUrl && !googleMapsUrlInput) setGoogleMapsUrlInput(String(locationDraft.googleMapsUrl));
    if (locationDraft.latitude && !latitudeInput) setLatitudeInput(String(locationDraft.latitude));
    if (locationDraft.longitude && !longitudeInput) setLongitudeInput(String(locationDraft.longitude));
    if (typeof locationDraft.showMap === "boolean") setShowMapInput(locationDraft.showMap);
    if (typeof locationDraft.invoiceShowLocationQr === "boolean") setInvoiceShowQrInput(locationDraft.invoiceShowLocationQr);
  }

  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (draftRestored || !locationDraft) return;
    const id = window.setTimeout(() => {
      applyLocationDraft();
      setDraftRestored(true);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationDraft]);

  function updateLocationFromCoordinates(lat: string, lng: string) {
    setLatitudeInput(lat);
    setLongitudeInput(lng);
    const generatedLink = buildGoogleMapsSearchUrl(lat, lng);
    if (generatedLink) {
      setGoogleMapsUrlInput((prev) => {
        // Only overwrite if empty or if the existing link was auto-generated from coordinates.
        if (!prev.trim() || isGoogleMapsSearchUrl(prev.trim())) return generatedLink;
        return prev;
      });
    }
    setCoordinateParseMessage(null);
    locationDirty.refresh();
  }

  function handleGetLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setGettingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateLocationFromCoordinates(pos.coords.latitude.toString(), pos.coords.longitude.toString());
        setGettingLocation(false);
      },
      (err) => {
        setLocationError(err.message || "Could not get your location.");
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleGenerateLinkFromCoordinates() {
    const generatedLink = buildGoogleMapsSearchUrl(latitudeInput, longitudeInput);
    if (generatedLink) {
      setGoogleMapsUrlInput(generatedLink);
      locationDirty.refresh();
    }
  }

  function handleGoogleMapsUrlChange(value: string) {
    setGoogleMapsUrlInput(value);
    const coords = parseCoordinatesFromMapInput(value);
    if (coords) {
      setLatitudeInput(coords.lat.toString());
      setLongitudeInput(coords.lng.toString());
      setCoordinateParseMessage("Coordinates were read from the link.");
    } else if (value.trim() && !isGoogleMapsSearchUrl(value.trim())) {
      // Only show the helper when the pasted link looks like a real Google Maps URL
      // but we could not extract coordinates from it.
      setCoordinateParseMessage(
        "We could not read coordinates from this link. Use current location or Adjust location to place the pin.",
      );
    } else {
      setCoordinateParseMessage(null);
    }
    // Defer dirty refresh so React has applied the new lat/lng state before the
    // dirty checker reads the form.
    window.requestAnimationFrame(() => locationDirty.refresh());
  }

  function handleAdjustLocationConfirm(coords: MapCoordinates) {
    updateLocationFromCoordinates(coords.lat.toString(), coords.lng.toString());
    setShowLocationPicker(false);
  }

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
      if (intent === "business_profile") {
        const phone = formData.get("phone") as string;
        const whatsapp = formData.get("whatsappSupport") as string;
        const isDirty = phone !== (settings.phone || "");
        const whatsappIsDirty = whatsapp !== (settings.whatsappSupport || "");
        if (isDirty && !isValidPhoneNumber(phone)) {
          setPhoneError(shellDict?.invalidPhone || "Please enter a valid phone number (e.g. +92 300 1234567).");
          return;
        } else {
          setPhoneError(null);
        }
        if (whatsappIsDirty && !isValidPhoneNumber(whatsapp)) {
          setWhatsappError("Please enter a valid WhatsApp support number (e.g. +92 300 7654321).");
          return;
        } else {
          setWhatsappError(null);
        }
      }
      if (intent === "branch_profile") {
        const branchPhone = formData.get("branchPhone") as string;
        const isDirty = branchPhone !== (settings.branchPhone || "");
        if (isDirty && !isValidPhoneNumber(branchPhone)) {
          setBranchPhoneError(shellDict?.invalidPhone || "Please enter a valid phone number (e.g. +92 300 1234567).");
          return;
        } else {
          setBranchPhoneError(null);
        }
      }
      const actions: Record<SettingsIntent, typeof bpAction> = {
        business_profile: bpAction,
        app_logo: logoAction,
        branch_profile: brAction,
        invoice_branding: invAction,
        theme: thAction,
        regional: regAction,
        location: locAction,
      };
      actions[intent](formData);
    };
  }

  const checkboxClass = "h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-[var(--primary-accent-bg)] focus:ring-[var(--primary-accent-bg)]";

  return (
    <div className="space-y-5">
      {/* Business Profile */}
      <Section
        title="Business Profile"
        description="Primary shop details used in app headers, print documents, and future sharing."
      >
        <form
          ref={businessFormRef}
          action={makeAction("business_profile")}
          onInput={businessDirty.handleChange}
          onChange={businessDirty.handleChange}
          onSubmit={businessDirty.preventCleanSubmit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Shop name</span>
              <input name="shopName" required defaultValue={settings.shopName} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Owner name</span>
              <input name="ownerName" defaultValue={settings.ownerName} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <PhoneNumberInput
              label="Phone"
              id="settings-phone"
              name="phone"
              value={businessPhone}
              onChange={(value) => {
                setBusinessPhone(value);
                if (!value || isValidPhoneNumber(value)) setPhoneError(null);
              }}
              disabled={!canEdit || bpPending}
              error={phoneError}
              helperText="This shop phone is used on invoices and receipts."
            />
            <PhoneNumberInput
              label="WhatsApp support"
              id="settings-whatsapp-support"
              name="whatsappSupport"
              value={whatsappSupport}
              onChange={(value) => {
                setWhatsappSupport(value);
                if (!value || isValidPhoneNumber(value)) setWhatsappError(null);
              }}
              disabled={!canEdit || bpPending}
              error={whatsappError}
              helperText="Optional customer support WhatsApp number."
            />
            <label className={labelClass}>
              <span className={labelTextClass}>Email</span>
              <input name="email" type="email" defaultValue={settings.email} disabled={!canEdit || bpPending} className={inputClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Address</span>
              <textarea name="address" defaultValue={settings.address} disabled={!canEdit || bpPending} className={textareaClass} />
            </label>
          </div>
          <BlockSaveButton pending={bpPending} canEdit={canEdit} isDirty={businessDirty.isDirty} label="Save business profile" />
          <BlockMessage state={bpState} />
        </form>

        {/* App / Shop Logo — inline sub-form inside same section */}
        <div className="mt-6 border-t border-slate-100 pt-6">
          <form
            ref={appLogoFormRef}
            action={makeAction("app_logo")}
            onInput={appLogoDirty.handleChange}
            onChange={appLogoDirty.handleChange}
            onSubmit={appLogoDirty.preventCleanSubmit}
          >
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
            <BlockSaveButton pending={logoPending} canEdit={canEdit} isDirty={appLogoDirty.isDirty} label="Save shop logo" />
            <BlockMessage state={logoState} />
          </form>
        </div>
      </Section>

      {/* Shop Location */}
      <Section
        title="Shop Location"
        description="Set your shop location for receipts, invoices, and customer directions."
      >
        <form
          ref={locationFormRef}
          action={makeAction("location")}
          onInput={locationDirty.handleChange}
          onChange={locationDirty.handleChange}
          onSubmit={locationDirty.preventCleanSubmit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Google Maps link</span>
              <input
                name="googleMapsUrl"
                value={googleMapsUrlInput}
                onChange={(e) => handleGoogleMapsUrlChange(e.target.value)}
                disabled={!canEdit || locPending}
                placeholder="e.g. https://maps.app.goo.gl/xyz123"
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                You can also paste a lat,lng pair like 24.8607,67.0011 or a full Google Maps URL.
              </p>
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Latitude</span>
              <input
                name="latitude"
                type="number"
                step="any"
                value={latitudeInput}
                onChange={(e) => {
                  updateLatitude(e.target.value);
                  locationDirty.refresh();
                }}
                disabled={!canEdit || locPending}
                placeholder="e.g. 33.6844"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Longitude</span>
              <input
                name="longitude"
                type="number"
                step="any"
                value={longitudeInput}
                onChange={(e) => {
                  updateLongitude(e.target.value);
                  locationDirty.refresh();
                }}
                disabled={!canEdit || locPending}
                placeholder="e.g. 73.0479"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gettingLocation || !canEdit || locPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <MapPin className="size-3.5" />
              {gettingLocation ? "Getting location..." : "Use my current location"}
            </button>
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              disabled={!canEdit || locPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Crosshair className="size-3.5" />
              Adjust location
            </button>
            {isValidCoordinate(latitudeInput, longitudeInput) && !isGoogleMapsSearchUrl(googleMapsUrlInput.trim()) && (
              <button
                type="button"
                onClick={handleGenerateLinkFromCoordinates}
                disabled={!canEdit || locPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Link2 className="size-3.5" />
                Generate link from coordinates
              </button>
            )}
            {latitudeInput && longitudeInput && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Location set: {Number(latitudeInput).toFixed(4)}, {Number(longitudeInput).toFixed(4)}
              </p>
            )}
            {locationError && (
              <p className="text-xs text-red-600 dark:text-red-400">{locationError}</p>
            )}
            {coordinateParseMessage && (
              <p className={`text-xs ${coordinateParseMessage.includes("could not read") ? "text-amber-700 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}`}>
                {coordinateParseMessage}
              </p>
            )}
          </div>

          {mapLinkUrl && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
              {hasMapEmbedData(latitudeInput, longitudeInput) ? (
                <iframe
                  title="Shop location map"
                  src={buildMapEmbedUrl(googleMapsUrlInput, latitudeInput, longitudeInput) ?? undefined}
                  className="mt-2 h-56 w-full rounded-lg border-0 print:hidden"
                  loading="lazy"
                  allowFullScreen
                />
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {googleMapsUrlInput.trim()
                    ? "We could not read coordinates from this link. Use current location or Adjust location to place the pin."
                    : "Enter coordinates or use a location tool above to see a map preview."}
                </p>
              )}
              <a
                href={mapLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Open map link
              </a>
            </div>
          )}

          {!mapLinkUrl && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Add a Google Maps link or set coordinates to see a preview.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice options</p>
            <input type="hidden" name="invoiceShowLocationQr" value={invoiceShowQrInput ? "true" : "false"} />
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={invoiceShowQrInput}
                onChange={(e) => {
                  setInvoiceShowQrInput(e.target.checked);
                  locationDirty.refresh();
                }}
                disabled={!canEdit || locPending}
                className={checkboxClass}
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show shop location QR code on invoice</span>
            </label>
            {!hasMapData(googleMapsUrlInput, latitudeInput, longitudeInput) && invoiceShowQrInput && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Add a Google Maps link or coordinates above to enable the location QR code on invoices.
              </p>
            )}
          </div>

          <input type="hidden" name="showMap" value={showMapInput ? "true" : "false"} />
          <label className="mt-4 flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={showMapInput}
              onChange={(e) => {
                setShowMapInput(e.target.checked);
                locationDirty.refresh();
              }}
              disabled={!canEdit || locPending}
              className={checkboxClass}
            />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show map on receipts and profile</span>
          </label>

          <BlockSaveButton pending={locPending} canEdit={canEdit} isDirty={locationDirty.isDirty} label="Save shop location" />
          <BlockMessage state={locState} />

          {showLocationPicker && (
            <LocationMapPicker
              initialLat={latitudeInput}
              initialLng={longitudeInput}
              onConfirm={handleAdjustLocationConfirm}
              onClose={() => setShowLocationPicker(false)}
            />
          )}
        </form>
      </Section>

      {/* Branch Profile */}
      <Section
        title="Branch Profile"
        description="Branch-level name and contact details shown on invoices, repair receipts, and reports."
      >
        <form
          ref={branchFormRef}
          action={makeAction("branch_profile")}
          onInput={branchDirty.handleChange}
          onChange={branchDirty.handleChange}
          onSubmit={branchDirty.preventCleanSubmit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Branch name</span>
              <input name="branchName" required defaultValue={settings.branchName} disabled={!canEdit || brPending} className={inputClass} />
            </label>
            <PhoneNumberInput
              label="Branch phone"
              id="settings-branch-phone"
              name="branchPhone"
              value={branchPhone}
              onChange={(value) => {
                setBranchPhone(value);
                if (!value || isValidPhoneNumber(value)) setBranchPhoneError(null);
              }}
              disabled={!canEdit || brPending}
              error={branchPhoneError}
              helperText="Branch-specific number, if different from the main shop."
            />
            <label className="block min-w-0 md:col-span-2">
              <span className={labelTextClass}>Branch address</span>
              <textarea name="branchAddress" defaultValue={settings.branchAddress} disabled={!canEdit || brPending} className={textareaClass} />
            </label>
          </div>
          <BlockSaveButton pending={brPending} canEdit={canEdit} isDirty={branchDirty.isDirty} label="Save branch profile" />
          <BlockMessage state={brState} />
        </form>
      </Section>

      {/* Invoice & Receipt Branding */}
      <Section
        title="Invoice & Receipt Branding"
        description="Branding fields used by invoice prints, repair receipts, and reports."
      >
        <form
          ref={invoiceFormRef}
          action={makeAction("invoice_branding")}
          onInput={invoiceDirty.handleChange}
          onChange={invoiceDirty.handleChange}
          onSubmit={invoiceDirty.preventCleanSubmit}
        >
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex aspect-square items-center justify-center rounded-xl bg-[#fff] p-5">
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
              {isDefaultLogo ? (
                <p className="mt-2 text-center text-[10px] text-slate-400">
                  Using default SaleDock logo
                </p>
              ) : (
                <div className="mt-2 space-y-0.5">
                  <p className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Logo uploaded
                  </p>
                  <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                    Current logo is saved. Upload a new logo to replace it.
                  </p>
                </div>
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
              <input type="hidden" name="logoUrl" value={logoUrlInput} />
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
                <AppSelect
                  name="printFormat"
                  defaultValue={settings.printFormat}
                  disabled={!canEdit || invPending}
                  options={PRINT_FORMAT_OPTIONS}
                  ariaLabel="Default print format"
                  className="mt-1"
                  buttonClassName="h-11 rounded-xl"
                />
              </label>
            </div>
          </div>
          <BlockSaveButton pending={invPending} canEdit={canEdit} isDirty={invoiceDirty.isDirty} label="Save invoice branding" />
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
        <form
          ref={regionalFormRef}
          action={makeAction("regional")}
          onInput={regionalDirty.handleChange}
          onChange={regionalDirty.handleChange}
          onSubmit={regionalDirty.preventCleanSubmit}
        >
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
          <BlockSaveButton pending={regPending} canEdit={canEdit} isDirty={regionalDirty.isDirty} label="Save regional settings" />
          <BlockMessage state={regState} />
        </form>
      </Section>
    </div>
  );
}
