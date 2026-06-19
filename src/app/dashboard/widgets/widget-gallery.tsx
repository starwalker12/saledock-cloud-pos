import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, ArrowLeft } from "lucide-react";
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

  if (!isOpen || typeof document === "undefined") return null;

  // Group widgets by category
  const groupedWidgets = WIDGET_CATALOG.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, WidgetDef[]>);

  // Rendered through a portal on <body> so the fixed panel is positioned
  // relative to the viewport — not a transformed/scrolled dashboard ancestor —
  // which is what was pushing the header off the top of the screen on mobile.
  return createPortal(
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
      <div className={`flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-[#fff] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-slate-800 dark:bg-[#0b1220] ${
        visible ? "translate-x-0" : "translate-x-full"
      }`}>
        {/* Sticky header — pinned above the scroll body, with top safe-area
           padding so the back control clears the status bar / notch. */}
        <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-[#fff]/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-[#0b1220]/95">
          {/* Back to dashboard (mobile) */}
          <button
            type="button"
            onClick={handleClose}
            className="flex w-full items-center gap-2 px-4 pt-3 text-sm font-bold text-slate-700 transition hover:text-slate-950 dark:text-slate-200 dark:hover:text-white lg:hidden"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="size-5 shrink-0" />
            Back to dashboard
          </button>

          {/* Title row */}
          <div className="flex items-center justify-between gap-2 p-4">
            <h2 className="text-base font-black text-slate-950 dark:text-white">Add widget</h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Close gallery"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable list (starts below the sticky header). Bottom padding
           clears the mobile bottom navigation + iPhone home indicator. */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add any widget more than once. For chart widgets, pick the view (bar, line, donut…) from the widget&apos;s settings after adding.
          </p>
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
    </div>,
    document.body,
  );
}
