"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useSyncExternalStore, useCallback } from "react";
import Link from "next/link";
import { LayoutGrid, Check, RotateCcw, Plus, ShoppingCart } from "lucide-react";
import { WidgetGrid, getWidgetDimsFromSize, getWidgetSizeFromDims } from "./widgets/widget-grid";
import { WidgetGallery } from "./widgets/widget-gallery";
import { BoardFillStyle, WIDGET_CATALOG, WidgetColor, WidgetFillStyle, WidgetSize } from "./widgets/widget-registry";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DASHBOARD_KEY,
  DASHBOARD_EVENT,
  saveDashboardLayout,
  useUIPreferencesSync,
} from "@/lib/use-ui-preferences";

export type DashboardLayoutLabels = {
  editLayout: string;
  done: string;
  resetLayout: string;
  dragToReorder: string;
  moveEarlier: string;
  moveLater: string;
  cardSize: string;
  setCardSize: string;
  small: string;
  medium: string;
  large: string;
  fillStyle: string;
  solid: string;
  gradient: string;
};

type WidgetInstance = {
  id: string;
  type: string;
  size: WidgetSize;
  color: WidgetColor;
  fillStyle?: WidgetFillStyle;
  x: number;
  y: number;
  w: number;
  h: number;
};

type DashboardPreferences = {
  widgets: WidgetInstance[];
  fillStyle: BoardFillStyle;
};

const DEFAULT_FILL_STYLE: BoardFillStyle = "solid";

// Default layout matching the current dashboard cards and sections
const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: "widget-today-profit", type: "today-profit", size: "S", color: "success", x: 0, y: 0, w: 1, h: 1 },
  { id: "widget-gross-sales", type: "gross-sales", size: "S", color: "success", x: 1, y: 0, w: 1, h: 1 },
  { id: "widget-returns", type: "returns", size: "S", color: "danger", x: 2, y: 0, w: 1, h: 1 },
  { id: "widget-expenses", type: "expenses", size: "S", color: "danger", x: 3, y: 0, w: 1, h: 1 },
  { id: "widget-low-stock", type: "low-stock", size: "S", color: "warning", x: 0, y: 1, w: 1, h: 1 },
  { id: "widget-pending-repairs", type: "pending-repairs", size: "S", color: "warning", x: 1, y: 1, w: 1, h: 1 },
  { id: "widget-supplier-dues", type: "supplier-dues", size: "S", color: "warning", x: 2, y: 1, w: 1, h: 1 },
  { id: "widget-customer-dues", type: "customer-dues", size: "S", color: "warning", x: 3, y: 1, w: 1, h: 1 },
  { id: "widget-weekly-sales", type: "weekly-sales", size: "M", color: "info", x: 0, y: 2, w: 2, h: 1 },
  { id: "widget-monthly-sales", type: "monthly-sales", size: "M", color: "info", x: 2, y: 2, w: 2, h: 1 },
  { id: "widget-top-selling-products", type: "top-selling-products", size: "L", color: "neutral", x: 0, y: 3, w: 4, h: 2 },
  { id: "widget-recent-activity", type: "recent-activity", size: "L", color: "neutral", x: 0, y: 5, w: 4, h: 2 },
  { id: "widget-credit-collected-today", type: "credit-collected-today", size: "S", color: "success", x: 0, y: 7, w: 1, h: 1 },
  { id: "widget-today-net", type: "today-net", size: "S", color: "success", x: 1, y: 7, w: 1, h: 1 },
  { id: "widget-today-closing", type: "today-closing", size: "S", color: "neutral", x: 2, y: 7, w: 1, h: 1 },
  { id: "widget-today-expenses", type: "today-expenses", size: "S", color: "danger", x: 3, y: 7, w: 1, h: 1 },
  { id: "widget-stock-valuation", type: "stock-valuation", size: "S", color: "neutral", x: 0, y: 8, w: 1, h: 1 },
  { id: "widget-potential-profit-in-stock", type: "potential-profit-in-stock", size: "M", color: "warning", x: 1, y: 8, w: 3, h: 1 },
];

const widgetSizes = new Set<WidgetSize>(["S", "M", "L", "XL"]);
const widgetColors = new Set<WidgetColor>(["neutral", "info", "success", "warning", "danger"]);
const widgetFillStyles = new Set<WidgetFillStyle>(["inherit", "solid", "gradient"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeWidgets(value: unknown): WidgetInstance[] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;

  const seenIds = new Set<string>();
  const normalized = value
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<WidgetInstance>;
      const catalog = WIDGET_CATALOG.find((widget) => widget.type === item.type);
      if (!catalog || typeof item.id !== "string") return null;

      const fallbackDims = getWidgetDimsFromSize(catalog.defaultSize);
      const w = isFiniteNumber(item.w) && item.w > 0 ? Math.min(Math.max(Math.round(item.w), 1), 4) : fallbackDims.w;
      const h = isFiniteNumber(item.h) && item.h > 0 ? Math.min(Math.max(Math.round(item.h), 1), 4) : fallbackDims.h;
      const size = widgetSizes.has(item.size as WidgetSize) ? (item.size as WidgetSize) : catalog.defaultSize;
      const derivedSize = getWidgetDimsFromSize(size);
      const normalizedW = item.w === undefined ? derivedSize.w : w;
      const normalizedH = item.h === undefined ? derivedSize.h : h;
      const fillStyle = widgetFillStyles.has(item.fillStyle as WidgetFillStyle)
        ? (item.fillStyle as WidgetFillStyle)
        : undefined;

      const id = seenIds.has(item.id) ? `${item.id}-${index}` : item.id;
      seenIds.add(id);

      const normalizedWidget: WidgetInstance = {
        id,
        type: catalog.type,
        size: getWidgetSizeFromDims(normalizedW, normalizedH),
        color: widgetColors.has(item.color as WidgetColor) ? (item.color as WidgetColor) : catalog.defaultColor,
        x: isFiniteNumber(item.x) ? Math.max(Math.round(item.x), 0) : index % 4,
        y: isFiniteNumber(item.y) ? Math.max(Math.round(item.y), 0) : Math.floor(index / 4),
        w: normalizedW,
        h: normalizedH,
      };

      if (fillStyle) {
        normalizedWidget.fillStyle = fillStyle;
      }

      return normalizedWidget;
    })
    .filter((item): item is WidgetInstance => item !== null);

  return normalized.length > 0 ? normalized : DEFAULT_WIDGETS;
}

function normalizeDashboardPreferences(layoutSnapshot: string): DashboardPreferences {
  if (!layoutSnapshot) {
    return { widgets: DEFAULT_WIDGETS, fillStyle: DEFAULT_FILL_STYLE };
  }

  try {
    const parsed = JSON.parse(layoutSnapshot);
    if (Array.isArray(parsed)) {
      return { widgets: normalizeWidgets(parsed), fillStyle: DEFAULT_FILL_STYLE };
    }
    if (parsed && typeof parsed === "object") {
      const prefs = parsed as { widgets?: unknown; fillStyle?: unknown; order?: unknown };
      if (Array.isArray(prefs.widgets)) {
        return {
          widgets: normalizeWidgets(prefs.widgets),
          fillStyle: prefs.fillStyle === "gradient" ? "gradient" : DEFAULT_FILL_STYLE,
        };
      }
      if (Array.isArray(prefs.order)) {
        return { widgets: DEFAULT_WIDGETS, fillStyle: DEFAULT_FILL_STYLE };
      }
    }
  } catch {
    return { widgets: DEFAULT_WIDGETS, fillStyle: DEFAULT_FILL_STYLE };
  }

  return { widgets: DEFAULT_WIDGETS, fillStyle: DEFAULT_FILL_STYLE };
}

function createWidgetId(type: string) {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `widget-${type}-${unique}`;
}

function getLayoutSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DASHBOARD_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerLayoutSnapshot(): string {
  return "";
}

function subscribeToLayout(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === DASHBOARD_KEY) onStoreChange();
  };
  const handleLocalChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(DASHBOARD_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(DASHBOARD_EVENT, handleLocalChange);
  };
}

export function DashboardStatLayout({
  firstName,
  role,
  organizationName,
  labels,
  widgetData,
}: {
  cards?: any[]; // kept for compatibility if needed
  firstName: string;
  role: string;
  organizationName: string;
  labels: DashboardLayoutLabels;
  widgetData: any;
}) {
  // Sync preferences with database on mount (fail-open)
  useUIPreferencesSync();
  const confirm = useConfirmDialog();

  const layoutSnapshot = useSyncExternalStore(
    subscribeToLayout,
    getLayoutSnapshot,
    getServerLayoutSnapshot
  );

  const dashboardPreferences = useMemo(
    () => normalizeDashboardPreferences(layoutSnapshot),
    [layoutSnapshot],
  );
  const widgets = dashboardPreferences.widgets;
  const fillStyle = dashboardPreferences.fillStyle;

  const [editing, setEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [highlightWidgetId, setHighlightWidgetId] = useState<string | null>(null);

  const persistDashboardPreferences = useCallback((nextWidgets: WidgetInstance[], nextFillStyle = fillStyle) => {
    saveDashboardLayout({
      widgets: nextWidgets,
      fillStyle: nextFillStyle,
    });
  }, [fillStyle]);

  const handleUpdateWidgets = useCallback((updated: WidgetInstance[]) => {
    persistDashboardPreferences(updated);
  }, [persistDashboardPreferences]);

  const handleAddWidget = (type: string) => {
    const catalogItem = WIDGET_CATALOG.find((w) => w.type === type);
    if (!catalogItem) return;
    if (widgets.some((widget) => widget.type === type)) return;

    const dims = getWidgetDimsFromSize(catalogItem.defaultSize);

    const newWidget: WidgetInstance = {
      id: createWidgetId(type),
      type,
      size: catalogItem.defaultSize,
      color: catalogItem.defaultColor,
      fillStyle: "inherit",
      x: 0,
      y: 0,
      w: dims.w,
      h: dims.h,
    };

    const shiftedWidgets = widgets.map((widget) => ({
      ...widget,
      y: widget.y + dims.h,
    }));
    persistDashboardPreferences([newWidget, ...shiftedWidgets]);
    setHighlightWidgetId(newWidget.id);
    setGalleryOpen(false);
  };

  const handleResetLayout = async () => {
    const shouldReset = await confirm({
      title: "Restore default dashboard?",
      message: "This will restore the default widgets, sizes, colors, and fill style for your dashboard.",
      confirmLabel: "Reset dashboard",
      cancelLabel: "Cancel",
      variant: "destructive",
    });

    if (!shouldReset) return;

    setHighlightWidgetId(null);
    saveDashboardLayout({
      widgets: DEFAULT_WIDGETS,
      fillStyle: DEFAULT_FILL_STYLE,
    });
  };

  const handleFillStyleChange = (nextFillStyle: BoardFillStyle) => {
    persistDashboardPreferences(widgets, nextFillStyle);
  };

  const clearHighlight = useCallback(() => {
    setHighlightWidgetId(null);
  }, []);

  const addedWidgetTypes = useMemo(() => {
    return new Set(widgets.map((w) => w.type));
  }, [widgets]);

  const stateForWidgets = {
    ...widgetData,
    labels,
  };

  return (
    <>
      {/* Dashboard Welcome Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-950 dark:text-white">
            Welcome, {firstName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase dark:bg-white/[0.08] dark:text-slate-300">
              {role}
            </span>
            {" · "}
            {organizationName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <>
              <div className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-[#f8fafc] px-1.5 text-xs font-bold text-slate-600 shadow-sm dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-slate-300">
                <span className="hidden px-1 sm:inline">{labels.fillStyle}</span>
                {(["solid", "gradient"] as BoardFillStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => handleFillStyleChange(style)}
                    aria-pressed={fillStyle === style}
                    className={`h-6 rounded-lg px-2 text-[11px] font-black transition ${
                      fillStyle === style
                        ? "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)]"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                    }`}
                  >
                    {style === "solid" ? labels.solid : labels.gradient}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary-accent-bg)] px-3 text-xs font-bold text-[var(--primary-accent-text)] shadow-sm transition hover:bg-[var(--primary-accent-hover)] focus:outline-none"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add Widget
              </button>
              <button
                type="button"
                onClick={handleResetLayout}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 text-xs font-bold text-slate-600 transition hover:bg-[#eef2f7] focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {labels.resetLayout}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditing((current) => !current)}
            aria-pressed={editing}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold shadow-sm transition focus:outline-none ${
              editing
                ? "bg-[#15803d] text-white hover:bg-[#166534] dark:bg-[#16a34a] dark:hover:bg-[#15803d]"
                : "border border-slate-200 bg-[#f8fafc] text-slate-700 hover:bg-[#eef2f7] dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
            }`}
          >
            {editing ? <Check className="size-3.5" aria-hidden="true" /> : <LayoutGrid className="size-3.5" aria-hidden="true" />}
            {editing ? labels.done : labels.editLayout}
          </button>
          <Link
            href="/pos"
            className="hidden h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#0891b2] px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-90 sm:inline-flex"
          >
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            New sale
          </Link>
        </div>
      </div>

      {/* Responsive Widget Grid */}
      <div className={editing ? "rounded-2xl border border-dashed border-blue-200 bg-[#eff6ff]/40 p-2 dark:border-blue-400/20 dark:bg-blue-950/10" : ""}>
        <WidgetGrid
          widgets={widgets}
          onChangeWidgets={handleUpdateWidgets}
          editing={editing}
          state={stateForWidgets}
          boardFillStyle={fillStyle}
          highlightWidgetId={highlightWidgetId}
          onHighlightComplete={clearHighlight}
        />
      </div>

      {/* Widget Gallery Side Drawer */}
      <WidgetGallery
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onAddWidget={handleAddWidget}
        addedWidgetTypes={addedWidgetTypes}
      />
    </>
  );
}
