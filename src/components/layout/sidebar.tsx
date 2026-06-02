import Link from "next/link";
import { getCurrentContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageUsers, canViewAuditLog, canManageSupplierPurchases, canViewReplenishment } from "@/lib/permissions";
import { isPlatformAdmin } from "@/lib/platform/admin";
import { SidebarNav, type NavItem } from "@/components/layout/sidebar-nav";

const items: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: "dashboard" },
  { href: "/pos", label: "pos", icon: "pos" },
  { href: "/products", label: "products", icon: "products" },
  { href: "/customers", label: "customers", icon: "customers" },
  { href: "/invoices", label: "invoices", icon: "invoices" },
  { href: "/returns", label: "returns", icon: "returns" },
  { href: "/repairs", label: "repairs", icon: "repairs" },
  { href: "/expenses", label: "expenses", icon: "expenses" },
  { href: "/daily-closing", label: "dailyClosing", icon: "dailyClosing" },
  { href: "/reports", label: "reports", icon: "reports" },
];

async function getDb() {
  try {
    return createAdminClient();
  } catch {
    return await createClient();
  }
}

async function getAppLogoUrl(organizationId: string, branchId: string | null): Promise<string | null> {
  const db = await getDb();
  const { data: rows } = await db
    .from("app_settings")
    .select("branch_id, settings")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .returns<{ branch_id: string | null; settings: Record<string, unknown> | null }[]>();
  if (!rows || rows.length === 0) return null;
  const row =
    rows.find((r) => r.branch_id === branchId) ??
    rows.find((r) => r.branch_id === null) ??
    rows[0];
  if (!row?.settings) return null;
  const url = row.settings.app_logo_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export async function Sidebar() {
  const { profile } = await getCurrentContext();
  const [platformAdmin] = await Promise.all([isPlatformAdmin()]);

  const appLogoUrl = profile?.organization_id
    ? await getAppLogoUrl(profile.organization_id, profile.branch_id)
    : null;

  const visibleItems: NavItem[] = [
    ...items,
    ...(canManageSupplierPurchases(profile?.role)
      ? [
          { href: "/suppliers/purchases", label: "purchases" as const, icon: "purchases" },
          { href: "/suppliers/dues", label: "supplierDues" as const, icon: "dues" },
        ]
      : []),
    ...(canViewReplenishment(profile?.role)
      ? [{ href: "/purchases/replenishment", label: "replenishment" as const, icon: "replenishment" }]
      : []),
    ...(canViewAuditLog(profile?.role) ? [{ href: "/audit-log", label: "auditLog" as const, icon: "auditLog" }] : []),
    ...(canManageUsers(profile?.role) ? [{ href: "/users", label: "users" as const, icon: "users" }] : []),
    { href: "/settings", label: "settings" as const, icon: "settings" },
    ...(platformAdmin ? [{ href: "/platform", label: "platform" as const, icon: "platform" }] : []),
  ];

  return (
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:flex">
      <Link href="/dashboard" className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/saledock-logo-full.png"
          alt="SaleDock Cloud POS"
          className="h-9 w-auto max-w-[160px] object-contain brightness-0 dark:invert"
        />
        {appLogoUrl && (
          <>
            <div className="h-8 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={appLogoUrl}
              src={appLogoUrl}
              alt="Shop logo"
              className="h-8 w-auto max-w-[120px] object-contain"
            />
          </>
        )}
      </Link>
      <SidebarNav items={visibleItems} />
    </aside>
  );
}
