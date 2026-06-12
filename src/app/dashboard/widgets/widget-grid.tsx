/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import { Trash2, GripHorizontal, Check, Settings2 } from "lucide-react";
import {
  WIDGET_COLORS,
  WIDGET_CATALOG,
  BoardFillStyle,
  WidgetColor,
  WidgetFillStyle,
  WidgetSize,
  getWidgetColorMeta,
  renderWidgetContent,
} from "./widget-registry";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

export function getWidgetDimsFromSize(size: WidgetSize): { w: number; h: number } {
  switch (size) {
    case "S":
      return { w: 1, h: 1 };
    case "M":
      return { w: 2, h: 1 };
    case "L":
      return { w: 4, h: 2 };
    case "XL":
      return { w: 4, h: 3 };
  }
}

export function getWidgetSizeFromDims(w: number, h: number): WidgetSize {
  if (w >= 4) {
    return h >= 3 ? "XL" : "L";
  }
  if (w >= 2) {
    return h >= 2 ? "L" : "M";
  }
  return "S";
}

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

type WidgetGridProps = {
  widgets: WidgetInstance[];
  onChangeWidgets: (widgets: WidgetInstance[]) => void;
  editing: boolean;
  state: any;
  boardFillStyle: BoardFillStyle;
  highlightWidgetId: string | null;
  onHighlightComplete: () => void;
};

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

  // Format layout for react-grid-layout
  const layout = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: 1,
    minH: 1,
    maxW: 4,
    maxH: 4,
  }));

  const handleLayoutChange = (currentLayout: readonly any[]) => {
    if (!editing) return;

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
        layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 4, md: 4, sm: 2, xs: 1, xxs: 1 }}
        rowHeight={100}
        margin={[16, 16]}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".widget-drag-handle"
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
          const cardStyle = isSolidFill
            ? ({
                "--widget-solid-text": colorMeta.solidText,
                "--widget-solid-muted": colorMeta.solidMuted,
              } as React.CSSProperties)
            : undefined;
          const isHighlighted = highlightWidgetId === widget.id;
          const isSettingsOpen = openSettingsId === widget.id;
          const hasLink = widget.type === "low-stock" || widget.type === "pending-repairs";
          const href = widget.type === "low-stock" ? "/purchases/replenishment" : "/repairs";

          return (
            <div
              key={widget.id}
              data-widget-id={widget.id}
              data-widget-fill={effectiveFillStyle}
              style={cardStyle}
              className={`dashboard-widget-card rounded-2xl border p-4 shadow-sm flex flex-col justify-between transition-all duration-200 group/widget relative min-w-0 ${borderClass} ${fillClass} ${isHighlighted ? "animate-dashboard-widget-highlight" : ""}`}
            >
              {/* Header Title (Clean, same in Edit and View modes) */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/40 dark:border-slate-800/40 pb-1.5 mb-1.5 shrink-0">
                <span className="widget-card-title text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate max-w-[180px] pr-14">
                  {WIDGET_CATALOG.find((cat) => cat.type === widget.type)?.title || widget.type}
                </span>
              </div>

              {/* Main Content Area */}
              <div className="widget-card-content flex-1 min-h-0 relative">
                {hasLink && !editing ? (
                  <Link href={href} className="block h-full hover:opacity-85 transition">
                    {renderWidgetContent(widget.type, renderSize, state)}
                  </Link>
                ) : (
                  renderWidgetContent(widget.type, renderSize, state)
                )}
              </div>

              {/* Edit controls */}
              {editing && (
                <div data-widget-settings-root={widget.id}>
                  <div
                    className="widget-drag-handle absolute left-2 top-2 z-30 cursor-grab rounded-lg border border-slate-200/70 bg-[#fff]/90 p-1 text-slate-500 shadow-sm backdrop-blur transition hover:bg-slate-50 hover:text-slate-800 active:cursor-grabbing active:scale-95 dark:border-white/[0.12] dark:bg-slate-950/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    title="Drag to reorder"
                    aria-label="Drag to reorder widget"
                  >
                    <GripHorizontal className="size-3.5" />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSettingsId((current) => current === widget.id ? null : widget.id);
                    }}
                    className={`absolute right-2 top-2 z-30 rounded-lg border p-1 shadow-sm backdrop-blur transition active:scale-95 ${
                      isSettingsOpen
                        ? "border-[var(--primary-accent-bg)] bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)]"
                        : "border-slate-200/70 bg-[#fff]/90 text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.12] dark:bg-slate-950/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    }`}
                    aria-expanded={isSettingsOpen}
                    aria-label="Open widget settings"
                  >
                    <Settings2 className="size-3.5" />
                  </button>

                  {isSettingsOpen && (
                    <div className="dashboard-widget-menu-open animate-dashboard-popover absolute right-2 top-10 z-[90] w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-[#fff] p-3 text-slate-900 shadow-2xl shadow-slate-900/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Size
                          </p>
                          <div className="grid grid-cols-4 gap-1">
                            {(["S", "M", "L", "XL"] as WidgetSize[]).map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateWidgetSize(widget.id, sz);
                                }}
                                aria-pressed={renderSize === sz}
                                aria-label={`Set widget size to ${sz}`}
                                className={`h-8 rounded-lg text-xs font-black transition active:scale-95 ${
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
                          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Color
                          </p>
                          <div className="grid grid-cols-5 gap-1.5">
                            {WIDGET_COLORS.map((c) => {
                              const isSelected = widget.color === c.value;
                              return (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateWidgetColor(widget.id, c.value);
                                  }}
                                  className={`flex h-8 items-center justify-center rounded-lg border transition active:scale-95 ${
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
                          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Fill
                          </p>
                          <div className="grid grid-cols-3 gap-1">
                            {(["inherit", "solid", "gradient"] as WidgetFillStyle[]).map((fill) => {
                              const isSelected = (widget.fillStyle ?? "inherit") === fill;
                              const label = fill === "inherit" ? (state.labels?.auto ?? "Auto") : fill === "solid" ? (state.labels?.solid ?? "Solid") : (state.labels?.gradient ?? "Gradient");
                              return (
                                <button
                                  key={fill}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateWidgetFillStyle(widget.id, fill);
                                  }}
                                  className={`h-8 rounded-lg px-2 text-[11px] font-black transition active:scale-95 ${
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

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSettingsId(null);
                            handleRemoveWidget(widget.id);
                          }}
                          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-95 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                          aria-label="Delete widget"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
