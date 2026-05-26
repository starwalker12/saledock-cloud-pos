import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  Role,
  canManageUsers,
  canViewAuditLog,
  canViewReports,
  canManageSettings,
} from "@/lib/permissions";

export type SearchResult = {
  id: string;
  type:
    | "page"
    | "product"
    | "customer"
    | "invoice"
    | "repair"
    | "return"
    | "expense"
    | "user"
    | "audit_log";
  title: string;
  subtitle: string | null;
  href: string;
  badge: string | null;
  badgeClass: string | null;
  groupLabel: string;
  iconKey: string;
};

const PAGES_DEFINITION = [
  { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", check: null },
  { title: "POS Checkout (New Sale)", href: "/pos", icon: "ShoppingCart", check: null },
  { title: "Products & Services", href: "/products", icon: "Package", check: null },
  { title: "Customers Database", href: "/customers", icon: "Users", check: null },
  { title: "Sales Invoices", href: "/invoices", icon: "FileText", check: null },
  { title: "Returns & Refunds", href: "/returns", icon: "RotateCcw", check: null },
  { title: "Expenses Tracker", href: "/expenses", icon: "Receipt", check: null },
  { title: "Daily Closing Records", href: "/daily-closing", icon: "Lock", check: null },
  { title: "Repairs Workflow", href: "/repairs", icon: "Wrench", check: null },
  {
    title: "Reports & Profit Analytics",
    href: "/reports",
    icon: "BarChart3",
    check: (r: Role | null | undefined) => canViewReports(r),
  },
  {
    title: "Shop Settings & Profile",
    href: "/settings",
    icon: "Settings",
    check: (r: Role | null | undefined) => canManageSettings(r),
  },
  {
    title: "Staff & User Management",
    href: "/users",
    icon: "UserCog",
    check: (r: Role | null | undefined) => canManageUsers(r),
  },
  {
    title: "System Audit Logs",
    href: "/audit-log",
    icon: "ScrollText",
    check: (r: Role | null | undefined) => canViewAuditLog(r),
  },
];

export async function searchGlobal(
  organizationId: string,
  role: Role | null | undefined,
  searchTerm: string
): Promise<SearchResult[]> {
  const query = searchTerm.trim();
  if (query.length === 0) return [];

  const supabase = await createClient();
  const lowerQuery = query.toLowerCase();

  // 1. Pages/Actions (instant matching)
  const matchingPages: SearchResult[] = PAGES_DEFINITION.filter((p) => {
    if (p.check && !p.check(role)) return false;
    return p.title.toLowerCase().includes(lowerQuery) || p.href.toLowerCase().includes(lowerQuery);
  }).map((p) => ({
    id: `page-${p.href}`,
    type: "page",
    title: p.title,
    subtitle: "App Route Navigation",
    href: p.href,
    badge: "System",
    badgeClass: "bg-slate-50 text-slate-600 border-slate-200 border",
    groupLabel: "Pages & Navigation",
    iconKey: p.icon,
  }));

  // For very short queries (< 2 chars), only return matching pages/actions
  if (query.length < 2) {
    return matchingPages;
  }

  const matchesPattern = `%${query}%`;
  const dataPromises: Promise<SearchResult[]>[] = [];

  // 2. Products & Services
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, type, sale_price, is_active")
        .eq("organization_id", organizationId)
        .or(`name.ilike.${matchesPattern},sku.ilike.${matchesPattern},barcode.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id,
        type: "product",
        title: r.name,
        subtitle: `SKU: ${r.sku ?? "N/A"} · Rs. ${r.sale_price.toLocaleString()}`,
        href: `/products?id=${r.id}`,
        badge: r.type === "service" ? "Service" : "Product",
        badgeClass: r.is_active
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 border"
          : "bg-slate-100 text-slate-500 border-slate-300 border",
        groupLabel: "Products & Services",
        iconKey: r.type === "service" ? "Sparkles" : "Package",
      } satisfies SearchResult));
    })()
  );

  // 3. Customers
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, is_archived")
        .eq("organization_id", organizationId)
        .or(`name.ilike.${matchesPattern},phone.ilike.${matchesPattern},email.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id,
        type: "customer",
        title: r.name,
        subtitle: `Phone: ${r.phone ?? "N/A"} · ${r.email ?? "No Email"}`,
        href: `/customers/${r.id}`,
        badge: r.is_archived ? "Archived" : "Active",
        badgeClass: r.is_archived
          ? "bg-amber-50 text-amber-700 border-amber-200 border"
          : "bg-blue-50 text-blue-700 border-blue-200 border",
        groupLabel: "Customers Database",
        iconKey: "User",
      } satisfies SearchResult));
    })()
  );

  // 4. Invoices
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`id, invoice_no, status, grand_total, customers(name, phone)`)
        .eq("organization_id", organizationId)
        .or(`invoice_no.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => {
        const c = r.customers as { name?: string } | { name?: string }[] | null;
        const custName = Array.isArray(c) ? c[0]?.name : c?.name;
        return {
          id: r.id,
          type: "invoice",
          title: `Invoice ${r.invoice_no}`,
          subtitle: `Customer: ${custName ?? "Walk-in"} · Rs. ${Number(r.grand_total).toLocaleString()}`,
          href: `/invoices/${r.id}`,
          badge: (r.status as string).toUpperCase(),
          badgeClass:
            r.status === "paid"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 border"
              : r.status === "partial"
              ? "bg-amber-50 text-amber-700 border-amber-200 border"
              : "bg-rose-50 text-rose-700 border-rose-200 border",
          groupLabel: "Sales Invoices",
          iconKey: "FileText",
        } satisfies SearchResult;
      });
    })()
  );

  // 5. Repairs Workflow
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("repairs")
        .select("id, job_no, customer_name, customer_phone, device_type, device_model, status")
        .eq("organization_id", organizationId)
        .or(`job_no.ilike.${matchesPattern},customer_name.ilike.${matchesPattern},customer_phone.ilike.${matchesPattern},device_model.ilike.${matchesPattern},serial_imei.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id,
        type: "repair",
        title: `Repair ${r.job_no}`,
        subtitle: `${r.customer_name} · ${r.device_type} (${r.device_model ?? "Unknown"})`,
        href: `/repairs/${r.id}`,
        badge: r.status.replace(/_/g, " ").toUpperCase(),
        badgeClass:
          r.status === "delivered" || r.status === "completed"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 border"
            : r.status === "cancelled"
            ? "bg-slate-100 text-slate-500 border-slate-300 border"
            : "bg-amber-50 text-amber-700 border-amber-200 border",
        groupLabel: "Repairs Workflow",
        iconKey: "Wrench",
      } satisfies SearchResult));
    })()
  );

  // 6. Returns & Refunds
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("returns")
        .select(`id, return_no, refund_amount, status, invoices(invoice_no)`)
        .eq("organization_id", organizationId)
        .or(`return_no.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => {
        const inv = r.invoices as { invoice_no?: string } | { invoice_no?: string }[] | null;
        const invNo = Array.isArray(inv) ? inv[0]?.invoice_no : inv?.invoice_no;
        return {
          id: r.id,
          type: "return",
          title: `Return ${r.return_no}`,
          subtitle: `Ref: Invoice ${invNo ?? "N/A"} · Refund: Rs. ${Number(r.refund_amount).toLocaleString()}`,
          href: `/returns`,
          badge: r.status.toUpperCase(),
          badgeClass:
            r.status === "completed" || r.status === "approved"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 border"
              : "bg-amber-50 text-amber-700 border-amber-200 border",
          groupLabel: "Returns & Refunds",
          iconKey: "RotateCcw",
        } satisfies SearchResult;
      });
    })()
  );

  // 7. Expenses
  dataPromises.push(
    (async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, category, vendor_name, notes, amount, status")
        .eq("organization_id", organizationId)
        .or(`category.ilike.${matchesPattern},vendor_name.ilike.${matchesPattern},notes.ilike.${matchesPattern}`)
        .limit(5);

      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id,
        type: "expense",
        title: r.category,
        subtitle: `Vendor: ${r.vendor_name ?? "None"} · Rs. ${Number(r.amount).toLocaleString()}`,
        href: `/expenses`,
        badge: r.status.toUpperCase(),
        badgeClass:
          r.status === "active"
            ? "bg-rose-50 text-rose-700 border-rose-200 border"
            : "bg-slate-100 text-slate-500 border-slate-300 border",
        groupLabel: "Shop Expenses",
        iconKey: "Receipt",
      } satisfies SearchResult));
    })()
  );

  // 8. Users (Admin/Owner only)
  if (canManageUsers(role)) {
    dataPromises.push(
      (async (): Promise<SearchResult[]> => {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, role, is_active")
          .eq("organization_id", organizationId)
          .or(`full_name.ilike.${matchesPattern},role.ilike.${matchesPattern}`)
          .limit(5);

        if (error) return [];
        return (data ?? []).map((r) => ({
          id: r.id,
          type: "user",
          title: r.full_name,
          subtitle: `Role: ${r.role.toUpperCase()}`,
          href: `/users`,
          badge: r.is_active ? "Active" : "Inactive",
          badgeClass: r.is_active
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 border"
            : "bg-slate-100 text-slate-500 border-slate-300 border",
          groupLabel: "Staff Directory",
          iconKey: "UserCog",
        } satisfies SearchResult));
      })()
    );
  }

  // 9. Audit Logs (Admin/Owner only)
  if (canViewAuditLog(role)) {
    dataPromises.push(
      (async (): Promise<SearchResult[]> => {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, module, action, details")
          .eq("organization_id", organizationId)
          .or(`module.ilike.${matchesPattern},action.ilike.${matchesPattern},details.ilike.${matchesPattern}`)
          .limit(5);

        if (error) return [];
        return (data ?? []).map((r) => ({
          id: r.id,
          type: "audit_log",
          title: r.action,
          subtitle: `Module: ${r.module.toUpperCase()} · ${r.details ?? ""}`,
          href: `/audit-log`,
          badge: "LOG",
          badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200 border",
          groupLabel: "System Audit Logs",
          iconKey: "ScrollText",
        } satisfies SearchResult));
      })()
    );
  }

  const promiseResults = await Promise.all(dataPromises);
  const dataResults = promiseResults.flat();

  return [...matchingPages, ...dataResults];
}
