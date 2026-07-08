/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import { Trash2, GripHorizontal, Check, Settings2, ArrowUp, ArrowDown } from "lucide-react";
import {
  WIDGET_COLORS,
  WIDGET_CATALOG,
  BoardFillStyle,
  WidgetColor,
  WidgetFillStyle,
  WidgetSize,
  WidgetTextColor,
  ChartType,
  CHART_TYPE_LABELS,
  getWidgetColorMeta,
  getChartTypesForWidget,
  renderWidgetContent,
} from "./widget-registry";
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GridBreakpoint,
  WidgetInstance,
  canMoveWidgetEarlier,
  canMoveWidgetLater,
  getWidgetDimsFromSize,
  getWidgetSizeFromDims,
  getReorderColumnCount,
  isMobileBreakpoint,
  makeLayoutForBreakpoint,
  moveWidgetInVisualOrder,
  packWidgetStateForColumns,
} from "./widget-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

type WidgetGridProps = {
  widgets: WidgetInstance[];
  onChangeWidgets: (widgets: WidgetInstance[]) => void;
  editing: boolean;
  state: any;
  boardFillStyle: BoardFillStyle;
  highlightWidgetId: string | null;
  onHighlightComplete: () => void;
};

function WidgetSettingsControls({
  widget,
  renderSize,
  textColor,
  labels,
  onUpdateSize,
  onUpdateColor,
  onUpdateFillStyle,
  onUpdateTextColor,
  onUpdateChartType,
  onMoveEarlier,
  onMoveLater,
  onRemove,
  canMoveEarlier: canMoveEarlierProp,
  canMoveLater: canMoveLaterProp,
}: {
  widget: WidgetInstance;
  renderSize: WidgetSize;
  textColor: WidgetTextColor;
  labels: any;
  onUpdateSize: (id: string, size: WidgetSize) => void;
  onUpdateColor: (id: string, color: WidgetColor) => void;
  onUpdateFillStyle: (id: string, fillStyle: WidgetFillStyle) => void;
  onUpdateTextColor: (id: string, textColor: WidgetTextColor) => void;
  onUpdateChartType: (id: string, chartType: ChartType) => void;
  onMoveEarlier: (id: string) => void;
  onMoveLater: (id: string) => void;
  onRemove: (id: string) => void;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}) {
  const chartTypes = getChartTypesForWidget(widget.type);
  const activeChartType: ChartType =
    chartTypes.length > 0 && widget.chartType && chartTypes.includes(widget.chartType)
      ? widget.chartType
      : chartTypes[0];
  const title = WIDGET_CATALOG.find((cat) => cat.type === widget.type)?.title || widget.type;

  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Order
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveEarlier(widget.id);
            }}
            disabled={!canMoveEarlierProp}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-[#fff] px-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:bg-[#fff] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:disabled:hover:bg-slate-950"
            aria-label={`Move ${title} earlier`}
          >
            <ArrowUp className="size-3.5" />
            <span>{labels?.moveEarlier ?? "Move earlier"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveLater(widget.id);
            }}
            disabled={!canMoveLaterProp}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-[#fff] px-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:bg-[#fff] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:disabled:hover:bg-slate-950"
            aria-label={`Move ${title} later`}
          >
            <ArrowDown className="size-3.5" />
            <span>{labels?.moveLater ?? "Move later"}</span>
          </button>
        </div>
      </div>

      {chartTypes.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            View
          </p>
          <div className="grid grid-cols-3 gap-1">
            {chartTypes.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateChartType(widget.id, ct);
                }}
                aria-pressed={activeChartType === ct}
                aria-label={`Show as ${CHART_TYPE_LABELS[ct]}`}
                className={`h-10 md:h-8 rounded-lg px-2 text-xs md:text-[11px] font-black transition active:scale-95 ${
                  activeChartType === ct
                    ? "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)] shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {CHART_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labels?.cardSize ?? "Size"}
        </p>
        <div className="grid grid-cols-4 gap-1">
          {(["S", "M", "L", "XL"] as WidgetSize[]).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSize(widget.id, sz);
              }}
              aria-pressed={renderSize === sz}
              aria-label={`Set widget size to ${sz}`}
              className={`h-10 md:h-8 rounded-lg text-xs md:text-[11px] font-black transition active:scale-95 ${
                renderSize === sz
                  ? "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)] shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Color
        </p>
        <div className="grid grid-cols-5 gap-1">
          {WIDGET_COLORS.map((c) => {
            const isSelected = widget.color === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateColor(widget.id, c.value);
                }}
                className={`flex h-10 md:h-8 items-center justify-center rounded-lg border transition active:scale-95 ${
                  isSelected
                    ? "border-slate-900 bg-slate-900/10 dark:border-white dark:bg-white/10"
                    : "border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                }`}
                title={c.label}
                aria-pressed={isSelected}
                aria-label={`Set widget color to ${c.label}`}
              >
                <span className={`flex size-4 items-center justify-center rounded-full ${c.chip}`}>
                  {isSelected && <Check className="size-2.5 shrink-0 text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labels?.fillStyle ?? "Fill"}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {(["inherit", "solid", "gradient"] as WidgetFillStyle[]).map((fill) => {
            const isSelected = (widget.fillStyle ?? "inherit") === fill;
            const label = fill === "inherit" ? (labels?.auto ?? "Auto") : fill === "solid" ? (labels?.solid ?? "Solid") : (labels?.gradient ?? "Gradient");
            return (
              <button
                key={fill}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateFillStyle(widget.id, fill);
                }}
                className={`h-10 md:h-8 rounded-lg px-2 text-xs md:text-[11px] font-black transition active:scale-95 ${
                  isSelected
                    ? "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)] shadow-sm ring-2 ring-[var(--primary-accent-soft)]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
                title={`${label} fill`}
                aria-pressed={isSelected}
                aria-label={`${label} fill`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labels?.textColor ?? "Text"}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {(["auto", "white", "black"] as WidgetTextColor[]).map((option) => {
            const isSelected = textColor === option;
            const label = option === "auto"
              ? (labels?.auto ?? "Auto")
              : option === "white"
                ? (labels?.white ?? "White")
                : (labels?.black ?? "Black");

            return (
              <button
                key={option}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateTextColor(widget.id, option);
                }}
                className={`h-10 md:h-8 rounded-lg px-2 text-xs md:text-[11px] font-black transition active:scale-95 ${
                  isSelected
                    ? "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)] shadow-sm ring-2 ring-[var(--primary-accent-soft)]"
                    : option === "white"
                      ? "bg-slate-800 text-white hover:bg-slate-700 dark:bg-[#fff] dark:text-slate-950 dark:hover:bg-slate-200"
                      : option === "black"
                        ? "bg-slate-100 text-slate-950 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
                aria-pressed={isSelected}
                aria-label={`Set widget text color to ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(widget.id);
        }}
        className="flex h-11 md:h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-95 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
        aria-label="Delete widget"
      >
        <Trash2 className="size-3.5" />
        Delete
      </button>
    </div>
  );
}

export function WidgetGrid({
  widgets,
  onChangeWidgets,
  editing,
  state,
  boardFillStyle,
  highlightWidgetId,
  onHighlightComplete,
}: WidgetGridProps) {
  const [mounted, setMounted] = useState(false);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const [activeBreakpoint, setActiveBreakpoint] = useState<GridBreakpoint>("lg");
  const [recentlyMovedWidgetId, setRecentlyMovedWidgetId] = useState<string | null>(null);
  const suppressProgrammaticLayoutChangesUntilRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!highlightWidgetId || typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollTimer = window.setTimeout(() => {
      const widgetElement = document.querySelector(`[data-widget-id="${highlightWidgetId}"]`);
      widgetElement?.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    }, 80);
    const clearTimer = window.setTimeout(onHighlightComplete, 1600);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightWidgetId, onHighlightComplete]);

  useEffect(() => {
    if (!recentlyMovedWidgetId || typeof window === "undefined") return;

    const clearTimer = window.setTimeout(() => setRecentlyMovedWidgetId(null), 1400);
    return () => window.clearTimeout(clearTimer);
  }, [recentlyMovedWidgetId]);

  useEffect(() => {
    if (!openSettingsId || typeof window === "undefined") return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const settingsRoot = target.closest("[data-widget-settings-root]");
      if (settingsRoot?.getAttribute("data-widget-settings-root") === openSettingsId) return;
      setOpenSettingsId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSettingsId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSettingsId]);

  if (!mounted) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 min-h-[300px]">
        {widgets.slice(0, 4).map((w) => (
          <div key={w.id} className="h-28 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse border border-slate-200 dark:border-slate-800" />
        ))}
      </div>
    );
  }

  const isMobileLayout = isMobileBreakpoint(activeBreakpoint);
  const openSettingsWidget = widgets.find((widget) => widget.id === openSettingsId) ?? null;
  const layouts = {
    ultra: makeLayoutForBreakpoint(widgets, "ultra"),
    wide: makeLayoutForBreakpoint(widgets, "wide"),
    lg: makeLayoutForBreakpoint(widgets, "lg"),
    md: makeLayoutForBreakpoint(widgets, "md"),
    sm: makeLayoutForBreakpoint(widgets, "sm"),
    xs: makeLayoutForBreakpoint(widgets, "xs"),
    xxs: makeLayoutForBreakpoint(widgets, "xxs"),
  };

  const handleLayoutChange = (currentLayout: readonly any[]) => {
    if (!editing) return;
    if (Date.now() < suppressProgrammaticLayoutChangesUntilRef.current) return;

    if (isMobileLayout) {
      const order = new Map(
        [...currentLayout]
          .sort((a, b) => (a.y - b.y) || (a.x - b.x))
          .map((item, index) => [item.i, index]),
      );
      const orderedWidgets = [...widgets].sort((a, b) => {
        const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.y - b.y || a.x - b.x;
      });
      const updated = packWidgetStateForColumns(orderedWidgets, GRID_COLS.lg);
      const hasChanged = updated.some((widget, index) => widget.id !== widgets[index]?.id);

      if (hasChanged) {
        onChangeWidgets(updated);
      }
      return;
    }

    const expectedResponsiveLayout = layouts[activeBreakpoint];
    const isResponsiveEcho =
      currentLayout.length === expectedResponsiveLayout.length &&
      currentLayout.every((item) => {
        const expected = expectedResponsiveLayout.find((layoutItem) => layoutItem.i === item.i);
        return (
          expected &&
          expected.x === item.x &&
          expected.y === item.y &&
          expected.w === item.w &&
          expected.h === item.h
        );
      });

    if (isResponsiveEcho) {
      return;
    }

    const updated = widgets.map((widget) => {
      const item = currentLayout.find((l) => l.i === widget.id);
      if (item) {
        const size = getWidgetSizeFromDims(item.w, item.h);
        return {
          ...widget,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          size,
        };
      }
      return widget;
    });

    const hasChanged = updated.some((w) => {
      const original = widgets.find((orig) => orig.id === w.id);
      if (!original) return true;
      return (
        w.x !== original.x ||
        w.y !== original.y ||
        w.w !== original.w ||
        w.h !== original.h ||
        w.size !== original.size
      );
    });

    if (hasChanged) {
      onChangeWidgets(updated);
    }
  };

  const handleResize = (currentLayout: readonly any[], oldItem: any, newItem: any) => {
    if (!editing) return;

    const size = getWidgetSizeFromDims(newItem.w, newItem.h);
    const updated = widgets.map((w) => {
      if (w.id === newItem.i) {
        return {
          ...w,
          w: newItem.w,
          h: newItem.h,
          size,
        };
      }
      return w;
    });
    onChangeWidgets(updated);
  };

  const handleRemoveWidget = (id: string) => {
    onChangeWidgets(widgets.filter((w) => w.id !== id));
  };

  const handleMoveWidget = (id: string, direction: "earlier" | "later") => {
    const updated = moveWidgetInVisualOrder(
      widgets,
      id,
      direction,
      getReorderColumnCount(widgets, activeBreakpoint),
    );
    if (updated === widgets) return;

    setOpenSettingsId(id);
    setRecentlyMovedWidgetId(id);
    suppressProgrammaticLayoutChangesUntilRef.current = Date.now() + 750;
    onChangeWidgets(updated);
  };

  const handleUpdateWidgetSize = (id: string, size: WidgetSize) => {
    const dims = getWidgetDimsFromSize(size);
    onChangeWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            size,
            w: dims.w,
            h: dims.h,
          };
        }
        return w;
      })
    );
  };

  const handleUpdateWidgetColor = (id: string, color: WidgetColor) => {
    onChangeWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return { ...w, color };
        }
        return w;
      })
    );
  };

  const handleUpdateWidgetFillStyle = (id: string, fillStyle: WidgetFillStyle) => {
    onChangeWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return { ...w, fillStyle };
        }
        return w;
      })
    );
  };

  const handleUpdateWidgetTextColor = (id: string, textColor: WidgetTextColor) => {
    onChangeWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return { ...w, textColor };
        }
        return w;
      })
    );
  };

  const handleUpdateWidgetChartType = (id: string, chartType: ChartType) => {
    onChangeWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return { ...w, chartType };
        }
        return w;
      })
    );
  };

  return (
    <div className={`dashboard-widget-grid relative ${editing ? "edit-mode-active" : ""}`}>
      {editing && (
        <style dangerouslySetInnerHTML={{
          __html: `
            .dashboard-widget-grid .react-grid-item:has(.dashboard-widget-menu-open) {
              z-index: 80 !important;
            }
            .dashboard-widget-grid .react-grid-item {
              transition: transform 220ms ease, width 220ms ease, height 220ms ease;
            }
            @media (prefers-reduced-motion: reduce) {
              .dashboard-widget-grid .react-grid-item {
                transition: none !important;
              }
            }
            .dashboard-widget-grid .react-grid-item.react-draggable-dragging,
            .dashboard-widget-grid .react-grid-item.react-resizable-resizing {
              z-index: 40;
              transition: none;
            }
            .react-resizable-handle {
              bottom: 6px !important;
              right: 6px !important;
              background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 19 4-4'%3E%3C/path%3E%3Cpath d='m9 19 10-10'%3E%3C/path%3E%3C/svg%3E") !important;
              background-repeat: no-repeat !important;
              background-position: center !important;
              width: 14px !important;
              height: 14px !important;
              cursor: se-resize !important;
              opacity: 0.6;
              filter: invert(0.5);
            }
            .dark .react-resizable-handle {
              filter: invert(0.8);
            }
          `
        }} />
      )}
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        isDraggable={editing}
        isResizable={editing && !isMobileLayout}
        draggableHandle=".widget-drag-handle"
        rowHeight={isMobileLayout ? 118 : 136}
        margin={isMobileLayout ? [10, 10] : [16, 16]}
        onBreakpointChange={(breakpoint) => setActiveBreakpoint(breakpoint as GridBreakpoint)}
        onLayoutChange={handleLayoutChange}
        onResize={handleResize}
      >
        {widgets.map((widget) => {
          const colorMeta = getWidgetColorMeta(widget.color);
          const renderSize = getWidgetSizeFromDims(widget.w, widget.h);
          const effectiveFillStyle = widget.fillStyle && widget.fillStyle !== "inherit" ? widget.fillStyle : boardFillStyle;
          const isSolidFill = effectiveFillStyle === "solid";
          const fillClass = isSolidFill ? colorMeta.solidBg : colorMeta.gradientBg;
          const borderClass = isSolidFill ? colorMeta.solidBorder : "border-slate-200 dark:border-slate-800/80";
          const textColor = widget.textColor ?? "auto";
          const forcedText = textColor === "white" ? "#ffffff" : textColor === "black" ? "#111827" : null;
          const forcedMuted = textColor === "white" ? "rgba(255,255,255,0.78)" : textColor === "black" ? "rgba(17,24,39,0.74)" : null;
          const resolvedText = forcedText ?? (isSolidFill ? colorMeta.solidText : null);
          const resolvedMuted = forcedMuted ?? (isSolidFill ? colorMeta.solidMuted : null);
          const cardStyle = resolvedText
            ? ({
                "--widget-text": resolvedText,
                "--widget-muted": resolvedMuted ?? resolvedText,
                "--widget-chart-color": resolvedText,
              } as React.CSSProperties)
            : undefined;
          const isHighlighted = highlightWidgetId === widget.id || recentlyMovedWidgetId === widget.id;
          const isSettingsOpen = openSettingsId === widget.id;
          const hasLink = widget.type === "low-stock" || widget.type === "pending-repairs";
          const href = widget.type === "low-stock" ? "/purchases/replenishment" : "/repairs";
          const title = WIDGET_CATALOG.find((cat) => cat.type === widget.type)?.title || widget.type;

          return (
            <div
              key={widget.id}
              data-widget-id={widget.id}
              data-widget-fill={effectiveFillStyle}
              data-widget-text={textColor}
              style={cardStyle}
              className={`dashboard-widget-card relative flex h-full min-w-0 flex-col overflow-visible rounded-xl border p-2.5 shadow-sm transition-all duration-200 group/widget md:rounded-2xl md:p-3 ${borderClass} ${fillClass} ${isHighlighted ? "animate-dashboard-widget-highlight" : ""}`}
            >
              {/* Header Title (Clean, same in Edit and View modes) */}
              <div className="mb-1.5 flex min-h-5 shrink-0 items-center justify-center border-b border-slate-200/40 pb-1.5 dark:border-slate-800/40">
                <span className={`widget-card-title min-w-0 flex-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[10px] ${editing ? "px-12 text-center lg:px-8" : ""}`}>
                  {title}
                </span>
              </div>

              {/* Main Content Area — clipped so chart bars/lines/text can never
                 paint outside the card or over the edit toolbar. The drag handle
                 and settings popover live in a sibling node below, so they still
                 escape the card via its own overflow-visible. */}
              <div className="widget-card-content relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {hasLink && !editing ? (
                  <Link href={href} className="block h-full hover:opacity-85 transition">
                    {renderWidgetContent(widget.type, renderSize, { ...state, editing }, widget.chartType)}
                  </Link>
                ) : (
                  renderWidgetContent(widget.type, renderSize, { ...state, editing }, widget.chartType)
                )}
              </div>

              {/* Edit controls */}
              {editing && (
                <div data-widget-settings-root={widget.id}>
                  <div
                    className="widget-drag-handle absolute left-2 top-2 z-30 flex size-11 touch-none cursor-grab items-center justify-center rounded-xl border border-slate-200/70 bg-[#fff]/90 text-slate-500 shadow-sm backdrop-blur transition hover:bg-slate-50 hover:text-slate-800 active:cursor-grabbing active:scale-95 dark:border-white/[0.12] dark:bg-slate-950/80 dark:text-slate-300 dark:hover:bg-slate-900 lg:size-auto lg:rounded-lg lg:p-1"
                    title="Drag to reorder"
                    aria-label={`Drag ${title} widget to reorder`}
                  >
                    <GripHorizontal className="size-3.5" />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSettingsId((current) => current === widget.id ? null : widget.id);
                    }}
                    className={`absolute right-2 top-2 z-30 flex size-11 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition active:scale-95 lg:size-auto lg:rounded-lg lg:p-1 ${
                      isSettingsOpen
                        ? "border-[var(--primary-accent-bg)] bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)]"
                        : "border-slate-200/70 bg-[#fff]/90 text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.12] dark:bg-slate-950/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    }`}
                    aria-expanded={isSettingsOpen}
                    aria-label={`Open ${title} widget settings`}
                  >
                    <Settings2 className="size-3.5" />
                  </button>

                  {isSettingsOpen && !isMobileLayout && (
                    <div className="dashboard-widget-menu-open animate-dashboard-popover absolute right-2 top-10 z-[90] w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-[#fff] p-2.5 text-slate-900 shadow-2xl shadow-slate-900/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      <WidgetSettingsControls
                        widget={widget}
                        renderSize={renderSize}
                        textColor={textColor}
                        labels={state.labels}
                        onUpdateSize={handleUpdateWidgetSize}
                        onUpdateColor={handleUpdateWidgetColor}
                        onUpdateFillStyle={handleUpdateWidgetFillStyle}
                        onUpdateTextColor={handleUpdateWidgetTextColor}
                        onUpdateChartType={handleUpdateWidgetChartType}
                        onMoveEarlier={(id) => handleMoveWidget(id, "earlier")}
                        onMoveLater={(id) => handleMoveWidget(id, "later")}
                        canMoveEarlier={canMoveWidgetEarlier(widgets, widget.id)}
                        canMoveLater={canMoveWidgetLater(widgets, widget.id)}
                        onRemove={(id) => {
                          setOpenSettingsId(null);
                          handleRemoveWidget(id);
                        }}
                      />
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>
      {editing && isMobileLayout && openSettingsWidget && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end bg-slate-950/60 px-0 pt-[calc(2.5rem+env(safe-area-inset-top))] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`widget-settings-title-${openSettingsWidget.id}`}
          data-widget-settings-root={openSettingsWidget.id}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpenSettingsId(null)}
            aria-label="Close widget settings"
          />
          <div className="animate-dashboard-sheet relative w-full max-h-[85dvh] flex flex-col rounded-t-3xl border border-slate-200 bg-[#fff] text-slate-900 shadow-2xl shadow-slate-950/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            {/* Sticky Header inside the bottom sheet */}
            <div className="shrink-0 p-4 pb-2 border-b border-slate-100 dark:border-slate-900">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
              <div className="flex items-center justify-between gap-3">
                <h2
                  id={`widget-settings-title-${openSettingsWidget.id}`}
                  className="min-w-0 truncate text-sm font-black text-slate-950 dark:text-white"
                >
                  {WIDGET_CATALOG.find((cat) => cat.type === openSettingsWidget.type)?.title || openSettingsWidget.type}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpenSettingsId(null)}
                  className="min-h-[44px] rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-700 transition active:scale-95 dark:bg-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {state.labels?.done ?? "Done"}
                </button>
              </div>
            </div>

            {/* Scrollable body content */}
            <div className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-4">
              <WidgetSettingsControls
                widget={openSettingsWidget}
                renderSize={getWidgetSizeFromDims(openSettingsWidget.w, openSettingsWidget.h)}
                textColor={openSettingsWidget.textColor ?? "auto"}
                labels={state.labels}
                onUpdateSize={handleUpdateWidgetSize}
                onUpdateColor={handleUpdateWidgetColor}
                onUpdateFillStyle={handleUpdateWidgetFillStyle}
                onUpdateTextColor={handleUpdateWidgetTextColor}
                onUpdateChartType={handleUpdateWidgetChartType}
                onMoveEarlier={(id) => handleMoveWidget(id, "earlier")}
                onMoveLater={(id) => handleMoveWidget(id, "later")}
                canMoveEarlier={canMoveWidgetEarlier(widgets, openSettingsWidget.id)}
                canMoveLater={canMoveWidgetLater(widgets, openSettingsWidget.id)}
                onRemove={(id) => {
                  setOpenSettingsId(null);
                  handleRemoveWidget(id);
                }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
