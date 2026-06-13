"use client";

import { useActionState, useEffect, useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { saveRepairAction } from "./actions";
import type { CustomerRow } from "@/lib/data/customers";
import type { RepairRow } from "@/lib/data/repairs";

const defaultState = { error: null as string | null, success: null as string | null };

export function RepairForm({
  customers,
  repair,
  onClose,
}: {
  customers: CustomerRow[];
  repair?: RepairRow;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(saveRepairAction, defaultState);
  const [customerId, setCustomerId] = useState(repair?.customer_id || "");
  const [customerName, setCustomerName] = useState(repair?.customer_name || "");
  const [customerPhone, setCustomerPhone] = useState(repair?.customer_phone || "");
  const [createCustomerAccount, setCreateCustomerAccount] = useState(false);

  // Search through customer lists
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(searchQuery))
  );

  // Autofill customer parameters on select
  const handleSelectCustomer = (c: CustomerRow) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setSearchQuery(c.name);
    setShowDropdown(false);
    setCreateCustomerAccount(false);
  };

  const handleClearCustomer = () => {
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setSearchQuery("");
  };

  useEffect(() => {
    if (state.success) {
      onClose();
    }
  }, [state, onClose]);

  // Format expected delivery for datetime-local value
  const getFmtDeliveryDate = () => {
    if (!repair?.expected_delivery_at) return "";
    const date = new Date(repair.expected_delivery_at);
    // return YYYY-MM-DD
    return date.toISOString().split("T")[0];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-3xl border-0 sm:border border-slate-200 bg-[#fff] dark:bg-slate-900 p-4 sm:p-6 shadow-2xl overflow-y-auto max-h-full sm:max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-slate-50">
              {repair ? `Edit Job Details (${repair.job_no})` : "New Repair Intake"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Record customer device issues and advances.</p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="h-11 w-11 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="size-6" />
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          {repair && <input type="hidden" name="id" value={repair.id} />}

          {/* Customer Selection Section */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Customer Info
            </h4>

            {!repair && (
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Search Registered Customers
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none transition focus:border-blue-600"
                  />
                  <Search className="absolute left-3 top-3 size-4 text-slate-400" />
                </div>

                {showDropdown && searchQuery && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                    {filteredCustomers.length === 0 ? (
                      <div className="px-4 py-2 text-xs text-slate-500">
                        No registered customers found.
                      </div>
                    ) : (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex flex-col"
                        >
                          <span className="font-bold text-slate-800">{c.name}</span>
                          {c.phone && <span className="text-xs text-slate-500">{c.phone}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  name="customer_name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  readOnly={Boolean(customerId)}
                  placeholder="Enter customer's full name"
                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 ${
                    customerId ? "bg-slate-100/70 text-slate-600" : "bg-white"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="customer_phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  readOnly={Boolean(customerId)}
                  placeholder="e.g. 03001234567"
                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 ${
                    customerId ? "bg-slate-100/70 text-slate-600" : "bg-white"
                  }`}
                />
              </div>
            </div>

            <input type="hidden" name="customer_id" value={customerId} />

            {customerId ? (
              <div className="flex justify-between items-center bg-blue-50/60 rounded-xl px-3 py-2 text-xs">
                <span className="text-blue-800 font-semibold">
                  Linked to registered account.
                </span>
                {!repair && (
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="text-blue-600 underline font-bold hover:text-blue-800"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            ) : (
              !repair && (
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-slate-200 rounded-xl p-2 px-3 text-xs">
                  <input
                    type="checkbox"
                    name="create_customer_account"
                    value="true"
                    checked={createCustomerAccount}
                    onChange={(e) => setCreateCustomerAccount(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="font-bold text-slate-700">
                    Create permanent customer account in ledger
                  </span>
                </label>
              )
            )}
          </div>

          {/* Device Parameters Section */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Device Type <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                name="device_type"
                defaultValue={repair?.device_type ?? "Mobile"}
                placeholder="e.g. Mobile, Tablet, Laptop"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Device Model
              </label>
              <input
                type="text"
                name="device_model"
                defaultValue={repair?.device_model ?? ""}
                placeholder="e.g. iPhone 13 Pro"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Serial / IMEI Number
              </label>
              <input
                type="text"
                name="serial_imei"
                defaultValue={repair?.serial_imei ?? ""}
                placeholder="IMEI/Serial code"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>
          </div>

          {/* Issue & Intake Information */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Problem Description <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                name="problem_description"
                defaultValue={repair?.problem_description ?? ""}
                placeholder="Describe device faults and symptoms..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Accessories Received
              </label>
              <textarea
                name="accessories_received"
                defaultValue={repair?.accessories_received ?? ""}
                placeholder="e.g. Charger, Original Box, Back Cover"
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>
          </div>

          {/* Estimates and advances */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estimated Cost (PKR)
              </label>
              <input
                type="number"
                name="estimated_cost"
                min="0"
                step="1"
                defaultValue={repair?.estimated_cost ?? 0}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Advance Paid (PKR)
              </label>
              <input
                type="number"
                name="advance_paid"
                min="0"
                step="1"
                defaultValue={repair?.advance_paid ?? 0}
                readOnly={Boolean(repair)} // Advance shouldn't change after initial receipt intake in edit mode
                className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-600 ${
                  repair ? "bg-slate-100 text-slate-500" : "bg-white"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                name="payment_method"
                defaultValue={repair?.payment_method ?? "cash"}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="easypaisa">EasyPaisa</option>
                <option value="jazzcash">JazzCash</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>

          {/* Dates and Statuses */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                name="expected_delivery_at"
                defaultValue={getFmtDeliveryDate()}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
              />
            </div>

            {repair ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={repair.status}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600 animate-pulse bg-amber-50/50"
                >
                  <option value="received">Received</option>
                  <option value="waiting_for_parts">Waiting for Parts</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Ready for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ) : (
              <input type="hidden" name="status" value="received" />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Internal Notes / Details
            </label>
            <textarea
              name="notes"
              defaultValue={repair?.notes ?? ""}
              placeholder="e.g. Scratches on back glass, custom components required..."
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
            />
          </div>

          {state.error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
              {state.error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 transition disabled:opacity-60 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : repair ? (
                "Update Details"
              ) : (
                "Record Intake"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
