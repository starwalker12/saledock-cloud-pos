"use client";

import { useEffect, useState } from "react";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import { CategoriesTab } from "./categories-tab";
import { ProductsTab } from "./products-tab";
import { SuppliersTab } from "./suppliers-tab";

export type CatalogTab = "products" | "categories" | "suppliers";

export type CatalogSearchParams = {
  tab?: string;
  q?: string;
  category?: string;
  lowstock?: string;
  inactive?: string;
  add?: string;
  edit?: string;
  barcode?: string;
  sort?: string;
  dir?: string;
};

const TABS: { id: CatalogTab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "suppliers", label: "Suppliers" },
];

const TAB_QUERY_KEYS = [
  "q",
  "category",
  "lowstock",
  "inactive",
  "add",
  "edit",
  "barcode",
  "sort",
  "dir",
] as const;

function tabFromLocation(): CatalogTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  return TABS.some((tab) => tab.id === value) ? (value as CatalogTab) : "products";
}

export function CatalogTabs({
  initialTab,
  params,
  currency,
  products,
  categories,
  suppliers,
  canWrite,
  canManageOverride,
  role,
}: {
  initialTab: CatalogTab;
  params: CatalogSearchParams;
  currency: string;
  products: ProductRow[];
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  canWrite: boolean;
  canManageOverride: boolean;
  role: string;
}) {
  const [activeTab, setActiveTab] = useState<CatalogTab>(initialTab);

  useEffect(() => {
    function handlePopState() {
      setActiveTab(tabFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function selectTab(tab: CatalogTab) {
    if (tab === activeTab) return;

    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    TAB_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const activeParams: CatalogSearchParams = {
    ...params,
    tab: activeTab,
    ...(activeTab === initialTab ? {} : {
      q: undefined,
      category: undefined,
      lowstock: undefined,
      inactive: undefined,
      add: undefined,
      edit: undefined,
      barcode: undefined,
      sort: undefined,
      dir: undefined,
    }),
  };

  return (
    <>
      <nav
        aria-label="Catalog sections"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/50"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                active
                  ? "bg-[#fff] text-blue-700 shadow dark:bg-slate-950 dark:text-blue-400"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 md:p-6">
        {!canWrite && (
          <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Your role ({role}) can view the catalog but cannot create or edit items.
          </p>
        )}

        {activeTab === "products" && (
          <ProductsTab
            currency={currency}
            params={activeParams}
            initialProducts={products}
            initialCategories={categories}
            suppliers={suppliers}
            canWrite={canWrite}
            canManageOverride={canManageOverride}
          />
        )}
        {activeTab === "categories" && (
          <CategoriesTab categories={categories} params={activeParams} canWrite={canWrite} />
        )}
        {activeTab === "suppliers" && (
          <SuppliersTab suppliers={suppliers} params={activeParams} canWrite={canWrite} />
        )}
      </div>
    </>
  );
}
