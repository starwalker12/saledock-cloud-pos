"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, CalendarCheck, BarChart3,
  Truck, ScrollText, UserCog, Settings, MonitorCog, PackageCheck, ListChecks,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  products: Boxes,
  customers: Users,
  invoices: ReceiptText,
  returns: RotateCcw,
  repairs: Wrench,
  expenses: Wallet,
  dailyClosing: CalendarCheck,
  reports: BarChart3,
  purchases: Truck,
  dues: ListChecks,
  replenishment: PackageCheck,
  auditLog: ScrollText,
  users: UserCog,
  settings: Settings,
  platform: MonitorCog,
};

export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;

  const t = (key: string) => sidebarDict?.[key] || key;

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    if (href === "/settings") {
      return pathname === "/settings" || pathname.startsWith("/settings");
    }
    if (href === "/pos") {
      return pathname === "/pos" || pathname.startsWith("/pos/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              active
                ? "bg-[#0b2f6f]/10 text-[#0b2f6f] ring-1 ring-[#0b2f6f]/10 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-[#0d9488] dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/10"
                : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
