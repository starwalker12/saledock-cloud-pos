import { randomUUID } from "node:crypto";
import {
  checked,
  createDiscountPrintFixture,
} from "./pos-discount-print-fixture";

export async function createInvoiceDesignFixture() {
  const base = await createDiscountPrintFixture();
  const customer = randomUUID();
  const invoices: Record<string, { id: string; count: number; total: number }> =
    {};
  try {
    checked(
      (
        await base.admin
          .from("organizations")
          .update({
            name: "Northline Studio & Supply",
            primary_color: "#15665D",
            accent_color: "#CA7437",
            email: "hello@example.test",
            google_maps_url: "https://maps.google.com/?q=0,0",
          })
          .eq("id", base.org)
      ).error,
    );
    checked(
      (
        await base.admin
          .from("branches")
          .update({
            name: "Central branch",
            phone: "03000000000",
            address: "24 Market Street, Business District",
          })
          .eq("id", base.branch)
      ).error,
    );
    checked(
      (
        await base.admin
          .from("customers")
          .insert({
            id: customer,
            organization_id: base.org,
            branch_id: base.branch,
            name: "Alex Morgan",
            phone: "03000000001",
            address:
              "Suite 12, Northline Commercial Building, Extended Commercial Avenue, Central Business District, Karachi, Pakistan",
            outstanding_balance: 0,
          })
      ).error,
    );
    checked(
      (
        await base.admin
          .from("app_settings")
          .insert({
            organization_id: base.org,
            branch_id: base.branch,
            shop_name: "Northline Studio & Supply",
            receipt_footer:
              "Thank you for your business. We look forward to seeing you again.",
            business_subtitle: "Retail & professional services",
            settings: {
              invoice_show_location_qr: true,
              receipt_terms: "QA TERMS MUST NOT BE SILENTLY REPURPOSED",
            },
          })
      ).error,
    );
    const definitions = [
      { key: "paid", count: 1, status: "paid", price: 4993 },
      { key: "unpaid", count: 10, status: "unpaid", price: 999 },
      {
        key: "partial",
        count: 10,
        status: "partial",
        price: 999,
        discounts: true,
      },
      { key: "void", count: 1, status: "void", price: 0 },
      { key: "change", count: 1, status: "paid", price: 4993, change: true },
      { key: "large", count: 1, status: "unpaid", price: 12345678.5 },
      { key: "midlarge", count: 1, status: "unpaid", price: 999999 },
      { key: "single999", count: 1, status: "paid", price: 999 },
      { key: "forty", count: 40, status: "paid", price: 999 },
      { key: "eighty", count: 80, status: "paid", price: 999 },
    ];
    for (const definition of definitions) {
      const id = randomUUID();
      const items = Array.from({ length: definition.count }, (_, index) => {
        const service = definition.count > 1 && index % 4 === 1;
        const discount = definition.discounts && index % 3 === 0 ? 25 : 0;
        const price = service ? 550 : definition.price;
        return {
          id: randomUUID(),
          organization_id: base.org,
          invoice_id: id,
          product_name: `QA85041-${definition.key}-${String(index + 1).padStart(3, "0")} ${service ? "Professional service with a detailed description and customer reference" : "Precision equipment and accessories"}`,
          product_type: service ? "service" : "product",
          quantity: 1,
          purchase_price: 773.21,
          unit_price: price,
          item_discount: discount,
          line_total: price - discount,
          service_provider: service ? "Example provider" : null,
          service_transaction_amount: service ? 500 : 0,
          service_commission: service ? 50 : 0,
          service_total_charged: service ? 550 : 0,
          service_reference_no: service
            ? "REFERENCE-ABCDEFGHIJKLMNOPQRSTUVWXYZ-012345678901234567890123456789"
            : null,
          service_note: service ? "Customer service detail" : null,
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
      const discount = definition.discounts ? 50 : 0;
      const total = subtotal - discount;
      const paid =
        definition.status === "paid"
          ? total
          : definition.status === "partial"
            ? 1000
            : 0;
      checked(
        (
          await base.admin
            .from("invoices")
            .insert({
              id,
              organization_id: base.org,
              branch_id: base.branch,
              customer_id:
                definition.key === "paid" || definition.key === "void"
                  ? null
                  : customer,
              invoice_no: `INV-85041-${definition.key.toUpperCase()}`,
              invoice_date: "2026-10-04T14:30:00Z",
              status: definition.status,
              subtotal,
              discount_total: discount,
              grand_total: total,
              amount_paid: paid,
              amount_tendered: paid + (definition.change ? 7 : 0),
              change_due: definition.change ? 7 : 0,
              balance_due: total - paid,
              note: "Please keep this invoice for your records.\nSynthetic customer-facing transaction note.",
            })
        ).error,
      );
      checked((await base.admin.from("invoice_items").insert(items)).error);
      if (paid > 0)
        checked(
          (
            await base.admin.from("payments").insert([
              {
                organization_id: base.org,
                branch_id: base.branch,
                invoice_id: id,
                method: "cash",
                amount: paid / 2,
              },
              {
                organization_id: base.org,
                branch_id: base.branch,
                invoice_id: id,
                method: "bank_transfer",
                amount: paid / 2,
                reference_no: "QA-BANK-REFERENCE",
              },
            ])
          ).error,
        );
      invoices[definition.key] = { id, count: definition.count, total };
    }
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of [
        "invoices",
        "invoice_items",
        "payments",
        "customers",
      ]) {
        const rows = await base.admin
          .from(table)
          .select("*")
          .eq("organization_id", base.org)
          .order("id");
        checked(rows.error);
        result[table] = rows.data;
      }
      return result;
    };
    const startingSnapshot = await snapshot();
    return {
      ...base,
      customer,
      invoices,
      snapshot,
      startingSnapshot,
      async branding(
        values: Record<string, unknown>,
        settings: Record<string, unknown> = {},
      ) {
        const organizationValues: Record<string, unknown> = {};
        for (const key of ["name", "primary_color", "email", "google_maps_url"])
          if (key in values) organizationValues[key] = values[key];
        if (Object.keys(organizationValues).length)
          checked(
            (
              await base.admin
                .from("organizations")
                .update(organizationValues)
                .eq("id", base.org)
            ).error,
          );
        checked(
          (
            await base.admin
              .from("branches")
              .update({
                address:
                  values.branch_address ??
                  "24 Market Street, Business District",
                phone:
                  "branch_phone" in values
                    ? values.branch_phone
                    : "03000000000",
              })
              .eq("id", base.branch)
          ).error,
        );
        checked(
          (
            await base.admin
              .from("app_settings")
              .update({
                shop_name: values.name ?? "Northline Studio & Supply",
                receipt_footer:
                  values.footer ??
                  "Thank you for your business. We look forward to seeing you again.",
                settings: { invoice_show_location_qr: true, ...settings },
              })
              .eq("organization_id", base.org)
              .eq("branch_id", base.branch)
          ).error,
        );
      },
    };
  } catch (error) {
    await base.cleanup();
    throw error;
  }
}
