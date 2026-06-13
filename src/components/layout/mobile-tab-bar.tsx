"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-provider";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, Banknote, BarChart3,
  Truck, ListChecks, PackageCheck, ScrollText, UserCog, Settings, MonitorCog
} from "lucide-react";

import type { ComponentType } from "react";

const tabDefs: Record<string, { labelKey: string; fallback: string; icon: ComponentType<{ className?: string }> }> = {
  "/dashboard": { labelKey: "dashboard", fallback: "Dashboard", icon: LayoutDashboard },
  "/pos": { labelKey: "pos", fallback: "POS", icon: ShoppingCart },
  "/products": { labelKey: "products", fallback: "Products", icon: Boxes },
  "/customers": { labelKey: "customers", fallback: "Customers", icon: Users },
  "/invoices": { labelKey: "invoices", fallback: "Invoices", icon: ReceiptText },
  "/returns": { labelKey: "returns", fallback: "Returns", icon: RotateCcw },
  "/repairs": { labelKey: "repairs", fallback: "Repairs", icon: Wrench },
  "/expenses": { labelKey: "expenses", fallback: "Expenses", icon: Wallet },
  "/daily-closing": { labelKey: "dailyClosing", fallback: "Cash Drawer", icon: Banknote },
  "/reports": { labelKey: "reports", fallback: "Reports", icon: BarChart3 },
  "/suppliers/purchases": { labelKey: "purchases", fallback: "Purchases", icon: Truck },
  "/suppliers/dues": { labelKey: "dues", fallback: "Supplier Dues", icon: ListChecks },
  "/purchases/replenishment": { labelKey: "replenishment", fallback: "Replenishment", icon: PackageCheck },
  "/audit-log": { labelKey: "auditLog", fallback: "Audit Log", icon: ScrollText },
  "/users": { labelKey: "users", fallback: "Users", icon: UserCog },
  "/settings": { labelKey: "settings", fallback: "Settings", icon: Settings },
  "/platform": { labelKey: "platform", fallback: "Platform", icon: MonitorCog },
};

export function MobileTabBar() {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => sidebarDict?.[key] || fallback;

  const [mobileTabs, setMobileTabs] = useState<string[]>([]);

  useEffect(() => {
    const loadTabs = () => {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem("saledock-sidebar-preferences-v1");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.mobileTabs) && parsed.mobileTabs.length >= 4 && parsed.mobileTabs.length <= 6) {
            setMobileTabs(parsed.mobileTabs);
            return;
          }
        } catch {}
      }
      setMobileTabs(["/dashboard", "/pos", "/invoices", "/daily-closing", "/products"]);
    };
    loadTabs();
    window.addEventListener("storage", loadTabs);
    window.addEventListener("saledock-sidebar-preferences-changed", loadTabs);
    return () => {
      window.removeEventListener("storage", loadTabs);
      window.removeEventListener("saledock-sidebar-preferences-changed", loadTabs);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const displayedTabs = mobileTabs
    .map((href) => {
      const def = tabDefs[href];
      if (!def) return null;
      return { href, ...def };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-[#fff]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
      <div className="flex h-16 items-center justify-around px-1">
        {displayedTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 px-1 py-1 text-center transition cursor-pointer select-none min-w-0 ${
                active
                  ? "text-[#0b2f6f] dark:text-teal-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="mt-1 text-[9px] min-[360px]:text-[10px] font-bold truncate max-w-full">
                {t(tab.labelKey, tab.fallback)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
