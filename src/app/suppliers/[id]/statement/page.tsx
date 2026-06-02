import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import { env } from "@/lib/env";
import {
  listSupplierLedger,
  getSupplierLedgerOpeningBalance,
} from "@/lib/data/supplier-purchases";
import { getBrandingSettings } from "@/lib/data/settings";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/formatters";
import { PrintButton } from "./print-button";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtDateFull(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ninetyDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

type SearchParams = {
  from?: string;
  to?: string;
};

export default async function SupplierStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  if (!canManageSupplierPurchases(profile?.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const sp = await searchParams;
  const orgId = profile.organization_id;

  const supabase = await createClient();
  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id, name, company, phone, email, address, outstanding_balance, is_active")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (supErr) throw new Error(supErr.message);
  if (!supplier) notFound();

  const [branding] = await Promise.all([
    getBrandingSettings(orgId, profile.branch_id),
  ]);

  const currency = branding.currencyCode || organization?.currency_code || "PKR";
  const orgName = branding.shopName || organization?.name || "Gadget Zone";
  const branchName = branding.branchName || "Main Branch";
  const branchPhone = branding.branchPhone || branding.phone;
  const branchAddress = branding.branchAddress || branding.address;

  const fromDate = sp.from || ninetyDaysAgoISO();
  const toDate = sp.to || todayISO();
  const fromStr = `${fromDate}T00:00:00`;
  const toStr = `${toDate}T23:59:59`;

  const [allEntries, openingBalance] = await Promise.all([
    listSupplierLedger(orgId, id, { from: fromStr, to: toStr }),
    getSupplierLedgerOpeningBalance(orgId, id, fromStr),
  ]);

  const entries = [...allEntries].reverse();

  let totalPurchases = 0;
  let totalPayments = 0;
  for (const e of entries) {
    if (e.entry_type === "purchase_credit" && e.direction === "credit") {
      totalPurchases += e.amount;
    } else if (e.entry_type === "payment_debit" && e.direction === "debit") {
      totalPayments += e.amount;
    } else if (e.entry_type === "adjustment") {
      if (e.direction === "credit") totalPurchases += e.amount;
      else totalPayments += e.amount;
    }
  }

  const closingBalance = Number(supplier.outstanding_balance ?? 0);

  const periodLabel =
    fromDate === toDate
      ? fmtDate(fromStr)
      : `${fmtDate(fromStr)} — ${fmtDate(toStr)}`;

  const DEFAULT_LOGO = "/saledock-logo-full.png";
  function hasShoLogo(logoUrl: string) {
    return Boolean(logoUrl) && logoUrl !== DEFAULT_LOGO;
  }
  const showLogo = hasShoLogo(branding.logoUrl);

  const whatsappMessage = [
    `*Supplier Statement*`,
    `${supplier.name}${supplier.company ? ` (${supplier.company})` : ""}`,
    `Period: ${periodLabel}`,
    ``,
    `Opening Balance: ${formatCurrency(openingBalance, currency)}`,
    `Total Purchases: ${formatCurrency(totalPurchases, currency)}`,
    `Total Payments: ${formatCurrency(totalPayments, currency)}`,
    `Closing Balance: ${formatCurrency(closingBalance, currency)}`,
    ``,
    `${orgName} — ${branchName}`,
  ].join("\n");
  const whatsappHref = whatsappLink(supplier.phone, whatsappMessage);

  return (
    <AppShell pageTitle={`Statement: ${supplier.name}`}>
      <div className="print-hidden mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/suppliers/${id}/ledger`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400"
        >
          &larr; Back to ledger
        </Link>
        <PrintButton whatsappHref={whatsappHref} />
      </div>

      <article className="a4-print mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:max-w-none print:border-0 print:shadow-none">
        <header className="border-b border-slate-200 px-6 py-6 dark:border-slate-800 sm:px-8 sm:py-8 print:px-0 print:py-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
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
            <div className="sm:text-right">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                Supplier Statement
              </p>
              <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 print:text-slate-900">
                {supplier.name}
              </h1>
              {supplier.company && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{supplier.company}</p>
              )}
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{periodLabel}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 px-6 py-5 dark:border-slate-800 sm:grid-cols-2 sm:px-8 print:px-0 print:py-4">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Supplier
            </p>
            <div className="space-y-0.5">
              <p className="font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                {supplier.name}
              </p>
              {supplier.company && (
                <p className="text-sm text-slate-600 dark:text-slate-400">{supplier.company}</p>
              )}
              {supplier.phone && (
                <p className="text-sm text-slate-600 dark:text-slate-400">Phone: {supplier.phone}</p>
              )}
              {supplier.email && (
                <p className="text-sm text-slate-600 dark:text-slate-400">Email: {supplier.email}</p>
              )}
              {supplier.address && (
                <p className="text-sm text-slate-600 dark:text-slate-400">{supplier.address}</p>
              )}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
              Summary
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-4 sm:justify-end">
                <span className="text-slate-500 dark:text-slate-400">Opening balance</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
                  {formatCurrency(openingBalance, currency)}
                </span>
              </div>
              <div className="flex justify-between gap-4 sm:justify-end">
                <span className="text-slate-500 dark:text-slate-400">Total purchases</span>
                <span className="font-semibold text-rose-700">{formatCurrency(totalPurchases, currency)}</span>
              </div>
              <div className="flex justify-between gap-4 sm:justify-end">
                <span className="text-slate-500 dark:text-slate-400">Total payments</span>
                <span className="font-semibold text-emerald-700">{formatCurrency(totalPayments, currency)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-slate-700 sm:justify-end">
                <span className="font-bold text-slate-800 dark:text-slate-200">Closing balance</span>
                <span className={`font-black ${closingBalance > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatCurrency(closingBalance, currency)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {entries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-600">No entries in this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto px-6 py-5 sm:px-8 print:px-0 print:py-4">
            <table className="w-full min-w-[640px] text-left text-sm print:min-w-0">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                  <th className="pb-3 pr-3">Date</th>
                  <th className="pb-3 px-2">Type</th>
                  <th className="pb-3 px-2">Reference</th>
                  <th className="pb-3 px-2 text-right">Credit</th>
                  <th className="pb-3 px-2 text-right">Debit</th>
                  <th className="pb-3 pl-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-3 pr-3 text-xs italic text-slate-400">Before {fmtDate(fromStr)}</td>
                  <td className="py-3 px-2" colSpan={3} />
                  <td className="py-3 px-2" />
                  <td className="py-3 pl-3 text-right font-semibold text-slate-700">
                    {formatCurrency(openingBalance, currency)}
                  </td>
                </tr>
                {entries.map((e) => {
                  const typeLabel =
                    e.entry_type === "purchase_credit"
                      ? "Purchase"
                      : e.entry_type === "payment_debit"
                        ? "Payment"
                        : "Adjustment";
                  const ref = e.reference_number ?? "—";
                  const isCredit = e.direction === "credit";
                  const isDebit = e.direction === "debit";
                  return (
                    <tr key={e.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                      <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">{fmtDateFull(e.created_at)}</td>
                      <td className="py-3 px-2 text-xs uppercase text-slate-500">{typeLabel}</td>
                      <td className="py-3 px-2 text-xs text-slate-600 dark:text-slate-400">
                        {e.purchase_id ? (
                          <Link
                            href={`/suppliers/purchases/${e.purchase_id}`}
                            className="font-semibold text-blue-700 underline dark:text-blue-400"
                          >
                            {ref}
                          </Link>
                        ) : (
                          ref
                        )}
                      </td>
                      <td className="py-3 px-2 text-right text-rose-700 tabular-nums">
                        {isCredit ? formatCurrency(e.amount, currency) : "—"}
                      </td>
                      <td className="py-3 px-2 text-right text-emerald-700 tabular-nums">
                        {isDebit ? formatCurrency(e.amount, currency) : "—"}
                      </td>
                      <td className="py-3 pl-3 text-right font-bold text-slate-900 tabular-nums dark:text-slate-100 print:text-slate-900">
                        {formatCurrency(e.balance_after, currency)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                  <td className="py-3 pr-3 font-bold text-slate-900 dark:text-slate-100">Closing balance</td>
                  <td className="py-3 px-2" colSpan={3} />
                  <td className="py-3 px-2" />
                  <td className={`py-3 pl-3 text-right font-black tabular-nums ${closingBalance > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {formatCurrency(closingBalance, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <footer className="border-t border-slate-200 px-6 py-5 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500 print:px-0">
          {branding.invoiceFooter || `Thank you for your business.`}
        </footer>
      </article>

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
        </header>

        <div className="my-2 border-y border-dashed border-black py-1 text-[10px] text-black">
          <div className="flex justify-between gap-2">
            <span>Statement</span>
            <strong>{supplier.name}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>Period</span>
            <span className="text-right">{periodLabel}</span>
          </div>
          {supplier.company && (
            <div className="flex justify-between gap-2">
              <span>Company</span>
              <span>{supplier.company}</span>
            </div>
          )}
          {supplier.phone && (
            <div className="flex justify-between gap-2">
              <span>Phone</span>
              <span>{supplier.phone}</span>
            </div>
          )}
        </div>

        <section className="text-[10px] text-black">
          <div className="flex justify-between border-b border-dashed border-black pb-1 font-bold">
            <span>Opening balance</span>
            <span>{formatCurrency(openingBalance, currency)}</span>
          </div>
          {entries.length === 0 ? (
            <p className="py-2 text-center text-[9px] text-slate-500">No entries in this period.</p>
          ) : (
            <>
              {entries.map((e) => {
                const typeLabel =
                  e.entry_type === "purchase_credit"
                    ? "Purchase"
                    : e.entry_type === "payment_debit"
                      ? "Payment"
                      : "Adjustment";
                const isCredit = e.direction === "credit";
                const isDebit = e.direction === "debit";
                return (
                  <div key={e.id} className="border-b border-dashed border-slate-400 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold leading-tight text-black">{typeLabel}</span>
                      <span className="tabular-nums">{e.reference_number ?? ""}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[9px]">{fmtDate(e.created_at)}</span>
                      <span className="tabular-nums">
                        {isCredit ? `+ ${formatCurrency(e.amount, currency)}` : isDebit ? `- ${formatCurrency(e.amount, currency)}` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-[9px]">
                      <span>Balance</span>
                      <span className="tabular-nums font-semibold">{formatCurrency(e.balance_after, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </section>

        <section className="mt-2 space-y-1 border-t border-dashed border-black pt-2 text-[11px] font-bold text-black">
          <div className="flex justify-between">
            <span>Total purchases</span>
            <span className="tabular-nums">{formatCurrency(totalPurchases, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total payments</span>
            <span className="tabular-nums">{formatCurrency(totalPayments, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-dashed border-black pt-1 text-[13px] font-black">
            <span>Closing balance</span>
            <span className="tabular-nums">{formatCurrency(closingBalance, currency)}</span>
          </div>
        </section>

        <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px] leading-tight text-black">
          <p>{branding.invoiceFooter || `Thank you for your business.`}</p>
        </footer>
      </article>
    </AppShell>
  );
}
