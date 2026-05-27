import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getReturnDetail } from "@/lib/data/returns";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";
import { PrintButton } from "./print-button";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

const PRODUCTION_URL = "https://saledock-cloud-pos.vercel.app";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const target = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${target}?text=${encodeURIComponent(message)}`;
}

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const { id } = await params;
  const ret = await getReturnDetail(profile.organization_id, id);
  if (!ret) notFound();

  const branding = await getBrandingSettings(profile.organization_id, ret.branch_id);

  const currency = branding.currencyCode || organization?.currency_code || "PKR";
  const orgName = branding.shopName || organization?.name || "Gadget Zone";
  const branchName = branding.branchName || "Main Branch";
  const branchPhone = branding.branchPhone || branding.phone;
  const branchAddress = branding.branchAddress || branding.address;

  const returnUrl = `${PRODUCTION_URL}/returns/${ret.id}`;
  const whatsappMessage = [
    `*${orgName} Return Receipt*`,
    `Return No: ${ret.return_no}`,
    `Original Invoice: ${ret.invoice_no || "—"}`,
    `Refund Amount: ${formatCurrency(ret.refund_amount, currency)}`,
    `Refund Method: ${PAYMENT_LABELS[ret.refund_method || ""] || ret.refund_method || "—"}`,
    `Date: ${fmtDate(ret.created_at)}`,
    `Link: ${returnUrl}`,
  ].join("\n");
  const whatsappHref = whatsappLink(ret.customer_phone, whatsappMessage);

  return (
    <AppShell pageTitle={`Return ${ret.return_no}`}>
      <div className="print-hidden mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/returns" className="text-sm font-semibold text-blue-700 underline">
          ← Back to returns
        </Link>
        <PrintButton whatsappHref={whatsappHref} />
      </div>

      {/* A4 Print Layout (also serves as Screen Layout) */}
      <article className="a4-print mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8 print:max-w-none print:border-0 print:shadow-none">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            {branding.logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logoUrl}
                  alt={`${orgName} logo`}
                  className="mb-3 h-14 w-auto max-w-[120px] object-contain"
                />
              </>
            )}
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">{orgName}</p>
            <h1 className="text-2xl font-black text-slate-950">{branchName}</h1>
            {branchAddress && (
              <p className="mt-1 text-sm text-slate-600">{branchAddress}</p>
            )}
            {branchPhone && (
              <p className="text-sm text-slate-600">{branchPhone}</p>
            )}
            {branding.email && <p className="text-sm text-slate-600">{branding.email}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Return Receipt</p>
            <p className="text-xl font-black text-slate-950">{ret.return_no}</p>
            <p className="mt-1 text-xs text-slate-500">{fmtDate(ret.created_at)}</p>
            <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              {ret.status}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
            {ret.customer_name ? (
              <>
                <p className="mt-1 font-bold text-slate-900">
                  {ret.customer_name}
                </p>
                {ret.customer_phone && <p className="text-sm text-slate-600">{ret.customer_phone}</p>}
                {ret.customer_address && <p className="text-sm text-slate-600">{ret.customer_address}</p>}
              </>
            ) : (
              <p className="mt-1 font-bold text-slate-900">Walk-in customer</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Cashier</p>
            <p className="mt-1 font-bold text-slate-900">{ret.created_by_name ?? "—"}</p>
            <p className="mt-4 text-xs font-bold uppercase text-slate-500">Linked Invoice</p>
            {ret.invoice_id ? (
              <p className="mt-1 font-bold text-blue-700 underline">
                <Link href={`/invoices/${ret.invoice_id}`}>{ret.invoice_no}</Link>
              </p>
            ) : (
              <p className="mt-1 font-bold text-slate-900">—</p>
            )}
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm md:min-w-0">
            <thead className="border-y border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3 text-right">Unit Price</th>
                <th className="py-2 px-3 text-center">Restocked</th>
                <th className="py-2 pl-3 text-right">Refund Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-slate-900">{it.item_name}</div>
                    <div className="text-xs text-slate-500">{it.item_type === "service" ? "Service" : "Product"}</div>
                  </td>
                  <td className="py-2 px-3 text-right">{it.quantity}</td>
                  <td className="py-2 px-3 text-right">
                    {formatCurrency(it.unit_price, currency)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        it.restock
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-slate-50 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {it.restock ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-2 pl-3 text-right font-mono font-semibold text-slate-950">
                    {formatCurrency(it.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-6 flex flex-col items-stretch gap-4 sm:flex-row sm:justify-between">
          <div className="flex-1 max-w-md">
            {ret.notes && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Notes / Reason</p>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{ret.notes}</p>
              </div>
            )}
          </div>
          <div className="w-full sm:w-64 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(ret.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-950">
              <span>Total Refund</span>
              <span className="font-mono">{formatCurrency(ret.refund_amount, currency)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Refund Method</span>
              <span>{PAYMENT_LABELS[ret.refund_method || ""] || ret.refund_method || "—"}</span>
            </div>
            {ret.reference_number && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>Reference No</span>
                <span>{ret.reference_number}</span>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}
        </footer>
      </article>

      {/* 80mm Thermal Print Layout */}
      <article className="thermal-print hidden bg-white text-black">
        <header className="text-center">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={`${orgName} logo`}
              className="mx-auto mb-2 h-12 w-auto max-w-[42mm] object-contain"
            />
          )}
          <h1 className="text-[13px] font-black uppercase leading-tight">{orgName}</h1>
          <p className="text-[10px] font-semibold">{branchName}</p>
          {branchAddress && <p className="text-[9px] leading-tight">{branchAddress}</p>}
          {branchPhone && <p className="text-[9px]">Phone: {branchPhone}</p>}
          {branding.whatsappSupport && <p className="text-[9px]">WhatsApp: {branding.whatsappSupport}</p>}
        </header>

        <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
          <div className="flex justify-between gap-2"><span>Return No</span><strong>{ret.return_no}</strong></div>
          <div className="flex justify-between gap-2"><span>Invoice No</span><span>{ret.invoice_no || "—"}</span></div>
          <div className="flex justify-between gap-2"><span>Date</span><span className="text-right">{fmtDate(ret.created_at)}</span></div>
          <div className="flex justify-between gap-2"><span>Customer</span><span className="text-right">{ret.customer_name ?? "Walk-in"}</span></div>
          {ret.customer_phone && <div className="flex justify-between gap-2"><span>Phone</span><span>{ret.customer_phone}</span></div>}
          <div className="flex justify-between gap-2"><span>Cashier</span><span>{ret.created_by_name ?? "Staff"}</span></div>
        </div>

        <section className="text-[10px]">
          {ret.items.map((it) => (
            <div key={it.id} className="border-b border-dashed border-slate-400 py-1">
              <p className="font-bold leading-tight">
                {it.item_name} {it.restock ? "(Restocked)" : ""}
              </p>
              <div className="flex justify-between gap-2">
                <span>{it.quantity} x {formatCurrency(it.unit_price, currency)}</span>
                <span className="font-bold">{formatCurrency(it.line_total, currency)}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-2 space-y-1 border-b border-dashed border-black pb-2 text-[10px]">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(ret.subtotal, currency)}</span></div>
          <div className="flex justify-between text-[11px] font-black">
            <span>Total Refund</span>
            <span>{formatCurrency(ret.refund_amount, currency)}</span>
          </div>
          <div className="flex justify-between"><span>Method</span><span>{PAYMENT_LABELS[ret.refund_method || ""] || ret.refund_method || "—"}</span></div>
          {ret.reference_number && <div className="flex justify-between"><span>Ref No</span><span>{ret.reference_number}</span></div>}
        </section>

        {ret.notes && (
          <section className="mt-2 text-[9px]">
            <p className="font-bold">Reason/Notes</p>
            <p>{ret.notes}</p>
          </section>
        )}

        <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px] leading-tight">
          <p>{branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}</p>
          <p className="mt-1">Powered by SaleDock Cloud POS</p>
        </footer>
      </article>
    </AppShell>
  );
}
