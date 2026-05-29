"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-provider";

const labelKeyMap: Record<string, string> = {
  "/dashboard": "dashboard",
  "/pos": "pos",
  "/products": "products",
  "/repairs": "repairs",
  "/invoices": "invoices",
  "/returns": "returns",
  "/expenses": "expenses",
  "/daily-closing": "dailyClosing",
  "/reports": "reports",
  "/suppliers/purchases": "purchases",
  "/customers": "customers",
  "/audit-log": "auditLog",
  "/users": "users",
};

export function MobileNav({ links }: { links: string[][] }) {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;
  const t = (href: string, fallback: string) => {
    const key = labelKeyMap[href];
    return key && sidebarDict?.[key] ? sidebarDict[key] : fallback;
  };

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 lg:hidden">
      <nav
        className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Mobile primary navigation"
      >
        {links.map(([label, href]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                active
                  ? "border-blue-700 bg-blue-700 text-white shadow-sm dark:border-slate-100 dark:bg-white dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t(href, label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
