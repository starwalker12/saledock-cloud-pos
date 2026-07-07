"use client";

import { Menu } from "lucide-react";
import { useDrawer } from "@/components/layout/drawer-context";

export function MobileDrawerTrigger() {
  const { openDrawer } = useDrawer();

  return (
    <button
      type="button"
      onClick={openDrawer}
      className="flex size-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
      aria-label="Open navigation menu"
    >
      <Menu className="size-6" />
    </button>
  );
}
