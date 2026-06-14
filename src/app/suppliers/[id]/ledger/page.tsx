import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases, canManageSupplierWriteOffs } from "@/lib/permissions";
import { env } from "@/lib/env";
import {
  listSupplierLedger,
  listSupplierPayments,
  listSupplierPurchases,
} from "@/lib/data/supplier-purchases";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/formatters";
import { RecordPaymentForm } from "../../purchases/[id]/record-payment-form";
import { SupplierWriteOffForm } from "./supplier-write-off-form";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function SupplierLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const { id } = await params;
  const orgId = profile.organization_id;
  const currency = organization?.currency_code ?? "PKR";

  const supabase = await createClient();
  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id, name, company, phone, email, address, outstanding_balance, is_active")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (supErr) throw new Error(supErr.message);
  if (!supplier) notFound();

  const [ledger, purchases, payments] = await Promise.all([
    listSupplierLedger(orgId, id),
    listSupplierPurchases(orgId, { supplier_id: id }),
    listSupplierPayments(orgId, { supplier_id: id, limit: 50 }),
  ]);

  const outstanding = Number(supplier.outstanding_balance ?? 0);
  const canPay = canManageSupplierPurchases(profile.role);
  const canWriteOff = canManageSupplierWriteOffs(profile.role);

  return (
    <AppShell pageTitle={`Supplier: ${supplier.name}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/suppliers/purchases" className="text-xs font-semibold text-slate-600 underline">
          ← Back to purchases
        </Link>
        <Link
          href={`/suppliers/${id}/statement`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          View statement
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">{supplier.name}</h2>
                {supplier.company && <p className="text-sm text-slate-600">{supplier.company}</p>}
                <p className="text-xs text-slate-500">
                  {supplier.phone ?? "No phone"} · {supplier.email ?? "No email"}
                </p>
                {supplier.address && (
                  <p className="text-xs text-slate-500">{supplier.address}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase text-slate-500">Outstanding</p>
                <p className={`text-2xl font-black ${outstanding > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatCurrency(outstanding, currency)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Ledger ({ledger.length} entries)</h3>
            {ledger.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No ledger entries for this supplier yet.
              </p>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">When</th>
                        <th className="px-2 py-2">Description</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2 text-right">Credit</th>
                        <th className="px-2 py-2 text-right">Debit</th>
                        <th className="px-2 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((e) => (
                        <tr key={e.id} className="border-b border-slate-100 align-top">
                          <td className="px-2 py-2 text-slate-700">{fmtTime(e.created_at)}</td>
                          <td className="px-2 py-2">
                            <p className="text-slate-900">{e.description ?? "—"}</p>
                            {e.reference_number && (
                              <p className="text-[10px] uppercase text-slate-400">{e.reference_number}</p>
                            )}
                            {e.purchase_id && (
                              <Link
                                href={`/suppliers/purchases/${e.purchase_id}`}
                                className="text-[10px] font-semibold text-blue-700 underline"
                              >
                                Open purchase
                              </Link>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs uppercase text-slate-500">{e.entry_type.replace("_", " ")}</td>
                          <td className="px-2 py-2 text-right text-rose-700">
                            {e.direction === "credit" ? formatCurrency(e.amount, currency) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right text-emerald-700">
                            {e.direction === "debit" ? formatCurrency(e.amount, currency) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right font-bold text-slate-900">
                            {formatCurrency(e.balance_after, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="space-y-2 md:hidden">
                  {ledger.map((e) => (
                    <div key={e.id} className="rounded-xl border border-slate-200 bg-[#fff] dark:border-slate-800 dark:bg-slate-900 p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-slate-500">{fmtTime(e.created_at)}</span>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          {e.entry_type.replace("_", " ")}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
                        {e.description ?? "—"}
                      </div>
                      {e.reference_number && (
                        <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500 mb-1">{e.reference_number}</p>
                      )}
                      {e.purchase_id && (
                        <Link
                          href={`/suppliers/purchases/${e.purchase_id}`}
                          className="inline-block text-[11px] font-bold text-blue-700 dark:text-blue-400 hover:underline mb-2"
                        >
                          Open purchase
                        </Link>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          {e.direction === "credit" ? (
                            <span className="font-bold text-rose-700 dark:text-rose-400">Credit: {formatCurrency(e.amount, currency)}</span>
                          ) : (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">Debit: {formatCurrency(e.amount, currency)}</span>
                          )}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 font-medium">
                          Bal: <span className="font-black text-slate-900 dark:text-slate-100">{formatCurrency(e.balance_after, currency)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Recent purchases ({purchases.length})</h3>
            {purchases.length === 0 ? (
              <p className="text-sm text-slate-500">No purchases recorded.</p>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Purchase #</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2 text-right">Balance</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.slice(0, 25).map((p) => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="px-2 py-2 text-slate-700">{fmtDate(p.purchase_date)}</td>
                          <td className="px-2 py-2 font-bold text-slate-900">{p.purchase_no}</td>
                          <td className="px-2 py-2 text-right text-slate-700">{formatCurrency(p.grand_total, currency)}</td>
                          <td className="px-2 py-2 text-right text-rose-700">{formatCurrency(p.balance_due, currency)}</td>
                          <td className="px-2 py-2 text-right">
                            <Link
                              href={`/suppliers/purchases/${p.id}`}
                              className="text-xs font-semibold text-blue-700 underline"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="space-y-2 md:hidden">
                  {purchases.slice(0, 25).map((p) => (
                    <div key={p.id} className="rounded-xl border border-slate-200 bg-[#fff] dark:border-slate-800 dark:bg-slate-900 p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{p.purchase_no}</span>
                        <span className="text-xs text-slate-500">{fmtDate(p.purchase_date)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="space-y-1">
                          <p className="text-slate-500">
                            Total: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(p.grand_total, currency)}</span>
                          </p>
                          <p className="text-slate-500">
                            Due: <span className="font-bold text-rose-700 dark:text-rose-400">{formatCurrency(p.balance_due, currency)}</span>
                          </p>
                        </div>
                        <Link
                          href={`/suppliers/purchases/${p.id}`}
                          className="rounded-lg border border-slate-200 dark:border-slate-750 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          {canPay && outstanding > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-base font-black text-slate-950">Record on-account payment</h3>
              <p className="mb-3 text-xs text-slate-500">
                Payment will reduce the supplier&apos;s overall outstanding balance. To pay against a specific
                purchase, open that purchase and use its payment form.
              </p>
              <RecordPaymentForm supplierId={id} maxAmount={outstanding} />
            </section>
          )}

          {canWriteOff && outstanding > 0 && (
            <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-base font-black text-slate-950">Write off balance</h3>
              <p className="mb-3 text-xs text-slate-500">
                Forgive part or all of the supplier&apos;s outstanding balance. This is NOT an expense &mdash;
                it clears a payable and is fully traceable.
              </p>
              <SupplierWriteOffForm supplierId={id} maxAmount={outstanding} />
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-slate-950">Recent payments</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {payments.slice(0, 10).map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <p className="font-semibold text-slate-900">{formatCurrency(p.amount, currency)}</p>
                      <p className="text-[11px] uppercase text-slate-500">
                        {p.method.replace("_", " ")} · {fmtTime(p.paid_at)}
                      </p>
                      {p.purchase_no && (
                        <Link
                          href={`/suppliers/purchases/${p.purchase_id}`}
                          className="text-[11px] font-semibold text-blue-700 underline"
                        >
                          {p.purchase_no}
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
