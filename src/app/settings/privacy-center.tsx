"use client";

import { useState, useEffect, useActionState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createPrivacyRequestAction, cancelPrivacyRequestAction, type PrivacyRequestFormState } from "./privacy-actions";
import {
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileJson,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  Search,
  Mail,
  Loader2,
  Eye,
} from "lucide-react";

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
  details: Record<string, string>;
  requested_at: string;
  processed_at: string | null;
  admin_notes: string | null;
};

const initialState: PrivacyRequestFormState = { error: null, success: null };

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Access my data",
  export: "Export my data",
  correction: "Correct my data",
  deletion: "Delete my account",
  restriction: "Restrict processing",
  portability: "Port my data",
  objection: "Object to processing",
};

const REQUEST_TYPE_ICONS: Record<string, string> = {
  access: "👁️",
  export: "📦",
  correction: "✏️",
  deletion: "🗑️",
  restriction: "🔒",
  portability: "📋",
  objection: "🚫",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending review",
    className: "text-amber-700 bg-amber-50 border-amber-200",
  },
  in_review: {
    label: "In review",
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
  completed: {
    label: "Completed",
    className: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  rejected: {
    label: "Rejected",
    className: "text-rose-700 bg-rose-50 border-rose-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "text-slate-500 bg-slate-50 border-slate-200",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "text-slate-700 bg-slate-50 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export function PrivacyCenter() {
  const supabase = createClient();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [createState, createAction, isCreating] = useActionState(createPrivacyRequestAction, initialState);
  const [cancelState, cancelAction, isCancelling] = useActionState(cancelPrivacyRequestAction, initialState);
  const [selectedType, setSelectedType] = useState<string>("deletion");
  const [submitCount, setSubmitCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("privacy_requests")
        .select("*")
        .eq("requester_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .order("requested_at", { ascending: false });
      setRequests((data as PrivacyRequest[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Refetch requests after create/cancel
  useEffect(() => {
    if (!createState.success && !cancelState.success) return;
    const id = setTimeout(() => {
      setSubmitCount((c) => c + 1);
    }, 0);
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) return;
      supabase.from("privacy_requests").select("*").eq("requester_user_id", u.id).order("requested_at", { ascending: false }).then(({ data }) => {
        if (data) setRequests(data as PrivacyRequest[]);
      });
    });
    return () => clearTimeout(id);
  }, [createState.success, cancelState.success]);

  async function handleExport() {
    try {
      setExporting(true);
      setExportError(null);
      const response = await fetch("/api/privacy/export");
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error ?? "Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saledock-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }

  async function handleQuickRequest(type: string) {
    setSelectedType(type);
    setTimeout(() => {
      const form = document.querySelector<HTMLFormElement>('form[key="privacy-form"]');
      form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    }, 50);
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Data Export Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-blue-50 p-3 text-blue-700 sm:block">
            <Download className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">Download your data</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Get a JSON file containing your account, profile, shop summary, branch list, and privacy requests.
              This is a personal data export — it includes only your account information and shop summary,
              not your full business records (products, customers, invoices, etc.).
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">Account info</span>
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">Shop summary</span>
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">Privacy requests</span>
              <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700">No business records</span>
            </div>

            {exportError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {exporting ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating export...
                </>
              ) : (
                <>
                  <FileJson className="size-4" />
                  Download my data
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Data Deletion Request Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-rose-50 p-3 text-rose-700 sm:block">
            <Trash2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">Request account deletion</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              This does not immediately delete your account. It creates a request for manual review
              so we can verify ownership and fulfil legal/audit requirements. You will be contacted
              at the email address on file.
            </p>
          </div>
        </div>
      </section>

      {/* Submit a privacy request */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-black text-slate-950">Submit a privacy request</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Choose the type of request below. You can also email us at{" "}
          <a href="mailto:fardan.aatir@outlook.com?subject=SaleDock%20Data%20Deletion%20Request" className="font-semibold text-blue-700 hover:underline">
            fardan.aatir@outlook.com
          </a>
          {" "}with subject &quot;SaleDock Data Deletion Request&quot;.
        </p>

        {/* Quick action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(REQUEST_TYPE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleQuickRequest(key)}
              disabled={isCreating}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                selectedType === key
                  ? "border-blue-700 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{REQUEST_TYPE_ICONS[key]}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <form key="privacy-form" action={createAction} className="mt-5 space-y-4">
          <input type="hidden" name="requestType" value={selectedType} />

          <div>
            <label htmlFor="details" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Details (optional)
            </label>
            <textarea
              id="details"
              name="details"
              defaultValue=""
              key={`details-${submitCount}`}
              rows={3}
              maxLength={2000}
              placeholder="Tell us more about your request..."
              disabled={isCreating}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white disabled:bg-slate-100"
            />
          </div>

          {createState.error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{createState.error}</span>
            </div>
          )}

          {createState.success && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle className="size-4 shrink-0" />
              <span>{createState.success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isCreating}
            className="flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {isCreating ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                Submit request
              </>
            )}
          </button>
        </form>
      </section>

      {/* Existing Requests Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-black text-slate-950">Existing requests</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          View and manage your submitted privacy requests.
        </p>

        {cancelState.error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{cancelState.error}</span>
          </div>
        )}

        {cancelState.success && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle className="size-4 shrink-0" />
            <span>{cancelState.success}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Search className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-500">No privacy requests yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Submit a request above to get started.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Requested</th>
                  <th className="px-3 py-3">Details</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const canCancel = req.status === "pending" || req.status === "in_review";
                  return (
                    <tr key={req.id} className="border-b border-slate-100 text-slate-700 last:border-0">
                      <td className="px-3 py-3 font-semibold">
                        <span className="text-xs">{REQUEST_TYPE_ICONS[req.request_type] ?? "•"} </span>
                        {REQUEST_TYPE_LABELS[req.request_type] ?? req.request_type}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">
                        {new Date(req.requested_at).toLocaleDateString()}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-xs text-slate-500">
                        {req.details?.description ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        {canCancel ? (
                          <form action={cancelAction}>
                            <input type="hidden" name="requestId" value={req.id} />
                            <button
                              type="submit"
                              disabled={isCancelling}
                              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <XCircle className="size-3" />
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Legal links */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-bold text-slate-950">Legal & Privacy resources</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href="/privacy"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Eye className="size-3.5" />
            Privacy Policy
            <ExternalLink className="size-3" />
          </a>
          <a
            href="/terms"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <FileJson className="size-3.5" />
            Terms of Service
            <ExternalLink className="size-3" />
          </a>
          <a
            href="/data-deletion"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Trash2 className="size-3.5" />
            Public Data Deletion
            <ExternalLink className="size-3" />
          </a>
          <a
            href="mailto:fardan.aatir@outlook.com?subject=SaleDock%20Data%20Deletion%20Request"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Mail className="size-3.5" />
            Email us
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          You can also email{" "}
          <a href="mailto:fardan.aatir@outlook.com" className="font-semibold text-blue-700 hover:underline">
            fardan.aatir@outlook.com
          </a>
          {" "}with subject &quot;SaleDock Data Deletion Request&quot; if you cannot sign in.
        </p>
      </section>
    </div>
  );
}
