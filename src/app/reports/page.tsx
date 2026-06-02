import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  Boxes,
  CalendarCheck,
  CircleDollarSign,
  Coins,
  CreditCard,
  ReceiptText,
  RotateCcw,
  Scale,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewReportsNew } from "@/lib/staff-permissions";
import { getReportsData } from "@/lib/data/reports";
import { getBrandingSettings } from "@/lib/data/settings";
import {
  listSuppliersWithBalances,
  supplierPurchaseCounts,
} from "@/lib/data/supplier-purchases";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { PrintButton } from "./print-button";

type SearchParams = {
  range?: string;
  startDate?: string;
  endDate?: string;
};

function fmtDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function getRangeDates(range: string, customStart?: string, customEnd?: string) {
  const today = new Date();

  const formatLocal = (d: Date) => {
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  };

  let start = formatLocal(today);
  let end = formatLocal(today);

  switch (range) {
    case "today":
      start = formatLocal(today);
      end = formatLocal(today);
      break;
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      start = formatLocal(yesterday);
      end = formatLocal(yesterday);
      break;
    }
    case "this_week": {
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(today);
      monday.setDate(diff);
      start = formatLocal(monday);
      end = formatLocal(today);
      break;
    }
    case "this_month": {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatLocal(firstDay);
      end = formatLocal(today);
      break;
    }
    case "last_month": {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      start = formatLocal(firstDayLastMonth);
      end = formatLocal(lastDayLastMonth);
      break;
    }
    case "custom":
      if (customStart) start = customStart;
      if (customEnd) end = customEnd;
      break;
    default: {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatLocal(firstDay);
      end = formatLocal(today);
      break;
    }
  }

  return { start, end };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, profile, organization, branch } = await getCurrentContext();

  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  // Enforce access control permissions: Cashier and Technician must be redirected
  if (!(await canViewReportsNew(profile))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const range = params.range ?? "this_month";
  const { start, end } = getRangeDates(range, params.startDate, params.endDate);

  const orgId = profile.organization_id;
  const branchId = profile.branch_id ?? null;
  const currency = organization?.currency_code ?? "PKR";

  const [data, branding, supplierBalances, purchaseCounts] = await Promise.all([
    getReportsData(orgId, branchId, start, end),
    getBrandingSettings(orgId, branchId),
    listSuppliersWithBalances(orgId),
    supplierPurchaseCounts(orgId),
  ]);
  const totalSupplierDues = supplierBalances.reduce((s, x) => s + x.outstanding_balance, 0);
  const topSupplierDues = supplierBalances
    .filter((s) => s.outstanding_balance > 0)
    .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
    .slice(0, 5);

  const quickRanges = [
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
  ];

  return (
    <AppShell pageTitle="Reports">
      {/* CSS overrides for print view */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, header, sidebar, .print\\:hidden, button, form {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .shadow-sm {
            box-shadow: none !important;
          }
          .border {
            border-color: #cbd5e1 !important;
          }
        }
      ` }} />

      {/* Header and Controls */}
      <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">Management Reports</h2>
          <p className="mt-1 text-sm text-slate-500">
            Branch: <strong>{branch?.name ?? "All Branches"}</strong> · Range: {fmtDay(start)} to {fmtDay(end)}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Date Filters Form */}
      <form
        action="/reports"
        method="GET"
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden"
      >
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {quickRanges.map((qr) => (
              <Link
                key={qr.value}
                href={`/reports?range=${qr.value}`}
                className={`min-h-10 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  range === qr.value
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {qr.label}
              </Link>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="range" value="custom" />
            <label className="block min-w-0 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Start Date
              </span>
              <input
                type="date"
                name="startDate"
                defaultValue={start}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-600"
              />
            </label>
            <label className="block min-w-0 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                End Date
              </span>
              <input
                type="date"
                name="endDate"
                defaultValue={end}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-600"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </form>

      {/* Corporate Letterhead for print only */}
      <div className="hidden print:block border-b-2 border-slate-950 pb-4 mb-6 text-left">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">{branding.shopName || organization?.name || "Gadget Zone Online POS"}</h1>
            <p className="text-sm font-semibold text-slate-600">Branch: {branding.branchName || branch?.name || "All Branches"}</p>
            {(branding.branchAddress || branding.address) && (
              <p className="text-xs text-slate-500">{branding.branchAddress || branding.address}</p>
            )}
            {(branding.branchPhone || branding.phone) && (
              <p className="text-xs text-slate-500">Phone: {branding.branchPhone || branding.phone}</p>
            )}
          </div>
          {branding.logoUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoUrl}
                alt={`${branding.shopName} logo`}
                className="h-16 w-auto max-w-[120px] object-contain"
              />
            </>
          )}
        </div>
        <p className="text-sm text-slate-500">Report Date Range: {fmtDay(start)} to {fmtDay(end)}</p>
        <p className="text-xs text-slate-400 mt-1">Generated: {new Date().toLocaleString()}</p>
      </div>

      {/* Primary Financial Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Gross sales"
          value={formatCurrency(data.sales.grossSales, currency)}
          detail={`${formatNumber(data.sales.invoiceCount)} active invoice${data.sales.invoiceCount === 1 ? "" : "s"}.`}
          icon={<ReceiptText className="size-5" />}
        />
        <StatCard
          label="Net Sales (Revenue)"
          value={formatCurrency(data.profit.salesRevenue, currency)}
          detail="Total sales after discounts, before cost deductions."
          icon={<CircleDollarSign className="size-5" />}
        />
        {/* Highlighted Net Profit Card for wow factor */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-5 shadow-md flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Estimated Net Profit</p>
            <p className="mt-2 text-3xl font-black text-emerald-950">
              {formatCurrency(data.profit.estimatedNetProfit, currency)}
            </p>
            <p className="mt-3 text-xs font-semibold text-emerald-700 leading-5">
              Gross Profit ({formatCurrency(data.profit.grossProfit, currency)}) − Expenses ({formatCurrency(data.expenses.totalExpenses, currency)}) − Refunds ({formatCurrency(data.returns.refundTotal, currency)})
            </p>
          </div>
          <div className="rounded-xl bg-emerald-500 p-3 text-white">
            <TrendingUp className="size-6" />
          </div>
        </div>
      </div>

      {/* Secondary Performance Stat Cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Gross Profit Margin"
          value={`${formatNumber(data.profit.grossMarginPercent)}%`}
          detail={`Asset Cost of Sales: ${formatCurrency(data.profit.productCost, currency)}`}
          icon={<Coins className="size-5" />}
        />
        <StatCard
          label="Service Revenue / Profit"
          value={formatCurrency(data.profit.serviceProfit, currency)}
          detail="Service billing total (assumes zero inventory cost)."
          icon={<Award className="size-5" />}
        />
        <StatCard
          label="Total Operating Expenses"
          value={formatCurrency(data.expenses.totalExpenses, currency)}
          detail="From active business expenses registry."
          icon={<Wallet className="size-5" />}
        />
      </div>

      {/* Main Breakdown Grids */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Sales & Profit Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <TrendingUp className="size-5 text-blue-600" />
            Profitability Summary
          </h3>
          <p className="text-xs text-slate-500 mt-1">Direct margins on product trade and service delivery.</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-semibold text-slate-600">Sales Revenue (Net Sales)</span>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(data.profit.salesRevenue, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-semibold text-slate-600">Product Cost of Sales (FIFO/Lots)</span>
              <span className="text-sm font-bold text-red-700">-{formatCurrency(data.profit.productCost, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-black text-slate-900">Gross Profit (Product Trade)</span>
              <span className="text-sm font-black text-emerald-700">{formatCurrency(data.profit.grossProfit, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-semibold text-slate-600">Service Commissions (Shop Income)</span>
              <span className="text-sm font-bold text-slate-900">+{formatCurrency(data.profit.serviceProfit, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 rounded-lg border-b border-slate-100 bg-slate-50/50 px-2 py-2 italic text-slate-500">
              <span className="text-xs font-semibold">Service Principal Handled (Pass-through)</span>
              <span className="text-xs font-semibold">{formatCurrency(data.profit.servicePrincipalHandled, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-semibold text-slate-600">Total Operating Expenses</span>
              <span className="text-sm font-bold text-red-700">-{formatCurrency(data.expenses.totalExpenses, currency)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
              <span className="text-sm font-semibold text-slate-600">Refund/Return Outflow Impact</span>
              <span className="text-sm font-bold text-red-700">-{formatCurrency(data.returns.refundTotal, currency)}</span>
            </div>
            {data.profit.creditWriteOffs > 0 && (
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
                <span className="text-sm font-semibold text-slate-600">Credit Write-offs / Bad Debt</span>
                <span className="text-sm font-bold text-rose-700">-{formatCurrency(data.profit.creditWriteOffs, currency)}</span>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t-2 border-dashed border-slate-200 pt-2">
              <span className="text-base font-black text-slate-950">Estimated Net Profit</span>
              <span className="text-base font-black text-emerald-800">{formatCurrency(data.profit.estimatedNetProfit, currency)}</span>
            </div>
          </div>
        </section>

        {/* Payment Summary Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <CreditCard className="size-5 text-blue-600" />
            Payment Methods Breakdown
          </h3>
          <p className="text-xs text-slate-500 mt-1">Sales revenue splits by cash drawer and digital rails.</p>
          <div className="mt-4 space-y-4">
            {[
              { label: "Cash Drawer", value: data.payments.cash },
              { label: "Credit Card Terminal", value: data.payments.card },
              { label: "EasyPaisa", value: data.payments.easypaisa },
              { label: "JazzCash", value: data.payments.jazzcash },
              { label: "Bank Transfer", value: data.payments.bank_transfer },
              { label: "Customer Ledger (Outstanding Credit)", value: data.payments.customer_credit, isCredit: true },
            ].map((method) => {
              const sharePercent = data.payments.total > 0 ? (method.value / data.payments.total) * 100 : 0;
              return (
                <div key={method.label}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-700">{method.label}</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(method.value, currency)}
                      <span className="text-xs font-semibold text-slate-400 ml-1">({formatNumber(sharePercent)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${method.isCredit ? "bg-slate-500" : "bg-blue-600"}`}
                      style={{ width: `${sharePercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black">
              <span>Total Reconciled Methods</span>
              <span>{formatCurrency(data.payments.total, currency)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Details Tables Grid */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Expenses Summary */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Wallet className="size-5 text-blue-600" />
            Operating Expenses Breakdown
          </h3>
          <p className="text-xs text-slate-500 mt-1">Summary of active expenditures during this cycle.</p>
          {data.expenses.expensesByCategory.length === 0 ? (
            <div className="mt-8 text-center text-sm text-slate-400 py-6">No expenses logged in this range.</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Category</h4>
                <div className="space-y-2">
                  {data.expenses.expensesByCategory.map((c) => (
                    <div key={c.category} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                      <span className="text-slate-600 font-semibold">{c.category}</span>
                      <span className="font-bold text-slate-950">{formatCurrency(c.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Payment Method</h4>
                <div className="space-y-2">
                  {data.expenses.expensesByPaymentMethod.map((m) => (
                    <div key={m.method} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                      <span className="text-slate-600 font-semibold capitalize">{m.method}</span>
                      <span className="font-bold text-slate-950">{formatCurrency(m.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Returns & Refunds */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <RotateCcw className="size-5 text-blue-600" />
            Returns & Refunds Summary
          </h3>
          <p className="text-xs text-slate-500 mt-1">Returned merchandise statistics and cash refunds.</p>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Return Tickets</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(data.returns.returnCount)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Returned Units</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(data.returns.returnedProductQty)}</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Refund Methods Issued</h4>
              {data.returns.refundsByMethod.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
                  No refunds processed.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.returns.refundsByMethod.map((rm) => (
                    <div key={rm.method} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                      <span className="text-slate-600 font-semibold capitalize">{rm.method}</span>
                      <span className="font-bold text-red-600">-{formatCurrency(rm.amount, currency)}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-sm font-black">
                    <span>Total Cash/Credit Refunded</span>
                    <span className="text-red-700">{formatCurrency(data.returns.refundTotal, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Customer Ledger & Top Performers */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Customer Ledger */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Scale className="size-5 text-blue-600" />
            Customer Outstanding Ledger
          </h3>
          <p className="text-xs text-slate-500 mt-1">Outstanding debt books and settlement recovery cycles.</p>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Debtor Accounts</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(data.ledger.debtorCount)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ledger Debt Settlements</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">+{formatCurrency(data.ledger.creditPaymentsReceived, currency)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Credit Write-offs</p>
                <p className="mt-1 text-2xl font-black text-rose-900">{formatCurrency(data.ledger.creditWriteOffs, currency)}</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Debt Outstanding Profiles</h4>
              {data.ledger.topDebtors.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
                  No active debtors on ledger.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.ledger.topDebtors.map((d) => (
                    <div key={d.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-slate-800">{d.name}</p>
                        <p className="text-xs text-slate-400">{d.phone ?? "No phone"}</p>
                      </div>
                      <span className="font-bold text-slate-950">{formatCurrency(d.balance, currency)}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 text-sm font-black">
                    <span>Total Debts Outstanding</span>
                    <span className="text-slate-950">{formatCurrency(data.ledger.totalOutstandingBalance, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Top Performers */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Award className="size-5 text-blue-600" />
            Top Performing Catalog Lines
          </h3>
          <p className="text-xs text-slate-500 mt-1">High volume units, top revenues, and service commissions.</p>
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Products by Quantity Sold</h4>
              {data.topItems.topProductsQty.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No physical products sold.</p>
              ) : (
                <div className="space-y-2">
                  {data.topItems.topProductsQty.map((item) => (
                    <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1 text-sm">
                      <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                      <span className="font-bold text-slate-900">{formatNumber(item.quantity)} units <span className="ml-1 text-xs font-normal text-slate-400">({formatCurrency(item.revenue, currency)})</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Services by Commission Revenue</h4>
              {data.topItems.topServicesRevenue.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No service commissions recorded.</p>
              ) : (
                <div className="space-y-2">
                  {data.topItems.topServicesRevenue.map((item) => (
                    <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1 text-sm">
                      <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                      <span className="font-bold text-emerald-800">+{formatCurrency(item.revenue, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Service Transactions Breakdown */}
      <section id="service-transactions" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
        <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
          <Award className="size-5 text-blue-600" />
          Service Transactions
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Mobile load, EasyPaisa, JazzCash, bank transfers, bill payments.
          <strong className="ml-1 font-semibold text-slate-700">Principal is pass-through, commission is shop income.</strong>
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transactions</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(data.services.transactionCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Commission earned</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{formatCurrency(data.services.commissionEarned, currency)}</p>
            <p className="mt-1 text-[10px] text-emerald-700">Counts toward profit.</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Principal handled</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(data.services.principalHandled, currency)}</p>
            <p className="mt-1 text-[10px] text-slate-500">Pass-through (NOT profit).</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total charged</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(data.services.totalCharged, currency)}</p>
            <p className="mt-1 text-[10px] text-slate-500">Customer-facing total.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Provider</h4>
            {data.services.byProvider.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No service transactions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Provider</th>
                      <th className="py-2 text-right">Txns</th>
                      <th className="py-2 text-right">Principal</th>
                      <th className="py-2 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.byProvider.map((row) => (
                      <tr key={row.provider} className="border-b border-slate-50">
                        <td className="py-2 font-semibold text-slate-800">{row.provider}</td>
                        <td className="py-2 text-right text-slate-700">{formatNumber(row.count)}</td>
                        <td className="py-2 text-right text-slate-700">{formatCurrency(row.principal, currency)}</td>
                        <td className="py-2 text-right font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Direction / Type</h4>
            {data.services.byDirection.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No service transactions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Direction</th>
                      <th className="py-2 text-right">Txns</th>
                      <th className="py-2 text-right">Principal</th>
                      <th className="py-2 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.byDirection.map((row) => (
                      <tr key={row.direction} className="border-b border-slate-50">
                        <td className="py-2 font-semibold text-slate-800 capitalize">{row.direction.replace(/_/g, " ")}</td>
                        <td className="py-2 text-right text-slate-700">{formatNumber(row.count)}</td>
                        <td className="py-2 text-right text-slate-700">{formatCurrency(row.principal, currency)}</td>
                        <td className="py-2 text-right font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Loss Prevention */}
      <section id="loss-prevention" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
        <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
          <Award className="size-5 text-red-600" />
          Loss Prevention
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Below-cost sales completed under admin override during this date range.
          Standard checkouts that would have lost money are blocked entirely.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Below-cost sales (overrides used)</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(data.lossPrevention.belowCostSaleCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Total loss amount</p>
            <p className="mt-1 text-2xl font-black text-red-900">{formatCurrency(data.lossPrevention.totalLossAmount, currency)}</p>
            <p className="mt-1 text-[10px] text-red-700">FIFO cost − effective revenue.</p>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Recent overrides</h4>
          {data.lossPrevention.recent.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No below-cost sales in this period. Loss prevention is doing its job.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Invoice</th>
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Loss</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lossPrevention.recent.map((r, i) => (
                    <tr key={`${r.invoice_no}-${i}`} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">{new Date(r.created_at).toLocaleDateString("en-PK")}</td>
                      <td className="py-2 font-semibold text-slate-800">{r.invoice_no}</td>
                      <td className="py-2 text-slate-700">{r.product_name}</td>
                      <td className="py-2 text-right font-bold text-red-700">{formatCurrency(r.loss_amount, currency)}</td>
                      <td className="py-2 text-slate-600">{r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* FIFO Stock Valuation & Daily Closings Audit */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Stock Valuation */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Boxes className="size-5 text-blue-600" />
            FIFO Stock Lots Valuation
          </h3>
          <p className="text-xs text-slate-500 mt-1">Capital stock valuation computed at lot purchase cost.</p>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Physical Catalog Lines</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(data.inventory.activeProductCount)}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Active Asset Value</p>
                <p className="mt-1 text-2xl font-black text-emerald-950">{formatCurrency(data.inventory.stockValuation, currency)}</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Valuable Stock Concentrates</h4>
              {data.inventory.topStockValueProducts.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No products in stock.</p>
              ) : (
                <div className="space-y-2">
                  {data.inventory.topStockValueProducts.map((item) => (
                    <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                      <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                      <span className="font-bold text-slate-900">{formatCurrency(item.cost_value, currency)} <span className="ml-1 text-xs font-normal text-slate-400">({formatNumber(item.quantity)} units)</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Out of Stock Warnings</h4>
                {data.inventory.outOfStockProducts.length === 0 ? (
                  <p className="text-xs text-slate-400">Zero critical gaps.</p>
                ) : (
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 max-h-[120px] overflow-y-auto">
                    {data.inventory.outOfStockProducts.slice(0, 5).map((p) => (
                      <li key={p.name} className="truncate">{p.name}</li>
                    ))}
                    {data.inventory.outOfStockProducts.length > 5 && <li className="text-slate-400">+ {data.inventory.outOfStockProducts.length - 5} more</li>}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Low Stock Warnings</h4>
                {data.inventory.lowStockProducts.length === 0 ? (
                  <p className="text-xs text-slate-400">All levels optimal.</p>
                ) : (
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 max-h-[120px] overflow-y-auto">
                    {data.inventory.lowStockProducts.slice(0, 5).map((p) => (
                      <li key={p.name} className="truncate">{p.name} (have {p.current_stock})</li>
                    ))}
                    {data.inventory.lowStockProducts.length > 5 && <li className="text-slate-400">+ {data.inventory.lowStockProducts.length - 5} more</li>}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Daily Closings Audit */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            <CalendarCheck className="size-5 text-blue-600" />
            Daily closings Auditor
          </h3>
          <p className="text-xs text-slate-500 mt-1">Audit status of business days and physical cash discrepancies.</p>
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Closed Days</p>
                <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(data.closing.closedDaysCount)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Days</p>
                <p className="mt-1 text-xl font-black text-amber-800">{formatNumber(data.closing.openDaysCount)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Drawer Diff</p>
                <p className={`mt-1 text-xl font-black ${data.closing.totalCashDifference === 0 ? "text-slate-500" : data.closing.totalCashDifference > 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {formatCurrency(data.closing.totalCashDifference, currency)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Recent Reconciled days</h4>
              {data.closing.recentClosings.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
                  No daily closing logs compiled.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 font-semibold text-slate-500 uppercase">
                        <th className="py-2">Date</th>
                        <th className="py-2 text-right">Bills</th>
                        <th className="py-2 text-right">Expected Cash</th>
                        <th className="py-2 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.closing.recentClosings.map((c) => (
                        <tr key={c.date} className="border-b border-slate-50 py-1">
                          <td className="py-2 font-semibold text-slate-800">{fmtDay(c.date)}</td>
                          <td className="py-2 text-right font-medium text-slate-900">{formatNumber(c.bills_count)}</td>
                          <td className="py-2 text-right font-medium text-slate-900">{formatCurrency(c.expected, currency)}</td>
                          <td className={`py-2 text-right font-bold ${c.difference === 0 ? "text-slate-500" : c.difference > 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {c.difference > 0 ? "+" : ""}{formatCurrency(c.difference, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Supplier Dues & Purchases Snapshot */}
      <section id="supplier-dues" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
        <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
          <Truck className="size-5 text-blue-600" />
          Supplier Dues & Purchases Snapshot
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Stock purchases create inventory value (not expenses). Dues are settled via supplier payments.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Purchases this month</p>
            <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(purchaseCounts.monthTotal, currency)}</p>
            <p className="text-xs text-slate-500">{formatNumber(purchaseCounts.monthCount)} purchase(s)</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
            <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Unpaid purchases</p>
            <p className="mt-1 text-xl font-black text-rose-900">{formatCurrency(purchaseCounts.unpaidTotal, currency)}</p>
            <p className="text-xs text-rose-600">{formatNumber(purchaseCounts.unpaidCount)} purchase(s) with balance</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Total supplier dues</p>
            <p className="mt-1 text-xl font-black text-amber-900">{formatCurrency(totalSupplierDues, currency)}</p>
            <p className="text-xs text-amber-700">{topSupplierDues.length} supplier(s) owed</p>
          </div>
        </div>

        {topSupplierDues.length > 0 && (
          <div className="mt-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top dues</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
                    <th className="py-2">Supplier</th>
                    <th className="py-2 text-right">Outstanding</th>
                    <th className="py-2 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {topSupplierDues.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2 font-semibold text-slate-800">
                        {s.name}
                        {s.company ? <span className="ml-2 text-xs text-slate-500">{s.company}</span> : null}
                      </td>
                      <td className="py-2 text-right font-bold text-rose-700">
                        {formatCurrency(s.outstanding_balance, currency)}
                      </td>
                      <td className="py-2 text-right">
                        <Link href={`/suppliers/${s.id}/ledger`} className="text-xs font-semibold text-blue-700 underline">
                          Ledger
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
