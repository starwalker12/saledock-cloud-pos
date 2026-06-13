import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/auth/session";
import { listInvoices } from "@/lib/data/invoices";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    partial: "bg-amber-100 text-amber-800",
    unpaid: "bg-red-100 text-red-800",
    draft: "bg-slate-200 text-slate-700",
    void: "bg-slate-200 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export default async function InvoicesPage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const invoices = await listInvoices(profile.organization_id);
  const currency = organization?.currency_code ?? "PKR";

  return (
    <AppShell pageTitle="Invoices">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#fff] shadow-sm md:rounded-2xl dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 md:px-5 md:py-4 dark:border-white/[0.07]">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-950 dark:text-slate-50">All invoices</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Most recent first.</p>
          </div>
          <Link
            href="/pos"
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800 md:px-4 cursor-pointer"
          >
            New sale
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No invoices yet"
              description="Start a sale from the POS to generate your first invoice."
              actionHref="/pos"
              actionLabel="Go to POS"
              type="empty"
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 dark:border-white/[0.05]">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{inv.invoice_no}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{inv.customer_name ?? "Walk-in"}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(inv.grand_total, currency)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrency(inv.amount_paid, currency)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={inv.balance_due > 0 ? "font-bold text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}>
                          {formatCurrency(inv.balance_due, currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 p-2 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden">
              {invoices.map((inv) => (
                <li key={inv.id} className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-white/[0.07] dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900 dark:text-slate-100">{inv.invoice_no}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(inv.invoice_date)}</p>
                      <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-300">{inv.customer_name ?? "Walk-in"}</p>
                    </div>
                    <StatusPill status={inv.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                      <p className="break-words text-[11px] font-bold leading-tight text-slate-900 min-[380px]:text-xs dark:text-slate-100">{formatCurrency(inv.grand_total, currency)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Paid</p>
                      <p className="break-words text-[11px] font-semibold leading-tight text-slate-700 min-[380px]:text-xs dark:text-slate-300">{formatCurrency(inv.amount_paid, currency)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Due</p>
                      <p className={inv.balance_due > 0 ? "break-words text-[11px] font-bold leading-tight text-red-700 min-[380px]:text-xs dark:text-red-400" : "break-words text-[11px] font-semibold leading-tight text-slate-500 min-[380px]:text-xs dark:text-slate-400"}>
                        {formatCurrency(inv.balance_due, currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-white/[0.05]">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}
