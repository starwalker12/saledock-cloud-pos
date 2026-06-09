"use client";

import { useCallback, startTransition, useOptimistic, type ComponentType } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Settings, UserCircle, Shield, Database, Archive, ShieldCheck, HelpCircle,
} from "lucide-react";
import { TabSkeleton } from "@/components/settings/tab-skeleton";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  general: Settings,
  accounts: UserCircle,
  privacy: Shield,
  "demo-data": Database,
  backup: Archive,
  security: ShieldCheck,
  help: HelpCircle,
};

export type TabDef = {
  id: string;
  label: string;
  icon: string;
};

export function SettingsTabShell({
  currentTab,
  tabs,
  heading,
  description,
  children,
}: {
  currentTab: string;
  tabs: TabDef[];
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [optimisticTab, setOptimisticTab] = useOptimistic(
    currentTab,
    (_curr, next: string) => next,
  );

  const goToTab = useCallback(
    (tabId: string) => {
      if (tabId === currentTab) return;
      startTransition(() => {
        setOptimisticTab(tabId);
        router.push(`${pathname}?tab=${tabId}`);
      });
    },
    [currentTab, pathname, router, setOptimisticTab],
  );

  const showSkeleton = optimisticTab !== currentTab;
  const activeTab = optimisticTab;

  return (
    <div className="w-full space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-slate-950 dark:text-slate-50">{heading}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700 gap-1 overflow-x-auto pb-px">
          {tabs.map((tab) => {
            const Icon = iconMap[tab.icon];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => goToTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition duration-200 shrink-0 ${
                  isActive
                    ? "rounded-t-xl border-[var(--primary-accent-bg)] bg-[var(--primary-accent-soft)] text-[var(--primary-accent-bg)] dark:border-[var(--primary-accent-bg)] dark:bg-[var(--primary-accent-soft)] dark:text-[var(--primary-accent-bg)]"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:border-slate-700"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {showSkeleton ? <TabSkeleton tabId={optimisticTab} /> : children}
    </div>
  );
}
