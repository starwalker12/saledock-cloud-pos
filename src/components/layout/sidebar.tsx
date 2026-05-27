import Link from "next/link";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingCart,
  Users,
  CalendarCheck,
  Wallet,
  Wrench,
  UserCog,
  ScrollText,
  Truck,
  MonitorCog,
} from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers, canViewAuditLog, canManageSupplierPurchases } from "@/lib/permissions";
import { isPlatformAdmin } from "@/lib/platform/admin";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/daily-closing", label: "Daily Closing", icon: CalendarCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function Sidebar() {
  const { profile } = await getCurrentContext();
  const [platformAdmin] = await Promise.all([isPlatformAdmin()]);
  const visibleItems = [
    ...items,
    ...(canManageSupplierPurchases(profile?.role)
      ? [{ href: "/suppliers/purchases", label: "Purchases", icon: Truck }]
      : []),
    ...(canViewAuditLog(profile?.role) ? [{ href: "/audit-log", label: "Audit Log", icon: ScrollText }] : []),
    ...(canManageUsers(profile?.role) ? [{ href: "/users", label: "Users", icon: UserCog }] : []),
    ...(platformAdmin ? [{ href: "/platform", label: "Platform", icon: MonitorCog }] : []),
  ];

  return (
    // h-dvh + flex column so the header stays fixed and the nav scrolls
    // internally when the list is taller than the viewport. The outer shell
    // is overflow-hidden, so this sidebar never moves when main scrolls.
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:flex">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/saledock-logo.svg"
          alt="SaleDock"
          className="h-9 w-auto max-w-[60px] object-contain rounded-lg"
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-slate-100">
            SaleDock
          </p>
          <p className="text-lg font-black text-slate-950 dark:text-slate-50">Cloud POS</p>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
