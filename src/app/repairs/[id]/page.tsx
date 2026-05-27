import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, User, Wrench, Calendar, Coins, History, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getRepairDetail } from "@/lib/data/repairs";
import { getBrandingSettings } from "@/lib/data/settings";
import { canUpdateRepairStatus } from "@/lib/permissions";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";
import { StatusForm } from "./status-form";
import { NotesForm } from "./notes-form";
import { PrintButton } from "./print-button";

type Params = {
  id: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  waiting_for_parts: "Waiting for Parts",
  in_progress: "In Progress",
  completed: "Ready for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  received: "bg-slate-100 text-slate-700 border-slate-200",
  waiting_for_parts: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

const PRODUCTION_URL = "https://gadget-zone-online-pos.vercel.app";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const target = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${target}?text=${encodeURIComponent(message)}`;
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization, branch } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const { id } = await params;
  const orgId = profile.organization_id;
  const canUpdate = canUpdateRepairStatus(profile.role);
  const branding = await getBrandingSettings(orgId, profile.branch_id);
  const currency = branding.currencyCode || organization?.currency_code || "PKR";

  const detail = await getRepairDetail(id, orgId);
  if (!detail) notFound();

  const { repair, history } = detail;
  const balanceDue = Math.max((repair.final_cost || repair.estimated_cost) - repair.advance_paid, 0);
  const repairUrl = `${PRODUCTION_URL}/repairs/${repair.id}`;
  const whatsappMessage = [
    `${branding.shopName || organization?.name || "Gadget Zone"} repair update`,
    `Job: ${repair.job_no}`,
    `Status: ${STATUS_LABELS[repair.status] || repair.status}`,
    `Device: ${repair.device_type}${repair.device_model ? ` ${repair.device_model}` : ""}`,
    `Estimate: ${formatCurrency(repair.estimated_cost, currency)}`,
    `Advance: ${formatCurrency(repair.advance_paid, currency)}`,
    `Balance: ${formatCurrency(balanceDue, currency)}`,
    `View repair: ${repairUrl}`,
  ].join("\n");
  const whatsappHref = whatsappLink(repair.customer_phone, whatsappMessage);
  const receiptTerms = branding.receiptTerms
    ? branding.receiptTerms.split(/\r?\n/).filter(Boolean)
    : [
        "Repairs have 7-day labor warranty. Physical/water damages void warranty.",
        "SaleDock is not liable for data loss during software or hardware services. Backup recommended.",
        "Devices uncollected after 60 days are subject to disposal or sale to recover repair costs.",
        "Diagnostic charges may apply if device is diagnosed but not approved for repairs.",
      ];

  return (
    <AppShell pageTitle={`Repair Job ${repair.job_no}`}>
      {/* CSS Print Styles Override */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, nav, header, button, form, .print-hidden, .no-print {
                display: none !important;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
              }
              .print-only {
                display: block !important;
              }
              body[data-print-mode="thermal"] .repair-a4-print {
                display: none !important;
              }
              body[data-print-mode="thermal"] .thermal-print {
                display: block !important;
              }
              .min-h-screen {
                min-h: 0 !important;
              }
            }
          `,
        }}
      />

      {/* Screen Mode Layout (Print Hidden) */}
      <div className="print-hidden">
        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/repairs"
            className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to Repairs
          </Link>
        </div>

        {/* Header Title Section */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 sm:tracking-[0.24em]">
                Repair Job Number
              </span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  STATUS_CLASSES[repair.status]
                }`}
              >
                {STATUS_LABELS[repair.status] || repair.status}
              </span>
            </div>
            <h2 className="mt-1.5 break-words text-2xl font-black text-slate-950">{repair.job_no}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Intake recorded by <span className="font-bold">{repair.created_by_name || "Staff"}</span> on {fmtDate(repair.created_at)} at {fmtTime(repair.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <PrintButton whatsappHref={whatsappHref} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Device Detail, Private Notes */}
          <div className="lg:col-span-2 space-y-6">
            {/* Core Device Info */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Wrench className="size-5 text-blue-700" />
                <h3 className="text-sm font-black text-slate-900">Device & Fault Log</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Details</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {repair.device_type} {repair.device_model && <span className="font-normal text-slate-500">({repair.device_model})</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Serial / IMEI</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{repair.serial_imei ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Problem Description</p>
                  <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-wrap font-medium">
                    {repair.problem_description}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accessories Received</p>
                  <p className="mt-1 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-wrap font-medium">
                    {repair.accessories_received ?? "None"}
                  </p>
                </div>
              </div>
            </div>

            {/* Customer Details info */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <User className="size-5 text-blue-700" />
                <h3 className="text-sm font-black text-slate-900">Customer Details</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer Profile</p>
                  {repair.customer_id ? (
                    <Link
                      href={`/customers/${repair.customer_id}`}
                      className="mt-1 inline-block text-sm font-black text-blue-700 hover:underline"
                    >
                      {repair.customer_name} ↗
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm font-black text-slate-800">{repair.customer_name}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{repair.customer_phone ?? "—"}</p>
                </div>
              </div>
            </div>

            {/* Private diagnosis / Internal Notes */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <History className="size-5 text-blue-700" />
                <h3 className="text-sm font-black text-slate-900">Technical Details & diagnosis</h3>
              </div>

              {canUpdate ? (
                <NotesForm repair={repair} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-400 uppercase tracking-wider">Diagnosis</p>
                    <p className="mt-1 text-slate-700 whitespace-pre-wrap">{repair.diagnosis ?? "No diagnosis logged."}</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-400 uppercase tracking-wider">Internal Private Notes</p>
                    <p className="mt-1 text-slate-700 whitespace-pre-wrap">{repair.notes ?? "No internal notes logged."}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Financials card, status forms, history timeline */}
          <div className="space-y-6">
            {/* Financial Overview */}
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                <Coins className="size-5 text-blue-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Financial Summary</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Estimated Cost:</span>
                  <span className="font-bold text-slate-200">{formatCurrency(repair.estimated_cost, currency)}</span>
                </div>
                {repair.final_cost > 0 && repair.final_cost !== repair.estimated_cost && (
                  <div className="flex justify-between items-center text-xs text-amber-300">
                    <span>Adjusted Final Cost:</span>
                    <span className="font-bold">{formatCurrency(repair.final_cost, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Advance Paid:</span>
                  <span className="font-bold text-emerald-400">-{formatCurrency(repair.advance_paid, currency)}</span>
                </div>
                <div className="border-t border-slate-800 pt-3 flex justify-between items-end">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Remaining Balance:</span>
                  <span className="text-2xl font-black text-rose-400">
                    {formatCurrency(balanceDue, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Expected Delivery Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Calendar className="size-5 text-blue-700" />
                <h3 className="text-sm font-black text-slate-900">Delivery Target</h3>
              </div>
              <div className="text-xs text-slate-700">
                <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Expected Delivery Date</p>
                <p className="text-sm font-bold text-slate-800">
                  {repair.expected_delivery_at ? fmtDate(repair.expected_delivery_at) : "No delivery date committed."}
                </p>
                {repair.delivered_at && (
                  <div className="mt-3 border-t border-slate-100 pt-3 bg-emerald-50/60 p-2.5 rounded-xl text-emerald-800">
                    <p className="font-bold text-xs uppercase tracking-wider text-emerald-700">Delivered On</p>
                    <p className="text-sm font-black mt-0.5">{fmtDate(repair.delivered_at)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status Update Form */}
            {canUpdate && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                  <Clock className="size-5 text-blue-700" />
                  <h3 className="text-sm font-black text-slate-900">Advance Workflow State</h3>
                </div>
                <StatusForm repair={repair} />
              </div>
            )}

            {/* Timeline history log */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <History className="size-5 text-blue-700" />
                <h3 className="text-sm font-black text-slate-900">Job Timeline Logs</h3>
              </div>

              {history.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  No status transition logs recorded yet.
                </div>
              ) : (
                <div className="relative border-l border-slate-200 pl-4 space-y-4 text-xs">
                  {history.map((h) => (
                    <div key={h.id} className="relative">
                      <span className="absolute -left-[21.5px] top-1 flex size-3 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                        <span className="size-1.5 rounded-full bg-slate-600" />
                      </span>
                      <p className="font-bold text-slate-900">
                        Status set to{" "}
                        <span className="text-blue-700 uppercase font-semibold text-[10px] tracking-wide rounded bg-slate-100 px-1.5 py-0.5 ml-1">
                          {STATUS_LABELS[h.new_status] || h.new_status}
                        </span>
                      </p>
                      {h.note && <p className="mt-1 text-slate-600 leading-normal bg-slate-50/70 p-2 rounded-lg border border-slate-100">{h.note}</p>}
                      <p className="mt-1 text-[10px] text-slate-400 whitespace-nowrap">
                        By {h.changed_by_name || "Staff"} · {fmtDate(h.created_at)} at {fmtTime(h.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY A4 SHEET INVOICE / RECEIPT (Hidden on Screen, Appears on Print) */}
      <div className="repair-a4-print hidden print-only bg-white text-black p-8 font-sans max-w-[800px] mx-auto text-sm leading-relaxed">
        {/* Letterhead Header */}
        <div className="border-b-2 border-slate-800 pb-6 mb-6 flex justify-between items-start">
          <div>
            {branding.logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logoUrl}
                  alt={`${branding.shopName} logo`}
                  className="mb-3 h-14 w-auto max-w-[120px] object-contain"
                />
              </>
            )}
            <h1 className="text-3xl font-black uppercase tracking-wider text-slate-900">
              {branding.shopName || organization?.name || "GADGET ZONE"}
            </h1>
            <p className="text-slate-600 font-semibold">{branding.branchName || branch?.name || "Main Branch"}</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[300px]">
              {branding.branchAddress || branch?.address || branding.address || organization?.address || "Address details"}
            </p>
            {(branding.branchPhone || branch?.phone || branding.phone) && (
              <p className="text-xs text-slate-500">
                Phone: {branding.branchPhone || branch?.phone || branding.phone}
              </p>
            )}
            {branding.whatsappSupport && (
              <p className="text-xs text-slate-500">WhatsApp: {branding.whatsappSupport}</p>
            )}
          </div>

          <div className="text-right">
            <h2 className="text-xl font-bold text-slate-950">REPAIR RECEIPT</h2>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <p>
                <span className="font-bold">Job No:</span> {repair.job_no}
              </p>
              <p>
                <span className="font-bold">Intake Date:</span> {fmtDate(repair.created_at)}
              </p>
              <p>
                <span className="font-bold">Staff:</span> {repair.created_by_name || "Operator"}
              </p>
            </div>
          </div>
        </div>

        {/* Customer & Device info grid */}
        <div className="grid grid-cols-2 gap-8 border-b border-slate-200 pb-6 mb-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Customer Info</h3>
            <p className="font-black text-slate-900 text-base">{repair.customer_name}</p>
            {repair.customer_phone && <p className="text-slate-600 mt-1 font-semibold">Phone: {repair.customer_phone}</p>}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Device info</h3>
            <p className="font-bold text-slate-900 text-base">
              {repair.device_type} {repair.device_model && `(${repair.device_model})`}
            </p>
            {repair.serial_imei && (
              <p className="text-slate-600 mt-1">
                <span className="font-semibold text-slate-500">Serial/IMEI:</span> {repair.serial_imei}
              </p>
            )}
          </div>
        </div>

        {/* Fault description */}
        <div className="border-b border-slate-200 pb-6 mb-6 grid gap-4 grid-cols-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Problem Description</h3>
            <p className="text-slate-800 font-semibold bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
              {repair.problem_description}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Accessories Received</h3>
            <p className="text-slate-700 font-semibold bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
              {repair.accessories_received ?? "None"}
            </p>
          </div>
        </div>

        {/* Terms and Financials Totals breakdown */}
        <div className="grid grid-cols-2 gap-8 items-start">
          {/* Shop repair terms and conditions */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-[10px] text-slate-600 leading-normal">
            <h4 className="font-black uppercase tracking-wider mb-2 text-slate-800">Intake Terms & Conditions</h4>
            <ol className="list-decimal pl-4 space-y-1.5 font-medium">
              {receiptTerms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ol>
            <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between">
              <div className="text-center w-[120px]">
                <div className="h-10 border-b border-slate-300" />
                <p className="text-[9px] mt-1 text-slate-500">Customer Signature</p>
              </div>
              <div className="text-center w-[120px]">
                <div className="h-10 border-b border-slate-300" />
                <p className="text-[9px] mt-1 text-slate-500">Authorized Signature</p>
              </div>
            </div>
          </div>

          {/* Totals column */}
          <div className="rounded-xl border-2 border-slate-900 p-4 space-y-3 font-semibold">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Estimated Cost:</span>
              <span className="text-slate-900">{formatCurrency(repair.estimated_cost, currency)}</span>
            </div>
            {repair.final_cost > 0 && repair.final_cost !== repair.estimated_cost && (
              <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-1.5">
                <span className="text-slate-500">Final Cost:</span>
                <span className="text-slate-900">{formatCurrency(repair.final_cost, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Advance Paid:</span>
              <span className="text-emerald-700">-{formatCurrency(repair.advance_paid, currency)}</span>
            </div>
            <div className="border-t-2 border-slate-800 pt-3 flex justify-between items-end text-sm">
              <span className="font-black text-slate-900 uppercase">Balance Due:</span>
              <span className="text-xl font-black text-slate-950">
                {formatCurrency(balanceDue, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer letterhead */}
        <div className="mt-16 text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
          {branding.invoiceFooter || `Thank you for choosing ${branding.shopName || organization?.name || "Gadget Zone"} for your device needs!`}
        </div>
      </div>

      <article className="thermal-print hidden bg-white text-black">
        <header className="text-center">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={`${branding.shopName} logo`}
              className="mx-auto mb-2 h-12 w-auto max-w-[42mm] object-contain"
            />
          )}
          <h1 className="text-[13px] font-black uppercase leading-tight">
            {branding.shopName || organization?.name || "GADGET ZONE"}
          </h1>
          <p className="text-[10px] font-semibold">{branding.branchName || branch?.name || "Main Branch"}</p>
          {(branding.branchPhone || branch?.phone || branding.phone) && (
            <p className="text-[9px]">Phone: {branding.branchPhone || branch?.phone || branding.phone}</p>
          )}
          {branding.whatsappSupport && <p className="text-[9px]">WhatsApp: {branding.whatsappSupport}</p>}
        </header>

        <section className="my-2 border-y border-dashed border-black py-1 text-[10px]">
          <div className="flex justify-between gap-2"><span>Repair job</span><strong>{repair.job_no}</strong></div>
          <div className="flex justify-between gap-2"><span>Status</span><span className="text-right">{STATUS_LABELS[repair.status] || repair.status}</span></div>
          <div className="flex justify-between gap-2"><span>Intake</span><span>{fmtDate(repair.created_at)} {fmtTime(repair.created_at)}</span></div>
          <div className="flex justify-between gap-2"><span>Customer</span><strong className="text-right">{repair.customer_name}</strong></div>
          {repair.customer_phone && <div className="flex justify-between gap-2"><span>Phone</span><span>{repair.customer_phone}</span></div>}
        </section>

        <section className="space-y-1 border-b border-dashed border-black pb-2 text-[10px]">
          <p><strong>Device:</strong> {repair.device_type}{repair.device_model ? ` ${repair.device_model}` : ""}</p>
          {repair.serial_imei && <p><strong>Serial/IMEI:</strong> {repair.serial_imei}</p>}
          <p><strong>Problem:</strong> {repair.problem_description}</p>
          {repair.accessories_received && <p><strong>Accessories:</strong> {repair.accessories_received}</p>}
          {repair.expected_delivery_at && <p><strong>Expected:</strong> {fmtDate(repair.expected_delivery_at)}</p>}
        </section>

        <section className="mt-2 space-y-1 border-b border-dashed border-black pb-2 text-[10px]">
          <div className="flex justify-between"><span>Estimate</span><span>{formatCurrency(repair.estimated_cost, currency)}</span></div>
          {repair.final_cost > 0 && repair.final_cost !== repair.estimated_cost && (
            <div className="flex justify-between"><span>Final cost</span><span>{formatCurrency(repair.final_cost, currency)}</span></div>
          )}
          <div className="flex justify-between"><span>Advance</span><span>{formatCurrency(repair.advance_paid, currency)}</span></div>
          <div className="flex justify-between text-[12px] font-black"><span>Balance</span><span>{formatCurrency(balanceDue, currency)}</span></div>
          <div className="flex justify-between"><span>Payment</span><span>{repair.payment_method}</span></div>
        </section>

        {receiptTerms.length > 0 && (
          <section className="mt-2 text-[8.5px] leading-tight">
            <p className="font-black uppercase">Terms</p>
            <ol className="list-decimal space-y-0.5 pl-3">
              {receiptTerms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px] leading-tight">
          <p>{branding.invoiceFooter || `Thank you for choosing ${branding.shopName || organization?.name || "Gadget Zone"}.`}</p>
          <p className="mt-1">Powered by SaleDock Cloud POS</p>
        </footer>
      </article>
    </AppShell>
  );
}
