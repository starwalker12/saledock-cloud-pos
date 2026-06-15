"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction, type OnboardingState } from "./actions";
import { ImageUpload } from "@/components/shared/image-upload";
import { PhoneNumberInput } from "@/components/forms/phone-number-input";
import { isValidPhoneNumber } from "@/lib/phone-validation";

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

  function validateStep(stepName: StepName): Record<string, string> {
    const errs: Record<string, string> = {};
    switch (stepName) {
      case "profile":
        if (!formData.fullName || formData.fullName.trim().length < 2) {
          errs.fullName = "Please enter your full name.";
        }
        if (formData.phone && !isValidPhoneNumber(formData.phone)) {
          errs.phone = "Please enter a valid phone number (e.g. +92 300 1234567).";
        }
        break;
      case "shop":
        if (!formData.organizationName || formData.organizationName.trim().length < 2) {
          errs.organizationName = "Please enter your shop name.";
        }
        if (!formData.orgPhone || formData.orgPhone.trim().length < 1) {
          errs.orgPhone = "Please enter your shop phone number.";
        } else if (!isValidPhoneNumber(formData.orgPhone)) {
          errs.orgPhone = "Please enter a valid phone number (e.g. +92 300 1234567).";
        }
        if (formData.orgWhatsapp && !isValidPhoneNumber(formData.orgWhatsapp)) {
          errs.orgWhatsapp = "Please enter a valid WhatsApp number (e.g. +92 300 7654321).";
        }
        if (!formData.orgEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.orgEmail.trim())) {
          errs.orgEmail = "Please enter a valid shop email address.";
        }
        break;
      case "branch":
        if (formData.branchUseShopDetails !== "true") {
          if (!formData.branchName || formData.branchName.trim().length < 2) {
            errs.branchName = "Please enter your branch name.";
          }
          if (formData.branchPhone && !isValidPhoneNumber(formData.branchPhone)) {
            errs.branchPhone = "Please enter a valid phone number (e.g. +92 300 1234567).";
          }
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
        return <BranchStep data={formData} onChange={updateField} errors={errors} />;
      case "branding":
        return <BrandingStep data={formData} onChange={updateField} userId={userId} />;
      case "confirm":
        return <ConfirmStep data={formData} />;
    }
  })();

  return (
    <div className="space-y-6">
      {/* Premium Step Indicator */}
      <div className="relative flex justify-between items-center w-full mb-8 px-1">
        {/* Background connecting line */}
        <div className="absolute left-0 right-0 top-[18px] h-[3px] bg-slate-100 dark:bg-slate-800/80 -z-10 rounded-full" />
        {/* Active portion of the connecting line */}
        <div
          className="absolute left-0 top-[18px] h-[3px] transition-all duration-500 -z-10 rounded-full"
          style={{
            width: `${(stepIndex / (STEP_ORDER.length - 1)) * 100}%`,
            backgroundColor: formData.accentColor || "#00b8b0",
          }}
        />

        {STEP_ORDER.map((s, i) => {
          const isCompleted = i < stepIndex;
          const isActive = s === step;

          return (
            <button
              key={s}
              type="button"
              onClick={() => i < stepIndex && setStep(s)}
              disabled={i > stepIndex}
              className={`flex flex-col items-center group relative outline-none focus:outline-none ${i < stepIndex ? "cursor-pointer" : "cursor-default"}`}
            >
              {/* Step Bubble */}
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 font-bold text-xs transition-all duration-300 ${
                  isActive
                    ? "bg-[#fff] text-slate-900 border-[var(--step-active-color)] dark:bg-slate-900 dark:text-white"
                    : isCompleted
                      ? "text-[#fff] border-transparent"
                      : "bg-[#fff] border-slate-200 text-slate-400 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-600"
                }`}
                style={{
                  borderColor: isActive ? formData.accentColor || "#00b8b0" : undefined,
                  backgroundColor: isCompleted ? formData.accentColor || "#00b8b0" : undefined,
                }}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4 fill-none stroke-current stroke-[3px]" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>

              {/* Step Label (Hidden on small mobile screens to prevent crowding) */}
              <span
                className={`absolute top-11 text-[10px] font-black tracking-wider uppercase transition-all duration-200 whitespace-nowrap hidden sm:block ${
                  isActive
                    ? "text-slate-900 dark:text-white"
                    : isCompleted
                      ? "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      : "text-slate-400 dark:text-slate-600"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile Step Description */}
      <div className="block sm:hidden text-center bg-slate-50 dark:bg-slate-900/40 py-2 rounded-xl border border-slate-100 dark:border-slate-800/60">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Step {stepIndex + 1} of {STEP_ORDER.length}: {STEP_LABELS[step]}
        </span>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/60 shadow-sm">
          {state.error}
        </p>
      )}

      <div className="min-h-[250px] transition-all duration-300 ease-in-out">
        {isLastStep ? (
          <form action={handleSubmit} className="space-y-6">
            {currentStep}
            <div className="mt-8 flex justify-between gap-3 border-t border-slate-100 pt-6 dark:border-slate-800/60">
              <button
                type="button"
                onClick={prevStep}
                className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-6 text-sm font-bold text-slate-600 hover:bg-slate-50 transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-xl px-7 text-sm font-bold text-white shadow-md hover:shadow-lg hover:opacity-95 disabled:opacity-50 active:scale-[0.98] transition cursor-pointer"
                style={{ backgroundColor: formData.primaryColor || "#0b2f6f" }}
              >
                {pending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating shop...
                  </span>
                ) : (
                  "Create my shop"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {currentStep}
            <div className="mt-8 flex justify-between gap-3 border-t border-slate-100 pt-6 dark:border-slate-800/60">
              <div className="flex gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-6 text-sm font-bold text-slate-600 hover:bg-slate-50 transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={restartSetup}
                  className="h-11 rounded-xl border border-slate-200 bg-[#fff] px-5 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition active:scale-[0.98] dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 cursor-pointer"
                >
                  Restart
                </button>
              </div>
              <button
                type="button"
                onClick={nextStep}
                className="h-11 rounded-xl px-7 text-sm font-bold text-white shadow-md hover:shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                style={{ backgroundColor: formData.primaryColor || "#0b2f6f" }}
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Owner Profile</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Provide your personal details as the shop owner.</p>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Personal Information</span>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">* Required fields</span>
        </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className={labelTextClass}>Username (optional)</span>
            <input
              value={data.username}
              onChange={(e) => onChange("username", e.target.value)}
              className={inputClass}
              placeholder="e.g. johndoe123"
              autoCapitalize="none"
            />
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Must be unique across SaleDock.</p>
          </label>
          <PhoneNumberInput
            label="Phone (optional)"
            id="phone"
            value={data.phone}
            onChange={(value) => onChange("phone", value)}
            error={errors.phone}
            helperText="Pakistan +92 is selected by default. Search by country or code."
          />
        </div>

        <label className="block">
          <span className={labelTextClass}>Email</span>
          <input
            type="email"
            value={data.orgEmail}
            onChange={(e) => onChange("orgEmail", e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-slate-50 text-slate-400 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed"
            readOnly
            tabIndex={-1}
          />
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Your sign-in email. Update in account settings later.</p>
        </label>
      </div>

      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20">
        <ImageUpload
          bucket="profile-pictures"
          folderPath={`users/${userId}/profile-picture`}
          currentUrl={data.profilePictureUrl || null}
          onUploadComplete={(url) => onChange("profilePictureUrl", url)}
          onRemove={() => onChange("profilePictureUrl", "")}
          label="Profile picture (optional)"
          aspectRatio="square"
        />
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 select-none">Or use a direct image URL</summary>
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Shop Profile</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Enter your business information used on invoices, receipts, and public profile.</p>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Business Details</span>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-855 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">* Required fields</span>
        </div>

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
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Multiple shops can have the same name.</p>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className={labelTextClass}>Owner name</span>
            <input
              value={data.ownerName}
              onChange={(e) => onChange("ownerName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Apex Owner"
            />
          </label>
          <PhoneNumberInput
            label="Phone"
            id="orgPhone"
            value={data.orgPhone}
            onChange={(value) => onChange("orgPhone", value)}
            required
            error={errors.orgPhone}
            helperText="This number appears on invoices and receipts."
          />
          <PhoneNumberInput
            label="WhatsApp"
            id="orgWhatsapp"
            value={data.orgWhatsapp}
            onChange={(value) => onChange("orgWhatsapp", value)}
            error={errors.orgWhatsapp}
            helperText="Optional support number for customers."
          />
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
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Localization Preferences</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Google Maps Location</span>
        <label className="block">
          <span className={labelTextClass}>Google Maps link (optional)</span>
          <input
            value={data.googleMapsUrl}
            onChange={(e) => onChange("googleMapsUrl", e.target.value)}
            className={inputClass}
            placeholder="e.g. https://maps.app.goo.gl/xyz123"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={gettingLocation}
            className="h-10 rounded-xl border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-60 transition cursor-pointer"
          >
            {gettingLocation ? "Getting location..." : "Use my current location"}
          </button>
          {locationError && (
            <p className="text-xs text-red-500">{locationError}</p>
          )}
          {data.latitude && data.longitude && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ Location set: {Number(data.latitude).toFixed(4)}, {Number(data.longitude).toFixed(4)}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.showMap === "true"}
            onChange={(e) => onChange("showMap", e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-teal-600 focus:ring-teal-500"
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
  errors,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors?: Record<string, string>;
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Branch Setup</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Set up your first branch. You can add more branches in settings later.
        </p>
      </div>

      <label className="flex items-start gap-3.5 cursor-pointer rounded-2xl border border-slate-200 bg-[#fff] p-4 shadow-sm hover:border-slate-300 transition dark:border-slate-800 dark:bg-slate-950/20 select-none">
        <input
          type="checkbox"
          checked={useShopDetails}
          onChange={(e) => handleUseShopDetails(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-teal-600 focus:ring-teal-500"
        />
        <div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Use same details as shop profile</span>
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">Branch name, phone, address, and location coordinates will be copied from your shop profile.</p>
        </div>
      </label>

      {useShopDetails ? (
        <div className="p-5 rounded-2xl border border-slate-250 bg-slate-50 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Configured Branch Details</span>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <li className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800"><span className="font-semibold text-slate-400">Name:</span> <span className="font-bold text-slate-700 dark:text-slate-300">Main Branch</span></li>
            <li className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800"><span className="font-semibold text-slate-400">Phone:</span> <span className="font-bold text-slate-700 dark:text-slate-300">{data.orgPhone || "—"}</span></li>
            <li className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800"><span className="font-semibold text-slate-400">Address:</span> <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{data.orgAddress || "—"}</span></li>
            <li className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800"><span className="font-semibold text-slate-400">Google Maps:</span> <span className="font-bold text-slate-700 dark:text-slate-300">{data.googleMapsUrl ? "Linked" : "—"}</span></li>
            <li className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800 sm:col-span-2"><span className="font-semibold text-slate-400">Coordinates:</span> <span className="font-bold text-slate-700 dark:text-slate-300">{data.latitude && data.longitude ? `${Number(data.latitude).toFixed(4)}, ${Number(data.longitude).toFixed(4)}` : "—"}</span></li>
          </ul>
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Custom Branch Information</span>

          <label className="block">
            <span className={labelTextClass}>Branch name</span>
            <input
              value={data.branchName}
              onChange={(e) => onChange("branchName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Downtown Branch"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PhoneNumberInput
              label="Branch phone (optional)"
              id="branchPhone"
              value={data.branchPhone}
              onChange={(value) => onChange("branchPhone", value)}
              error={errors?.branchPhone}
              helperText="Use a branch-specific number if different from the shop."
            />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gettingLocation}
              className="h-10 rounded-xl border border-slate-200 bg-[#fff] px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-60 transition cursor-pointer"
            >
              {gettingLocation ? "Getting location..." : "Use my current location"}
            </button>
            {locationError && (
              <p className="text-xs text-red-500">{locationError}</p>
            )}
            {data.branchLatitude && data.branchLongitude && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ Location set: {Number(data.branchLatitude).toFixed(4)}, {Number(data.branchLongitude).toFixed(4)}
              </p>
            )}
          </div>
        </div>
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Branding</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Customize your shop appearance, theme, colors, and social profile links.</p>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-3">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Shop Identity</span>
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
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 select-none">Or use a direct logo image URL</summary>
          <input
            value={data.logoUrl}
            onChange={(e) => onChange("logoUrl", e.target.value)}
            className={`${inputClass} mt-2`}
            placeholder="e.g. https://example.com/assets/logo.png"
          />
        </details>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-4">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Theme & Colors</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className={labelTextClass}>Primary color</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={data.primaryColor}
                onChange={(e) => onChange("primaryColor", e.target.value)}
                className="h-11 w-14 shrink-0 rounded-lg border border-slate-200 p-1 cursor-pointer dark:border-slate-700 dark:bg-slate-800"
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
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={data.accentColor}
                onChange={(e) => onChange("accentColor", e.target.value)}
                className="h-11 w-14 shrink-0 rounded-lg border border-slate-200 p-1 cursor-pointer dark:border-slate-700 dark:bg-slate-800"
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
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none bg-[#fff] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="system">System Default</option>
              <option value="light">Light Theme</option>
              <option value="dark">Dark Theme</option>
            </select>
          </label>
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Social Links</span>
          <button
            type="button"
            onClick={addSocialLink}
            className="h-8 rounded-lg border border-slate-200 bg-[#fff] px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            + Add Link
          </button>
        </div>
        {socialLinks.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-1">No social links added yet. Add links to show on your invoices/receipts.</p>
        )}
        <div className="space-y-2">
          {socialLinks.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 text-xs font-bold text-red-500 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/20 transition cursor-pointer"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20 space-y-3">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Live Preview</span>
        <div
          className="rounded-xl p-5 space-y-3 shadow-md border border-black/10 transition-all duration-300"
          style={{
            backgroundColor: data.primaryColor || "#0b2f6f",
            color: "#ffffff",
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Branding Preview</p>
          <p className="text-base font-bold truncate">{data.organizationName || "Your Shop Name"}</p>
          <div className="flex gap-2.5 pt-1">
            <span
              className="rounded-lg px-4.5 py-1.5 text-xs font-bold shadow-sm transition-opacity"
              style={{ backgroundColor: data.accentColor || "#00b8b0", color: "#ffffff" }}
            >
              Primary Button
            </span>
            <span
              className="rounded-lg px-4.5 py-1.5 text-xs font-bold shadow-sm border border-white/20 transition-opacity"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }}
            >
              Secondary
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ready to create your shop</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Review your setup details before finalizing organization creation.</p>
      </div>

      <div className="space-y-4">
        <Section summary="Owner Profile">
          <Row label="Name" value={data.fullName} />
          <Row label="Username" value={data.username || "—"} />
          <Row label="Phone" value={data.phone || "—"} />
          <Row label="Email" value={data.orgEmail || "—"} />
          <Row label="Profile picture" value={data.profilePictureUrl ? "Uploaded Custom" : "Default Avatar"} />
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
          {data.googleMapsUrl && <Row label="Google Maps" value="Linked" />}
          {data.latitude && data.longitude && <Row label="Location coordinates" value={`${Number(data.latitude).toFixed(4)}, ${Number(data.longitude).toFixed(4)}`} />}
          <Row label="Show map on receipts" value={data.showMap === "true" ? "Yes" : "No"} />
        </Section>

        <Section summary="First Branch Setup">
          <Row label="Name" value={data.branchUseShopDetails === "true" ? "Main Branch (same as shop)" : data.branchName || "Main Branch"} />
          <Row label="Phone" value={data.branchUseShopDetails === "true" ? (data.orgPhone || "—") : (data.branchPhone || "—")} />
          <Row label="Address" value={data.branchUseShopDetails === "true" ? (data.orgAddress || "—") : (data.branchAddress || "—")} />
          {(data.branchGoogleMapsUrl || (data.branchUseShopDetails === "true" && data.googleMapsUrl)) && (
            <Row label="Google Maps" value="Linked" />
          )}
        </Section>

        <Section summary="Custom Branding">
          <Row label="Shop logo" value={data.logoUrl ? "Uploaded Custom Logo" : "Default SaleDock Logo"} />
          <Row label="Primary brand color" value={data.primaryColor} />
          <Row label="Accent brand color" value={data.accentColor} />
          <Row label="Default interface theme" value={data.defaultTheme} />
        </Section>

        {socialLinks.length > 0 && (
          <Section summary={`Social Media Links (${socialLinks.length})`}>
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
    <details className="group rounded-2xl border border-slate-200 bg-[#fff] p-4 dark:border-slate-800 dark:bg-slate-950/10 transition-all select-none open:pb-5">
      <summary className="flex items-center justify-between cursor-pointer list-none outline-none focus:outline-none">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {summary}
        </span>
        <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200 text-xs font-semibold">
          ▼
        </span>
      </summary>
      <div className="mt-3.5 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-900/60">
        {children}
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between text-sm py-0.5">
      <span className="font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-bold text-slate-800 dark:text-slate-200 text-right truncate max-w-[200px] sm:max-w-xs">{value}</span>
    </p>
  );
}
