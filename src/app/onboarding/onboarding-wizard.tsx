"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction, type OnboardingState } from "./actions";

const initialState: OnboardingState = { error: null };

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600";
const labelTextClass = "text-xs font-bold uppercase tracking-wide text-slate-500";

const TIMEZONES = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Riyadh", "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "UTC",
] as const;

const CURRENCIES = [
  { code: "PKR", label: "PKR (₨)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "AED", label: "AED (د.إ)" },
  { code: "INR", label: "INR (₹)" },
  { code: "SAR", label: "SAR (﷼)" },
  { code: "BDT", label: "BDT (৳)" },
] as const;

type StepName = "profile" | "shop" | "branch" | "branding" | "confirm";

const STEP_LABELS: Record<StepName, string> = {
  profile: "Owner Profile",
  shop: "Shop Profile",
  branch: "Branch Setup",
  branding: "Branding",
  confirm: "Finish",
};

const STEP_ORDER: StepName[] = ["profile", "shop", "branch", "branding", "confirm"];

export function OnboardingWizard({
  defaultFullName,
  userEmail,
}: {
  defaultFullName: string;
  userEmail: string;
}) {
  const [step, setStep] = useState<StepName>("profile");
  const [state, formAction, pending] = useActionState(completeOnboardingAction, initialState);

  const [formData, setFormData] = useState<Record<string, string>>({
    fullName: defaultFullName,
    phone: "",
    avatarUrl: "",
    organizationName: "",
    ownerName: "",
    orgPhone: "",
    orgWhatsapp: "",
    orgEmail: userEmail,
    orgAddress: "",
    currencyCode: "PKR",
    timezone: "Asia/Karachi",
    branchName: "Main Branch",
    branchPhone: "",
    branchAddress: "",
    logoUrl: "",
    primaryColor: "#3B82F6",
    accentColor: "#10B981",
    defaultTheme: "system",
  });

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLastStep = step === "confirm";
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  function updateField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function nextStep() {
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

  const currentStep = (function () {
    switch (step) {
      case "profile":
        return (
          <ProfileStep
            data={formData}
            onChange={updateField}
          />
        );
      case "shop":
        return (
          <ShopStep
            data={formData}
            onChange={updateField}
          />
        );
      case "branch":
        return (
          <BranchStep
            data={formData}
            onChange={updateField}
          />
        );
      case "branding":
        return (
          <BrandingStep
            data={formData}
            onChange={updateField}
          />
        );
      case "confirm":
        return (
          <ConfirmStep data={formData} />
        );
    }
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-700 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">
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
                ? "bg-blue-700 text-white"
                : i < stepIndex
                  ? "bg-emerald-100 text-emerald-800 cursor-pointer"
                  : "bg-slate-100 text-slate-400 cursor-default"
            }`}
          >
            {i < stepIndex ? "✓ " : ""}{STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
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
              className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {pending ? "Creating shop..." : "Create my shop"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {currentStep}
          <div className="mt-6 flex justify-between">
            <div>
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={nextStep}
              className="h-11 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white hover:bg-blue-800"
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
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Owner Profile</h2>
        <p className="mt-1 text-sm text-slate-500">Your personal details as the shop owner.</p>
      </div>
      <label className="block">
        <span className={labelTextClass}>Full name *</span>
        <input
          required
          value={data.fullName}
          onChange={(e) => onChange("fullName", e.target.value)}
          className={inputClass}
          placeholder="Your full name"
        />
      </label>
      <label className="block">
        <span className={labelTextClass}>Phone (optional)</span>
        <input
          value={data.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          className={inputClass}
          placeholder="+92 300 1234567"
        />
      </label>
      <label className="block">
        <span className={labelTextClass}>Avatar URL (optional)</span>
        <input
          value={data.avatarUrl}
          onChange={(e) => onChange("avatarUrl", e.target.value)}
          className={inputClass}
          placeholder="https://example.com/avatar.jpg"
        />
        <p className="mt-1 text-xs text-slate-400">URL or path to your profile picture. File upload coming soon.</p>
      </label>
    </div>
  );
}

function ShopStep({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Shop Profile</h2>
        <p className="mt-1 text-sm text-slate-500">Your business information used on invoices and reports.</p>
      </div>
      <label className="block">
        <span className={labelTextClass}>Shop name *</span>
        <input
          required
          value={data.organizationName}
          onChange={(e) => onChange("organizationName", e.target.value)}
          className={inputClass}
          placeholder="Gadget Zone"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelTextClass}>Owner name</span>
          <input
            value={data.ownerName}
            onChange={(e) => onChange("ownerName", e.target.value)}
            className={inputClass}
            placeholder="Owner display name"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>Phone</span>
          <input
            value={data.orgPhone}
            onChange={(e) => onChange("orgPhone", e.target.value)}
            className={inputClass}
            placeholder="+92 300 1234567"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>WhatsApp</span>
          <input
            value={data.orgWhatsapp}
            onChange={(e) => onChange("orgWhatsapp", e.target.value)}
            className={inputClass}
            placeholder="+92 300 1234567"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>Email</span>
          <input
            type="email"
            value={data.orgEmail}
            onChange={(e) => onChange("orgEmail", e.target.value)}
            className={inputClass}
            placeholder="shop@example.com"
          />
        </label>
      </div>
      <label className="block">
        <span className={labelTextClass}>Address</span>
        <textarea
          value={data.orgAddress}
          onChange={(e) => onChange("orgAddress", e.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-600"
          placeholder="Shop address"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelTextClass}>Currency</span>
          <select
            value={data.currencyCode}
            onChange={(e) => onChange("currencyCode", e.target.value)}
            className={inputClass}
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
            className={inputClass}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Branch Setup</h2>
        <p className="mt-1 text-sm text-slate-500">Set up your first branch. You can add more later.</p>
      </div>
      <label className="block">
        <span className={labelTextClass}>Branch name</span>
        <input
          value={data.branchName}
          onChange={(e) => onChange("branchName", e.target.value)}
          className={inputClass}
          placeholder="Main Branch"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelTextClass}>Branch phone</span>
          <input
            value={data.branchPhone}
            onChange={(e) => onChange("branchPhone", e.target.value)}
            className={inputClass}
            placeholder="+92 300 1234567"
          />
        </label>
        <label className="block">
          <span className={labelTextClass}>Branch address</span>
          <input
            value={data.branchAddress}
            onChange={(e) => onChange("branchAddress", e.target.value)}
            className={inputClass}
            placeholder="Branch address"
          />
        </label>
      </div>
    </div>
  );
}

function BrandingStep({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Branding</h2>
        <p className="mt-1 text-sm text-slate-500">Customize your shop appearance and colors.</p>
      </div>
      <label className="block">
        <span className={labelTextClass}>Logo URL (optional)</span>
        <input
          value={data.logoUrl}
          onChange={(e) => onChange("logoUrl", e.target.value)}
          className={inputClass}
          placeholder="/gadget-zone-logo.png"
        />
        <p className="mt-1 text-xs text-slate-400">URL or path to your shop logo. File upload coming soon.</p>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={labelTextClass}>Primary color</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={data.primaryColor}
              onChange={(e) => onChange("primaryColor", e.target.value)}
              className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer"
            />
            <input
              value={data.primaryColor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^#[0-9a-fA-F0-9]{0,6}$/.test(val)) onChange("primaryColor", val);
              }}
              className={inputClass}
              placeholder="#3B82F6"
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
              className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer"
            />
            <input
              value={data.accentColor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^#[0-9a-fA-F0-9]{0,6}$/.test(val)) onChange("accentColor", val);
              }}
              className={inputClass}
              placeholder="#10B981"
              maxLength={7}
            />
          </div>
        </label>
        <label className="block">
          <span className={labelTextClass}>Default theme</span>
          <select
            value={data.defaultTheme}
            onChange={(e) => onChange("defaultTheme", e.target.value)}
            className={inputClass}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ConfirmStep({
  data,
}: {
  data: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Ready to create your shop</h2>
        <p className="mt-1 text-sm text-slate-500">Review your details before finishing setup.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm">
        <Section summary="Owner Profile">
          <Row label="Name" value={data.fullName} />
          <Row label="Phone" value={data.phone || "—"} />
          <Row label="Avatar" value={data.avatarUrl || "Default"} />
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
        </Section>
        <Section summary="Branch">
          <Row label="Name" value={data.branchName || "Main Branch"} />
          <Row label="Phone" value={data.branchPhone || "—"} />
          <Row label="Address" value={data.branchAddress || "—"} />
        </Section>
        <Section summary="Branding">
          <Row label="Logo" value={data.logoUrl || "Default"} />
          <Row label="Primary" value={data.primaryColor} />
          <Row label="Accent" value={data.accentColor} />
          <Row label="Theme" value={data.defaultTheme} />
        </Section>
      </div>
    </div>
  );
}

function Section({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-700">
        {summary}
      </summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="text-slate-900">{value}</span>
    </p>
  );
}
