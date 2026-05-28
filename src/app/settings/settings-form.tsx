"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import type { BrandingSettings } from "@/lib/data/settings";
import { updateSettingsAction, updateProfilePictureAction, type SettingsActionState } from "./actions";
import { ImageUpload } from "@/components/shared/image-upload";

const initialState: SettingsActionState = { error: null, success: null };

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-500";
const textareaClass =
  "mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass = "block min-w-0";
const labelTextClass = "text-xs font-bold uppercase tracking-wide text-slate-500";

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

export function SettingsForm({
  settings,
  canEdit,
  organizationId,
  branchId,
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
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);
  const [ppState, ppAction, ppPending] = useActionState(updateProfilePictureAction, initialState);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  function handleLogoUpload(url: string) {
    setLogoPreview(url);
  }

  return (
    <form action={formAction} className="space-y-5">
      {!canEdit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Your role can view these settings, but only owners and admins can save changes.
        </div>
      )}

      {state.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {state.success}
        </div>
      )}

      <Section
        title="Business Profile"
        description="Primary shop details used in app headers, print documents, and future sharing."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>Shop name</span>
            <input name="shopName" required defaultValue={settings.shopName} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Owner name</span>
            <input name="ownerName" defaultValue={settings.ownerName} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Phone</span>
            <input name="phone" defaultValue={settings.phone} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>WhatsApp support</span>
            <input name="whatsappSupport" defaultValue={settings.whatsappSupport} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Email</span>
            <input name="email" type="email" defaultValue={settings.email} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className="block min-w-0 md:col-span-2">
            <span className={labelTextClass}>Address</span>
            <textarea name="address" defaultValue={settings.address} disabled={!canEdit || pending} className={textareaClass} />
          </label>
        </div>
      </Section>

      <Section
        title="Branch Profile"
        description="Branch-level name and contact details shown on invoices, repair receipts, and reports."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>Branch name</span>
            <input name="branchName" required defaultValue={settings.branchName} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Branch phone</span>
            <input name="branchPhone" defaultValue={settings.branchPhone} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className="block min-w-0 md:col-span-2">
            <span className={labelTextClass}>Branch address</span>
            <textarea name="branchAddress" defaultValue={settings.branchAddress} disabled={!canEdit || pending} className={textareaClass} />
          </label>
        </div>
      </Section>

      <Section
        title="Invoice & Receipt Branding"
        description="Branding fields used by invoice prints, repair receipts, and reports."
      >
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreview || settings.logoUrl || "/saledock-logo-full.png"}
                alt="Shop logo preview"
                className="h-auto max-h-28 w-auto object-contain"
              />
            </div>
            <div className="mt-3 space-y-2">
              <ImageUpload
                bucket="public-branding"
                folderPath={`orgs/${organizationId}/logo`}
                currentUrl={null}
                onUploadComplete={handleLogoUpload}
                aspectRatio="landscape"
                uploadingText="Uploading logo..."
              />
            </div>
          </div>
          <div className="grid gap-4">
            <label className={labelClass}>
              <span className={labelTextClass}>Logo URL or path</span>
              <input name="logoUrl" defaultValue={settings.logoUrl} disabled={!canEdit || pending} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Invoice footer / note</span>
              <textarea name="invoiceFooter" defaultValue={settings.invoiceFooter} disabled={!canEdit || pending} className={textareaClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Repair receipt terms</span>
              <textarea name="receiptTerms" defaultValue={settings.receiptTerms} disabled={!canEdit || pending} className={textareaClass} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Default print format</span>
              <select name="printFormat" defaultValue={settings.printFormat} disabled={!canEdit || pending} className={inputClass}>
                <option value="a4">A4 default</option>
                <option value="80mm_planned">80mm planned / deferred</option>
              </select>
            </label>
          </div>
        </div>
      </Section>

      <Section
        title="Theme & Appearance"
        description="Custom brand colors and default theme mode for your shop."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Primary color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                name="primaryColor"
                defaultValue={settings.primaryColor ?? "#3B82F6"}
                disabled={!canEdit || pending}
                className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer"
              />
              <input
                name="primaryColor"
                defaultValue={settings.primaryColor ?? "#3B82F6"}
                disabled={!canEdit || pending}
                className={inputClass}
                placeholder="#3B82F6"
                maxLength={7}
              />
            </div>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Accent color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                name="accentColor"
                defaultValue={settings.accentColor ?? "#10B981"}
                disabled={!canEdit || pending}
                className="h-11 w-14 rounded-lg border border-slate-200 p-1 cursor-pointer"
              />
              <input
                name="accentColor"
                defaultValue={settings.accentColor ?? "#10B981"}
                disabled={!canEdit || pending}
                className={inputClass}
                placeholder="#10B981"
                maxLength={7}
              />
            </div>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Default theme</span>
            <select
              name="defaultTheme"
              defaultValue={settings.defaultTheme ?? "system"}
              disabled={!canEdit || pending}
              className={inputClass}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </Section>

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

      <Section
        title="Regional / Currency"
        description="Regional defaults for money formatting, reporting, and future branch operations."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Currency</span>
            <input name="currencyCode" defaultValue={settings.currencyCode || "PKR"} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className="block min-w-0 md:col-span-2">
            <span className={labelTextClass}>Timezone</span>
            <input name="timezone" defaultValue={settings.timezone || "Asia/Karachi"} disabled={!canEdit || pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Low-stock default threshold</span>
            <input
              name="lowStockDefaultThreshold"
              type="number"
              min={0}
              defaultValue={settings.lowStockDefaultThreshold}
              disabled={!canEdit || pending}
              className={inputClass}
            />
          </label>
        </div>
      </Section>

      <Section
        title="System Info / Safe Notes"
        description="Reference details for support. IDs are shown for troubleshooting only."
      >
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className={labelTextClass}>Production URL</dt>
            <dd className="mt-1 break-words font-semibold text-slate-800">https://saledock-cloud-pos.vercel.app</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className={labelTextClass}>Uploads/storage</dt>
            <dd className="mt-1 font-semibold text-slate-800">Enabled via Supabase Storage (profile-pictures, public-branding buckets).</dd>
          </div>
          <details className="rounded-xl bg-slate-50 p-3 md:col-span-2">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Technical IDs</summary>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <p className="break-all">Organization: {organizationId}</p>
              <p className="break-all">Branch: {branchId ?? "None"}</p>
            </div>
          </details>
        </dl>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-3 border-t border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <button
          type="submit"
          disabled={!canEdit || pending}
          className="min-h-12 w-full rounded-xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-60 sm:w-auto"
        >
          {pending || ppPending ? "Saving settings..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
