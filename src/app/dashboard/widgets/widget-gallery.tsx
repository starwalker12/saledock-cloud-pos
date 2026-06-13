import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { WIDGET_CATALOG, WidgetDef } from "./widget-registry";

type WidgetGalleryProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (type: string) => void;
  widgetCounts: Record<string, number>;
};

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales & Performance",
  money: "Money & Accounts",
  inventory: "Inventory & Stock",
  customers: "Customers",
  repairs: "Repairs & Jobs",
  suppliers: "Suppliers",
  activity: "System Activity",
};

export function WidgetGallery({ isOpen, onClose, onAddWidget, widgetCounts }: WidgetGalleryProps) {
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    setVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
      closeTimerRef.current = null;
    }, 220);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => setVisible(true));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [handleClose, isOpen]);

  if (!isOpen) return null;

  // Group widgets by category
  const groupedWidgets = WIDGET_CATALOG.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, WidgetDef[]>);

  return (
    <div className={`fixed inset-0 z-[80] flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
      visible ? "opacity-100" : "opacity-0"
    }`}>
      {/* Backdrop click closer */}
      <button
        type="button"
        className="flex-1 cursor-default"
        onClick={handleClose}
        aria-label="Close widget gallery"
      />

      {/* Slide out panel */}
      <div className={`h-full w-full max-w-md border-l border-slate-200 bg-[#fff] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-slate-800 dark:bg-[#0b1220] ${
        visible ? "translate-x-0" : "translate-x-full"
      } flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">Add Widget</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose a widget to add to your board</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
            aria-label="Close gallery"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-6">
          {Object.entries(groupedWidgets).map(([category, widgets]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <div className="space-y-2">
                {widgets.map((widget) => {
                  const Icon = widget.icon;
                  const count = widgetCounts[widget.type] ?? 0;
                  return (
                    <div
                      key={widget.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition duration-200"
                    >
                      {/* Icon */}
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 mt-0.5">
                        <Icon className="size-4.5" />
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {widget.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                          {widget.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400 dark:bg-slate-800">
                            Default Size: {widget.defaultSize}
                          </span>
                          <span className="inline-block rounded bg-[var(--primary-accent-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--primary-accent-bg)]">
                            On board: {count}
                          </span>
                        </div>
                      </div>

                      {/* Add Button */}
                      <button
                        type="button"
                        onClick={() => {
                          onAddWidget(widget.type);
                          handleClose();
                        }}
                        className="rounded-lg border border-slate-200 bg-[#fff] p-1.5 text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent-bg)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        title="Add to layout"
                        aria-label={`Add ${widget.title}`}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
