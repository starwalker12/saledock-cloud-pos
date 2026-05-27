import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import { env } from "@/lib/env";
import { getSupplierPurchase } from "@/lib/data/supplier-purchases";
import { formatCurrency } from "@/lib/formatters";
import { RecordPaymentForm } from "./record-payment-form";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

const STATUS_CLASS: Record<string, string> = {
  unpaid: "bg-rose-100 text-rose-800",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
};

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SupplierPurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const { id } = await params;
  const data = await getSupplierPurchase(profile.organization_id, id);
  if (!data) notFound();

  const { purchase, items, payments } = data;
  const currency = organization?.currency_code ?? "PKR";
  const canRecordPayment = canManageSupplierPurchases(profile.role);

  return (
    <AppShell pageTitle={`Purchase ${purchase.purchase_no}`}>
      <div className="mb-3 flex items-center justify-between">
        <Link
          href="/suppliers/purchases"
          className="text-xs font-semibold text-slate-600 underline"
        >
          ← Back to purchases
        </Link>
        <Link
          href={`/suppliers/${purchase.supplier_id}/ledger`}
          className="text-xs font-semibold text-slate-600 underline"
        >
          View supplier ledger →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">{purchase.purchase_no}</h2>
                <p className="text-xs text-slate-500">Recorded {fmtTime(purchase.created_at)}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_CLASS[purchase.status]}`}
              >
                {purchase.status}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Supplier</dt>
                <dd className="font-bold text-slate-900">{purchase.supplier_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Purchase date</dt>
                <dd className="font-semibold text-slate-900">{fmtDate(purchase.purchase_date)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Supplier ref</dt>
                <dd className="font-semibold text-slate-900">{purchase.reference_no ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Recorded by</dt>
                <dd className="font-semibold text-slate-900">{purchase.created_by_name ?? "—"}</dd>
              </div>
              {purchase.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase text-slate-500">Notes</dt>
                  <dd className="text-slate-700">{purchase.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Items received ({items.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Unit cost</th>
                    <th className="px-2 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <p className="font-bold text-slate-900">{it.product_name}</p>
                        {it.notes && <p className="text-xs text-slate-500">{it.notes}</p>}
                        {it.stock_lot_id && (
                          <p className="text-[10px] uppercase text-slate-400">Lot {it.stock_lot_id.slice(0, 8)}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{it.quantity}</td>
                      <td className="px-2 py-2 text-right text-slate-700">{formatCurrency(it.unit_cost, currency)}</td>
                      <td className="px-2 py-2 text-right font-bold text-slate-900">
                        {formatCurrency(it.line_total, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Payments ({payments.length})</h3>
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No payments recorded against this purchase yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Reference</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{fmtTime(p.paid_at)}</td>
                        <td className="px-2 py-2 text-slate-700">{PAYMENT_LABELS[p.method] ?? p.method}</td>
                        <td className="px-2 py-2 text-slate-500">{p.reference_no ?? "—"}</td>
                        <td className="px-2 py-2 text-right font-bold text-emerald-700">
                          {formatCurrency(p.amount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Totals</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(purchase.subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Discount</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(purchase.discount_total, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                <dt className="font-bold text-slate-700">Grand total</dt>
                <dd className="font-black text-slate-950">{formatCurrency(purchase.grand_total, currency)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Paid</dt>
                <dd className="font-semibold text-emerald-700">{formatCurrency(purchase.amount_paid, currency)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Balance due</dt>
                <dd className="font-bold text-rose-700">{formatCurrency(purchase.balance_due, currency)}</dd>
              </div>
            </dl>
          </section>

          {canRecordPayment && purchase.balance_due > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-base font-black text-slate-950">Record payment</h3>
              <RecordPaymentForm
                supplierId={purchase.supplier_id}
                purchaseId={purchase.id}
                maxAmount={purchase.balance_due}
              />
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
