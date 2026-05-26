"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2, UserPlus2 } from "lucide-react";
import { checkoutAction, quickCreateCustomerAction } from "./actions";
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

type Props = {
  products: PosProduct[];
  customers: PosCustomer[];
  categories: { id: string; name: string }[];
  currency: string;
  canCheckout: boolean;
};

type ServiceFields = {
  provider: string;
  direction: ServiceDirection | "";
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
    direction: (p.service_type ?? "") as ServiceDirection | "",
    commission: p.default_commission_amount > 0 ? String(p.default_commission_amount) : "",
  };
}

type CartLine = {
  product: PosProduct;
  quantity: number;
  unit_price: number;
  discount: number;
  service?: ServiceFields;
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

export function PosClient({ products: initialProducts, customers: initialCustomers, categories, currency, canCheckout }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [customers, setCustomers] = useState(initialCustomers);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentRef, setPaymentRef] = useState("");
  const [note, setNote] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; no: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("products");
  const [pending, startTransition] = useTransition();

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
  const paid = Number(amountPaid || 0);
  const balance = Math.max(grandTotal - paid, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addToCart(p: PosProduct) {
    if (success) setSuccess(null);
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        if (p.type === "product" && existing.quantity + 1 > p.stock_quantity) {
          setError(`Only ${p.stock_quantity} ${p.name} in stock.`);
          return prev;
        }
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      if (p.type === "product" && p.stock_quantity <= 0) {
        setError(`${p.name} is out of stock.`);
        return prev;
      }
      return [
        ...prev,
        {
          product: p,
          quantity: 1,
          unit_price: p.sale_price,
          discount: 0,
          service: p.type === "service" ? defaultServiceForProduct(p) : undefined,
        },
      ];
    });
  }

  function updateLineService(id: string, patch: Partial<ServiceFields>) {
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === id && l.service
          ? { ...l, service: { ...l.service, ...patch } }
          : l,
      ),
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
    setCart([]);
    setCustomerId("");
    setDiscountTotal(0);
    setPaymentMethod("cash");
    setAmountPaid("");
    setPaymentRef("");
    setNote("");
  }

  function checkout() {
    if (cart.length === 0) {
      setError("Add at least one item to the cart.");
      return;
    }
    // Pre-validate service required fields client-side (the RPC re-enforces).
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
    setError(null);
    setSuccess(null);
    const input: CheckoutInput = {
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
      amount_paid: paid,
      payment_reference: paymentRef || null,
      note: note || null,
    };

    startTransition(async () => {
      const res = await checkoutAction(input);
      if (!res.ok) {
        setError(res.error ?? "Checkout failed.");
        return;
      }
      // Decrement stock locally for immediate UI feedback before navigation.
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

  return (
    <div className="pb-24 xl:pb-0">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm xl:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={`min-h-11 rounded-lg px-3 text-sm font-black ${
            mobileTab === "products" ? "bg-blue-700 text-white" : "text-slate-600"
          }`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("cart")}
          className={`min-h-11 rounded-lg px-3 text-sm font-black ${
            mobileTab === "cart" ? "bg-blue-700 text-white" : "text-slate-600"
          }`}
        >
          Cart · {cartCount} · {formatCurrency(grandTotal, currency)}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      {/* Products column */}
      <section className={`${mobileTab === "products" ? "block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 xl:block`}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="min-w-0">
            <span className="sr-only">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, or barcode"
                className="h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 outline-none focus:border-blue-600"
              />
            </div>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 sm:w-52"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
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
                  onClick={() => addToCart(p)}
                  disabled={outOfStock || !canCheckout}
                  className={`flex min-h-36 h-full flex-col rounded-xl border p-3 text-left transition ${
                    outOfStock
                      ? "border-slate-200 bg-slate-50 opacity-60"
                      : "border-slate-200 bg-white hover:border-blue-600 hover:shadow"
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
                  <p className="mt-2 line-clamp-2 break-words text-sm font-bold text-slate-900">{p.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{p.sku ?? p.barcode ?? p.category_name ?? "—"}</p>
                  <div className="mt-auto flex flex-col gap-1 pt-3 min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:justify-between">
                    <span className="text-sm font-black text-slate-950 sm:text-base">
                      {formatCurrency(p.sale_price, currency)}
                    </span>
                    {p.type === "product" && (
                      <span className="text-xs text-slate-500">{formatNumber(p.stock_quantity)} in stock</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Cart column */}
      <section className={`${mobileTab === "cart" ? "block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 xl:block xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">Cart</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {cartCount} items
          </span>
        </div>
        {!canCheckout && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Your role does not allow completing a sale.
          </p>
        )}

        {cart.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Cart is empty. Tap a product to add it.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cart.map((l) => (
              <li key={l.product.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-slate-900">{l.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.product.type === "service" ? "Service" : `${formatNumber(l.product.stock_quantity)} in stock`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.product.id)}
                    className="rounded-md p-1 text-red-600 hover:bg-red-50"
                    title="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                  <div className="flex items-center gap-2 min-[380px]:col-span-3">
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, -1)}
                      className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{l.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, 1)}
                      className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600"
                    >
                      <Plus className="size-3" />
                    </button>
                    <span className="ml-auto text-right text-sm font-bold text-slate-900">
                      {formatCurrency(Math.max(l.unit_price * l.quantity - l.discount, 0), currency)}
                    </span>
                  </div>
                  <label className="text-xs min-[380px]:col-span-2">
                    <span className="text-slate-500">Unit price</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unit_price}
                      onChange={(e) => setLinePrice(l.product.id, e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-slate-500">Discount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.discount}
                      onChange={(e) => setLineDiscount(l.product.id, e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
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
                    <div className={`mt-2 rounded-lg p-2.5 text-xs font-semibold border ${
                      isOverrideAllowed
                        ? "bg-amber-50 text-amber-900 border-amber-200"
                        : "bg-red-50 text-red-900 border-red-200"
                    }`}>
                      {isOverrideAllowed ? (
                        <p>
                          ⚠️ Selling below cost price (Cost: Rs. {totalCost.toLocaleString()}, Effective: Rs. {Math.round(effectiveRevenue).toLocaleString()}).
                          <span className="block text-[10px] text-amber-700 mt-0.5">Approved under admin override: &quot;{l.product.sell_at_loss_reason}&quot;</span>
                        </p>
                      ) : (
                        <p>
                          🚨 Blocked: Selling below cost price (Cost: Rs. {totalCost.toLocaleString()}, Effective: Rs. {Math.round(effectiveRevenue).toLocaleString()}).
                          <span className="block text-[10px] text-red-700 mt-0.5">Checkout will be blocked. Reduce discount or ask admin to enable override.</span>
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

        {/* Customer */}
        <div className="mt-5">
          <label className="block text-sm font-semibold text-slate-700">Customer</label>
          <div className="mt-1 grid gap-2 min-[380px]:grid-cols-[1fr_auto]">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
            >
              <option value="">Walk-in</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowCustomerForm((v) => !v)}
              className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
              type="button"
            >
              <UserPlus2 className="size-4" /> New
            </button>
          </div>
          {showCustomerForm && (
            <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-600"
              />
              <input
                placeholder="Phone"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={createCustomer}
                disabled={pending || !newCustomerName.trim()}
                className="h-9 rounded-md bg-blue-700 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2"
              >
                {pending ? "Saving…" : "Save customer"}
              </button>
            </div>
          )}
        </div>

        {/* Totals + payment */}
        <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-semibold">{formatCurrency(subtotal, currency)}</span>
          </div>
          <label className="grid gap-1 text-sm min-[380px]:grid-cols-[1fr_auto] min-[380px]:items-center">
            <span>Cart discount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountTotal}
              onChange={(e) => setDiscountTotal(Math.max(Number(e.target.value) || 0, 0))}
              className="h-9 w-full rounded-md border border-slate-200 px-2 text-right outline-none focus:border-blue-600 min-[380px]:w-32"
            />
          </label>
          <div className="flex justify-between text-base">
            <span className="font-bold">Grand total</span>
            <span className="text-lg font-black text-slate-950">
              {formatCurrency(grandTotal, currency)}
            </span>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <label className="block text-sm font-semibold text-slate-700">Payment method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Amount paid</span>
            <div className="mt-1 grid gap-2 min-[380px]:grid-cols-[1fr_auto]">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setAmountPaid(String(grandTotal))}
                className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Exact
              </button>
            </div>
          </label>
          {paymentMethod !== "cash" && paymentMethod !== "customer_credit" && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Reference (optional)</span>
              <input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
              />
            </label>
          )}
          <div className="flex justify-between text-sm">
            <span>Balance due</span>
            <span className={`font-bold ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatCurrency(balance, currency)}
            </span>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
        )}
        {success && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800">
            Sale recorded as <strong>{success.no}</strong>.{" "}
            <Link href={`/invoices/${success.id}`} className="ml-1 underline">
              Open invoice
            </Link>
          </div>
        )}

        <div className="mt-4 grid gap-3 min-[380px]:grid-cols-[1fr_2fr]">
          <button
            type="button"
            onClick={resetCart}
            disabled={cart.length === 0 || pending}
            className="h-12 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={checkout}
            disabled={!canCheckout || pending || cart.length === 0}
            className="h-12 rounded-lg bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? "Processing…" : `Checkout · ${formatCurrency(grandTotal, currency)}`}
          </button>
        </div>
      </section>
      </div>

      {cart.length > 0 && mobileTab === "products" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-12px_28px_rgba(15,23,42,0.12)] backdrop-blur xl:hidden">
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

  // Auto-fill total charged when both principal and commission are set and total is empty.
  const principalNum = Number(s.principal || 0);
  const commissionNum = Number(s.commission || 0);
  const totalNum = Number(s.total_charged || 0);
  const totalLessThanCommission =
    s.total_charged !== "" && commissionNum > 0 && totalNum < commissionNum;
  const computedTotal = principalNum + commissionNum;

  return (
    <details className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3" open>
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-blue-800">
        Service details
        <span className="ml-2 font-normal text-blue-700">
          (principal = pass-through, commission = shop income)
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-slate-600">
            Provider{requiresProvider ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.provider}
            onChange={(e) => onChange({ provider: e.target.value })}
            placeholder="e.g. EasyPaisa, Jazz, Telenor"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600">Direction / type</span>
          <select
            value={s.direction}
            onChange={(e) =>
              onChange({ direction: e.target.value as ServiceDirection | "" })
            }
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          >
            <option value="">—</option>
            {SERVICE_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {SERVICE_DIRECTION_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-slate-600">
            Sender / account #{requiresAccount ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.account_number}
            onChange={(e) => onChange({ account_number: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600">Receiver account #</span>
          <input
            type="text"
            value={s.receiver_account}
            onChange={(e) => onChange({ receiver_account: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600">
            Reference #{requiresReference ? " *" : ""}
          </span>
          <input
            type="text"
            value={s.reference_no}
            onChange={(e) => onChange({ reference_no: e.target.value })}
            placeholder="TID / transaction reference"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600">Principal (pass-through)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={s.principal}
            onChange={(e) => onChange({ principal: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600">Commission (shop income)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={s.commission}
            onChange={(e) => onChange({ commission: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600">
            Total charged
            {s.total_charged === "" && computedTotal > 0 && (
              <span className="ml-1 font-normal text-slate-400">
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
            className={`mt-1 h-9 w-full rounded-md border px-2 outline-none focus:border-blue-600 ${
              totalLessThanCommission ? "border-red-300" : "border-slate-200"
            }`}
          />
          {totalLessThanCommission && (
            <span className="mt-1 block text-[10px] text-red-700">
              Total charged cannot be less than commission.
            </span>
          )}
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-slate-600">Note (optional)</span>
          <textarea
            value={s.note}
            onChange={(e) => onChange({ note: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 outline-none focus:border-blue-600"
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        The cart line total above is what appears on the invoice. Principal and
        commission are stored for reporting; commission is profit, principal is
        pass-through.
      </p>
    </details>
  );
}
