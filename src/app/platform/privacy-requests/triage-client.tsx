"use client";

import { useState, useMemo, useActionState } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { updatePrivacyRequestStatusAction } from "../privacy-request-actions";

export type PrivacyRequest = {
  id: string;
  organization_id: string | null;
  requester_user_id: string;
  requester_email: string | null;
  requester_name: string | null;
  request_type: string;
  status: string;
  details: Record<string, unknown>;
  admin_notes: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  requests: PrivacyRequest[];
  orgNames: Record<string, string>;
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Access",
  export: "Export",
  correction: "Correction",
  deletion: "Deletion",
  restriction: "Restriction",
  portability: "Portability",
  objection: "Objection",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300" },
  in_review: { label: "In Review", className: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300" },
  completed: { label: "Completed", className: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300" },
  rejected: { label: "Rejected", className: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300" },
  cancelled: { label: "Cancelled", className: "text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-400" },
};

const STATUSES = ["all", "pending", "in_review", "completed", "rejected", "cancelled"] as const;
const TYPES = ["all", "access", "export", "correction", "deletion", "restriction", "portability", "objection"] as const;

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "text-slate-700 bg-slate-50 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function typeIcon(type: string) {
  switch (type) {
    case "access": return "👁️";
    case "export": return "📦";
    case "correction": return "✏️";
    case "deletion": return "🗑️";
    case "restriction": return "🔒";
    case "portability": return "📋";
    case "objection": return "🚫";
    default: return "•";
  }
}

export function PrivacyRequestTriage({ requests: initialRequests, orgNames }: Props) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateState] = useActionState(updatePrivacyRequestStatusAction, { error: null, success: null });

  const requests = useMemo(() => initialRequests, [initialRequests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterType !== "all" && r.request_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = r.requester_name?.toLowerCase() ?? "";
        const email = r.requester_email?.toLowerCase() ?? "";
        const org = (orgNames[r.organization_id ?? ""] ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !org.includes(q)) return false;
      }
      return true;
    });
  }, [requests, filterStatus, filterType, search, orgNames]);

  const summary = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    inReview: requests.filter((r) => r.status === "in_review").length,
    deletion: requests.filter((r) => r.request_type === "deletion").length,
    completedThisMonth: requests.filter((r) => {
      if (r.status !== "completed") return false;
      const d = new Date(r.processed_at ?? r.updated_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
  }), [requests]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Pending" value={summary.pending} warn={summary.pending > 0} />
        <SummaryCard label="In Review" value={summary.inReview} warn={summary.inReview > 0} />
        <SummaryCard label="Deletion Requests" value={summary.deletion} warn={summary.deletion > 0} />
        <SummaryCard label="Completed (This Month)" value={summary.completedThisMonth} />
      </div>

      {/* Warning banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-900/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Completing a request records the review outcome only.</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              Marking a deletion request as &ldquo;completed&rdquo; does <strong>not</strong> automatically delete
              the account, shop, audit, tax, or business data. Deletion must be performed manually through
              Supabase Dashboard or a separate script. See the process checklist below.
            </p>
          </div>
        </div>
      </div>

      {/* Error / success alert from update */}
      {updateState.error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{updateState.error}</span>
        </div>
      )}
      {updateState.success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <CheckCircle className="size-4 shrink-0" />
          <span>{updateState.success}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, or shop..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All types" : REQUEST_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Search className="size-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {requests.length === 0 ? "No privacy requests yet" : "No requests match your filters"}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {requests.length === 0
                ? "Requests submitted by users will appear here."
                : "Try adjusting the filters or search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3">Requester</th>
                  <th className="px-3 py-3">Shop</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Requested</th>
                  <th className="px-3 py-3">Processed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <FragmentComponent key={req.id}>
                    <tr
                      className={`cursor-pointer border-b border-slate-100 text-slate-700 transition hover:bg-slate-50 last:border-0 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50 ${expandedId === req.id ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                      onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                    >
                      <td className="px-3 py-3">
                        {expandedId === req.id ? (
                          <ChevronDown className="size-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="size-4 text-slate-400" />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{req.requester_name ?? "—"}</div>
                        {req.requester_email && (
                          <div className="text-xs text-slate-400 dark:text-slate-500">{req.requester_email}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {req.organization_id ? (orgNames[req.organization_id] ?? "—") : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs">{typeIcon(req.request_type)} </span>
                        {REQUEST_TYPE_LABELS[req.request_type] ?? req.request_type}
                      </td>
                      <td className="px-3 py-3">{statusBadge(req.status)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(req.requested_at).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {req.processed_at ? new Date(req.processed_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                    {expandedId === req.id && (
                      <tr key={`${req.id}-detail`}>
                        <td colSpan={7} className="border-b border-slate-100 bg-slate-50/50 px-6 py-5 dark:border-slate-800 dark:bg-slate-800/30">
                          <DetailPanel
                            request={req}
                            updatingId={updatingId}
                            setUpdatingId={setUpdatingId}
                          />
                        </td>
                      </tr>
                    )}
                  </FragmentComponent>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-slate-50">
          <ShieldCheck className="size-4 text-blue-600" />
          Request Review Checklist
        </h3>
        <ol className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">1</span>
            <span>Verify requester identity — confirm the request matches the authenticated user</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">2</span>
            <span>Confirm shop ownership if the user has an organization</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">3</span>
            <span>Review legal, audit, and tax retention requirements before approving deletion</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">4</span>
            <span>Prepare data export if the request type is &ldquo;Export&rdquo; or &ldquo;Portability&rdquo;</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">5</span>
            <span>Mark request as <strong>Completed</strong> or <strong>Rejected</strong> with clear admin notes</span>
          </li>
        </ol>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          <strong>Note:</strong> Marking a deletion request as completed does not perform the deletion.
          Deletion must be carried out manually through Supabase Dashboard.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${warn ? "text-red-600 dark:text-red-400" : "text-slate-950 dark:text-slate-50"}`}>
        {value}
      </p>
    </div>
  );
}

function FragmentComponent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DetailPanel({
  request,
  updatingId,
  setUpdatingId,
}: {
  request: PrivacyRequest;
  updatingId: string | null;
  setUpdatingId: (id: string | null) => void;
}) {
  const detailsEntries = Object.entries(request.details ?? {}).filter(([, v]) => v);

  const canUpdate = ["pending", "in_review", "completed", "rejected"].includes(request.status);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Requester</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{request.requester_name ?? "—"}</p>
          {request.requester_email && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{request.requester_email}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">User ID</p>
          <p className="mt-0.5 truncate text-xs font-mono text-slate-600 dark:text-slate-400">{request.requester_user_id}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Processed By</p>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
            {request.processed_by ? (
              <span className="truncate font-mono text-xs">{request.processed_by}</span>
            ) : (
              <span className="text-slate-400">Not yet processed</span>
            )}
          </p>
        </div>
      </div>

      {detailsEntries.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Requester Details</p>
          {detailsEntries.map(([key, val]) => (
            <p key={key} className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {String(val)}
            </p>
          ))}
        </div>
      )}

      {canUpdate && (
        <form
          action={async (formData: FormData) => {
            setUpdatingId(request.id);
            await updatePrivacyRequestStatusAction({ error: null, success: null }, formData);
            setUpdatingId(null);
          }}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50"
        >
          <input type="hidden" name="requestId" value={request.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Update Status
              </label>
              <select
                name="status"
                defaultValue={request.status}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {["pending", "in_review", "completed", "rejected"].map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Admin Notes <span className="font-normal normal-case text-slate-400">(visible to user in data export)</span>
            </label>
            <textarea
              name="adminNotes"
              defaultValue={request.admin_notes ?? ""}
              rows={3}
              maxLength={5000}
              placeholder="Add notes about the review outcome..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {request.status === "pending" || request.status === "in_review" ? (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Setting to completed/rejected will record the processed date
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  This request has already been processed
                </span>
              )}
            </p>
            <button
              type="submit"
              disabled={updatingId === request.id}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
            >
              {updatingId === request.id ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3" />
                  Update Request
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {!canUpdate && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This request is <strong>{request.status}</strong> and cannot be updated further.
          </p>
          {request.admin_notes && (
            <div className="mt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Admin Notes</p>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{request.admin_notes}</p>
            </div>
          )}
        </div>
      )}

      {request.processed_at && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <CheckCircle className="size-3 text-emerald-500" />
          Processed on {new Date(request.processed_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
