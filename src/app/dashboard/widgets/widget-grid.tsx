/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import { Trash2, GripHorizontal, Check } from "lucide-react";
import {
  WIDGET_COLORS,
  WIDGET_CATALOG,
  WidgetColor,
  WidgetSize,
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
};

export function WidgetGrid({ widgets, onChangeWidgets, editing, state }: WidgetGridProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

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

  return (
    <div className={`relative ${editing ? "edit-mode-active" : ""}`}>
      {editing && (
        <style dangerouslySetInnerHTML={{
          __html: `
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
        layouts={{ lg: layout, md: layout, sm: layout, xs: layout }}
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
          const colorMeta = WIDGET_COLORS.find((c) => c.value === widget.color) || WIDGET_COLORS[0];
          const hasLink = widget.type === "low-stock" || widget.type === "pending-repairs";
          const href = widget.type === "low-stock" ? "/purchases/replenishment" : "/repairs";

          return (
            <div
              key={widget.id}
              className={`rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm p-4 flex flex-col justify-between transition-colors duration-200 group/widget relative ${colorMeta.bg}`}
            >
              {/* Header Title (Clean, same in Edit and View modes) */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/40 dark:border-slate-800/40 pb-1.5 mb-1.5 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                  {WIDGET_CATALOG.find((cat) => cat.type === widget.type)?.title || widget.type}
                </span>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-h-0 relative">
                {hasLink && !editing ? (
                  <Link href={href} className="block h-full hover:opacity-85 transition">
                    {renderWidgetContent(widget.type, widget.size, state)}
                  </Link>
                ) : (
                  renderWidgetContent(widget.type, widget.size, state)
                )}
              </div>

              {/* Floating Edit Toolbar - sits on top-right corner of card */}
              {editing && (
                <div 
                  className="absolute -top-3.5 right-2.5 z-30 flex items-center bg-[#fff] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-1.5 py-0.5 shadow-md select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Drag Handle */}
                  <div className="cursor-grab active:cursor-grabbing widget-drag-handle p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Drag to reorder">
                    <GripHorizontal className="size-3.5" />
                  </div>

                  {/* Size Pill */}
                  <div className="flex bg-slate-100 dark:bg-slate-850 rounded-lg p-0.5 ml-1">
                    {(["S", "M", "L", "XL"] as WidgetSize[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateWidgetSize(widget.id, sz);
                        }}
                        className={`text-[9px] font-black w-4.5 h-4.5 rounded flex items-center justify-center transition ${
                          widget.size === sz
                            ? "bg-blue-600 text-white dark:bg-blue-500"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>

                  {/* Colors Selector */}
                  <div className="flex items-center gap-0.5 border-l border-slate-200 dark:border-slate-800 pl-1.5 ml-1">
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
                          className={`size-3 rounded-full border border-slate-300 dark:border-slate-700 transition flex items-center justify-center relative ${
                            c.value === "neutral" ? "bg-slate-400" :
                            c.value === "info" ? "bg-blue-400" :
                            c.value === "success" ? "bg-green-400" :
                            c.value === "warning" ? "bg-amber-400" : "bg-red-400"
                          }`}
                          title={c.label}
                        >
                          {isSelected && <Check className="size-2 text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveWidget(widget.id);
                    }}
                    className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition border-l border-slate-200 dark:border-slate-800 pl-1.5 ml-1"
                    title="Remove widget"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
