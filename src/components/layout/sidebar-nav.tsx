"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";
import { useReorderAnim } from "@/lib/use-reorder-animation";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, Banknote, BarChart3,
  Truck, ScrollText, UserCog, Settings, MonitorCog, PackageCheck, ListChecks,
  GripVertical, PanelLeftClose, PanelLeftOpen, Archive, ArchiveRestore,
  Check, RefreshCcw, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";
import { saveSidebarPreferences, useUIPreferencesSync } from "@/lib/use-ui-preferences";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  products: Boxes,
  customers: Users,
  invoices: ReceiptText,
  returns: RotateCcw,
  repairs: Wrench,
  expenses: Wallet,
  dailyClosing: Banknote,
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
  // Cookie-consent values are stored in the same preferences object for signed-in
  // users. Preserve them so sidebar operations do not wipe consent decisions.
  analyticsConsent?: "accepted" | "rejected";
  marketingConsent?: "accepted" | "rejected";
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
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      ...parsed,
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
  saveSidebarPreferences(next);
}

function clearStoredPreferences() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(STORAGE_EVENT));
  saveSidebarPreferences(null);
}

function normalizeOrder(items: NavItem[], storedOrder: string[]): string[] {
  const knownHrefs = new Set(items.map((item) => item.href));
  const saved = storedOrder.filter((href) => knownHrefs.has(href));
  const missing = items.map((item) => item.href).filter((href) => !saved.includes(href));
  return [...saved, ...missing];
}

export function SidebarNav({ items, appLogoUrl }: { items: NavItem[]; appLogoUrl: string | null }) {
  useUIPreferencesSync();
  const pathname = usePathname();
  const { dict } = useLanguage();
  const confirm = useConfirmDialog();
  const [rearrangeMode, setRearrangeMode] = useState(false);
  const logoUrl = appLogoUrl || "/saledock-logo-mark.png";
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;
  const preferenceSnapshot = useSyncExternalStore(
    subscribeToPreferences,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );
  const prefs = useMemo(() => parseStoredPreferences(preferenceSnapshot), [preferenceSnapshot]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [pendingArchiveHref, setPendingArchiveHref] = useState<string | null>(null);
  const draggingHrefRef = useRef<string | null>(null);
  const lastDragTargetRef = useRef<string | null>(null);
  const archivePanelRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const justDraggedRef = useRef<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentTargetIndexRef = useRef<number | null>(null);
  const siblingRectsRef = useRef<Array<{ el: HTMLElement; href: string; index: number; rect: DOMRect }>>([]);

  const getDraggedElement = (href: string) => {
    return navListRef.current?.querySelector<HTMLElement>(`[data-sidebar-nav-href="${href}"]`) ?? null;
  };

  const cleanupStyles = () => {
    if (!navListRef.current) return;
    const items = navListRef.current.querySelectorAll<HTMLElement>("[data-sidebar-nav-href]");
    items.forEach((item) => {
      item.style.transform = "";
      item.style.transition = "";
      item.style.boxShadow = "";
      item.style.opacity = "";
      item.style.zIndex = "";
      item.style.pointerEvents = "";
      item.style.willChange = "";
    });
  };

  useEffect(() => {
    if (!draggingHref) {
      cleanupStyles();
    }
  }, [draggingHref]);

  const labelFallback: Record<string, string> = {
    supplierDues: "Supplier Dues",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    dragToReorder: "Drag to reorder",
    moveEarlier: "Move earlier",
    moveLater: "Move later",
    archiveNavItem: "Archive tab",
    confirmArchiveNavItem: "Confirm archive",
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

  // Keep the active nav item visible after navigation. Some layouts reset the
  // sidebar scroll to the top on route change, which can hide the selected tab.
  // `block: "nearest"` only scrolls when the item is off-screen (no jump if it
  // is already visible, no layout shift on unrelated renders) and never steals
  // keyboard focus.
  useEffect(() => {
    const el = navListRef.current?.querySelector<HTMLElement>('[data-sidebar-active="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [pathname]);

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

  useEffect(() => {
    if (!pendingArchiveHref) return;

    const cancelPendingArchive = () => {
      setPendingArchiveHref((current) => (current === pendingArchiveHref ? null : current));
    };
    const timeoutId = window.setTimeout(cancelPendingArchive, 3000);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPendingArchive();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const archiveButton = event.target instanceof Element
        ? event.target.closest("[data-sidebar-archive-href]")
        : null;
      if (
        archiveButton instanceof HTMLElement &&
        archiveButton.dataset.sidebarArchiveHref === pendingArchiveHref
      ) {
        return;
      }

      cancelPendingArchive();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pendingArchiveHref]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.href, item])), [items]);
  const orderedHrefs = useMemo(() => normalizeOrder(items, prefs.order), [items, prefs.order]);
  const archivedHrefs = useMemo(() => {
    return new Set(
      prefs.archived.filter((href) => itemMap.has(href) && !PROTECTED_HREFS.has(href)),
    );
  }, [itemMap, prefs.archived]);

  const orderedItems = orderedHrefs
    .map((href) => itemMap.get(href))
    .filter((item): item is NavItem => Boolean(item));
  const visibleItems = orderedItems.filter((item) => !archivedHrefs.has(item.href));
  const archivedItems = orderedItems.filter((item) => archivedHrefs.has(item.href));
  const collapsed = prefs.collapsed;
  const displayCollapsed = collapsed && !rearrangeMode;

  useReorderAnim(navListRef, "sidebar-nav-href", [visibleItems], justDraggedRef);

  const storePreferences = (updater: (current: SidebarPreferences) => SidebarPreferences) => {
    const next = {
      ...updater(parseStoredPreferences(getPreferenceSnapshot())),
      version: 1 as const,
      updatedAt: new Date().toISOString(),
    };
    writeStoredPreferences(next);
  };

  const resetSidebar = async () => {
    const shouldReset = await confirm({
      title: "Reset sidebar?",
      message: "Are you sure you want to reset the sidebar and bottom tabs to their default setup?",
      confirmLabel: "Reset",
      cancelLabel: "Cancel",
      variant: "destructive",
    });

    if (!shouldReset) return;

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

  const moveVisibleItem = (sourceHref: string, direction: "earlier" | "later") => {
    const sourceIndex = visibleItems.findIndex((item) => item.href === sourceHref);
    if (sourceIndex === -1) return;

    const targetIndex = direction === "earlier" ? sourceIndex - 1 : sourceIndex + 1;
    const targetItem = visibleItems[targetIndex];
    if (!targetItem) return;

    justDraggedRef.current = sourceHref;
    moveHref(sourceHref, targetItem.href, direction === "earlier" ? "before" : "after");
  };

  const archiveItem = (item: NavItem) => {
    if (PROTECTED_HREFS.has(item.href) || isActive(item.href)) return;

    storePreferences((current) => ({
      ...current,
      archived: [...new Set([...current.archived, item.href])],
    }));
  };

  const handleArchiveAction = (item: NavItem, isConfirming: boolean) => {
    if (isConfirming) {
      setPendingArchiveHref(null);
      archiveItem(item);
      return;
    }

    setPendingArchiveHref(item.href);
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

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReduced) {
      dragStartPosRef.current = { x: event.clientX, y: event.clientY };
      const el = getDraggedElement(href);
      if (el) {
        el.style.transform = "translate(0px, 0px) scale(1.03)";
        el.style.boxShadow = "0 8px 25px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)";
        el.style.opacity = "0.92";
        el.style.zIndex = "1000";
        el.style.pointerEvents = "none";
        el.style.willChange = "transform";
      }
    }

    // Measure sibling elements' initial rects and heights once at drag start
    const sourceIndex = visibleItems.findIndex((item) => item.href === href);
    currentTargetIndexRef.current = sourceIndex;

    const listItems = Array.from(navListRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-nav-href]") ?? []);
    siblingRectsRef.current = listItems.map((item, index) => {
      const itemHref = item.getAttribute("data-sidebar-nav-href")!;
      if (!prefersReduced && itemHref !== href) {
        item.style.transition = "transform 150ms ease";
      }
      return {
        el: item,
        href: itemHref,
        index,
        rect: item.getBoundingClientRect(),
      };
    });
  };

  const updateDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceHref = draggingHrefRef.current;
    if (!sourceHref) return;

    event.preventDefault();

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReduced && dragStartPosRef.current) {
      const el = getDraggedElement(sourceHref);
      if (el) {
        const dx = event.clientX - dragStartPosRef.current.x;
        const dy = event.clientY - dragStartPosRef.current.y;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
      }
    }

    // Find the height of the dragged item from siblingRectsRef
    const draggedInfo = siblingRectsRef.current.find((s) => s.href === sourceHref);
    if (!draggedInfo) return;

    const sourceIndex = draggedInfo.index;
    const draggedHeight = draggedInfo.rect.height;

    // Calculate targetIndex based on other items' midpoints compared to event.clientY
    let targetIndex = 0;
    const siblings = siblingRectsRef.current.filter((s) => s.href !== sourceHref);
    siblings.forEach((s) => {
      const midpoint = s.rect.top + s.rect.height / 2;
      if (event.clientY > midpoint) {
        targetIndex++;
      }
    });

    if (targetIndex !== currentTargetIndexRef.current) {
      currentTargetIndexRef.current = targetIndex;

      // Apply index-based transforms to all other items to open a gap ONLY IF NOT prefersReduced
      if (!prefersReduced) {
        siblingRectsRef.current.forEach((s) => {
          if (s.href === sourceHref) return;

          let transformVal = "none";
          if (targetIndex < sourceIndex) {
            if (s.index >= targetIndex && s.index < sourceIndex) {
              transformVal = `translateY(${draggedHeight}px)`;
            }
          } else if (targetIndex > sourceIndex) {
            if (s.index > sourceIndex && s.index <= targetIndex) {
              transformVal = `translateY(${-draggedHeight}px)`;
            }
          }
          s.el.style.transform = transformVal;
        });
      }
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceHref = draggingHrefRef.current;
    if (!sourceHref) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const targetIndex = currentTargetIndexRef.current;
    const sourceIndex = visibleItems.findIndex((item) => item.href === sourceHref);

    if (targetIndex !== null && targetIndex !== sourceIndex && targetIndex >= 0) {
      const targetItem = visibleItems[targetIndex];
      if (targetItem) {
        justDraggedRef.current = sourceHref;
        moveHref(sourceHref, targetItem.href, targetIndex > sourceIndex ? "after" : "before");
      }
    }

    draggingHrefRef.current = null;
    lastDragTargetRef.current = null;
    dragStartPosRef.current = null;
    currentTargetIndexRef.current = null;
    siblingRectsRef.current = [];
    setDraggingHref(null);
    cleanupStyles();
  };

  return (
    <aside
      data-sidebar-state={displayCollapsed ? "collapsed" : "expanded"}
      data-sidebar-stored-collapsed={collapsed ? "true" : "false"}
      className={`hidden h-dvh shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] text-[var(--sidebar-inactive)] transition-[width] duration-200 lg:flex ${
        displayCollapsed ? "w-24" : "w-72"
      }`}
    >
      <div className={`flex h-20 shrink-0 items-center gap-3 border-b border-[var(--sidebar-border)] ${displayCollapsed ? "justify-center px-3" : "px-6"}`}>
        <Link
          href="/dashboard"
          className={`flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
            displayCollapsed ? "justify-center" : ""
          }`}
          aria-label="SaleDock Cloud POS"
          title={displayCollapsed ? "SaleDock Cloud POS" : undefined}
        >
          {displayCollapsed ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#fff] p-1.5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={logoUrl}
                src={logoUrl}
                alt="Shop logo"
                className="size-full object-contain"
              />
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/saledock-logo-full.png"
                alt="SaleDock Cloud POS"
                className="h-8 max-w-[120px] w-auto object-contain brightness-0 invert"
              />
              <div className="h-8 w-px shrink-0 bg-[var(--sidebar-border-strong)]" />
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#fff] p-1.5 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={logoUrl}
                  src={logoUrl}
                  alt="Shop logo"
                  className="size-full object-contain"
                />
              </div>
            </>
          )}
        </Link>
      </div>

      <div className={`flex border-b border-[var(--sidebar-border)] px-3 py-2 ${displayCollapsed ? "flex-row items-center justify-center gap-1.5" : "flex-row items-center justify-between"}`}>
        <div className="relative group/rearrange">
          <button
            type="button"
            onClick={() => setRearrangeMode((prev) => !prev)}
            className={`flex items-center justify-center rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
              displayCollapsed ? "size-8 shrink-0" : "h-10 px-3 gap-2 text-xs font-bold"
            } ${
              rearrangeMode
                ? "border-[var(--sidebar-active-accent)] bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                : "border-[var(--sidebar-border-strong)] bg-[var(--sidebar-control-bg)] text-[var(--sidebar-inactive)] hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)]"
            }`}
            aria-label={rearrangeMode ? "Done rearranging" : "Rearrange items"}
          >
            {rearrangeMode ? <Check className="size-4 shrink-0" /> : <ArrowUpDown className="size-4 shrink-0" />}
            {!displayCollapsed && <span>{rearrangeMode ? "Done" : "Rearrange"}</span>}
          </button>
          {displayCollapsed && (
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/rearrange:translate-x-0 group-hover/rearrange:scale-100 group-hover/rearrange:opacity-100 group-focus-within/rearrange:translate-x-0 group-focus-within/rearrange:scale-100 group-focus-within/rearrange:opacity-100">
              <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white shadow-xl dark:bg-slate-800 dark:text-slate-100 border border-slate-700/50 whitespace-nowrap">
                {rearrangeMode ? "Done rearranging" : "Rearrange items"}
              </div>
            </div>
          )}
        </div>

        <div className="relative group/togglecol">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`flex items-center justify-center rounded-xl border border-[var(--sidebar-border-strong)] bg-[var(--sidebar-control-bg)] text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
              displayCollapsed ? "size-8 shrink-0" : "size-10"
            }`}
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          {displayCollapsed && (
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/togglecol:translate-x-0 group-hover/togglecol:scale-100 group-hover/togglecol:opacity-100 group-focus-within/togglecol:translate-x-0 group-focus-within/togglecol:scale-100 group-focus-within/togglecol:opacity-100">
              <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white shadow-xl dark:bg-slate-800 dark:text-slate-100 border border-slate-700/50 whitespace-nowrap">
                {t("expandSidebar")}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto py-4 ${displayCollapsed ? "px-2" : "px-3"}`} aria-label="Main navigation">
        <ul ref={navListRef} className="space-y-1">
          {visibleItems.map((item, index) => {
            const Icon = iconMap[item.icon];
            const active = isActive(item.href);
            const label = t(item.label);
            const canArchive = !PROTECTED_HREFS.has(item.href) && !active;
            const dragging = draggingHref === item.href;
            const isConfirmingArchive = pendingArchiveHref === item.href;
            const canMoveEarlier = index > 0;
            const canMoveLater = index < visibleItems.length - 1;

            return (
              <li
                key={item.href}
                data-sidebar-nav-href={item.href}
                data-sidebar-active={active ? "true" : undefined}
                onPointerLeave={() => {
                  if (isConfirmingArchive) {
                    setPendingArchiveHref((current) => (current === item.href ? null : current));
                  }
                }}
                className={`group/navitem relative flex min-h-12 items-center gap-1 rounded-xl ${
                  dragging ? "opacity-70 ring-2 ring-[var(--sidebar-active-accent)]" : ""
                }`}
              >
                {rearrangeMode && (
                  <>
                    <button
                      type="button"
                      data-sidebar-reorder-control="earlier"
                      data-sidebar-reorder-href={item.href}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        moveVisibleItem(item.href, "earlier");
                      }}
                      disabled={!canMoveEarlier}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--sidebar-inactive)]"
                      aria-label={`${t("moveEarlier")}: ${label}`}
                      title={`${t("moveEarlier")}: ${label}`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      data-sidebar-reorder-control="later"
                      data-sidebar-reorder-href={item.href}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        moveVisibleItem(item.href, "later");
                      }}
                      disabled={!canMoveLater}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--sidebar-inactive)]"
                      aria-label={`${t("moveLater")}: ${label}`}
                      title={`${t("moveLater")}: ${label}`}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => beginDrag(event, item.href)}
                      onPointerMove={updateDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="flex size-10 shrink-0 touch-none items-center justify-center rounded-lg text-[var(--sidebar-drag-handle)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-drag-handle-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] opacity-70 group-hover/navitem:opacity-100 group-focus-within/navitem:opacity-100"
                      aria-label={`${t("dragToReorder")}: ${label}`}
                      title={`${t("dragToReorder")}: ${label}`}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  </>
                )}

                <Link
                  href={item.href}
                  aria-label={displayCollapsed ? label : undefined}
                  className={`relative flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
                    displayCollapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] ring-1 ring-[var(--sidebar-ring)] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-[var(--sidebar-active-accent)]"
                      : "text-[var(--sidebar-inactive)] hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)]"
                  }`}
                >
                  {Icon && <Icon className="size-[22px] shrink-0" />}
                  {!displayCollapsed && <span className="truncate">{label}</span>}
                </Link>

                {displayCollapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/navitem:translate-x-0 group-hover/navitem:scale-100 group-hover/navitem:opacity-100 group-focus-within/navitem:translate-x-0 group-focus-within/navitem:scale-100 group-focus-within/navitem:opacity-100">
                    <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white shadow-xl dark:bg-slate-800 dark:text-slate-100 border border-slate-700/50 whitespace-nowrap">
                      {label}
                    </div>
                  </div>
                )}

                {!displayCollapsed && canArchive && (
                  <div
                    className={`flex shrink-0 items-center transition ${
                      isConfirmingArchive
                        ? "opacity-100"
                        : "opacity-0 group-hover/navitem:opacity-100 group-focus-within/navitem:opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      data-sidebar-archive-href={item.href}
                      onClick={() => handleArchiveAction(item, isConfirmingArchive)}
                      onBlur={() => {
                        if (isConfirmingArchive) {
                          setPendingArchiveHref((current) => (current === item.href ? null : current));
                        }
                      }}
                      className={`flex size-8 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
                        isConfirmingArchive
                          ? "bg-[var(--sidebar-confirm-bg)] text-[var(--sidebar-confirm-text)] shadow-sm hover:bg-[var(--sidebar-confirm-hover)]"
                          : "text-[var(--sidebar-inactive)] hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)]"
                      }`}
                      aria-label={`${t(isConfirmingArchive ? "confirmArchiveNavItem" : "archiveNavItem")}: ${label}`}
                      aria-pressed={isConfirmingArchive}
                      title={`${t(isConfirmingArchive ? "confirmArchiveNavItem" : "archiveNavItem")}: ${label}`}
                    >
                      {isConfirmingArchive ? <Check className="size-3.5" /> : <Archive className="size-3.5" />}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div ref={archivePanelRef} className="relative shrink-0 border-t border-[var(--sidebar-border)] p-3">
        {archiveOpen && (
          <div
            id="sidebar-archive-panel"
            className={`absolute bottom-full z-30 mb-2 max-h-96 overflow-y-auto rounded-2xl border border-[var(--sidebar-border-popover)] bg-[var(--sidebar-popover-bg)] p-3 shadow-xl shadow-black/35 ${
              displayCollapsed ? "left-2 w-72" : "left-3 right-3"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--sidebar-inactive)]">
                {t("archived")}
              </p>
              <button
                type="button"
                onClick={resetSidebar}
                className="flex items-center gap-2 rounded-lg border border-[var(--sidebar-border-popover)] bg-[var(--sidebar-control-bg-strong)] px-2.5 py-1.5 text-xs font-bold text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-control-hover)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)]"
              >
                <RefreshCcw className="size-3.5" />
                {t("resetSidebar")}
              </button>
            </div>

            {archivedItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--sidebar-border-dashed)] px-3 py-4 text-center text-sm font-semibold text-[var(--sidebar-inactive)]">
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
                        onClick={() => setArchiveOpen(false)}
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)]"
                      >
                        {Icon && <Icon className="size-4 shrink-0" />}
                        <span className="truncate">{label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => unarchiveItem(item.href)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)]"
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

        <div className="relative group/archivebtn">
          <button
            type="button"
            onClick={() => setArchiveOpen((open) => !open)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-[var(--sidebar-border-strong)] bg-[var(--sidebar-control-bg)] px-3 text-sm font-bold text-[var(--sidebar-inactive)] transition hover:bg-[var(--sidebar-hover-overlay)] hover:text-[var(--sidebar-active-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-active-accent)] ${
              displayCollapsed ? "justify-center" : ""
            }`}
            aria-controls="sidebar-archive-panel"
            aria-expanded={archiveOpen}
            aria-label={t("archived")}
          >
            <Archive className="size-4 shrink-0" />
            {!displayCollapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{t("archived")}</span>
                <span className="rounded-full bg-[var(--sidebar-count-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--sidebar-active-text)]">
                  {archivedItems.length}
                </span>
              </>
            )}
          </button>
          {displayCollapsed && (
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/archivebtn:translate-x-0 group-hover/archivebtn:scale-100 group-hover/archivebtn:opacity-100 group-focus-within/archivebtn:translate-x-0 group-focus-within/archivebtn:scale-100 group-focus-within/archivebtn:opacity-100">
              <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white shadow-xl dark:bg-slate-800 dark:text-slate-100 border border-slate-700/50 whitespace-nowrap">
                {t("archived")} ({archivedItems.length})
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
