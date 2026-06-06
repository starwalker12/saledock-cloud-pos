"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, CalendarCheck, BarChart3,
  Truck, ScrollText, UserCog, Settings, MonitorCog, PackageCheck, ListChecks,
  GripVertical, PanelLeftClose, PanelLeftOpen, Archive, ArchiveRestore,
  ArrowUp, ArrowDown, RefreshCcw,
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

type SidebarPreferences = {
  version: 1;
  collapsed: boolean;
  order: string[];
  archived: string[];
  updatedAt: string;
};

const STORAGE_KEY = "saledock-sidebar-preferences-v1";
const STORAGE_EVENT = "saledock-sidebar-preferences-changed";
const PROTECTED_HREFS = new Set(["/dashboard", "/pos"]);

function createDefaultPreferences(): SidebarPreferences {
  return {
    version: 1,
    collapsed: false,
    order: [],
    archived: [],
    updatedAt: "",
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

function parseStoredPreferences(raw: string | null): SidebarPreferences {
  try {
    if (!raw) return createDefaultPreferences();
    const parsed = JSON.parse(raw) as Partial<SidebarPreferences>;

    return {
      version: 1,
      collapsed: parsed.collapsed === true,
      order: uniqueStrings(parsed.order),
      archived: uniqueStrings(parsed.archived),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return createDefaultPreferences();
  }
}

function getPreferenceSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function getServerPreferenceSnapshot(): string {
  return "";
}

function subscribeToPreferences(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const handleLocalChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, handleLocalChange);
  };
}

function writeStoredPreferences(next: SidebarPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function clearStoredPreferences() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function normalizeOrder(items: NavItem[], storedOrder: string[]): string[] {
  const knownHrefs = new Set(items.map((item) => item.href));
  const saved = storedOrder.filter((href) => knownHrefs.has(href));
  const missing = items.map((item) => item.href).filter((href) => !saved.includes(href));
  return [...saved, ...missing];
}

export function SidebarNav({ items, appLogoUrl }: { items: NavItem[]; appLogoUrl: string | null }) {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;
  const preferenceSnapshot = useSyncExternalStore(
    subscribeToPreferences,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );
  const prefs = useMemo(() => parseStoredPreferences(preferenceSnapshot), [preferenceSnapshot]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const draggingHrefRef = useRef<string | null>(null);
  const lastDragTargetRef = useRef<string | null>(null);
  const archivePanelRef = useRef<HTMLDivElement>(null);

  const labelFallback: Record<string, string> = {
    supplierDues: "Supplier Dues",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    dragToReorder: "Drag to reorder",
    moveUp: "Move up",
    moveDown: "Move down",
    archiveNavItem: "Archive tab",
    archived: "Archived",
    noArchivedItems: "No archived tabs",
    unarchiveNavItem: "Unarchive",
    resetSidebar: "Reset sidebar to default",
  };
  const t = (key: string) => sidebarDict?.[key] || labelFallback[key] || key;

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

  useEffect(() => {
    if (!archiveOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArchiveOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!archivePanelRef.current?.contains(event.target as Node)) {
        setArchiveOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [archiveOpen]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.href, item])), [items]);
  const orderedHrefs = useMemo(() => normalizeOrder(items, prefs.order), [items, prefs.order]);
  const activeHref = items.find((item) => isActive(item.href))?.href ?? null;
  const archivedHrefs = useMemo(() => {
    return new Set(
      prefs.archived.filter((href) => itemMap.has(href) && !PROTECTED_HREFS.has(href) && href !== activeHref),
    );
  }, [activeHref, itemMap, prefs.archived]);

  const orderedItems = orderedHrefs
    .map((href) => itemMap.get(href))
    .filter((item): item is NavItem => Boolean(item));
  const visibleItems = orderedItems.filter((item) => !archivedHrefs.has(item.href));
  const archivedItems = orderedItems.filter((item) => archivedHrefs.has(item.href));
  const collapsed = prefs.collapsed;

  const storePreferences = (updater: (current: SidebarPreferences) => SidebarPreferences) => {
    const next = {
      ...updater(parseStoredPreferences(getPreferenceSnapshot())),
      version: 1 as const,
      updatedAt: new Date().toISOString(),
    };
    writeStoredPreferences(next);
  };

  const resetSidebar = () => {
    clearStoredPreferences();
    setArchiveOpen(false);
  };

  const moveHref = (sourceHref: string, targetHref: string, placement: "before" | "after") => {
    if (sourceHref === targetHref) return;

    storePreferences((current) => {
      const nextOrder = normalizeOrder(items, current.order).filter((href) => href !== sourceHref);
      const targetIndex = nextOrder.indexOf(targetHref);
      if (targetIndex === -1) return current;

      nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceHref);
      return { ...current, order: nextOrder };
    });
  };

  const moveVisibleItem = (href: string, direction: -1 | 1) => {
    const currentIndex = visibleItems.findIndex((item) => item.href === href);
    const target = visibleItems[currentIndex + direction];
    if (!target) return;
    moveHref(href, target.href, direction > 0 ? "after" : "before");
  };

  const archiveItem = (item: NavItem) => {
    if (PROTECTED_HREFS.has(item.href) || isActive(item.href)) return;

    storePreferences((current) => ({
      ...current,
      archived: [...new Set([...current.archived, item.href])],
    }));
  };

  const unarchiveItem = (href: string) => {
    storePreferences((current) => ({
      ...current,
      archived: current.archived.filter((archivedHref) => archivedHref !== href),
    }));
  };

  const toggleCollapsed = () => {
    storePreferences((current) => ({ ...current, collapsed: !current.collapsed }));
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, href: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingHrefRef.current = href;
    lastDragTargetRef.current = null;
    setDraggingHref(href);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceHref = draggingHrefRef.current;
    if (!sourceHref) return;

    event.preventDefault();
    const rawTarget = document.elementFromPoint(event.clientX, event.clientY);
    const targetElement = rawTarget instanceof HTMLElement
      ? rawTarget.closest("[data-sidebar-nav-href]")
      : null;
    const targetHref = targetElement instanceof HTMLElement ? targetElement.dataset.sidebarNavHref : null;
    if (!targetHref || targetHref === sourceHref || targetHref === lastDragTargetRef.current) return;

    const sourceIndex = visibleItems.findIndex((item) => item.href === sourceHref);
    const targetIndex = visibleItems.findIndex((item) => item.href === targetHref);
    if (sourceIndex === -1 || targetIndex === -1) return;

    moveHref(sourceHref, targetHref, targetIndex > sourceIndex ? "after" : "before");
    lastDragTargetRef.current = targetHref;
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingHrefRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingHrefRef.current = null;
    lastDragTargetRef.current = null;
    setDraggingHref(null);
  };

  return (
    <aside
      className={`hidden h-dvh shrink-0 flex-col border-r border-slate-200 bg-[#f8fafc] text-slate-950 transition-[width] duration-200 dark:border-slate-800 dark:bg-[#020617] dark:text-slate-50 lg:flex ${
        collapsed ? "w-24" : "w-72"
      }`}
    >
      <div className={`flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 dark:border-slate-800 ${collapsed ? "justify-center px-3" : "px-6"}`}>
        <Link
          href="/dashboard"
          className={`flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label="SaleDock Cloud POS"
          title={collapsed ? "SaleDock Cloud POS" : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/saledock-logo-full.png"
            alt="SaleDock Cloud POS"
            className={`${collapsed ? "h-8 max-w-10" : "h-9 max-w-[160px]"} w-auto object-contain brightness-0 dark:invert`}
          />
          {!collapsed && appLogoUrl && (
            <>
              <div className="h-8 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={appLogoUrl}
                src={appLogoUrl}
                alt="Shop logo"
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            </>
          )}
        </Link>
      </div>

      <div className="flex items-center justify-end border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-[#f1f5f9] text-slate-600 transition hover:bg-[#e2e8f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#1e293b]"
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`} aria-label="Main navigation">
        <ul className="space-y-1">
          {visibleItems.map((item, index) => {
            const Icon = iconMap[item.icon];
            const active = isActive(item.href);
            const label = t(item.label);
            const canArchive = !PROTECTED_HREFS.has(item.href) && !active;
            const dragging = draggingHref === item.href;

            return (
              <li
                key={item.href}
                data-sidebar-nav-href={item.href}
                className={`group/navitem relative flex min-h-12 items-center gap-1 rounded-xl ${
                  dragging ? "opacity-70 ring-2 ring-teal-500" : ""
                }`}
              >
                <button
                  type="button"
                  onPointerDown={(event) => beginDrag(event, item.href)}
                  onPointerMove={updateDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`flex size-8 shrink-0 touch-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e2e8f0] hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-500 dark:hover:bg-[#1e293b] dark:hover:text-slate-200 ${
                    collapsed ? "" : "opacity-70 group-hover/navitem:opacity-100 group-focus-within/navitem:opacity-100"
                  }`}
                  aria-label={`${t("dragToReorder")}: ${label}`}
                  title={`${t("dragToReorder")}: ${label}`}
                >
                  <GripVertical className="size-4" />
                </button>

                <Link
                  href={item.href}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={`relative flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    collapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-[#0b2f6f]/10 text-[#0b2f6f] ring-1 ring-[#0b2f6f]/10 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-[#0d9488] dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/10"
                      : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  {Icon && <Icon className="size-4 shrink-0" />}
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>

                {!collapsed && (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/navitem:opacity-100 group-focus-within/navitem:opacity-100">
                    <button
                      type="button"
                      onClick={() => moveVisibleItem(item.href, -1)}
                      disabled={index === 0}
                      className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e2e8f0] hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-[#1e293b] dark:hover:text-slate-200"
                      aria-label={`${t("moveUp")}: ${label}`}
                      title={`${t("moveUp")}: ${label}`}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveVisibleItem(item.href, 1)}
                      disabled={index === visibleItems.length - 1}
                      className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e2e8f0] hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-[#1e293b] dark:hover:text-slate-200"
                      aria-label={`${t("moveDown")}: ${label}`}
                      title={`${t("moveDown")}: ${label}`}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    {canArchive && (
                      <button
                        type="button"
                        onClick={() => archiveItem(item)}
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-amber-100 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-amber-500/15 dark:hover:text-amber-200"
                        aria-label={`${t("archiveNavItem")}: ${label}`}
                        title={`${t("archiveNavItem")}: ${label}`}
                      >
                        <Archive className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div ref={archivePanelRef} className="relative shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
        {archiveOpen && (
          <div
            id="sidebar-archive-panel"
            className={`absolute bottom-full z-30 mb-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-[#f8fafc] p-3 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-[#0f172a] dark:shadow-black/40 ${
              collapsed ? "left-2 w-72" : "left-3 right-3"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("archived")}
              </p>
              <button
                type="button"
                onClick={resetSidebar}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-[#f1f5f9] px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-[#e2e8f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-[#020617] dark:text-slate-300 dark:hover:bg-[#1e293b]"
              >
                <RefreshCcw className="size-3.5" />
                {t("resetSidebar")}
              </button>
            </div>

            {archivedItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t("noArchivedItems")}
              </p>
            ) : (
              <ul className="space-y-1">
                {archivedItems.map((item) => {
                  const Icon = iconMap[item.icon];
                  const label = t(item.label);
                  return (
                    <li key={item.href} className="flex items-center gap-2 rounded-xl p-1">
                      <Link
                        href={item.href}
                        onClick={() => unarchiveItem(item.href)}
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition hover:bg-[#e2e8f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-200 dark:hover:bg-[#1e293b]"
                      >
                        {Icon && <Icon className="size-4 shrink-0" />}
                        <span className="truncate">{label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => unarchiveItem(item.href)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#e2e8f0] hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-[#1e293b] dark:hover:text-slate-100"
                        aria-label={`${t("unarchiveNavItem")}: ${label}`}
                        title={`${t("unarchiveNavItem")}: ${label}`}
                      >
                        <ArchiveRestore className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setArchiveOpen((open) => !open)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-[#f1f5f9] px-3 text-sm font-bold text-slate-600 transition hover:bg-[#e2e8f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#1e293b] ${
            collapsed ? "justify-center" : ""
          }`}
          aria-controls="sidebar-archive-panel"
          aria-expanded={archiveOpen}
          aria-label={t("archived")}
          title={collapsed ? t("archived") : undefined}
        >
          <Archive className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{t("archived")}</span>
              <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                {archivedItems.length}
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
