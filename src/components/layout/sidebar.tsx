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
} from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";

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
  const visibleItems = canManageUsers(profile?.role)
    ? [...items, { href: "/users", label: "Users", icon: UserCog }]
    : items;

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-6">
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
      <nav className="space-y-1 p-4">
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
