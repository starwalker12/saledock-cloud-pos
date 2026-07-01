import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  History,
  Info,
  Layers,
  MapPin,
  Phone,
  Mail,
  User,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import {
  getCustomerDetail,
  listCustomerCreditPayments,
  listCustomerInvoices,
  listCustomerLedger,
} from "@/lib/data/customers";
import { canWriteCatalog } from "@/lib/permissions";
import { listCustomerRepairs } from "@/lib/data/repairs";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { archiveCustomerAction, restoreCustomerAction } from "../actions";
import { SettlementForm } from "./settlement-form";
import { WriteOffForm } from "./write-off-form";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

type SearchParams = {
  tab?: string;
  paystate?: string;
};

export default async function CustomerDetailPage({
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

  const { id } = await params;
  const p = await searchParams;
  const orgId = profile.organization_id;
  const canWrite = canWriteCatalog(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const customer = await getCustomerDetail(id, orgId);
  if (!customer) notFound();

  const [invoices, ledger, payments, repairs] = await Promise.all([
    listCustomerInvoices(id, orgId),
    listCustomerLedger(id, orgId),
    listCustomerCreditPayments(id, orgId),
    listCustomerRepairs(id, orgId),
  ]);

  const activeTab = p.tab ?? "ledger";

  // Calculations for Stats
  const totalPurchased = invoices
    .filter((inv) => inv.status !== "void")
    .reduce((acc, inv) => acc + inv.grand_total, 0);
  const openInvoicesCount = invoices.filter(
    (inv) => inv.status === "unpaid" || inv.status === "partial"
  ).length;

  const isPrivileged = profile.role === "owner" || profile.role === "admin";

  // Credit utilization calculations
  const limit = customer.credit_limit;
  const balance = customer.outstanding_balance;
  const utilizationPercent = limit > 0 ? Math.min(Math.round((balance / limit) * 100), 100) : 0;

  return (
    <AppShell pageTitle={`Customer: ${customer.name}`}>
      <div className="mb-4">
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
          <ArrowLeft className="size-4" /> Back to Customers
        </Link>
      </div>

      {/* Customer Header Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Core Identity Info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <User className="size-7" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">{customer.name}</h2>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {customer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" /> {customer.phone}
                    </span>
                  )}
                  {customer.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3.5" /> {customer.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div>
              {customer.is_archived ? (
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                  Archived
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                  Active
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600 space-y-2">
            {customer.address && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-slate-400" />
                <span>{customer.address}</span>
              </p>
            )}
            {customer.notes && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5">
                <strong>Remarks:</strong> {customer.notes}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href={`/customers?edit=${customer.id}`}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Edit Customer Details
            </Link>
            {canWrite && (
              <>
                {customer.is_archived ? (
                  <form action={restoreCustomerAction}>
                    <input type="hidden" name="id" value={customer.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      Restore Profile
                    </button>
                  </form>
                ) : (
                  <form action={archiveCustomerAction}>
                    <input type="hidden" name="id" value={customer.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                    >
                      Archive Profile
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        {/* Credit Utilization Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Credit utilization</h3>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900">{formatCurrency(balance, currency)}</span>
            <span className="text-sm text-slate-500"> outstanding</span>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Credit Line Limit</span>
              <span className="font-bold text-slate-700">{formatCurrency(limit, currency)}</span>
            </div>
            {limit > 0 ? (
              <>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      utilizationPercent > 80 ? "bg-red-600" : utilizationPercent > 50 ? "bg-amber-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${utilizationPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-[10px] font-bold text-slate-400">
                  {utilizationPercent}% Used
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-slate-50 p-2.5 text-center text-xs text-slate-400">
                No credit limit limit established.
              </div>
            )}
          </div>

          {/* Quick Pay Settlement Action */}
          {canWrite && balance <= 0 && payments.length > 0 && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              Customer balance is fully settled.
            </p>
          )}
          {canWrite && balance > 0 && (
            <div className="mt-4 space-y-3">
              <SettlementForm customerId={customer.id} outstandingBalance={balance} />
              {isPrivileged && (
                <WriteOffForm customerId={customer.id} outstandingBalance={balance} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Customer Stats Cards */}
      <div className="grid gap-4 mt-6 sm:grid-cols-3">
        <StatCard
          label="All-time purchases"
          value={formatCurrency(totalPurchased, currency)}
          detail="Excluding void sales."
          icon={<CreditCard className="size-5" />}
        />
        <StatCard
          label="Open invoices count"
          value={formatNumber(openInvoicesCount)}
          detail="Invoices with pending balance."
          icon={<Layers className="size-5" />}
        />
        <StatCard
          label="Purchase count"
          value={formatNumber(invoices.length)}
          detail="Total historic transactions."
          icon={<History className="size-5" />}
        />
      </div>

      {/* Ledger, Invoice and Settlement History tabs */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-2">
          {[
            { id: "ledger", label: "Ledger", icon: History },
            { id: "invoices", label: "Invoice history", icon: Layers },
            { id: "payments", label: "Settlement history", icon: CreditCard },
            { id: "repairs", label: "Repairs history", icon: Wrench },
          ].map((t) => {
            const active = t.id === activeTab;
            const href = `/customers/${customer.id}?tab=${t.id}`;
            const Icon = t.icon;
            return (
              <Link
                key={t.id}
                href={href}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  active ? "bg-white text-blue-700 shadow" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="size-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-5 sm:p-6">
          {activeTab === "ledger" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800">Double-entry Ledger History</h4>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Info className="size-3.5" /> Chronological transaction audit trail
                </span>
              </div>

              {ledger.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No ledger entries recorded for this customer yet.
                </div>
              ) : (
                <>
                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[700px]">
                      <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
                        <tr>
                          <th className="px-3 py-3">Date</th>
                          <th className="px-3 py-3">Type</th>
                          <th className="px-3 py-3">Description</th>
                          <th className="px-3 py-3">Reference No</th>
                          <th className="px-3 py-3 text-right">Debit (Debt +)</th>
                          <th className="px-3 py-3 text-right">Credit (Debt −)</th>
                          <th className="px-3 py-3 text-right">Balance After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((l) => (
                          <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/55">
                            <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                l.entry_type === "invoice_credit"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : l.entry_type === "credit_payment"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : l.entry_type === "write_off"
                                  ? "bg-rose-50 text-rose-700 border border-rose-100"
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}>
                                {l.entry_type.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-800">
                              {l.description}
                              {l.invoice_no && (
                                <Link href={`/invoices/${l.id}`} className="ml-1 text-xs text-blue-700 hover:underline">
                                  ({l.invoice_no})
                                </Link>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500">{l.reference_number ?? "—"}</td>
                            <td className="px-3 py-3 text-right font-bold text-red-600">
                              {l.direction === "debit" ? formatCurrency(l.amount, currency) : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-emerald-700">
                              {l.direction === "credit" ? formatCurrency(l.amount, currency) : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-black text-slate-900">{formatCurrency(l.balance_after, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile view */}
                  <div className="space-y-2 md:hidden">
                    {ledger.map((l) => (
                      <div key={l.id} className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            l.entry_type === "invoice_credit"
                              ? "bg-red-50 text-red-700 border border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
                              : l.entry_type === "credit_payment"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                              : l.entry_type === "write_off"
                              ? "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
                              : "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50"
                          }`}>
                            {l.entry_type.replace("_", " ")}
                          </span>
                          <span className="text-[11px] text-slate-500">{fmtDate(l.created_at)}</span>
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-1">
                          {l.description}
                          {l.invoice_no && (
                            <Link href={`/invoices/${l.id}`} className="ml-1 text-xs text-blue-700 dark:text-blue-400 hover:underline">
                              ({l.invoice_no})
                            </Link>
                          )}
                        </div>
                        {l.reference_number && (
                          <div className="text-xs text-slate-500 mb-2">
                            Ref: {l.reference_number}
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <div>
                            {l.direction === "debit" ? (
                              <span className="font-bold text-red-600 dark:text-red-400">Debit: {formatCurrency(l.amount, currency)}</span>
                            ) : (
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">Credit: {formatCurrency(l.amount, currency)}</span>
                            )}
                          </div>
                          <div className="text-slate-500">
                            Bal: <span className="font-black text-slate-900 dark:text-slate-100">{formatCurrency(l.balance_after, currency)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800">Invoice Transaction History</h4>

              {invoices.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No invoices created for this customer yet.
                </div>
              ) : (
                <>
                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
                        <tr>
                          <th className="px-3 py-3">Invoice No</th>
                          <th className="px-3 py-3">Date</th>
                          <th className="px-3 py-3 text-right">Grand Total</th>
                          <th className="px-3 py-3 text-right">Amount Paid</th>
                          <th className="px-3 py-3 text-right">Balance Due</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/55">
                            <td className="px-3 py-3 font-bold text-blue-700">
                              <Link href={`/invoices/${inv.id}`} className="hover:underline">{inv.invoice_no}</Link>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatCurrency(inv.grand_total, currency)}</td>
                            <td className="px-3 py-3 text-right text-emerald-700">{formatCurrency(inv.amount_paid, currency)}</td>
                            <td className={`px-3 py-3 text-right font-bold ${inv.balance_due > 0 ? "text-red-600" : "text-slate-500"}`}>
                              {formatCurrency(inv.balance_due, currency)}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                inv.status === "paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : inv.status === "partial"
                                  ? "bg-amber-100 text-amber-800"
                                  : inv.status === "unpaid"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                View invoice
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile view */}
                  <div className="space-y-2 md:hidden">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-2">
                          <Link href={`/invoices/${inv.id}`} className="font-bold text-blue-700 dark:text-blue-400 text-sm hover:underline">
                            {inv.invoice_no}
                          </Link>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                            inv.status === "paid"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : inv.status === "partial"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              : inv.status === "unpaid"
                              ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mb-2">{fmtDate(inv.invoice_date)}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                          <div>
                            <span className="text-slate-500">Total:</span>{" "}
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(inv.grand_total, currency)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Paid:</span>{" "}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(inv.amount_paid, currency)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-slate-100 dark:border-slate-800 text-xs">
                          <div>
                            <span className="text-slate-500">Due:</span>{" "}
                            <span className={`font-bold ${inv.balance_due > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}>
                              {formatCurrency(inv.balance_due, currency)}
                            </span>
                          </div>
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800">Direct Account Settlements</h4>

              {payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No settlements recorded yet.
                </div>
              ) : (
                <>
                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
                        <tr>
                          <th className="px-3 py-3">Date</th>
                          <th className="px-3 py-3 text-right">Amount Settled</th>
                          <th className="px-3 py-3">Method</th>
                          <th className="px-3 py-3">Reference No</th>
                          <th className="px-3 py-3">Received By</th>
                          <th className="px-3 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((pmt) => (
                          <tr key={pmt.id} className="border-b border-slate-100 hover:bg-slate-50/55">
                            <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(pmt.created_at)}</td>
                            <td className="px-3 py-3 text-right font-black text-emerald-700">{formatCurrency(pmt.amount, currency)}</td>
                            <td className="px-3 py-3">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 uppercase">
                                {pmt.method.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500">{pmt.reference_number ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-slate-700">{pmt.received_by_name ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={pmt.notes ?? ""}>
                              {pmt.notes ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile view */}
                  <div className="space-y-2 md:hidden">
                    {payments.map((pmt) => (
                      <div key={pmt.id} className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500">{fmtDate(pmt.created_at)}</span>
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase">
                            {pmt.method.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-2">
                          <span className="text-slate-500 text-xs">Amount Settled:</span>
                          <span className="font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(pmt.amount, currency)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2 mb-1">
                          <div>
                            <span>Ref:</span>{" "}
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{pmt.reference_number ?? "—"}</span>
                          </div>
                          <div>
                            <span>Received by:</span>{" "}
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{pmt.received_by_name ?? "—"}</span>
                          </div>
                        </div>
                        {pmt.notes && (
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg leading-relaxed">
                            {pmt.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "repairs" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800">Repair History</h4>
              {repairs.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No repair jobs recorded yet.
                </div>
              ) : (
                <>
                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[700px]">
                      <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
                        <tr>
                          <th className="px-3 py-3">Job No</th>
                          <th className="px-3 py-3">Device</th>
                          <th className="px-3 py-3">Problem</th>
                          <th className="px-3 py-3 text-right">Estimated Cost</th>
                          <th className="px-3 py-3 text-right">Advance Paid</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Expected Delivery</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repairs.map((rep) => (
                          <tr key={rep.id} className="border-b border-slate-100 hover:bg-slate-50/55">
                            <td className="px-3 py-3 font-bold text-slate-900">
                              <Link href={`/repairs/${rep.id}`} className="text-blue-700 hover:underline">
                                {rep.job_no}
                              </Link>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-800">{rep.device_type}</span>
                              {rep.device_model && <span className="text-xs text-slate-500 ml-1">({rep.device_model})</span>}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={rep.problem_description}>
                              {rep.problem_description}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrency(rep.estimated_cost, currency)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatCurrency(rep.advance_paid, currency)}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                rep.status === "delivered"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : rep.status === "completed"
                                  ? "bg-blue-50 text-blue-700"
                                  : rep.status === "cancelled"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}>
                                {rep.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {rep.expected_delivery_at ? fmtDate(rep.expected_delivery_at) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile view */}
                  <div className="space-y-2 md:hidden">
                    {repairs.map((rep) => (
                      <div key={rep.id} className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-2">
                          <Link href={`/repairs/${rep.id}`} className="font-bold text-blue-700 dark:text-blue-400 text-sm hover:underline">
                            {rep.job_no}
                          </Link>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            rep.status === "delivered"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : rep.status === "completed"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              : rep.status === "cancelled"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}>
                            {rep.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-1">
                          {rep.device_type}
                          {rep.device_model && <span className="text-xs text-slate-500 ml-1">({rep.device_model})</span>}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mb-2 truncate max-w-[300px]">
                          {rep.problem_description}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 dark:border-slate-800 pt-2 mb-1">
                          <div>
                            <span className="text-slate-500">Est. Cost:</span>{" "}
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(rep.estimated_cost, currency)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Advance Paid:</span>{" "}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(rep.advance_paid, currency)}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-dashed border-slate-100 dark:border-slate-800">
                          Expected Delivery: <span className="font-medium text-slate-800 dark:text-slate-200">{rep.expected_delivery_at ? fmtDate(rep.expected_delivery_at) : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
