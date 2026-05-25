import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { listReturnableInvoiceItems, listReturnsForInvoice } from "@/lib/data/returns";
import { getBrandingSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";
import { canProcessReturns } from "@/lib/permissions";
import { PrintButton } from "./print-button";
import { ReturnForm } from "./returns/return-form";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const { id } = await params;
  const invoice = await getInvoiceDetail(profile.organization_id, id);
  if (!invoice) notFound();
  const [returnableItems, invoiceReturns, branding] = await Promise.all([
    listReturnableInvoiceItems(profile.organization_id, id),
    listReturnsForInvoice(profile.organization_id, id),
    getBrandingSettings(profile.organization_id, invoice.branch?.id ?? profile.branch_id),
  ]);

  const currency = branding.currencyCode || organization?.currency_code || "PKR";
  const orgName = branding.shopName || organization?.name || "Gadget Zone";
  const branchName = invoice.branch?.name ?? branding.branchName ?? "Main Branch";
  const branchPhone = invoice.branch?.phone ?? branding.branchPhone ?? branding.phone;
  const branchAddress = invoice.branch?.address ?? branding.branchAddress ?? branding.address;

  const isPrivileged =
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    profile?.role === "manager";

  const totalCost = invoice.items.reduce(
    (sum, item) => sum + (item.purchase_price ?? 0) * item.quantity,
    0,
  );
  const grossProfit = invoice.grand_total - totalCost;
  const grossMargin =
    invoice.grand_total > 0 ? (grossProfit / invoice.grand_total) * 100 : 0;
  const canReturn = canProcessReturns(profile.role);

  return (
    <AppShell pageTitle={`Invoice ${invoice.invoice_no}`}>
      <div className="print-hidden mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/invoices" className="text-sm font-semibold text-blue-700 underline">
          ← Back to invoices
        </Link>
        <PrintButton />
      </div>

      <article id="invoice-print" className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8 print:max-w-none print:border-0 print:shadow-none">
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
            <p className="text-xs font-bold uppercase text-slate-500">Invoice</p>
            <p className="text-xl font-black text-slate-950">{invoice.invoice_no}</p>
            <p className="mt-1 text-xs text-slate-500">{fmtDate(invoice.invoice_date)}</p>
            <p className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
              {invoice.status}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Bill to</p>
            {invoice.customer ? (
              <>
                <p className="mt-1 font-bold text-slate-900">
                  <Link href={`/customers/${invoice.customer.id}`} className="text-blue-700 hover:underline">
                    {invoice.customer.name}
                  </Link>
                </p>
                {invoice.customer.phone && <p className="text-sm text-slate-600">{invoice.customer.phone}</p>}
                {invoice.customer.address && <p className="text-sm text-slate-600">{invoice.customer.address}</p>}
                {invoice.balance_due > 0 && (
                  <div className="print-hidden mt-3 inline-block rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700">
                    ⚠️ Customer balance due
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 font-bold text-slate-900">Walk-in customer</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Cashier</p>
            <p className="mt-1 font-bold text-slate-900">{invoice.cashier_name ?? "—"}</p>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm md:min-w-0">
            <thead className="border-y border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 px-3 text-right">Qty</th>
                {isPrivileged && (
                  <th className="py-2 px-3 text-right print-hidden text-slate-500">Cost</th>
                )}
                <th className="py-2 px-3 text-right">Unit</th>
                <th className="py-2 px-3 text-right">Discount</th>
                <th className="py-2 pl-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-slate-900">{it.product_name}</div>
                    <div className="text-xs text-slate-500">{it.product_type === "service" ? "Service" : "Product"}</div>
                  </td>
                  <td className="py-2 px-3 text-right">{it.quantity}</td>
                  {isPrivileged && (
                    <td className="py-2 px-3 text-right print-hidden text-slate-500 font-mono text-xs">
                      {formatCurrency(it.purchase_price, currency)}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right">{formatCurrency(it.unit_price, currency)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(it.item_discount, currency)}</td>
                  <td className="py-2 pl-3 text-right font-bold">{formatCurrency(it.line_total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-5 ml-auto w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span>Cart discount</span><span>{formatCurrency(invoice.discount_total, currency)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
            <span className="font-bold">Grand total</span>
            <span className="font-black">{formatCurrency(invoice.grand_total, currency)}</span>
          </div>
          <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(invoice.amount_paid, currency)}</span></div>
          <div className="flex justify-between">
            <span>Balance due</span>
            <span className={invoice.balance_due > 0 ? "font-bold text-red-700" : "font-bold text-emerald-700"}>
              {formatCurrency(invoice.balance_due, currency)}
            </span>
          </div>
        </section>

        {invoice.payments.length > 0 && (
          <section className="mt-5">
            <p className="text-xs font-bold uppercase text-slate-500">Payments</p>
            <ul className="mt-2 space-y-1 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    {PAYMENT_LABELS[p.method] ?? p.method}
                    {p.reference_no ? ` · ${p.reference_no}` : ""}
                  </span>
                  <span className="font-semibold">{formatCurrency(p.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {invoice.note && (
          <section className="mt-5">
            <p className="text-xs font-bold uppercase text-slate-500">Note</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{invoice.note}</p>
          </section>
        )}

        {isPrivileged && (
          <section className="print-hidden mt-8 rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-500 mb-3 flex items-center gap-2">
              📊 Profitability & Cost Analysis <span className="text-[10px] font-bold text-blue-700 uppercase tracking-normal bg-blue-50 px-2 py-0.5 rounded-full">Privileged View</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Purchase Cost</p>
                <p className="mt-1 text-base font-black text-slate-900">{formatCurrency(totalCost, currency)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Profit</p>
                <p className={`mt-1 text-base font-black ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(grossProfit, currency)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Margin</p>
                <p className={`mt-1 text-base font-black ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {grossMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>
        )}

        <ReturnForm
          invoiceId={invoice.id}
          items={returnableItems}
          currency={currency}
          canProcess={canReturn}
        />

        {invoiceReturns.length > 0 && (
          <section className="print-hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Return history
                </p>
                <h2 className="text-lg font-black text-slate-950">Previous returns</h2>
              </div>
              <Link href="/returns" className="text-xs font-bold text-blue-700 underline">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {invoiceReturns.map((ret) => (
                <div key={ret.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-slate-950">{ret.return_no}</p>
                      <p className="text-xs text-slate-500">
                        {fmtDate(ret.created_at)}
                        {ret.created_by_name ? ` · ${ret.created_by_name}` : ""}
                      </p>
                    </div>
                    <div className="text-sm sm:text-right">
                      <p className="font-black text-slate-900">
                        {formatCurrency(ret.subtotal, currency)}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Payout {formatCurrency(ret.refund_amount, currency)}
                        {ret.refund_method ? ` · ${PAYMENT_LABELS[ret.refund_method] ?? ret.refund_method}` : ""}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {ret.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>
                          {item.quantity} × {item.item_name}
                          {item.item_type === "service" ? " · service" : item.restock ? " · restocked" : " · no restock"}
                        </span>
                        <span className="font-semibold">{formatCurrency(item.line_total, currency)}</span>
                      </li>
                    ))}
                  </ul>
                  {ret.notes && <p className="mt-2 text-xs text-slate-500">{ret.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}
        </footer>
      </article>
    </AppShell>
  );
}
