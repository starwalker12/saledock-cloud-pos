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
import { InvoiceDocument } from "./invoice-document";
import { buildMapLinkUrl, hasMapData } from "@/lib/map-utils";

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



function hasServiceSplit(item: { service_transaction_amount: number; service_commission: number; service_total_charged: number }) {
  return item.service_transaction_amount > 0 || item.service_commission > 0 || item.service_total_charged > 0;
}

const DEFAULT_LOGO = "/saledock-logo-full.png";


function hasShoLogo(logoUrl: string): boolean {
  return Boolean(logoUrl) && logoUrl !== DEFAULT_LOGO;
}

async function optionalInvoiceDetailSection<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.error(`[InvoiceDetailPage] ${label} failed:`, error);
    return fallback;
  }
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
  const organizationId = profile.organization_id;

  const { id } = await params;
  const invoice = await getInvoiceDetail(organizationId, id);
  if (!invoice) notFound();
  const [returnableItems, invoiceReturns, branding] = await Promise.all([
    optionalInvoiceDetailSection(
      "returnable invoice items query",
      () => listReturnableInvoiceItems(organizationId, id),
      [],
    ),
    optionalInvoiceDetailSection(
      "invoice returns query",
      () => listReturnsForInvoice(organizationId, id),
      [],
    ),
    optionalInvoiceDetailSection(
      "branding settings query",
      () => getBrandingSettings(organizationId, invoice.branch?.id ?? profile.branch_id),
      {
        appSettingsId: null,
        organizationId,
        branchId: invoice.branch?.id ?? profile.branch_id ?? null,
        shopName: organization?.name || "Gadget Zone",
        ownerName: "",
        phone: "",
        whatsappSupport: "",
        email: "",
        address: "",
        branchName: invoice.branch?.name ?? "Main Branch",
        branchPhone: invoice.branch?.phone ?? "",
        branchAddress: invoice.branch?.address ?? "",
        currencyCode: organization?.currency_code || "PKR",
        timezone: organization?.timezone || "Asia/Karachi",
        logoUrl: DEFAULT_LOGO,
        appLogoUrl: "",
        invoiceFooter: "",
        receiptTerms: "",
        printFormat: "a4",
        lowStockDefaultThreshold: 5,
        businessSubtitle: "Mobile & Accessories Hub",
        primaryColor: null,
        accentColor: null,
        defaultTheme: null,
        googleMapsUrl: "",
        latitude: "",
        longitude: "",
        showMap: false,
        invoiceShowLocationQr: false,
      },
    ),
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
  const hasChangeDue = invoice.change_due > 0;
  const showLogo = hasShoLogo(branding.logoUrl);

  const showInvoiceQr = branding.invoiceShowLocationQr && hasMapData(branding.googleMapsUrl, branding.latitude, branding.longitude);
  const mapLinkUrl = buildMapLinkUrl(branding.googleMapsUrl, branding.latitude, branding.longitude);

  return (
    <AppShell
      pageTitle={`Invoice ${invoice.invoice_no}`}
      mainClassName="p-3 pb-3 sm:p-6 sm:pb-4 md:pb-6 print:p-0"
      printFullDocument
      showMobileTabBar={false}
    >
      {/* ── Action bar ── */}
      <div className="print-hidden mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400"
        >
          &larr; Back to invoices
        </Link>
        <PrintButton
          invoiceNo={invoice.invoice_no}
          customerPhone={invoice.customer?.phone}
          invoice={{
            invoice_no: invoice.invoice_no,
            invoice_date: invoice.invoice_date,
            status: invoice.status,
            subtotal: invoice.subtotal,
            discount_total: invoice.discount_total,
            grand_total: invoice.grand_total,
            amount_paid: invoice.amount_paid,
            change_due: invoice.change_due,
            balance_due: invoice.balance_due,
            note: invoice.note,
            customer: invoice.customer ? { name: invoice.customer.name, phone: invoice.customer.phone } : null,
            items: invoice.items.map(item => ({
              product_name: item.product_name, product_type: item.product_type,
              quantity: item.quantity, unit_price: item.unit_price,
              item_discount: item.item_discount, line_total: item.line_total,
              service_provider: item.service_provider,
              service_transaction_amount: item.service_transaction_amount,
              service_commission: item.service_commission,
              service_reference_no: item.service_reference_no,
            })),
            payments: invoice.payments.map(payment => ({
              method: payment.method, amount: payment.amount, reference_no: payment.reference_no,
            })),
          }}
          shopName={orgName}
          currency={currency}
          invoiceFooter={branding.invoiceFooter}
        />
      </div>

      <InvoiceDocument
        invoice={invoice} branding={branding} orgName={orgName}
        branchName={branchName} branchAddress={branchAddress} branchPhone={branchPhone}
        currency={currency} showLogo={showLogo} mapLinkUrl={mapLinkUrl} showInvoiceQr={showInvoiceQr}
      />

      <div className="print-hidden mx-auto mt-8 max-w-4xl" data-invoice-internal aria-label="Internal invoice management">
        {isPrivileged && <section className="mx-6 mb-6 sm:mx-8">
          <h2 className="mb-3 text-sm font-semibold">Internal purchase costs</h2>
          <dl className="space-y-2 text-sm">{invoice.items.map(item => <div key={item.id} className="flex justify-between gap-4">
            <dt className="min-w-0 break-words">{item.product_name}</dt><dd className="shrink-0 tabular-nums">{formatCurrency(item.purchase_price, currency)}</dd>
          </div>)}</dl>
        </section>}
        {/* ── Profitability (privileged, screen only) ── */}
        {isPrivileged && (
          <section className="print-hidden mx-6 mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30 sm:mx-8">
            <div className="px-5 py-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                Profitability
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-normal text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  Owner only
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Total cost</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-slate-50 tabular-nums">
                    {formatCurrency(totalCost, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Gross profit</p>
                  <p className={`mt-0.5 text-sm font-black tabular-nums ${grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(grossProfit, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Gross margin</p>
                  <p className={`mt-0.5 text-sm font-black tabular-nums ${grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {grossMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Returns / refunds section ── */}
        <section className="px-6 pb-2 sm:px-8 print:hidden">
          <ReturnForm
            invoiceId={invoice.id}
            items={returnableItems}
            currency={currency}
            canProcess={canReturn}
          />
        </section>

        {invoiceReturns.length > 0 && (
          <section className="print-hidden mx-6 mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:mx-8">
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                    Returns / Refunds
                  </p>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-50">
                    Previous returns
                  </h3>
                </div>
                <Link
                  href="/returns"
                  className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  View all
                </Link>
              </div>
              <div className="space-y-3">
                {invoiceReturns.map((ret) => (
                  <div
                    key={ret.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <Link
                          href={`/returns/${ret.id}`}
                          className="font-bold text-blue-700 hover:underline dark:text-blue-400"
                        >
                          {ret.return_no}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {fmtDate(ret.created_at)}
                          {ret.created_by_name ? ` by ${ret.created_by_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                          {formatCurrency(ret.subtotal, currency)}
                        </p>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Refunded {formatCurrency(ret.refund_amount, currency)}
                          {ret.refund_method ? ` via ${PAYMENT_LABELS[ret.refund_method] ?? ret.refund_method}` : ""}
                        </p>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                      {ret.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3">
                          <span>
                            {item.quantity} &times; {item.item_name}
                            {item.item_type === "service"
                              ? " (service)"
                              : item.restock
                                ? " (restocked)"
                                : " (no restock)"}
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatCurrency(item.line_total, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {ret.notes && (
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{ret.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>

      {/* ── Thermal receipt print version ── */}
      <article className="thermal-print hidden bg-white text-black">
        <header className="text-center">
          {showLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logoUrl}
              alt={`${orgName} logo`}
              className="mx-auto mb-2 h-12 w-auto max-w-[42mm] object-contain"
            />
          ) : (
            <h1 className="text-[13px] font-black uppercase leading-tight text-black">{orgName}</h1>
          )}
          <h1 className="text-[13px] font-black uppercase leading-tight text-black">{orgName}</h1>
          <p className="text-[10px] font-semibold text-black">{branchName}</p>
          {branchAddress && <p className="text-[9px] leading-tight text-black">{branchAddress}</p>}
          {branchPhone && <p className="text-[9px] text-black">Phone: {branchPhone}</p>}
          {branding.whatsappSupport && <p className="text-[9px] text-black">WhatsApp: {branding.whatsappSupport}</p>}
        </header>

        <div className="my-2 border-y border-dashed border-black py-1 text-[10px] text-black">
          <div className="flex justify-between gap-2">
            <span>Invoice</span>
            <strong>{invoice.invoice_no}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>Date</span>
            <span className="text-right">{fmtDate(invoice.invoice_date)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Customer</span>
            <span className="text-right">{invoice.customer?.name ?? "Walk-in"}</span>
          </div>
          {invoice.customer?.phone && (
            <div className="flex justify-between gap-2">
              <span>Phone</span>
              <span>{invoice.customer.phone}</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span>Cashier</span>
            <span>{invoice.cashier_name ?? "Staff"}</span>
          </div>
        </div>

        <section className="text-[10px] text-black">
          {invoice.items.map((it) => (
            <div key={it.id} className="border-b border-dashed border-slate-400 py-1">
              <p className="font-bold leading-tight text-black">{it.product_name}</p>
              <div className="flex justify-between gap-2">
                <span>{it.quantity} x {formatCurrency(it.unit_price, currency)}</span>
                <span className="font-bold">{formatCurrency(it.line_total, currency)}</span>
              </div>
              {it.item_discount > 0 && (
                <div className="flex justify-between gap-2 text-[9px]">
                  <span>Discount</span>
                  <span>{formatCurrency(it.item_discount, currency)}</span>
                </div>
              )}
              {it.product_type === "service" && hasServiceSplit(it) && (
                <div className="mt-1 space-y-0.5 text-[9px]">
                  {it.service_transaction_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Principal</span>
                      <span>{formatCurrency(it.service_transaction_amount, currency)}</span>
                    </div>
                  )}
                  {it.service_commission > 0 && (
                    <div className="flex justify-between">
                      <span>Commission</span>
                      <span>{formatCurrency(it.service_commission, currency)}</span>
                    </div>
                  )}
                  {it.service_reference_no && <p>Ref: {it.service_reference_no}</p>}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="mt-2 space-y-1 border-b border-dashed border-black pb-2 text-[10px] text-black">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>{formatCurrency(invoice.discount_total, currency)}</span>
          </div>
          <div className="flex justify-between text-[12px] font-black">
            <span>Grand total</span>
            <span>{formatCurrency(invoice.grand_total, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid</span>
            <span>{formatCurrency(invoice.amount_paid, currency)}</span>
          </div>
          {hasChangeDue && (
            <>
              <div className="flex justify-between">
                <span>Tendered</span>
                <span>{formatCurrency(invoice.amount_tendered, currency)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Change</span>
                <span>{formatCurrency(invoice.change_due, currency)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold">
            <span>Balance</span>
            <span>{formatCurrency(invoice.balance_due, currency)}</span>
          </div>
        </section>

        {invoice.payments.length > 0 && (
          <section className="mt-2 text-[10px] text-black">
            <p className="font-black uppercase">Payments</p>
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex justify-between gap-2">
                <span>{PAYMENT_LABELS[p.method] ?? p.method}{p.reference_no ? ` / ${p.reference_no}` : ""}</span>
                <span>{formatCurrency(p.amount, currency)}</span>
              </div>
            ))}
          </section>
        )}

        {invoice.note && (
          <section className="mt-2 text-[9px] text-black">
            <p className="font-bold">Note</p>
            <p>{invoice.note}</p>
          </section>
        )}

        <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px] leading-tight text-black">
          <p>{branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}</p>
          {mapLinkUrl && branding.invoiceShowLocationQr && (
            <p className="mt-1 break-words">Location: {mapLinkUrl}</p>
          )}
        </footer>
      </article>
    </AppShell>
  );
}
