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
import { QrCodeImage } from "@/components/shared/qr-code";
import { buildMapEmbedUrl, buildMapLinkUrl, hasMapData } from "@/lib/map-utils";

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

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}


function hasServiceSplit(item: { service_transaction_amount: number; service_commission: number; service_total_charged: number }) {
  return item.service_transaction_amount > 0 || item.service_commission > 0 || item.service_total_charged > 0;
}

const DEFAULT_LOGO = "/saledock-logo-full.png";

function statusBadgeClass(status: string) {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "partial": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "unpaid": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "void": return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
  }
}

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
        invoiceShowLocationMap: false,
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

  const showInvoiceMap = branding.invoiceShowLocationMap && hasMapData(branding.googleMapsUrl, branding.latitude, branding.longitude);
  const showInvoiceQr = branding.invoiceShowLocationQr && hasMapData(branding.googleMapsUrl, branding.latitude, branding.longitude);
  const mapLinkUrl = buildMapLinkUrl(branding.googleMapsUrl, branding.latitude, branding.longitude);
  const mapEmbedUrl = buildMapEmbedUrl(branding.googleMapsUrl, branding.latitude, branding.longitude);

  return (
    <AppShell pageTitle={`Invoice ${invoice.invoice_no}`}>
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
          invoice={invoice}
          shopName={orgName}
        />
      </div>

      {/* ── Invoice document card ── */}
      <article
        id="invoice-print"
        className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:max-w-none print:border-0 print:shadow-none"
      >
        {/* ── Header ── */}
        <header className="border-b border-slate-200 px-6 py-6 dark:border-slate-800 sm:px-8 sm:py-8 print:px-0 print:py-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {/* Left: Logo / Shop name */}
            <div className="min-w-0">
              {showLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={branding.logoUrl}
                  alt={`${orgName} logo`}
                  className="mb-4 h-14 w-auto max-w-[180px] object-contain print:h-12"
                />
              ) : (
                <div className="mb-4">
                  <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 print:text-slate-900">
                    {orgName}
                  </h2>
                </div>
              )}
              <div className="space-y-0.5 text-sm text-slate-600 dark:text-slate-400 print:text-slate-700">
                <p className="font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">
                  {branchName}
                </p>
                {branchAddress && <p>{branchAddress}</p>}
                {branchPhone && <p>{branchPhone}</p>}
                {branding.email && <p className="text-xs">{branding.email}</p>}
              </div>
            </div>
            {/* Right: Invoice meta */}
            <div className="sm:text-right">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                Invoice
              </p>
              <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 print:text-slate-900">
                {invoice.invoice_no}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {fmtDateShort(invoice.invoice_date)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 sm:justify-end">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusBadgeClass(invoice.status)}`}
                >
                  {invoice.status}
                </span>
                {invoice.balance_due > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/30 dark:text-red-400">
                    {formatCurrency(invoice.balance_due, currency)} due
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ── Customer & cashier ── */}
        <section className="grid gap-6 border-b border-slate-200 px-6 py-5 dark:border-slate-800 sm:grid-cols-2 sm:px-8 print:px-0 print:py-4">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Bill to
            </p>
            {invoice.customer ? (
              <div className="space-y-0.5">
                <p className="font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                  <Link
                    href={`/customers/${invoice.customer.id}`}
                    className="text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {invoice.customer.name}
                  </Link>
                </p>
                {invoice.customer.phone && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{invoice.customer.phone}</p>
                )}
                {invoice.customer.address && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{invoice.customer.address}</p>
                )}
              </div>
            ) : (
              <p className="font-semibold text-slate-600 dark:text-slate-400">Walk-in customer</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Salesperson
            </p>
            <p className="font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
              {invoice.cashier_name ?? "\u2014"}
            </p>
            {invoice.customer && invoice.balance_due > 0 && (
              <div className="print-hidden mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                <span className="block text-[10px] font-bold uppercase tracking-wide">Outstanding balance</span>
                {formatCurrency(invoice.balance_due, currency)} remaining on this invoice
              </div>
            )}
          </div>
        </section>

        {/* ── Items table (Desktop/Print) ── */}
        <div className="hidden md:block print:block overflow-x-auto px-6 py-5 sm:px-8 print:px-0 print:py-4">
          <table className="w-full min-w-[480px] text-left text-sm print:min-w-0">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <th className="pb-3 pr-3">Item</th>
                <th className="pb-3 px-2 text-right">Qty</th>
                {isPrivileged && (
                  <th className="pb-3 px-2 text-right print-hidden text-slate-400 dark:text-slate-500">Cost</th>
                )}
                <th className="pb-3 px-2 text-right">Unit price</th>
                <th className="pb-3 px-2 text-right">Discount</th>
                <th className="pb-3 pl-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, idx) => (
                <tr key={it.id} className={idx < invoice.items.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}>
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
                      {it.product_name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {it.product_type === "service" ? "Service" : "Product"}
                    </div>
                    {it.product_type === "service" && hasServiceSplit(it) && (
                      <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {it.service_provider && <p>Provider: {it.service_provider}</p>}
                        {it.service_transaction_amount > 0 && (
                          <p>Principal: {formatCurrency(it.service_transaction_amount, currency)}</p>
                        )}
                        {it.service_commission > 0 && (
                          <p>Commission: {formatCurrency(it.service_commission, currency)}</p>
                        )}
                        {it.service_reference_no && <p>Ref: {it.service_reference_no}</p>}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">{it.quantity}</td>
                  {isPrivileged && (
                    <td className="py-3 px-2 text-right print-hidden tabular-nums text-slate-400 dark:text-slate-500">
                      {formatCurrency(it.purchase_price, currency)}
                    </td>
                  )}
                  <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(it.unit_price, currency)}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(it.item_discount, currency)}</td>
                  <td className="py-3 pl-3 text-right tabular-nums font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                    {formatCurrency(it.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Items cards (Mobile only) ── */}
        <div className="md:hidden print:hidden space-y-3 px-6 py-4">
          {invoice.items.map((it) => (
            <div key={it.id} className="rounded-xl border border-slate-100 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div>
                  <h4 className="font-bold text-slate-950 dark:text-slate-50 text-sm leading-tight">
                    {it.product_name}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {it.product_type === "service" ? "Service" : "Product"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500">Qty: {it.quantity}</span>
                </div>
              </div>

              {it.product_type === "service" && hasServiceSplit(it) && (
                <div className="mb-2 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
                  {it.service_provider && <p>Provider: {it.service_provider}</p>}
                  {it.service_transaction_amount > 0 && (
                    <p>Principal: {formatCurrency(it.service_transaction_amount, currency)}</p>
                  )}
                  {it.service_commission > 0 && (
                    <p>Commission: {formatCurrency(it.service_commission, currency)}</p>
                  )}
                  {it.service_reference_no && <p>Ref: {it.service_reference_no}</p>}
                </div>
              )}

              <div className="flex justify-between items-center text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                <div className="space-y-0.5 text-slate-500">
                  <div>
                    Unit Price: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(it.unit_price, currency)}</span>
                  </div>
                  {it.item_discount > 0 && (
                    <div>
                      Discount: <span className="font-semibold text-red-600 dark:text-red-400">-{formatCurrency(it.item_discount, currency)}</span>
                    </div>
                  )}
                  {isPrivileged && (
                    <div className="text-[10px]">
                      Cost: <span>{formatCurrency(it.purchase_price, currency)}</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {formatCurrency(it.line_total, currency)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Totals ── */}
        <section className="border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:px-8 print:px-0 print:pt-4 print:pb-2">
          <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
              <span className="tabular-nums font-medium">{formatCurrency(invoice.subtotal, currency)}</span>
            </div>
            {invoice.discount_total > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Cart discount</span>
                <span className="tabular-nums font-medium text-red-600 dark:text-red-400">
                  &minus;{formatCurrency(invoice.discount_total, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-700">
              <span className="font-bold text-slate-800 dark:text-slate-200">Grand total</span>
              <span className="tabular-nums font-black text-slate-900 dark:text-slate-50 print:text-slate-900">
                {formatCurrency(invoice.grand_total, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Paid</span>
              <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(invoice.amount_paid, currency)}
              </span>
            </div>
            {hasChangeDue && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Tendered</span>
                  <span className="tabular-nums font-semibold">
                    {formatCurrency(invoice.amount_tendered, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Change</span>
                  <span className="tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(invoice.change_due, currency)}
                  </span>
                </div>
              </>
            )}
            {invoice.balance_due > 0 && (
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Balance due</span>
                <span className="tabular-nums font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(invoice.balance_due, currency)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Payments ── */}
        {invoice.payments.length > 0 && (
          <section className="border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:px-8 print:px-0 print:py-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Payment{invoice.payments.length > 1 ? "s" : ""}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {invoice.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {PAYMENT_LABELS[p.method] ?? p.method}
                    </p>
                    {p.reference_no && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{p.reference_no}</p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                    {formatCurrency(p.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Note ── */}
        {invoice.note && (
          <section className="border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:px-8 print:px-0 print:py-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Note
            </p>
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300 print:text-slate-800">
              {invoice.note}
            </p>
          </section>
        )}

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

        {/* ── Location map / QR ── */}
        {(showInvoiceMap || showInvoiceQr) && mapLinkUrl && (
          <section className="border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:px-8 print:px-0 print:py-3">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Find us
            </p>
            <div className={`grid gap-4 ${showInvoiceMap && showInvoiceQr ? "md:grid-cols-[1fr_auto]" : ""}`}>
              {showInvoiceMap && (
                <div className="min-w-0">
                  {mapEmbedUrl ? (
                    <iframe
                      title="Shop location map"
                      src={mapEmbedUrl}
                      className="h-56 w-full rounded-xl border-0 print:hidden"
                      loading="lazy"
                      allowFullScreen
                    />
                  ) : null}
                  <div className={`${mapEmbedUrl ? "mt-2" : ""} text-sm print:text-slate-900`}>
                    <a
                      href={mapLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-400 print:text-slate-900"
                    >
                      Open shop location
                    </a>
                  </div>
                </div>
              )}
              {showInvoiceQr && (
                <div className="flex flex-col items-start gap-2">
                  <QrCodeImage value={mapLinkUrl} size={128} alt="Shop location QR code" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Scan for directions</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="border-t border-slate-200 px-6 py-5 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500 print:px-0">
          {branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}
        </footer>
      </article>

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
          {mapLinkUrl && (branding.invoiceShowLocationMap || branding.invoiceShowLocationQr) && (
            <p className="mt-1 break-words">Location: {mapLinkUrl}</p>
          )}
        </footer>
      </article>
    </AppShell>
  );
}
