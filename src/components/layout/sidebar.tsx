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
} from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers, canViewAuditLog } from "@/lib/permissions";

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
  const visibleItems = [
    ...items,
    ...(canViewAuditLog(profile?.role) ? [{ href: "/audit-log", label: "Audit Log", icon: ScrollText }] : []),
    ...(canManageUsers(profile?.role) ? [{ href: "/users", label: "Users", icon: UserCog }] : []),
  ];

  return (
    // h-dvh + flex column so the header stays fixed and the nav scrolls
    // internally when the list is taller than the viewport. The outer shell
    // is overflow-hidden, so this sidebar never moves when main scrolls.
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gadget-zone-logo.png"
          alt="Gadget Zone Logo"
          className="h-11 w-auto max-w-[80px] object-contain rounded-lg"
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
            Gadget Zone
          </p>
          <p className="text-lg font-black text-slate-950">Online POS</p>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
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
