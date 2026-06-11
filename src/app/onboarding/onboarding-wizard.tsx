"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction, type OnboardingState } from "./actions";
import { ImageUpload } from "@/components/shared/image-upload";

const initialState: OnboardingState = { error: null };

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500";
const labelTextClass = "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const TIMEZONES = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Riyadh", "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Kabul", "Asia/Tehran", "Asia/Baghdad",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Moscow",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Africa/Cairo", "Africa/Lagos", "Australia/Sydney",
  "Pacific/Auckland", "UTC",
] as const;

const CURRENCIES = [
  { code: "PKR", label: "PKR (₨) — Pakistan" },
  { code: "USD", label: "USD ($) — US Dollar" },
  { code: "EUR", label: "EUR (€) — Euro" },
  { code: "GBP", label: "GBP (£) — British Pound" },
  { code: "AED", label: "AED (د.إ) — UAE Dirham" },
  { code: "SAR", label: "SAR (﷼) — Saudi Riyal" },
  { code: "INR", label: "INR (₹) — Indian Rupee" },
  { code: "BDT", label: "BDT (৳) — Bangladeshi Taka" },
  { code: "AFN", label: "AFN (؋) — Afghan Afghani" },
  { code: "IRR", label: "IRR (﷼) — Iranian Rial" },
  { code: "QAR", label: "QAR (﷼) — Qatari Riyal" },
  { code: "OMR", label: "OMR (﷼) — Omani Rial" },
  { code: "KWD", label: "KWD (د.ك) — Kuwaiti Dinar" },
  { code: "MYR", label: "MYR (RM) — Malaysian Ringgit" },
  { code: "SGD", label: "SGD ($) — Singapore Dollar" },
  { code: "TRY", label: "TRY (₺) — Turkish Lira" },
  { code: "CAD", label: "CAD ($) — Canadian Dollar" },
  { code: "AUD", label: "AUD ($) — Australian Dollar" },
  { code: "CNY", label: "CNY (¥) — Chinese Yuan" },
  { code: "JPY", label: "JPY (¥) — Japanese Yen" },
] as const;

const SOCIAL_PLATFORMS = [
  "Instagram", "Facebook", "TikTok", "X / Twitter", "Snapchat",
  "YouTube", "LinkedIn", "Website", "WhatsApp Channel", "Other",
] as const;

type SocialLink = { platform: string; url: string };
type StepName = "profile" | "shop" | "branch" | "branding" | "confirm";

const STEP_LABELS: Record<StepName, string> = {
  profile: "Owner Profile",
  shop: "Shop Profile",
  branch: "Branch Setup",
  branding: "Branding",
  confirm: "Finish",
};

const STEP_ORDER: StepName[] = ["profile", "shop", "branch", "branding", "confirm"];

function getDefaultCurrency(): string {
  if (typeof Intl === "undefined") return "PKR";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith("Asia/Karachi")) return "PKR";
    if (tz.startsWith("Asia/Dubai")) return "AED";
    if (tz.startsWith("Asia/Kolkata")) return "INR";
    if (tz.startsWith("Asia/Dhaka")) return "BDT";
    if (tz.startsWith("Asia/Riyadh")) return "SAR";
    if (tz.startsWith("Asia/Singapore")) return "SGD";
    if (tz.startsWith("Europe/London")) return "GBP";
    if (tz.startsWith("Europe/Berlin") || tz.startsWith("Europe/Paris")) return "EUR";
    if (tz.startsWith("America/New_York") || tz.startsWith("America/Chicago")) return "USD";
    return "PKR";
  } catch {
    return "PKR";
  }
}

function getDefaultTimezone(): string {
  if (typeof Intl === "undefined") return "Asia/Karachi";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi";
  } catch {
    return "Asia/Karachi";
  }
}

export function OnboardingWizard({
  defaultFullName,
  userEmail,
  userId,
}: {
  defaultFullName: string;
  userEmail: string;
  userId: string;
}) {
  const [step, setStep] = useState<StepName>("profile");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(completeOnboardingAction, initialState);
  const defaultCurrency = getDefaultCurrency();
  const defaultTimezone = getDefaultTimezone();

  const [formData, setFormData] = useState<Record<string, string>>({
    fullName: defaultFullName,
    username: "",
    phone: "",
    profilePictureUrl: "",
    organizationName: "",
    ownerName: "",
    orgPhone: "",
    orgWhatsapp: "",
    orgEmail: userEmail,
    orgAddress: "",
    currencyCode: defaultCurrency,
    timezone: defaultTimezone,
    googleMapsUrl: "",
    latitude: "",
    longitude: "",
    showMap: "false",
    socialLinks: "[]",
    branchName: "Main Branch",
    branchPhone: "",
    branchAddress: "",
    branchGoogleMapsUrl: "",
    branchLatitude: "",
    branchLongitude: "",
    branchUseShopDetails: "true",
    logoUrl: "",
    primaryColor: "#0b2f6f",
    accentColor: "#00b8b0",
    defaultTheme: "system",
  });

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLastStep = step === "confirm";
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  function validateStep(stepName: StepName): Record<string, string> {
    const errs: Record<string, string> = {};
    switch (stepName) {
      case "profile":
        if (!formData.fullName || formData.fullName.trim().length < 2) {
          errs.fullName = "Please enter your full name.";
        }
        break;
      case "shop":
        if (!formData.organizationName || formData.organizationName.trim().length < 2) {
          errs.organizationName = "Please enter your shop name.";
        }
        if (!formData.orgPhone || formData.orgPhone.trim().length < 1) {
          errs.orgPhone = "Please enter your shop phone number.";
        }
        if (!formData.orgEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.orgEmail.trim())) {
          errs.orgEmail = "Please enter a valid shop email address.";
        }
        break;
    }
    return errs;
  }

  function updateField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function nextStep() {
    const stepErrors = validateStep(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      // Find the first error key, focus and scroll to it
      const firstErrorKey = Object.keys(stepErrors)[0];
      if (firstErrorKey) {
        setTimeout(() => {
          const element = document.getElementById(firstErrorKey) || document.querySelector(`[name="${firstErrorKey}"]`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
              element.focus();
            }
          }
        }, 100);
      }
      return;
    }
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }

  function prevStep() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleSubmit(form: FormData) {
    for (const [key, value] of Object.entries(formData)) {
      form.set(key, value);
    }
    formAction(form);
  }

  function restartSetup() {
    setStep("profile");
    setFormData({
      fullName: defaultFullName,
      username: "",
      phone: "",
      profilePictureUrl: "",
      organizationName: "",
      ownerName: "",
      orgPhone: "",
      orgWhatsapp: "",
      orgEmail: userEmail,
      orgAddress: "",
      currencyCode: defaultCurrency,
      timezone: defaultTimezone,
      googleMapsUrl: "",
      latitude: "",
      longitude: "",
      showMap: "false",
      socialLinks: "[]",
      branchName: "Main Branch",
      branchPhone: "",
      branchAddress: "",
      branchGoogleMapsUrl: "",
      branchLatitude: "",
      branchLongitude: "",
      branchUseShopDetails: "true",
      logoUrl: "",
      primaryColor: "#0b2f6f",
      accentColor: "#00b8b0",
      defaultTheme: "system",
    });
  }

  const currentStep = (function () {
    switch (step) {
      case "profile":
        return <ProfileStep data={formData} onChange={updateField} errors={errors} userId={userId} />;
      case "shop":
        return <ShopStep data={formData} onChange={updateField} errors={errors} />;
      case "branch":
        return <BranchStep data={formData} onChange={updateField} />;
      case "branding":
        return <BrandingStep data={formData} onChange={updateField} userId={userId} />;
      case "confirm":
        return <ConfirmStep data={formData} />;
    }
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: formData.accentColor || "#00b8b0" }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0 dark:text-slate-400">
          {stepIndex + 1}/{STEP_ORDER.length}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {STEP_ORDER.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => i < stepIndex && setStep(s)}
            disabled={i > stepIndex}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              s === step
                ? "text-white"
                : i < stepIndex
                  ? "text-white cursor-pointer"
                  : "bg-slate-100 text-slate-400 cursor-default dark:bg-slate-800 dark:text-slate-500"
            }`}
            style={{
              backgroundColor: s === step || i < stepIndex ? formData.accentColor || "#00b8b0" : undefined,
            }}
          >
            {i < stepIndex ? "✓ " : ""}{STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900">
          {state.error}
        </p>
      )}

      {isLastStep ? (
        <form action={handleSubmit}>
          {currentStep}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={prevStep}
              className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-xl px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: formData.primaryColor || "#0b2f6f" }}
            >
              {pending ? "Creating shop..." : "Create my shop"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {currentStep}
          <div className="mt-6 flex justify-between">
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={restartSetup}
                className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-5 text-sm font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Restart
              </button>
            </div>
            <button
              type="button"
              onClick={nextStep}
              className="h-11 rounded-xl px-6 text-sm font-bold text-white hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: formData.primaryColor || "#0b2f6f" }}
            >
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileStep({
  data,
  onChange,
  errors,
  userId,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors: Record<string, string>;
  userId: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Owner Profile</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your personal details as the shop owner.</p>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500"><span className="text-red-500">*</span> Required</p>
      <label className="block">
        <span className={labelTextClass}>Full name <span className="text-red-500">*</span></span>
        <input
          id="fullName"
          required
          value={data.fullName}
          onChange={(e) => onChange("fullName", e.target.value)}
          className={`${inputClass} ${errors.fullName ? "border-red-400 focus:border-red-600 dark:border-red-500 dark:focus:border-red-400" : ""}`}
          placeholder="e.g. John Doe"
        />
        {errors.fullName && (
          <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.fullName}</p>
        )}
      </label>
      <label className="block">
        <span className={labelTextClass}>Username (optional)</span>
        <input
          value={data.username}
          onChange={(e) => onChange("username", e.target.value)}
          className={inputClass}
          placeholder="e.g. johndoe123"
          autoCapitalize="none"
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Must be unique across SaleDock.</p>
      </label>
      <label className="block">
        <span className={labelTextClass}>Phone (optional)</span>
        <input
          type="tel"
          value={data.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          className={inputClass}
          placeholder="e.g. +92 300 1234567"
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Include country code, e.g. +923001234567.</p>
      </label>
      <label className="block">
        <span className={labelTextClass}>Email</span>
        <input
          type="email"
          value={data.orgEmail}
          onChange={(e) => onChange("orgEmail", e.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-slate-50 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed"
          readOnly
          tabIndex={-1}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Your sign-in email. Update in account settings later.</p>
      </label>
      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/10">
        <ImageUpload
          bucket="profile-pictures"
          folderPath={`users/${userId}/profile-picture`}
          currentUrl={data.profilePictureUrl || null}
          onUploadComplete={(url) => onChange("profilePictureUrl", url)}
          onRemove={() => onChange("profilePictureUrl", "")}
          label="Profile picture (optional)"
          aspectRatio="square"
        />
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">Or use a URL</summary>
          <input
            value={data.profilePictureUrl}
            onChange={(e) => onChange("profilePictureUrl", e.target.value)}
            className={`${inputClass} mt-2`}
            placeholder="e.g. https://example.com/assets/photo.jpg"
          />
        </details>
      </div>
    </div>
  );
}

function ShopStep({
  data,
  onChange,
  errors,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors: Record<string, string>;
}) {
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setGettingLocation(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange("latitude", pos.coords.latitude.toString());
        onChange("longitude", pos.coords.longitude.toString());
        setGettingLocation(false);
      },
      (err) => {
        setLocationError(err.message);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Shop Profile</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your business information used on invoices, receipts, and public profile.</p>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500"><span className="text-red-500">*</span> Required</p>
      <label className="block">
        <span className={labelTextClass}>Shop name <span className="text-red-500">*</span></span>
        <input
          id="organizationName"
          required
          value={data.organizationName}
          onChange={(e) => onChange("organizationName", e.target.value)}
          className={`${inputClass} ${errors.organizationName ? "border-red-400 focus:border-red-600 dark:border-red-500 dark:focus:border-red-400" : ""}`}
          placeholder="e.g. Apex Electronics"
        />
        {errors.organizationName && (
          <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.organizationName}</p>
        )}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Multiple shops can have the same name.</p>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelTextClass}>Owner name</span>
          <input
            value={data.ownerName}
            onChange={(e) => onChange("ownerName", e.target.value)}
            className={inputClass}
            placeholder="e.g. Apex Owner"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>Phone <span className="text-red-500">*</span></span>
          <input
            id="orgPhone"
            type="tel"
            required
            value={data.orgPhone}
            onChange={(e) => onChange("orgPhone", e.target.value)}
            className={`${inputClass} ${errors.orgPhone ? "border-red-400 focus:border-red-600 dark:border-red-500 dark:focus:border-red-400" : ""}`}
            placeholder="e.g. +92 300 1234567"
          />
          {errors.orgPhone && (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.orgPhone}</p>
          )}
        </label>
        <label className="block">
          <span className={labelTextClass}>WhatsApp</span>
          <input
            type="tel"
            value={data.orgWhatsapp}
            onChange={(e) => onChange("orgWhatsapp", e.target.value)}
            className={inputClass}
            placeholder="e.g. +92 300 7654321"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>Email <span className="text-red-500">*</span></span>
          <input
            id="orgEmail"
            type="email"
            required
            value={data.orgEmail}
            onChange={(e) => onChange("orgEmail", e.target.value)}
            className={`${inputClass} ${errors.orgEmail ? "border-red-400 focus:border-red-600 dark:border-red-500 dark:focus:border-red-400" : ""}`}
            placeholder="e.g. contact@apex.com"
          />
          {errors.orgEmail && (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.orgEmail}</p>
          )}
        </label>
      </div>
      <label className="block">
        <span className={labelTextClass}>Address</span>
        <textarea
          value={data.orgAddress}
          onChange={(e) => onChange("orgAddress", e.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="e.g. 123 Commercial Area, Phase 5, DHA"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelTextClass}>Currency</span>
          <select
            value={data.currencyCode}
            onChange={(e) => onChange("currencyCode", e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-[#fff] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelTextClass}>Timezone</span>
          <select
            value={data.timezone}
            onChange={(e) => onChange("timezone", e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-[#fff] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/10">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Google Maps Location</h3>
        <label className="block">
          <span className={labelTextClass}>Google Maps link (optional)</span>
          <input
            value={data.googleMapsUrl}
            onChange={(e) => onChange("googleMapsUrl", e.target.value)}
            className={inputClass}
            placeholder="e.g. https://maps.app.goo.gl/xyz123"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelTextClass}>Latitude</span>
            <input
              type="number"
              step="any"
              value={data.latitude}
              onChange={(e) => onChange("latitude", e.target.value)}
              className={inputClass}
              placeholder="e.g. 33.6844"
            />
          </label>
          <label className="block">
            <span className={labelTextClass}>Longitude</span>
            <input
              type="number"
              step="any"
              value={data.longitude}
              onChange={(e) => onChange("longitude", e.target.value)}
              className={inputClass}
              placeholder="e.g. 73.0479"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleGetLocation}
          disabled={gettingLocation}
          className="h-10 rounded-xl border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
        >
          {gettingLocation ? "Getting location..." : "Use my current location"}
        </button>
        {locationError && (
          <p className="text-xs text-red-500">{locationError}</p>
        )}
        {data.latitude && data.longitude && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Location set: {data.latitude}, {data.longitude}
          </p>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.showMap === "true"}
            onChange={(e) => onChange("showMap", e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800"
          />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Show map on receipts and profile</span>
        </label>
      </div>
    </div>
  );
}

function BranchStep({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const useShopDetails = data.branchUseShopDetails === "true";

  function handleUseShopDetails(use: boolean) {
    onChange("branchUseShopDetails", use ? "true" : "false");
    if (use) {
      onChange("branchName", "Main Branch");
      onChange("branchPhone", data.orgPhone || "");
      onChange("branchAddress", data.orgAddress || "");
      onChange("branchGoogleMapsUrl", data.googleMapsUrl || "");
      onChange("branchLatitude", data.latitude || "");
      onChange("branchLongitude", data.longitude || "");
    }
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setGettingLocation(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange("branchLatitude", pos.coords.latitude.toString());
        onChange("branchLongitude", pos.coords.longitude.toString());
        setGettingLocation(false);
      },
      (err) => {
        setLocationError(err.message);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Branch Setup</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set up your first branch. You can add more later in settings.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 bg-[#fff] p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <input
          type="checkbox"
          checked={useShopDetails}
          onChange={(e) => handleUseShopDetails(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800"
        />
        <div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Use same details as shop profile</span>
          <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Branch name, phone, address, and location will be copied from your shop.</p>
        </div>
      </label>

      {useShopDetails ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          Branch will use shop details:
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>Name: Main Branch</li>
            <li>Phone: {data.orgPhone || "—"}</li>
            <li>Address: {data.orgAddress || "—"}</li>
            <li>Google Maps: {data.googleMapsUrl ? "Set" : "—"}</li>
            <li>Location: {data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : "—"}</li>
          </ul>
        </div>
      ) : (
        <>
          <label className="block">
            <span className={labelTextClass}>Branch name</span>
            <input
              value={data.branchName}
              onChange={(e) => onChange("branchName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Downtown Branch"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelTextClass}>Branch phone (optional)</span>
              <input
                type="tel"
                value={data.branchPhone}
                onChange={(e) => onChange("branchPhone", e.target.value)}
                className={inputClass}
                placeholder="e.g. +92 300 1234567"
              />
            </label>
            <label className="block">
              <span className={labelTextClass}>Branch address</span>
              <input
                value={data.branchAddress}
                onChange={(e) => onChange("branchAddress", e.target.value)}
                className={inputClass}
                placeholder="e.g. 456 Mall Road"
              />
            </label>
          </div>
          <label className="block">
            <span className={labelTextClass}>Google Maps link (optional)</span>
            <input
              value={data.branchGoogleMapsUrl}
              onChange={(e) => onChange("branchGoogleMapsUrl", e.target.value)}
              className={inputClass}
              placeholder="e.g. https://maps.app.goo.gl/abc789"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelTextClass}>Latitude</span>
              <input
                type="number"
                step="any"
                value={data.branchLatitude}
                onChange={(e) => onChange("branchLatitude", e.target.value)}
                className={inputClass}
                placeholder="e.g. 33.6844"
              />
            </label>
            <label className="block">
              <span className={labelTextClass}>Longitude</span>
              <input
                type="number"
                step="any"
                value={data.branchLongitude}
                onChange={(e) => onChange("branchLongitude", e.target.value)}
                className={inputClass}
                placeholder="e.g. 73.0479"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={gettingLocation}
            className="h-10 rounded-xl border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
          >
            {gettingLocation ? "Getting location..." : "Use my current location"}
          </button>
          {locationError && (
            <p className="text-xs text-red-500">{locationError}</p>
          )}
          {data.branchLatitude && data.branchLongitude && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Location set: {data.branchLatitude}, {data.branchLongitude}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BrandingStep({
  data,
  onChange,
  userId,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  userId: string;
}) {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(() => {
    try {
      return JSON.parse(data.socialLinks || "[]");
    } catch {
      return [];
    }
  });

  function syncSocialLinks(links: SocialLink[]) {
    setSocialLinks(links);
    onChange("socialLinks", JSON.stringify(links));
  }

  function addSocialLink() {
    syncSocialLinks([...socialLinks, { platform: "Instagram", url: "" }]);
  }

  function removeSocialLink(index: number) {
    const next = socialLinks.filter((_, i) => i !== index);
    syncSocialLinks(next);
  }

  function updateSocialLink(index: number, field: keyof SocialLink, value: string) {
    const next = socialLinks.map((link, i) =>
      i === index ? { ...link, [field]: value } : link,
    );
    syncSocialLinks(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Branding</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Customize your shop appearance, colors, and social links.</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/10">
        <ImageUpload
          bucket="public-branding"
          folderPath={`temp/${userId}/logo`}
          currentUrl={data.logoUrl || null}
          onUploadComplete={(url) => onChange("logoUrl", url)}
          onRemove={() => onChange("logoUrl", "")}
          label="Shop logo (optional)"
          aspectRatio="landscape"
          uploadingText="Uploading logo..."
        />
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">Or use a URL</summary>
          <input
            value={data.logoUrl}
            onChange={(e) => onChange("logoUrl", e.target.value)}
            className={`${inputClass} mt-2`}
            placeholder="e.g. https://example.com/assets/logo.png"
          />
        </details>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={labelTextClass}>Primary color</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={data.primaryColor}
              onChange={(e) => onChange("primaryColor", e.target.value)}
              className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              value={data.primaryColor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^#[0-9a-fA-F0-9]{0,6}$/.test(val)) onChange("primaryColor", val);
              }}
              className={inputClass}
              placeholder="e.g. #0b2f6f"
              maxLength={7}
            />
          </div>
        </label>
        <label className="block">
          <span className={labelTextClass}>Accent color</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={data.accentColor}
              onChange={(e) => onChange("accentColor", e.target.value)}
              className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              value={data.accentColor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^#[0-9a-fA-F0-9]{0,6}$/.test(val)) onChange("accentColor", val);
              }}
              className={inputClass}
              placeholder="e.g. #00b8b0"
              maxLength={7}
            />
          </div>
        </label>
        <label className="block">
          <span className={labelTextClass}>Default theme</span>
          <select
            value={data.defaultTheme}
            onChange={(e) => onChange("defaultTheme", e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-[#fff] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-2 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Social Links</h3>
          <button
            type="button"
            onClick={addSocialLink}
            className="h-8 rounded-lg border border-slate-200 bg-[#fff] px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
          >
            + Add link
          </button>
        </div>
        {socialLinks.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">No social links added yet.</p>
        )}
        {socialLinks.map((link, i) => (
          <div key={i} className="flex items-start gap-2">
            <select
              value={link.platform}
              onChange={(e) => updateSocialLink(i, "platform", e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-[#fff] px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              value={link.url}
              onChange={(e) => updateSocialLink(i, "url", e.target.value)}
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="e.g. https://instagram.com/apexshop"
            />
            <button
              type="button"
              onClick={() => removeSocialLink(i)}
              className="h-10 w-10 rounded-lg border border-red-200 text-xs font-bold text-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20 cursor-pointer"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Live Preview</h3>
        <div
          className="rounded-lg p-4 space-y-2 shadow-inner"
          style={{
            backgroundColor: data.primaryColor || "#0b2f6f",
            color: "#ffffff",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider">Shop Preview</p>
          <p className="text-sm">{data.organizationName || "Your shop name here"}</p>
          <div className="flex gap-2">
            <span
              className="rounded px-3 py-1 text-xs font-bold shadow-sm"
              style={{ backgroundColor: data.accentColor || "#00b8b0", color: "#ffffff" }}
            >
              Button
            </span>
            <span
              className="rounded px-3 py-1 text-xs font-bold shadow-sm"
              style={{ backgroundColor: data.accentColor || "#00b8b0", color: "#ffffff" }}
            >
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmStep({
  data,
}: {
  data: Record<string, string>;
}) {
  const socialLinks: SocialLink[] = (() => {
    try {
      return JSON.parse(data.socialLinks || "[]");
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Ready to create your shop</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review your details before finishing setup.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm dark:border-slate-700 dark:bg-slate-800/30">
        <Section summary="Owner Profile">
          <Row label="Name" value={data.fullName} />
          <Row label="Username" value={data.username || "—"} />
          <Row label="Phone" value={data.phone || "—"} />
          <Row label="Email" value={data.orgEmail || "—"} />
          <Row label="Profile picture" value={data.profilePictureUrl ? "Set" : "Default"} />
        </Section>
        <Section summary="Shop Profile">
          <Row label="Shop name" value={data.organizationName} />
          <Row label="Owner" value={data.ownerName || data.fullName} />
          <Row label="Phone" value={data.orgPhone || "—"} />
          <Row label="WhatsApp" value={data.orgWhatsapp || "—"} />
          <Row label="Email" value={data.orgEmail || "—"} />
          <Row label="Address" value={data.orgAddress || "—"} />
          <Row label="Currency" value={data.currencyCode} />
          <Row label="Timezone" value={data.timezone} />
          <Row label="Google Maps" value={data.googleMapsUrl ? "Set" : "—"} />
          <Row label="Location" value={data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : "—"} />
          <Row label="Show map" value={data.showMap === "true" ? "Yes" : "No"} />
        </Section>
        <Section summary="Branch">
          <Row label="Name" value={data.branchUseShopDetails === "true" ? "Main Branch — same as shop profile" : data.branchName || "Main Branch"} />
          <Row label="Phone" value={data.branchUseShopDetails === "true" ? (data.orgPhone || "—") : (data.branchPhone || "—")} />
          <Row label="Address" value={data.branchUseShopDetails === "true" ? (data.orgAddress || "—") : (data.branchAddress || "—")} />
          <Row label="Google Maps" value={data.branchUseShopDetails === "true" ? (data.googleMapsUrl ? "Set" : "—") : (data.branchGoogleMapsUrl ? "Set" : "—")} />
        </Section>
        <Section summary="Branding">
          <Row label="Logo" value={data.logoUrl ? "Set" : "Default"} />
          <Row label="Primary" value={data.primaryColor} />
          <Row label="Accent" value={data.accentColor} />
          <Row label="Theme" value={data.defaultTheme} />
        </Section>
        {socialLinks.length > 0 && (
          <Section summary={`Social Links (${socialLinks.length})`}>
            {socialLinks.map((link, i) => (
              <Row key={i} label={link.platform} value={link.url || "—"} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-[#fff] p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        {summary}
      </summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between text-sm">
      <span className="font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-slate-900 dark:text-slate-100">{value}</span>
    </p>
  );
}
