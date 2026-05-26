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
  ["Customers", "/customers"],
  ["Audit Log", "/audit-log"],
  ["Users", "/users"],
];

export function AppShell({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) {
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Topbar pageTitle={pageTitle} />
          <MobileNav links={mobileLinks} />
          <main className="min-w-0 p-3 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
