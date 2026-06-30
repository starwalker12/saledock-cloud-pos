"use client";

import { useMemo, useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2, UserPlus2, X, PauseCircle, ReceiptText } from "lucide-react";
import {
  checkoutAction,
  quickCreateCustomerAction,
  holdBillAction,
  getHeldBillAction,
  resumeHeldBillAction,
  completeHeldBillAction,
  cancelHeldBillAction,
  listHeldBillsAction,
} from "./actions";
import { BarcodeScanner } from "@/app/products/barcode-scanner";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import {
  PAYMENT_METHODS,
  SERVICE_DIRECTIONS,
  SERVICE_DIRECTION_LABELS,
  type CheckoutInput,
  type PaymentMethod,
  type ServiceDirection,
} from "@/lib/validation/pos";
import type { PosCustomer, PosProduct } from "@/lib/data/pos";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { AppSelect } from "@/components/ui/app-select";
import { FormModal } from "@/components/ui/form-modal";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  usePosTabs,
  buildHeldBillPayload,
  heldItemsToCart,
  defaultServiceForProduct,
  type CartLine,
  type ServiceFields,
} from "./use-pos-tabs";
import { HoldBillModal } from "./hold-bill-modal";
import { HeldBillsDrawer } from "./held-bills-drawer";

type Props = {
  products: PosProduct[];
  customers: PosCustomer[];
  categories: { id: string; name: string }[];
  currency: string;
  canCheckout: boolean;
  canWriteCatalog: boolean;
  orgId?: string | null;
  userId?: string | null;
};

type CheckoutPayload = Omit<CheckoutInput, "idempotency_key">;
type CheckoutAttempt = { key: string; fingerprint: string };

function normalizedOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function checkoutPayloadFingerprint(payload: CheckoutPayload): string {
  const normalizedCart = payload.cart
    .map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      discount: Number(item.discount ?? 0),
      service_provider: normalizedOptionalText(item.service_provider),
      service_direction: normalizedOptionalText(item.service_direction),
      service_account_number: normalizedOptionalText(item.service_account_number),
      service_receiver_account: normalizedOptionalText(item.service_receiver_account),
      service_reference_no: normalizedOptionalText(item.service_reference_no),
      service_transaction_amount: item.service_transaction_amount ?? null,
      service_commission: item.service_commission ?? null,
      service_total_charged: item.service_total_charged ?? null,
      service_note: normalizedOptionalText(item.service_note),
    }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id));

  return JSON.stringify({
    cart: normalizedCart,
    customer_id: payload.customer_id ?? null,
    discount_total: Number(payload.discount_total),
    payment_method: payload.payment_method,
    amount_paid: Number(payload.amount_paid),
    payment_reference: normalizedOptionalText(payload.payment_reference),
    note: normalizedOptionalText(payload.note),
  });
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

export function PosClient({
  products: initialProducts,
  customers: initialCustomers,
  categories,
  currency,
  canCheckout,
  canWriteCatalog,
  orgId,
  userId,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const [products, setProducts] = useState(initialProducts);
  const [customers, setCustomers] = useState(initialCustomers);

  const {
    tabs,
    activeId,
    activeTab,
    addTab: rawAddTab,
    switchTab: rawSwitchTab,
    updateActiveTab,
    closeTab: rawCloseTab,
    resumeHeldBill: rawResumeHeldBill,
    clearActiveTab,
    hydrated,
  } = usePosTabs({ orgId, userId, products });

  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; no: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("products");
  const [pending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<{ barcode: string } | null>(null);

  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [heldBillsOpen, setHeldBillsOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<{ id: string; status: string; label: string | null; customer_name: string | null; note: string | null; item_count: number; grand_total: number; created_at: string; updated_at: string }[]>([]);
  const [heldBillsLoading, setHeldBillsLoading] = useState(false);
  const [heldBillsError, setHeldBillsError] = useState<string | null>(null);
  const [closeTabPrompt, setCloseTabPrompt] = useState<{ open: boolean; tabId: string } | null>(null);

  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  const switchTab = useCallback(
    (id: string) => {
      clearMessages();
      rawSwitchTab(id);
    },
    [rawSwitchTab],
  );

  const addTab = useCallback(() => {
    clearMessages();
    rawAddTab();
  }, [rawAddTab]);

  const closeTab = useCallback(
    (id: string) => {
      clearMessages();
      rawCloseTab(id);
    },
    [rawCloseTab],
  );

  const resumeHeldBill = useCallback(
    (heldBillId: string, cart: CartLine[], customerId?: string, customerName?: string, label?: string) => {
      clearMessages();
      rawResumeHeldBill(heldBillId, cart, customerId, customerName, label);
    },
    [rawResumeHeldBill],
  );

  const cart = activeTab.cart;
  const customerId = activeTab.customerId;
  const discountTotal = activeTab.discountTotal;
  const paymentMethod = activeTab.paymentMethod as PaymentMethod;
  const amountPaid = activeTab.amountPaid;
  const paymentRef = activeTab.paymentRef;
  const note = activeTab.note;

  function setCart(next: CartLine[] | ((prev: CartLine[]) => CartLine[])) {
    if (typeof next === "function") {
      updateActiveTab({ cart: next(cart) });
    } else {
      updateActiveTab({ cart: next });
    }
  }

  function setCustomerId(id: string) {
    const customer = customers.find((c) => c.id === id);
    updateActiveTab({ customerId: id, customerName: customer?.name });
  }

  function setDiscountTotal(value: number) {
    updateActiveTab({ discountTotal: value });
  }

  function setPaymentMethod(method: PaymentMethod) {
    updateActiveTab({ paymentMethod: method });
  }

  function setAmountPaid(value: string) {
    updateActiveTab({ amountPaid: value });
  }

  function setPaymentRef(value: string) {
    updateActiveTab({ paymentRef: value });
  }

  function setNote(value: string) {
    updateActiveTab({ note: value });
  }

  function setTabLabel(value: string) {
    updateActiveTab({ label: value });
  }

  function handleBarcodeScan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const match = products.find((p) => p.barcode === trimmed);
    if (match) {
      addToCart(match);
      setSearch("");
      setScanResult(null);
      searchRef.current?.focus();
      return;
    }
    setScanResult({ barcode: trimmed });
    setTimeout(() => setScanResult(null), 8000);
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryId]);
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "All categories" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );
  const customerOptions = useMemo(
    () => [
      { value: "", label: "Walk-in" },
      ...customers.map((c) => ({
        value: c.id,
        label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
      })),
    ],
    [customers],
  );
  const paymentOptions = useMemo(
    () => PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_LABELS[m] })),
    [],
  );

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Math.max(l.unit_price * l.quantity - l.discount, 0), 0),
    [cart],
  );
  const totalProductRevenue = useMemo(() => {
    return cart.reduce((s, l) => {
      if (l.product.type !== "product") return s;
      return s + Math.max(l.unit_price * l.quantity - l.discount, 0);
    }, 0);
  }, [cart]);
  const grandTotal = Math.max(subtotal - (discountTotal || 0), 0);
  const tenderedValue = Number(amountPaid || 0);
  const tendered = Number.isFinite(tenderedValue) ? Math.max(tenderedValue, 0) : 0;
  const balance = Math.max(grandTotal - tendered, 0);
  const changeDue = Math.max(tendered - grandTotal, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const isCreditAndMissingCustomer = paymentMethod === "customer_credit" && !customerId;

  function addToCart(p: PosProduct) {
    if (success) setSuccess(null);
    setError(null);

    const existing = cart.find((l) => l.product.id === p.id);
    if (p.type === "product" && existing && existing.quantity + 1 > p.stock_quantity) {
      setError(`Only ${p.stock_quantity} ${p.name} in stock.`);
      return;
    }
    if (p.type === "product" && p.stock_quantity <= 0) {
      setError(`${p.name} is out of stock.`);
      return;
    }

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      toast.show({
        message: `Added to cart — ${p.name}`,
        duration: 2000,
        onClick: () => setMobileTab("cart"),
      });
    }

    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      const service = p.type === "service" ? defaultServiceForProduct(p) : undefined;
      const initialUnitPrice =
        p.type === "service" && service
          ? Number(service.total_charged || 0)
          : p.sale_price;
      return [
        ...prev,
        {
          product: p,
          quantity: 1,
          unit_price: initialUnitPrice,
          discount: 0,
          service,
        },
      ];
    });
  }

  function updateLineService(id: string, patch: Partial<ServiceFields>) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== id || !l.service) return l;
        const nextService = { ...l.service, ...patch };
        const principal = Number(nextService.principal || 0);
        const commission = Number(nextService.commission || 0);
        const totalCharged =
          nextService.total_charged.trim() === ""
            ? principal + commission
            : Number(nextService.total_charged);
        return {
          ...l,
          unit_price: totalCharged,
          service: nextService,
        };
      }),
    );
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== id) return l;
          const next = l.quantity + delta;
          if (next <= 0) return null;
          if (l.product.type === "product" && next > l.product.stock_quantity) {
            setError(`Only ${l.product.stock_quantity} ${l.product.name} in stock.`);
            return l;
          }
          return { ...l, quantity: next };
        })
        .filter((x): x is CartLine => x !== null),
    );
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  }

  function setLinePrice(id: string, v: string) {
    const n = Math.max(Number(v) || 0, 0);
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, unit_price: n } : l)));
  }

  function setLineDiscount(id: string, v: string) {
    const n = Math.max(Number(v) || 0, 0);
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, discount: n } : l)));
  }

  function resetCart() {
    updateActiveTab({
      cart: [],
      customerId: "",
      customerName: undefined,
      discountTotal: 0,
      paymentMethod: "cash",
      amountPaid: "",
      paymentRef: "",
      note: "",
      heldBillId: undefined,
      label: undefined,
    });
  }

  function checkout() {
    if (cart.length === 0) {
      setError("Add at least one item to the cart.");
      return;
    }
    for (const line of cart) {
      if (line.product.type !== "service" || !line.service) continue;
      const s = line.service;
      const p = line.product;
      if (p.requires_provider && !s.provider.trim()) {
        setError(`Service provider is required for ${p.name}.`);
        return;
      }
      if (p.requires_account_number && !s.account_number.trim() && !s.receiver_account.trim()) {
        setError(`Sender or receiver account is required for ${p.name}.`);
        return;
      }
      if (p.requires_reference && !s.reference_no.trim()) {
        setError(`Reference number is required for ${p.name}.`);
        return;
      }
    }
    if (paymentMethod === "customer_credit" && !customerId) {
      setError("Select a customer to put this sale on credit.");
      return;
    }
    setError(null);
    setSuccess(null);
    const payload: CheckoutPayload = {
      cart: cart.map((l) => {
        const base = {
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
        };
        if (l.product.type !== "service" || !l.service) return base;
        const s = l.service;
        const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
        return {
          ...base,
          service_provider: s.provider || undefined,
          service_direction: s.direction || undefined,
          service_account_number: s.account_number || undefined,
          service_receiver_account: s.receiver_account || undefined,
          service_reference_no: s.reference_no || undefined,
          service_transaction_amount: num(s.principal),
          service_commission: num(s.commission),
          service_total_charged: num(s.total_charged),
          service_note: s.note || undefined,
        };
      }),
      customer_id: customerId || null,
      discount_total: discountTotal,
      payment_method: paymentMethod,
      amount_paid: paymentMethod === "customer_credit" ? 0 : tendered,
      payment_reference: paymentRef || null,
      note: note || null,
    };

    const fingerprint = checkoutPayloadFingerprint(payload);
    if (!checkoutAttemptRef.current || checkoutAttemptRef.current.fingerprint !== fingerprint) {
      checkoutAttemptRef.current = { key: crypto.randomUUID(), fingerprint };
    }
    const input: CheckoutInput = {
      ...payload,
      idempotency_key: checkoutAttemptRef.current.key,
    };

    const heldBillId = activeTab.heldBillId;

    startTransition(async () => {
      const res = await checkoutAction(input);
      if (!res.ok) {
        setError(res.error ?? "Checkout failed.");
        return;
      }
      checkoutAttemptRef.current = null;

      if (heldBillId && res.invoice_id) {
        const completeRes = await completeHeldBillAction(heldBillId, res.invoice_id);
        if (!completeRes.ok) {
          toast.show({
            type: "error",
            message: `Sale completed as ${res.invoice_no}, but we could not link it to the held bill. Please contact support.`,
          });
        }
      }

      setProducts((prev) =>
        prev.map((p) => {
          if (p.type !== "product") return p;
          const line = cart.find((l) => l.product.id === p.id);
          if (!line) return p;
          return { ...p, stock_quantity: Math.max(p.stock_quantity - line.quantity, 0) };
        }),
      );
      setSuccess({ id: res.invoice_id!, no: res.invoice_no! });
      resetCart();
      router.refresh();
    });
  }

  function createCustomer() {
    setError(null);
    startTransition(async () => {
      const res = await quickCreateCustomerAction({
        name: newCustomerName,
        phone: newCustomerPhone || null,
      });
      if (!res.ok || !res.customer) {
        setError(res.error ?? "Failed to create customer.");
        return;
      }
      setCustomers((prev) => [...prev, res.customer!].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(res.customer.id);
      setShowCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
    });
  }

  function openHoldModal() {
    if (cart.length === 0) {
      toast.show({ type: "error", message: "Cannot hold an empty bill." });
      return;
    }
    setHoldModalOpen(true);
  }

  function handleHoldConfirm(label: string, holdNote: string) {
    const payload = buildHeldBillPayload(activeTab, label, holdNote);
    if (!payload) {
      toast.show({ type: "error", message: "Cannot hold an empty bill." });
      setHoldModalOpen(false);
      return;
    }

    startTransition(async () => {
      const res = await holdBillAction(payload);
      if (!res.ok) {
        toast.show({ type: "error", message: res.error ?? "Failed to hold bill." });
        return;
      }
      toast.show({ message: "Bill held." });
      setHoldModalOpen(false);
      if (tabs.length > 1) {
        closeTab(activeId);
      } else {
        clearActiveTab();
      }
    });
  }

  function openHeldBills() {
    setHeldBillsOpen(true);
    refreshHeldBills();
  }

  async function refreshHeldBills() {
    setHeldBillsLoading(true);
    setHeldBillsError(null);
    const res = await listHeldBillsAction();
    setHeldBillsLoading(false);
    if (!res.ok) {
      setHeldBillsError(res.error ?? "Failed to load held bills.");
      setHeldBills([]);
      return;
    }
    setHeldBills(res.bills ?? []);
  }

  async function handleResumeHeldBill(bill: {
    id: string;
    label: string | null;
    customer_name: string | null;
  }) {
    setHeldBillsOpen(false);
    const confirmed = await confirm({
      title: "Resume held bill",
      message: "This will load the bill into a new tab. Continue?",
      confirmLabel: "Resume",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const resumeRes = await resumeHeldBillAction(bill.id);
      if (!resumeRes.ok) {
        toast.show({ type: "error", message: resumeRes.error ?? "Failed to resume bill." });
        return;
      }
      const getRes = await getHeldBillAction(bill.id);
      if (!getRes.ok || !getRes.bill) {
        toast.show({ type: "error", message: getRes.error ?? "Held bill not found." });
        return;
      }
      const resumedCart = heldItemsToCart(products, getRes.bill.cart);
      if (resumedCart.length === 0) {
        toast.show({ type: "error", message: "No products from this held bill are available." });
        return;
      }
      resumeHeldBill(bill.id, resumedCart, getRes.bill.customer_id ?? undefined, bill.customer_name ?? undefined, bill.label ?? undefined);
      toast.show({ message: "Held bill resumed." });
    });
  }

  async function handleCancelHeldBill(bill: { id: string; label: string | null }) {
    setHeldBillsOpen(false);
    const confirmed = await confirm({
      title: "Cancel held bill",
      message: `Cancel ${bill.label ? `"${bill.label}"` : "this held bill"}? This cannot be undone.`,
      confirmLabel: "Cancel bill",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const res = await cancelHeldBillAction(bill.id);
      if (!res.ok) {
        toast.show({ type: "error", message: res.error ?? "Failed to cancel held bill." });
        return;
      }
      toast.show({ message: "Held bill cancelled." });
      setHeldBillsOpen(false);
    });
  }

  function promptCloseTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.cart.length === 0) {
      closeTab(tabId);
      return;
    }
    setCloseTabPrompt({ open: true, tabId });
  }

  function confirmCloseTab(action: "hold" | "discard") {
    const tabId = closeTabPrompt?.tabId;
    if (!tabId) return;

    if (action === "hold") {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.cart.length === 0) {
        setCloseTabPrompt(null);
        return;
      }
      const payload = buildHeldBillPayload(tab);
      if (!payload) {
        setCloseTabPrompt(null);
        return;
      }
      startTransition(async () => {
        const res = await holdBillAction(payload);
        setCloseTabPrompt(null);
        if (!res.ok) {
          toast.show({ type: "error", message: res.error ?? "Failed to hold bill." });
          return;
        }
        toast.show({ message: "Bill held and tab closed." });
        closeTab(tabId);
      });
      return;
    }

    setCloseTabPrompt(null);
    closeTab(tabId);
  }

  const tabBar = (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const total = tab.cart.reduce((s, l) => s + Math.max(l.unit_price * l.quantity - l.discount, 0), 0) - tab.discountTotal;
        return (
          <div
            key={tab.id}
            data-testid="pos-bill-tab"
            onClick={() => switchTab(tab.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
              isActive
                ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-100"
                : "border-slate-200 bg-[#fff] text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <div className="flex min-w-0 flex-col items-start">
              <input
                data-testid="pos-bill-label"
                type="text"
                value={tab.label ?? `Bill ${tabs.findIndex((t) => t.id === tab.id) + 1}`}
                onChange={(e) => {
                  if (isActive) setTabLabel(e.target.value);
                }}
                onFocus={() => {
                  if (!isActive) switchTab(tab.id);
                }}
                onClick={(e) => e.stopPropagation()}
                readOnly={!isActive}
                className="max-w-[8rem] cursor-pointer bg-transparent font-bold outline-none placeholder:text-slate-400 read-only:cursor-pointer"
                placeholder="Bill label"
              />
              <span className="text-xs font-semibold opacity-80">{formatCurrency(Math.max(total, 0), currency)}</span>
            </div>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  promptCloseTab(tab.id);
                }}
                className="flex size-6 items-center justify-center rounded text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close tab"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addTab}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        + New bill
      </button>
    </div>
  );

  if (!hydrated) {
    return (
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-[#fff] p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-8 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-4 h-48 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="pb-24 xl:pb-0">
      <div className="mb-4 hidden items-center justify-between gap-3 xl:flex">
        {tabBar}
        <button
          type="button"
          onClick={openHeldBills}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ReceiptText className="size-4" />
          Held bills
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-[#fff] p-1 shadow-sm dark:bg-slate-900 xl:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={`min-h-11 rounded-lg px-3 text-sm font-black ${
            mobileTab === "products" ? "bg-blue-700 text-white" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("cart")}
          className={`min-h-11 rounded-lg px-3 text-sm font-black ${
            mobileTab === "cart" ? "bg-blue-700 text-white" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Cart · {cartCount} · {formatCurrency(grandTotal, currency)}
        </button>
      </div>

      <div className="mb-3 block xl:hidden">
        <div className="flex items-center justify-between gap-2">
          {tabBar}
          <button
            type="button"
            onClick={openHeldBills}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-[#fff] px-2.5 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <ReceiptText className="size-3.5" />
            Held
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section
          className={`${
            mobileTab === "products" ? "block" : "hidden"
          } rounded-2xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:bg-slate-900 sm:p-5 xl:block`}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="min-w-0">
              <span className="sr-only">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBarcodeScan(search);
                    }
                  }}
                  placeholder="Search by name, SKU, or barcode"
                  className="h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </label>
            <BarcodeScanner
              onDetected={(code) => {
                handleBarcodeScan(code);
              }}
              disabled={false}
            />
            <label className="min-w-0">
              <span className="sr-only">Category</span>
              <AppSelect
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
                ariaLabel="Category"
                searchable={categories.length > 8}
                className="sm:w-52"
                buttonClassName="h-11"
              />
            </label>
          </div>
          {scanResult && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <span>No product found for barcode {scanResult.barcode}.</span>
              {canWriteCatalog && (
                <Link
                  href={`/products?tab=products&barcode=${encodeURIComponent(scanResult.barcode)}`}
                  className="ml-2 font-bold text-blue-700 underline hover:text-blue-800"
                >
                  Create product?
                </Link>
              )}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50">
              {products.length === 0 ? (
                <>
                  <p className="font-semibold">No products yet.</p>
                  <p className="mt-1 text-xs">
                    Add products in the{" "}
                    <Link href="/products" className="text-blue-700 underline">
                      Catalog
                    </Link>
                    {" "}before using POS.
                  </p>
                </>
              ) : (
                "No products match your search."
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((p) => {
                const outOfStock = p.type === "product" && p.stock_quantity <= 0;
                const low = p.type === "product" && p.stock_quantity > 0 && p.stock_quantity <= p.minimum_stock;
                return (
                  <button
                    type="button"
                    key={p.id}
                    data-testid="pos-product-btn"
                    data-product-id={p.id}
                    onClick={() => addToCart(p)}
                    disabled={outOfStock || !canCheckout}
                    className={`flex min-h-36 h-full flex-col rounded-xl border p-3 text-left transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-400/70 dark:focus-visible:ring-offset-slate-950 ${
                      outOfStock
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900/70"
                        : "cursor-pointer border-slate-200 bg-[#fff] shadow-sm hover:-translate-y-0.5 hover:border-blue-600 hover:bg-blue-50/50 hover:shadow-md hover:shadow-blue-100/60 dark:border-slate-700 dark:bg-slate-950 dark:shadow-none dark:hover:border-cyan-400/80 dark:hover:bg-slate-800/90 dark:hover:ring-1 dark:hover:ring-cyan-400/40 dark:hover:shadow-lg dark:hover:shadow-cyan-950/40"
                    }`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        {p.type === "service" ? "Service" : "Product"}
                      </span>
                      {low && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                          Low
                        </span>
                      )}
                      {outOfStock && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                          Out
                        </span>
                      )}
                    </div>
                    <ProductThumbnail
                      imageUrl={p.image_url}
                      productName={p.name}
                      className="mt-2 aspect-square w-full"
                      sizes="(max-width: 379px) 100vw, (max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                    />
                    <p className="mt-2 line-clamp-2 break-words text-sm font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{p.sku ?? p.barcode ?? p.category_name ?? "—"}</p>
                    <div className="mt-auto flex flex-col gap-1 pt-3 min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:justify-between">
                      <span className="text-sm font-black text-slate-950 dark:text-white">
                        {formatCurrency(p.sale_price, currency)}
                      </span>
                      {p.type === "product" && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatNumber(p.stock_quantity)} in stock</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section
          className={`${
            mobileTab === "cart" ? "block" : "hidden"
          } rounded-2xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:bg-slate-900 sm:p-5 xl:block xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto`}
        >
          <div className="mb-3 hidden xl:block">{tabBar}</div>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950 dark:text-slate-100">Cart</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {cartCount} items
            </span>
          </div>
          {!canCheckout && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Your role does not allow completing a sale.
            </p>
          )}

          {cart.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
              Cart is empty. Tap a product to add it.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {cart.map((l) => (
                <li key={l.product.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-900 dark:text-slate-100">{l.product.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {l.product.type === "service" ? "Service" : `${formatNumber(l.product.stock_quantity)} in stock`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.product.id)}
                      className="flex size-10 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      title="Remove"
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                    <div className="flex items-center gap-2 min-[380px]:col-span-3">
                      <button
                        type="button"
                        onClick={() => updateQty(l.product.id, -1)}
                        className="flex size-11 items-center justify-center rounded-md border border-slate-200 text-slate-600 dark:border-slate-700"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-bold">{l.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(l.product.id, 1)}
                        className="flex size-11 items-center justify-center rounded-md border border-slate-200 text-slate-600 dark:border-slate-700"
                      >
                        <Plus className="size-4" />
                      </button>
                      <span className="ml-auto text-right text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(Math.max(l.unit_price * l.quantity - l.discount, 0), currency)}
                      </span>
                    </div>
                    <label className="text-xs min-[380px]:col-span-2">
                      <span className="text-slate-500 dark:text-slate-400">Unit price</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.unit_price}
                        onChange={(e) => setLinePrice(l.product.id, e.target.value)}
                        className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-200 bg-[#fff] px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Discount</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.discount}
                        onChange={(e) => setLineDiscount(l.product.id, e.target.value)}
                        className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-200 bg-[#fff] px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                  </div>

                  {l.product.type === "product" && (() => {
                    const lineRevenue = Math.max(l.unit_price * l.quantity - l.discount, 0);
                    const allocatedBillDiscount = totalProductRevenue > 0 ? (lineRevenue / totalProductRevenue) * (discountTotal || 0) : 0;
                    const effectiveRevenue = Math.max(lineRevenue - allocatedBillDiscount, 0);
                    const totalCost = l.product.purchase_price * l.quantity;
                    const isBelowCost = effectiveRevenue < totalCost;
                    const isOverrideAllowed = l.product.allow_sell_at_loss;

                    if (!isBelowCost) return null;

                    return (
                      <div
                        className={`mt-2 rounded-lg border p-2.5 text-xs font-semibold ${
                          isOverrideAllowed
                            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
                            : "border-red-200 bg-red-50 text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200"
                        }`}
                      >
                        {isOverrideAllowed ? (
                          <p>
                            ⚠️ Selling below cost price (Cost: Rs. {totalCost.toLocaleString()}, Effective: Rs. {Math.round(effectiveRevenue).toLocaleString()}).
                            <span className="block text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">Approved under admin override: &quot;{l.product.sell_at_loss_reason}&quot;</span>
                          </p>
                        ) : (
                          <p>
                            🚨 Blocked: Selling below cost price (Cost: Rs. {totalCost.toLocaleString()}, Effective: Rs. {Math.round(effectiveRevenue).toLocaleString()}).
                            <span className="block text-[10px] text-red-700 dark:text-red-300 mt-0.5">Checkout will be blocked. Reduce discount or ask admin to enable override.</span>
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {l.product.type === "service" && l.service && (
                    <ServiceLineDetails
                      line={l}
                      onChange={(patch) => updateLineService(l.product.id, patch)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Customer</label>
            <div className="mt-1 flex flex-col gap-2 min-[360px]:flex-row">
              <AppSelect
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                ariaLabel="Customer"
                searchable={customers.length > 8}
                className="min-w-0 flex-1"
              />
              <button
                onClick={() => setShowCustomerForm((v) => !v)}
                className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-[#fff] px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                type="button"
              >
                <UserPlus2 className="size-4" /> New
              </button>
            </div>
            {showCustomerForm && (
              <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:grid-cols-2">
                <input
                  placeholder="Name"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="h-10 min-w-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  placeholder="Phone"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="h-10 min-w-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={createCustomer}
                  disabled={pending || !newCustomerName.trim()}
                  className="h-10 rounded-md bg-blue-700 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2"
                >
                  {pending ? "Saving…" : "Save customer"}
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600 dark:text-slate-400">Cart discount</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discountTotal}
                onChange={(e) => setDiscountTotal(Math.max(Number(e.target.value) || 0, 0))}
                className="h-9 w-24 min-w-0 rounded-md border border-slate-200 bg-[#fff] px-2 text-right outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 sm:w-32"
              />
            </div>
            <div className="flex justify-between text-base">
              <span className="font-bold">Grand total</span>
              <span className="text-lg font-black text-slate-950 dark:text-white">
                {formatCurrency(grandTotal, currency)}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Payment method</label>
              <AppSelect
                value={paymentMethod}
                onChange={(nextValue) => {
                  const method = nextValue as PaymentMethod;
                  setPaymentMethod(method);
                  if (method === "customer_credit") {
                    setAmountPaid("0");
                  } else {
                    setAmountPaid("");
                  }
                }}
                options={paymentOptions}
                ariaLabel="Payment method"
                className="mt-1"
              />
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Amount tendered</span>
              <div className="mt-1 flex flex-col gap-2 min-[360px]:flex-row">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  data-testid="pos-amount-tendered-input"
                  value={paymentMethod === "customer_credit" ? "0" : amountPaid}
                  disabled={paymentMethod === "customer_credit"}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="h-10 w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-[#fff] px-3 outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                />
                <button
                  type="button"
                  data-testid="pos-exact-tender-btn"
                  disabled={paymentMethod === "customer_credit"}
                  onClick={() => setAmountPaid(String(grandTotal))}
                  className="h-10 shrink-0 rounded-lg border border-slate-200 bg-[#fff] px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Exact
                </button>
              </div>
            </label>
            {paymentMethod !== "cash" && paymentMethod !== "customer_credit" && (
              <label className="block">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reference (optional)</span>
                <input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Balance due</span>
              <span className={`font-bold ${balance > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {formatCurrency(balance, currency)}
              </span>
            </div>
            {changeDue > 0 && (
              <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="font-semibold">Change due</span>
                <span className="font-black tabular-nums">{formatCurrency(changeDue, currency)}</span>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                data-testid="pos-note-input"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          {isCreditAndMissingCustomer && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              ⚠️ Select a customer to put this sale on credit.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>
          )}
          {success && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              Sale recorded as <strong>{success.no}</strong>.{" "}
              <Link href={`/invoices/${success.id}`} className="ml-1 underline">
                Open invoice
              </Link>
            </div>
          )}

          <div className="mt-4 grid gap-3 min-[380px]:grid-cols-[1fr_1fr_2fr]">
            <button
              type="button"
              onClick={openHoldModal}
              disabled={cart.length === 0 || pending}
              className="flex h-12 items-center justify-center gap-1 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <PauseCircle className="size-4" /> Hold
            </button>
            <button
              type="button"
              onClick={resetCart}
              disabled={cart.length === 0 || pending}
              className="h-12 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={checkout}
              data-testid="pos-checkout-btn"
              disabled={!canCheckout || pending || cart.length === 0 || isCreditAndMissingCustomer}
              className="h-12 rounded-lg bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {pending ? "Processing…" : `Checkout · ${formatCurrency(grandTotal, currency)}`}
            </button>
          </div>
          <div className="h-20 xl:hidden" />
        </section>
      </div>

      {cart.length > 0 && mobileTab === "products" && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-[#fff]/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:bottom-0 xl:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("cart")}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-blue-700 px-4 text-left text-sm font-black text-white"
          >
            <span>View cart · {cartCount} items</span>
            <span>{formatCurrency(grandTotal, currency)}</span>
          </button>
        </div>
      )}

      <HoldBillModal
        key={holdModalOpen ? "open" : "closed"}
        open={holdModalOpen}
        onClose={() => setHoldModalOpen(false)}
        onConfirm={handleHoldConfirm}
        defaultLabel={activeTab.label ?? ""}
        pending={pending}
      />

      <HeldBillsDrawer
        open={heldBillsOpen}
        onClose={() => setHeldBillsOpen(false)}
        currency={currency}
        bills={heldBills}
        loading={heldBillsLoading}
        error={heldBillsError}
        onRefresh={refreshHeldBills}
        onResume={handleResumeHeldBill}
        onCancel={handleCancelHeldBill}
      />

      <FormModal
        open={closeTabPrompt?.open ?? false}
        onClose={() => setCloseTabPrompt(null)}
        title="Close this bill?"
        description="This tab still has items. Hold the bill for later, or discard the cart."
        footer={
          <>
            <button
              type="button"
              onClick={() => setCloseTabPrompt(null)}
              className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmCloseTab("discard")}
              disabled={pending}
              className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => confirmCloseTab("hold")}
              disabled={pending}
              className="h-11 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {pending ? "Holding…" : "Hold & close"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Holding saves the cart so it can be resumed later. Discarding removes the items permanently.
        </p>
      </FormModal>
    </div>
  );
}

function ServiceLineDetails({
  line,
  onChange,
}: {
  line: CartLine;
  onChange: (patch: Partial<ServiceFields>) => void;
}) {
  const s = line.service!;
  const p = line.product;
  const requiresProvider = p.requires_provider;
  const requiresAccount = p.requires_account_number;
  const requiresReference = p.requires_reference;

  const principalNum = Number(s.principal || 0);
  const commissionNum = Number(s.commission || 0);
  const totalNum = Number(s.total_charged || 0);
  const totalLessThanCommission =
    s.total_charged !== "" && commissionNum > 0 && totalNum < commissionNum;
  const computedTotal = principalNum + commissionNum;
  const directionOptions = [
    { value: "", label: "—" },
    ...SERVICE_DIRECTIONS.map((d) => ({ value: d, label: SERVICE_DIRECTION_LABELS[d] })),
  ];

  return (
    <details className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20" open>
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">
        Service details
        <span className="ml-2 font-normal text-blue-700 dark:text-blue-400">
          (principal = pass-through, commission = shop income)
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">
            Provider{requiresProvider ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.provider}
            onChange={(e) => onChange({ provider: e.target.value })}
            placeholder="e.g. EasyPaisa, Jazz, Telenor"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">Direction / type</span>
          <AppSelect
            value={s.direction}
            onChange={(nextValue) => onChange({ direction: nextValue as ServiceDirection | "" })}
            options={directionOptions}
            ariaLabel="Direction / type"
            className="mt-1"
            buttonClassName="h-9 rounded-md text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">
            Sender / account #{requiresAccount ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.account_number}
            onChange={(e) => onChange({ account_number: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">Receiver account #</span>
          <input
            type="text"
            value={s.receiver_account}
            onChange={(e) => onChange({ receiver_account: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">
            Reference #{requiresReference ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.reference_no}
            onChange={(e) => onChange({ reference_no: e.target.value })}
            placeholder="TID / transaction reference"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">Principal (pass-through)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={s.principal}
            onChange={(e) => onChange({ principal: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600 dark:text-slate-400">Commission (shop income)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={s.commission}
            onChange={(e) => onChange({ commission: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">
            Total charged
            {s.total_charged === "" && computedTotal > 0 && (
              <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                (auto: {computedTotal.toLocaleString("en-PK")})
              </span>
            )}
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={s.total_charged}
            onChange={(e) => onChange({ total_charged: e.target.value })}
            placeholder={String(computedTotal || "")}
            className={`mt-1 h-9 w-full rounded-md border px-2 outline-none focus:border-blue-600 dark:bg-slate-900 ${
              totalLessThanCommission ? "border-red-300" : "border-slate-200 dark:border-slate-700"
            }`}
          />
          {totalLessThanCommission && (
            <span className="mt-1 block text-[10px] text-red-700 dark:text-red-300">
              Total charged cannot be less than commission.
            </span>
          )}
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">Note (optional)</span>
          <textarea
            value={s.note}
            onChange={(e) => onChange({ note: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        The cart line total above is what appears on the invoice. Principal and
        commission are stored for reporting; commission is profit, principal is
        pass-through.
      </p>
    </details>
  );
}
