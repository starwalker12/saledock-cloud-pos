import React from "react";
import { X, Plus } from "lucide-react";
import { WIDGET_CATALOG, WidgetDef } from "./widget-registry";

type WidgetGalleryProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (type: string) => void;
  addedWidgetTypes: Set<string>;
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

export function WidgetGallery({ isOpen, onClose, onAddWidget, addedWidgetTypes }: WidgetGalleryProps) {
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300">
      {/* Backdrop click closer */}
      <div className="flex-1" onClick={onClose} />

      {/* Slide out panel */}
      <div className="w-full max-w-md h-full bg-[#fff] dark:bg-[#0b1220] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">Add Widget</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose a widget to add to your board</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
            aria-label="Close gallery"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(groupedWidgets).map(([category, widgets]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <div className="space-y-2">
                {widgets.map((widget) => {
                  const Icon = widget.icon;
                  const isAlreadyAdded = addedWidgetTypes.has(widget.type);
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
                        <span className="inline-block text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mt-1.5 uppercase">
                          Default Size: {widget.defaultSize}
                        </span>
                      </div>

                      {/* Add Button */}
                      <button
                        type="button"
                        onClick={() => onAddWidget(widget.type)}
                        disabled={isAlreadyAdded}
                        className={`rounded-lg border p-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isAlreadyAdded
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-600"
                            : "border-slate-200 bg-[#fff] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        }`}
                        title={isAlreadyAdded ? "Already on board" : "Add to layout"}
                        aria-label={isAlreadyAdded ? `${widget.title} already on board` : `Add ${widget.title}`}
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
