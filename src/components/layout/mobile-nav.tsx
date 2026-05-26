"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav({ links }: { links: string[][] }) {
  const pathname = usePathname();

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
                  ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
