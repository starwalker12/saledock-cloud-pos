"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { PosProduct } from "@/lib/data/pos";
import type { HeldBillCartItem, HeldBillPayload } from "@/lib/validation/pos";

export type BillTab = {
  id: string;
  label?: string;
  customerId: string;
  customerName?: string;
  cart: CartLine[];
  discountTotal: number;
  paymentMethod: string;
  amountPaid: string;
  paymentRef: string;
  note: string;
  heldBillId?: string;
};

export type CartLine = {
  product: PosProduct;
  quantity: number;
  unit_price: number;
  discount: number;
  service?: ServiceFields;
};

type ServiceFields = {
  provider: string;
  direction: string;
  account_number: string;
  receiver_account: string;
  reference_no: string;
  principal: string;
  commission: string;
  total_charged: string;
  note: string;
};

const EMPTY_SERVICE: ServiceFields = {
  provider: "",
  direction: "",
  account_number: "",
  receiver_account: "",
  reference_no: "",
  principal: "",
  commission: "",
  total_charged: "",
  note: "",
};

function defaultServiceForProduct(p: PosProduct): ServiceFields {
  return {
    ...EMPTY_SERVICE,
    direction: (p.service_type ?? "") as string,
    commission: p.default_commission_amount > 0 ? String(p.default_commission_amount) : "",
  };
}

function serviceTotalCharged(service: ServiceFields): number {
  const principal = Number(service.principal || 0);
  const commission = Number(service.commission || 0);
  return service.total_charged.trim() === "" ? principal + commission : Number(service.total_charged);
}

function emptyTab(id?: string): BillTab {
  return {
    id: id ?? crypto.randomUUID(),
    customerId: "",
    cart: [],
    discountTotal: 0,
    paymentMethod: "cash",
    amountPaid: "",
    paymentRef: "",
    note: "",
  };
}

function storageKey(orgId?: string | null, userId?: string | null) {
  if (!orgId || !userId) return null;
  return `saledock-pos-tabs-v1-${orgId}-${userId}`;
}

type TabsAction =
  | { type: "init"; tabs: BillTab[]; activeId: string }
  | { type: "add"; tab?: BillTab }
  | { type: "switch"; id: string }
  | { type: "update"; tab: Partial<BillTab> }
  | { type: "close"; id: string; allowHold?: boolean }
  | { type: "resume"; heldBillId: string; cart: CartLine[]; customerId?: string; customerName?: string; label?: string }
  | { type: "markHeld"; id: string; heldBillId: string }
  | { type: "clearActive" };

interface TabsState {
  tabs: BillTab[];
  activeId: string;
}

function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "init":
      return { tabs: action.tabs, activeId: action.activeId };
    case "add": {
      const newTab = action.tab ?? emptyTab();
      return { tabs: [...state.tabs, newTab], activeId: newTab.id };
    }
    case "switch":
      return state.tabs.some((t) => t.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case "update": {
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === state.activeId ? { ...t, ...action.tab } : t)),
      };
    }
    case "close": {
      if (state.tabs.length <= 1) return state;
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const nextTabs = state.tabs.filter((t) => t.id !== action.id);
      const nextActive =
        state.activeId === action.id
          ? nextTabs[Math.max(0, Math.min(idx, nextTabs.length - 1))]?.id ?? nextTabs[0]?.id
          : state.activeId;
      return { tabs: nextTabs, activeId: nextActive };
    }
    case "resume": {
      const existingIdx = state.tabs.findIndex((t) => t.heldBillId === action.heldBillId);
      if (existingIdx >= 0) {
        return { ...state, activeId: state.tabs[existingIdx]!.id };
      }
      const newTab: BillTab = {
        ...emptyTab(),
        heldBillId: action.heldBillId,
        label: action.label,
        customerId: action.customerId ?? "",
        customerName: action.customerName,
        cart: action.cart,
      };
      return { tabs: [...state.tabs, newTab], activeId: newTab.id };
    }
    case "markHeld": {
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.id ? { ...t, heldBillId: action.heldBillId, cart: [], label: undefined, customerId: "", customerName: undefined, note: "" } : t)),
        activeId: state.tabs.find((t) => t.id !== action.id && t.cart.length === 0)?.id ?? state.tabs[0]?.id ?? "",
      };
    }
    case "clearActive": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === state.activeId
            ? { ...emptyTab(t.id), customerId: t.customerId, customerName: t.customerName }
            : t,
        ),
      };
    }
    default:
      return state;
  }
}

function serializeLine(line: CartLine): Record<string, unknown> {
  return {
    product_id: line.product.id,
    quantity: line.quantity,
    unit_price: line.unit_price,
    discount: line.discount,
    service: line.service,
  };
}

function deserializeLine(products: PosProduct[], raw: unknown): CartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const product = products.find((p) => p.id === r.product_id);
  if (!product) return null;
  return {
    product,
    quantity: Number(r.quantity) || 1,
    unit_price: Number(r.unit_price) ?? product.sale_price,
    discount: Number(r.discount) || 0,
    service: r.service as ServiceFields | undefined,
  };
}

function serializeTabs(tabs: BillTab[]): string {
  return JSON.stringify(
    tabs.map((t) => ({
      id: t.id,
      label: t.label,
      customerId: t.customerId,
      customerName: t.customerName,
      cart: t.cart.map(serializeLine),
      discountTotal: t.discountTotal,
      paymentMethod: t.paymentMethod,
      amountPaid: t.amountPaid,
      paymentRef: t.paymentRef,
      note: t.note,
      heldBillId: t.heldBillId,
    })),
  );
}

function deserializeTabs(products: PosProduct[], raw: string): BillTab[] {
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [emptyTab()];
    const tabs = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const t = item as Record<string, unknown>;
        const cartRaw = Array.isArray(t.cart) ? t.cart : [];
        const cart = cartRaw.map((l) => deserializeLine(products, l)).filter((x): x is CartLine => x !== null);
        return {
          id: typeof t.id === "string" ? t.id : crypto.randomUUID(),
          label: typeof t.label === "string" ? t.label : undefined,
          customerId: typeof t.customerId === "string" ? t.customerId : "",
          customerName: typeof t.customerName === "string" ? t.customerName : undefined,
          cart,
          discountTotal: Number(t.discountTotal) || 0,
          paymentMethod: typeof t.paymentMethod === "string" ? t.paymentMethod : "cash",
          amountPaid: typeof t.amountPaid === "string" ? t.amountPaid : "",
          paymentRef: typeof t.paymentRef === "string" ? t.paymentRef : "",
          note: typeof t.note === "string" ? t.note : "",
          heldBillId: typeof t.heldBillId === "string" ? t.heldBillId : undefined,
        } as BillTab;
      })
      .filter((x): x is BillTab => x !== null);
    return tabs.length > 0 ? tabs : [emptyTab()];
  } catch {
    return [emptyTab()];
  }
}

function initState({
  orgId,
  userId,
  products,
}: {
  orgId?: string | null;
  userId?: string | null;
  products: PosProduct[];
}): TabsState {
  const key = storageKey(orgId, userId);
  if (key && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const tabs = deserializeTabs(products, raw);
        return { tabs, activeId: tabs[0]?.id ?? "" };
      }
    } catch {
      // fall through to default
    }
  }
  const tab = emptyTab();
  return { tabs: [tab], activeId: tab.id };
}

export function usePosTabs({
  orgId,
  userId,
  products,
}: {
  orgId?: string | null;
  userId?: string | null;
  products: PosProduct[];
}) {
  const [state, dispatch] = useReducer(tabsReducer, { orgId, userId, products }, initState);

  const activeTab = useMemo(
    () => state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0] ?? emptyTab(),
    [state],
  );

  useEffect(() => {
    const key = storageKey(orgId, userId);
    if (key && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, serializeTabs(state.tabs));
      } catch {
        // ignore storage errors
      }
    }
  }, [state.tabs, orgId, userId]);

  const addTab = useCallback(() => dispatch({ type: "add" }), []);
  const switchTab = useCallback((id: string) => dispatch({ type: "switch", id }), []);
  const updateActiveTab = useCallback((tab: Partial<BillTab>) => dispatch({ type: "update", tab }), []);
  const closeTab = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const resumeHeldBill = useCallback(
    (heldBillId: string, cart: CartLine[], customerId?: string, customerName?: string, label?: string) =>
      dispatch({ type: "resume", heldBillId, cart, customerId, customerName, label }),
    [],
  );
  const markHeld = useCallback((id: string, heldBillId: string) => dispatch({ type: "markHeld", id, heldBillId }), []);
  const clearActiveTab = useCallback(() => dispatch({ type: "clearActive" }), []);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    activeTab,
    addTab,
    switchTab,
    updateActiveTab,
    closeTab,
    resumeHeldBill,
    markHeld,
    clearActiveTab,
    hydrated: true,
  };
}

export function cartToHeldItems(cart: CartLine[]): HeldBillCartItem[] {
  return cart.map((l) => ({
    product_id: l.product.id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount,
    service_provider: l.service?.provider || undefined,
    service_direction: l.service?.direction || undefined,
    service_account_number: l.service?.account_number || undefined,
    service_receiver_account: l.service?.receiver_account || undefined,
    service_reference_no: l.service?.reference_no || undefined,
    service_transaction_amount:
      l.service?.principal && l.service.principal !== "" ? Number(l.service.principal) : undefined,
    service_commission:
      l.service?.commission && l.service.commission !== "" ? Number(l.service.commission) : undefined,
    service_total_charged:
      l.service?.total_charged && l.service.total_charged !== ""
        ? Number(l.service.total_charged)
        : undefined,
    service_note: l.service?.note || undefined,
  }));
}

export function heldItemsToCart(products: PosProduct[], items: HeldBillCartItem[]): CartLine[] {
  return items
    .map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return null;
      const service: ServiceFields | undefined =
        product.type === "service"
          ? {
              provider: item.service_provider ?? "",
              direction: item.service_direction ?? "",
              account_number: item.service_account_number ?? "",
              receiver_account: item.service_receiver_account ?? "",
              reference_no: item.service_reference_no ?? "",
              principal: item.service_transaction_amount != null ? String(item.service_transaction_amount) : "",
              commission: item.service_commission != null ? String(item.service_commission) : "",
              total_charged: item.service_total_charged != null ? String(item.service_total_charged) : "",
              note: item.service_note ?? "",
            }
          : undefined;
      return {
        product,
        quantity: item.quantity,
        unit_price:
          product.type === "service" && service
            ? serviceTotalCharged(service)
            : item.unit_price,
        discount: item.discount,
        service,
      } as CartLine;
    })
    .filter((x): x is CartLine => x !== null);
}

export function buildHeldBillPayload(
  tab: BillTab,
  label?: string,
  note?: string,
): HeldBillPayload | null {
  if (tab.cart.length === 0) return null;
  const customerName = tab.customerName || (tab.customerId ? undefined : undefined);
  return {
    label: label || tab.label || null,
    customer_id: tab.customerId || null,
    customer_name: customerName || null,
    note: note || null,
    cart: cartToHeldItems(tab.cart),
    totals_snapshot: {
      item_count: tab.cart.reduce((sum, l) => sum + l.quantity, 0),
      grand_total: tab.cart.reduce((sum, l) => sum + Math.max(l.unit_price * l.quantity - l.discount, 0), 0) - tab.discountTotal,
    },
  };
}

export { defaultServiceForProduct, EMPTY_SERVICE };
export type { ServiceFields };
