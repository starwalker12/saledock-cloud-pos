import type { ReactNode } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

const mobileLinks = [
  ["Dashboard", "/dashboard"],
  ["POS", "/pos"],
  ["Products", "/products"],
  ["Repairs", "/repairs"],
  ["Invoices", "/invoices"],
  ["Returns", "/returns"],
  ["Expenses", "/expenses"],
  ["Closing", "/daily-closing"],
  ["Reports", "/reports"],
  ["Purchases", "/suppliers/purchases"],
  ["Customers", "/customers"],
  ["Audit Log", "/audit-log"],
  ["Users", "/users"],
];

export function AppShell({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) {
  // Viewport-sized shell where:
  //   - the sidebar fills full viewport height and scrolls internally if needed,
  //   - the topbar + mobile-nav sit as shrink-0 siblings above the content,
  //   - <main> is the single scroll container for page content.
  // h-dvh handles mobile address-bar resizing; overflow-hidden prevents the
  // whole document scrolling when content overflows.
  return (
    <div className="flex h-dvh max-w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar pageTitle={pageTitle} />
        <MobileNav links={mobileLinks} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
