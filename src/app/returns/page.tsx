import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { listRecentReturns } from "@/lib/data/returns";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ReturnsPage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const returns = await listRecentReturns(profile.organization_id);
  const currency = organization?.currency_code ?? "PKR";

  return (
    <AppShell pageTitle="Returns">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Refund audit
          </p>
          <h1 className="text-2xl font-black text-slate-950">Returns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Invoice-linked return documents, refund methods, and stock restoration records.
          </p>
        </div>
        <Link
          href="/invoices"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800"
        >
          Find invoice
        </Link>
      </div>

      {returns.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-black text-slate-950">No returns yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Open an invoice detail page to process the first return.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3 text-right">Payout</th>
                  <th className="px-4 py-3">Method</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr key={ret.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <Link href={`/returns/${ret.id}`} className="font-black text-blue-700 hover:underline">
                        {ret.return_no}
                      </Link>
                      <div className="text-xs text-slate-500">{fmtDate(ret.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${ret.invoice_id}`} className="font-bold text-blue-700 hover:underline">
                        {ret.invoice_no ?? "Invoice"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ret.customer_name ?? "Walk-in"}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatCurrency(ret.subtotal, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatCurrency(ret.refund_amount, currency)}
                    </td>
                    <td className="px-4 py-3">
                      {ret.refund_method ? METHOD_LABELS[ret.refund_method] ?? ret.refund_method : "No payout"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {returns.map((ret) => (
              <article key={ret.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/returns/${ret.id}`} className="font-black text-blue-700 hover:underline">
                      {ret.return_no}
                    </Link>
                    <p className="text-xs text-slate-500">{fmtDate(ret.created_at)}</p>
                  </div>
                  <p className="text-right text-sm font-black text-slate-900">
                    {formatCurrency(ret.subtotal, currency)}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <Link href={`/invoices/${ret.invoice_id}`} className="font-bold text-blue-700 underline">
                    {ret.invoice_no ?? "Open invoice"}
                  </Link>
                  <p>{ret.customer_name ?? "Walk-in customer"}</p>
                  <p>
                    Payout {formatCurrency(ret.refund_amount, currency)} ·{" "}
                    {ret.refund_method ? METHOD_LABELS[ret.refund_method] ?? ret.refund_method : "No payout"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
