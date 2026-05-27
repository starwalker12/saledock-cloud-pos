"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

async function isDemoDataEnabled(): Promise<boolean> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "demo_data_enabled")
      .single();
    return data?.value !== false && data?.value !== "false";
  } catch {
    return true;
  }
}

export type DemoActionState = {
  success: boolean;
  error?: string;
  message?: string;
};

export async function loadDemoDataAction(
  prevState: DemoActionState | null,
  formData: FormData
): Promise<DemoActionState> {
  try {
    const demoDataEnabled = await isDemoDataEnabled();
    if (!demoDataEnabled) {
      return { success: false, error: "Demo data seeding has been disabled by the platform administrator." };
    }

    const confirmation = formData.get("confirmation")?.toString().trim();
    if (confirmation !== "CREATE DEMO DATA") {
      return { success: false, error: "Confirmation text must match exactly 'CREATE DEMO DATA'." };
    }

    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return { success: false, error: "Only Owners and Admins can create demo data." };
    }

    const orgId = profile.organization_id;
    const branchId = profile.branch_id;
    if (!orgId || !branchId) {
      return { success: false, error: "No organization/branch assigned." };
    }

    const supabase = await createClient();

    // 1. Insert product categories
    const categoriesData = [
      { organization_id: orgId, name: "[DEMO] Accessories", description: "[DEMO] Chargers, cables, hubs and screen protectors", is_active: true },
      { organization_id: orgId, name: "[DEMO] Devices", description: "[DEMO] Smartphones, tablets and smartwatches", is_active: true }
    ];
    const { data: categories, error: catErr } = await supabase
      .from("product_categories")
      .insert(categoriesData)
      .select();
    if (catErr) throw new Error("Categories creation failed: " + catErr.message);

    const accessCat = categories.find(c => c.name.includes("Accessories"));
    const deviceCat = categories.find(c => c.name.includes("Devices"));

    // 2. Insert suppliers
    const suppliersData = [
      { organization_id: orgId, name: "[DEMO] Alpha Distributors", company: "[DEMO] Alpha Tech", phone: "+923001112222", email: "alpha@example.com", address: "123 Tech Park, Lahore", notes: "[DEMO] Primary hardware distributor", is_active: true }
    ];
    const { data: suppliers, error: supErr } = await supabase
      .from("suppliers")
      .insert(suppliersData)
      .select();
    if (supErr) throw new Error("Suppliers creation failed: " + supErr.message);
    const alphaSup = suppliers[0];

    // 3. Insert products and services
    const productsData = [
      {
        organization_id: orgId,
        category_id: accessCat?.id ?? null,
        supplier_id: alphaSup?.id ?? null,
        name: "[DEMO] USB-C Hub 8-in-1",
        sku: "DEMO-USB-HUB-8",
        barcode: "DEMO1002003",
        type: "product",
        purchase_price: 25,
        sale_price: 45,
        stock_quantity: 49, // Started with 50, sold 2, then restocked 1 demo return
        minimum_stock: 5,
        is_active: true,
        notes: "[DEMO] 8-in-1 USB-C docking station"
      },
      {
        organization_id: orgId,
        category_id: deviceCat?.id ?? null,
        supplier_id: alphaSup?.id ?? null,
        name: "[DEMO] iPhone 14 Pro 256GB",
        sku: "DEMO-IPH14-256",
        barcode: "DEMO1002004",
        type: "product",
        purchase_price: 900,
        sale_price: 1100,
        stock_quantity: 9, // Started with 10, 1 sold in demo invoice
        minimum_stock: 2,
        is_active: true,
        notes: "[DEMO] Deep Purple Color iPhone"
      },
      {
        organization_id: orgId,
        category_id: accessCat?.id ?? null,
        name: "[DEMO] Screen Glass Replacement Service",
        sku: "DEMO-SRV-GLASS",
        barcode: "DEMO1002005",
        type: "service",
        purchase_price: 0,
        sale_price: 60,
        stock_quantity: 0,
        minimum_stock: 0,
        is_active: true,
        notes: "[DEMO] Professional OLED screen refurbishing service"
      }
    ];
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .insert(productsData)
      .select();
    if (prodErr) throw new Error("Products creation failed: " + prodErr.message);

    const hubProduct = products.find(p => p.sku === "DEMO-USB-HUB-8");
    const iphoneProduct = products.find(p => p.sku === "DEMO-IPH14-256");
    const glassService = products.find(p => p.sku === "DEMO-SRV-GLASS");

    // 4. Insert FIFO stock lots
    const lotsData = [
      {
        organization_id: orgId,
        branch_id: branchId,
        product_id: hubProduct?.id,
        supplier_id: alphaSup?.id,
        lot_number: "DEMO-LOT-001",
        purchase_date: new Date().toISOString().split("T")[0],
        quantity_received: 50,
        quantity_remaining: 49,
        unit_cost: 25,
        is_active: true,
        notes: "[DEMO] Opening stock batch"
      },
      {
        organization_id: orgId,
        branch_id: branchId,
        product_id: iphoneProduct?.id,
        supplier_id: alphaSup?.id,
        lot_number: "DEMO-LOT-002",
        purchase_date: new Date().toISOString().split("T")[0],
        quantity_received: 10,
        quantity_remaining: 9,
        unit_cost: 900,
        is_active: true,
        notes: "[DEMO] Opening stock batch"
      }
    ];
    const { data: lots, error: lotErr } = await supabase
      .from("product_stock_lots")
      .insert(lotsData)
      .select();
    if (lotErr) throw new Error("Stock lots creation failed: " + lotErr.message);

    const hubLot = lots.find(l => l.lot_number === "DEMO-LOT-001");
    const iphoneLot = lots.find(l => l.lot_number === "DEMO-LOT-002");

    // 5. Insert Stock Movements (opening_stock)
    const movementsData = [
      {
        organization_id: orgId,
        branch_id: branchId,
        product_id: hubProduct?.id,
        stock_lot_id: hubLot?.id,
        movement_type: "opening_stock",
        quantity: 50,
        unit_cost: 25,
        notes: "[DEMO] Initial opening stock lot"
      },
      {
        organization_id: orgId,
        branch_id: branchId,
        product_id: iphoneProduct?.id,
        stock_lot_id: iphoneLot?.id,
        movement_type: "opening_stock",
        quantity: 10,
        unit_cost: 900,
        notes: "[DEMO] Initial opening stock lot"
      }
    ];
    const { error: movErr } = await supabase
      .from("stock_movements")
      .insert(movementsData);
    if (movErr) throw new Error("Stock movements creation failed: " + movErr.message);

    // 6. Insert Customers
    const customersData = [
      { organization_id: orgId, name: "[DEMO] Alice Johnson", phone: "+923001234567", address: "123 Demo Street, Islamabad", outstanding_balance: 0 },
      { organization_id: orgId, name: "[DEMO] Bob Smith", phone: "+923129876543", address: "456 Test Boulevard, Karachi", outstanding_balance: 360 } // Leftover after partial paid sale
    ];
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .insert(customersData)
      .select();
    if (custErr) throw new Error("Customers creation failed: " + custErr.message);

    const aliceCust = customers.find(c => c.name.includes("Alice"));
    const bobCust = customers.find(c => c.name.includes("Bob"));

    // 7. Insert Invoices (Demo sales)
    // Invoice 1: Alice Johnson, USB-C Hub x2 (Fully paid)
    const invoice1Id = crypto.randomUUID();
    const { error: inv1Err } = await supabase
      .from("invoices")
      .insert({
        id: invoice1Id,
        organization_id: orgId,
        branch_id: branchId,
        customer_id: aliceCust?.id ?? null,
        invoice_no: "INV-DEMO-1001",
        status: "paid",
        subtotal: 90,
        discount_total: 0,
        grand_total: 90,
        amount_paid: 90,
        balance_due: 0,
        note: "[DEMO] Completed full cash sale",
        created_by: profile.id
      });
    if (inv1Err) throw new Error("Invoice 1 creation failed: " + inv1Err.message);

    // Invoice 1 Items
    const { data: inv1Items, error: items1Err } = await supabase
      .from("invoice_items")
      .insert({
        organization_id: orgId,
        invoice_id: invoice1Id,
        product_id: hubProduct?.id,
        product_name: "[DEMO] USB-C Hub 8-in-1",
        product_type: "product",
        quantity: 2,
        purchase_price: 25,
        unit_price: 45,
        item_discount: 0,
        line_total: 90
      })
      .select();
    if (items1Err) throw new Error("Invoice 1 items creation failed: " + items1Err.message);

    // Allocate stock lot usage for Invoice 1 item
    await supabase.from("invoice_item_stock_allocations").insert({
      organization_id: orgId,
      invoice_id: invoice1Id,
      invoice_item_id: inv1Items[0].id,
      product_id: hubProduct?.id,
      stock_lot_id: hubLot?.id,
      quantity: 2,
      unit_cost: 25
    });

    // Stock movement for sale of USB-C Hub
    await supabase.from("stock_movements").insert({
      organization_id: orgId,
      branch_id: branchId,
      product_id: hubProduct?.id,
      stock_lot_id: hubLot?.id,
      movement_type: "sale",
      quantity: 2,
      unit_cost: 25,
      invoice_id: invoice1Id,
      invoice_item_id: inv1Items[0].id,
      notes: "[DEMO] Customer sale USB-C Hub"
    });

    // Payment for Invoice 1
    await supabase.from("payments").insert({
      organization_id: orgId,
      branch_id: branchId,
      invoice_id: invoice1Id,
      customer_id: aliceCust?.id ?? null,
      method: "cash",
      amount: 90,
      reference_no: "DEMO-PAY-REF-001",
      received_by: profile.id
    });

    // Invoice 2: Bob Smith, iPhone 14 Pro x1 + Service Screen Replacement x1 (Partially paid)
    const invoice2Id = crypto.randomUUID();
    const { error: inv2Err } = await supabase
      .from("invoices")
      .insert({
        id: invoice2Id,
        organization_id: orgId,
        branch_id: branchId,
        customer_id: bobCust?.id ?? null,
        invoice_no: "INV-DEMO-1002",
        status: "partial",
        subtotal: 1160,
        discount_total: 0,
        grand_total: 1160,
        amount_paid: 800,
        balance_due: 360,
        note: "[DEMO] Partial card sale",
        created_by: profile.id
      });
    if (inv2Err) throw new Error("Invoice 2 creation failed: " + inv2Err.message);

    // Invoice 2 items
    const { data: inv2Items, error: items2Err } = await supabase
      .from("invoice_items")
      .insert([
        {
          organization_id: orgId,
          invoice_id: invoice2Id,
          product_id: iphoneProduct?.id,
          product_name: "[DEMO] iPhone 14 Pro 256GB",
          product_type: "product",
          quantity: 1,
          purchase_price: 900,
          unit_price: 1100,
          item_discount: 0,
          line_total: 1100
        },
        {
          organization_id: orgId,
          invoice_id: invoice2Id,
          product_id: glassService?.id,
          product_name: "[DEMO] Screen Glass Replacement Service",
          product_type: "service",
          quantity: 1,
          purchase_price: 0,
          unit_price: 60,
          item_discount: 0,
          line_total: 60
        }
      ])
      .select();
    if (items2Err) throw new Error("Invoice 2 items creation failed: " + items2Err.message);

    const iphoneItem = inv2Items.find(i => i.product_id === iphoneProduct?.id);

    // Allocate stock lot for iPhone 14 Pro sale
    await supabase.from("invoice_item_stock_allocations").insert({
      organization_id: orgId,
      invoice_id: invoice2Id,
      invoice_item_id: iphoneItem?.id,
      product_id: iphoneProduct?.id,
      stock_lot_id: iphoneLot?.id,
      quantity: 1,
      unit_cost: 900
    });

    // Stock movement for sale of iPhone 14
    await supabase.from("stock_movements").insert({
      organization_id: orgId,
      branch_id: branchId,
      product_id: iphoneProduct?.id,
      stock_lot_id: iphoneLot?.id,
      movement_type: "sale",
      quantity: 1,
      unit_cost: 900,
      invoice_id: invoice2Id,
      invoice_item_id: iphoneItem?.id,
      notes: "[DEMO] Customer sale iPhone 14 Pro"
    });

    // Payment for Invoice 2
    await supabase.from("payments").insert({
      organization_id: orgId,
      branch_id: branchId,
      invoice_id: invoice2Id,
      customer_id: bobCust?.id ?? null,
      method: "card",
      amount: 800,
      reference_no: "DEMO-PAY-REF-002",
      received_by: profile.id
    });

    // Customer ledger entry for Bob's debit
    await supabase.from("customer_ledger_entries").insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: bobCust?.id,
      invoice_id: invoice2Id,
      entry_type: "invoice_credit",
      direction: "debit",
      amount: 360,
      balance_after: 360,
      description: "[DEMO] Invoice INV-DEMO-1002 balance due",
      created_by: profile.id
    });

    // 8. Insert Return/Refund Demo
    // Let's record a refund for Alice returning 1 USB-C Hub
    const returnId = crypto.randomUUID();
    const { error: retErr } = await supabase
      .from("returns")
      .insert({
        id: returnId,
        organization_id: orgId,
        branch_id: branchId,
        invoice_id: invoice1Id,
        customer_id: aliceCust?.id ?? null,
        return_no: "RET-DEMO-1001",
        status: "completed",
        subtotal: 45,
        refund_amount: 45,
        refund_method: "cash",
        reference_number: "DEMO-REFUND-REF-001",
        notes: "[DEMO] Faulty adapter casing; restocked to original FIFO lot",
        created_by: profile.id,
        created_at: new Date().toISOString()
      });
    if (retErr) throw new Error("Return creation failed: " + retErr.message);

    // Return items
    const { data: returnItem, error: retItemErr } = await supabase
      .from("return_items")
      .insert({
        organization_id: orgId,
        return_id: returnId,
        invoice_id: invoice1Id,
        invoice_item_id: inv1Items[0].id,
        product_id: hubProduct?.id,
        item_name: "[DEMO] USB-C Hub 8-in-1",
        item_type: "product",
        quantity: 1,
        unit_price: 45,
        line_total: 45,
        restock: true
      })
      .select("id")
      .single();
    if (retItemErr) throw new Error("Return items creation failed: " + retItemErr.message);

    const { error: retStockAllocErr } = await supabase
      .from("return_stock_allocations")
      .insert({
        organization_id: orgId,
        return_id: returnId,
        return_item_id: returnItem.id,
        product_id: hubProduct?.id,
        stock_lot_id: hubLot?.id,
        quantity: 1,
        unit_cost: 25
      });
    if (retStockAllocErr) throw new Error("Return stock allocation creation failed: " + retStockAllocErr.message);

    await supabase.from("stock_movements").insert({
      organization_id: orgId,
      branch_id: branchId,
      product_id: hubProduct?.id,
      stock_lot_id: hubLot?.id,
      movement_type: "return_in",
      quantity: 1,
      unit_cost: 25,
      reference_type: "return",
      reference_id: returnId,
      invoice_id: invoice1Id,
      invoice_item_id: inv1Items[0].id,
      notes: "[DEMO] Return RET-DEMO-1001 restocked USB-C Hub",
      created_by: profile.id
    });

    // 9. Insert Expenses
    const expensesData = [
      {
        organization_id: orgId,
        branch_id: branchId,
        category: "[DEMO] Utilities",
        amount: 85,
        payment_method: "cash",
        vendor_name: "Demo Power Grid",
        notes: "[DEMO] Monthly mock branch electricity bill",
        status: "active",
        spent_at: new Date().toISOString(),
        created_by: profile.id
      }
    ];
    const { error: expErr } = await supabase
      .from("expenses")
      .insert(expensesData);
    if (expErr) throw new Error("Expenses creation failed: " + expErr.message);

    // 10. Insert Repairs
    const repairsData = [
      {
        organization_id: orgId,
        branch_id: branchId,
        customer_id: aliceCust?.id ?? null,
        job_no: "JOB-DEMO-001",
        customer_name: "[DEMO] Alice Johnson",
        customer_phone: "+923001234567",
        device_type: "Phone",
        device_model: "Samsung Galaxy S22",
        serial_imei: "IMEI99008811",
        problem_description: "Charging port loose and screen flickering",
        diagnosis: "Charging port socket broken, replace flex cable",
        estimated_cost: 75,
        advance_paid: 15,
        final_cost: 0,
        status: "received",
        accessories_received: "[DEMO] Charger Adapter, Silicone Cover Case",
        payment_method: "cash",
        created_by: profile.id,
        notes: "[DEMO] Fast track request"
      }
    ];
    const { data: repairs, error: repErr } = await supabase
      .from("repairs")
      .insert(repairsData)
      .select();
    if (repErr) throw new Error("Repairs creation failed: " + repErr.message);

    // Repair status history
    await supabase
      .from("repair_status_history")
      .insert({
        organization_id: orgId,
        repair_id: repairs[0].id,
        old_status: null,
        new_status: "received",
        note: "[DEMO] Initial checkin logged by owner",
        changed_by: profile.id
      });

    // 11. Insert Daily Closings (Mock for yesterday)
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

    const closingsData = [
      {
        organization_id: orgId,
        branch_id: branchId,
        closing_date: yesterdayStr,
        bills_count: 5,
        cash_sales: 320,
        digital_payments: 150,
        credit_pending: 80,
        expenses_total: 45,
        refunds_total: 0,
        expected_closing_cash: 375, // 100 opening + 320 cash sales - 45 expenses
        actual_closing_cash: 375,
        cash_difference: 0,
        notes: "[DEMO] Flawless end-of-day reconciliation closing",
        finalized_by: profile.id
      }
    ];
    const { error: closeErr } = await supabase
      .from("daily_closings")
      .insert(closingsData);
    // Ignore duplicate closes if seeded again
    if (closeErr && !closeErr.message.includes("unique")) {
      throw new Error("Daily closing creation failed: " + closeErr.message);
    }

    // Audit log
    await logAudit({
      module: "settings",
      action: "LOAD_DEMO_DATA",
      details: "[DEMO] Owner loaded complete sets of demonstration POS records and catalog products"
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/pos");
    revalidatePath("/customers");
    revalidatePath("/invoices");
    revalidatePath("/expenses");
    revalidatePath("/repairs");

    return { success: true, message: "Demo data loaded successfully." };
  } catch (error) {
    const err = error as Error;
    console.error("Failed to seed demo data:", err);
    return { success: false, error: err.message || "An unexpected error occurred during demo data creation." };
  }
}

export async function removeDemoDataAction(
  prevState: DemoActionState | null,
  formData: FormData
): Promise<DemoActionState> {
  try {
    const demoDataEnabled = await isDemoDataEnabled();
    if (!demoDataEnabled) {
      return { success: false, error: "Demo data operations have been disabled by the platform administrator." };
    }

    const confirmation = formData.get("confirmation")?.toString().trim();
    if (confirmation !== "REMOVE DEMO DATA") {
      return { success: false, error: "Confirmation text must match exactly 'REMOVE DEMO DATA'." };
    }

    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return { success: false, error: "Only Owners and Admins can remove demo data." };
    }

    const orgId = profile.organization_id;
    if (!orgId) {
      return { success: false, error: "No organization assigned." };
    }

    const supabase = await createClient();

    // 1. Delete Daily Closings
    await supabase.from("daily_closings").delete().eq("organization_id", orgId).like("notes", "[DEMO]%");

    // 2. Delete Repairs (cascade deletes history)
    await supabase.from("repairs").delete().eq("organization_id", orgId).like("customer_name", "[DEMO]%");

    // 3. Delete Expenses
    await supabase.from("expenses").delete().eq("organization_id", orgId).like("category", "[DEMO]%");

    // 4. Delete demo returns. Linked return_items and return_stock_allocations cascade from returns.
    await supabase.from("returns").delete().eq("organization_id", orgId).like("return_no", "RET-DEMO-%");

    // 5. Delete Customer ledger entries, Payments, Invoice items and Invoices
    // Delete payments
    await supabase.from("payments").delete().eq("organization_id", orgId).like("reference_no", "DEMO-%");
    // Delete ledger entries
    await supabase.from("customer_ledger_entries").delete().eq("organization_id", orgId).like("description", "[DEMO]%");
    // Delete invoices (cascades or deletes invoice_items)
    await supabase.from("invoices").delete().eq("organization_id", orgId).like("invoice_no", "INV-DEMO-%");

    // 6. Delete stock movements
    await supabase.from("stock_movements").delete().eq("organization_id", orgId).like("notes", "[DEMO]%");

    // 7. Delete stock lots
    await supabase.from("product_stock_lots").delete().eq("organization_id", orgId).like("lot_number", "DEMO-LOT-%");

    // 8. Delete products
    await supabase.from("products").delete().eq("organization_id", orgId).like("name", "[DEMO]%");

    // 9. Delete categories
    await supabase.from("product_categories").delete().eq("organization_id", orgId).like("name", "[DEMO]%");

    // 10. Delete suppliers
    await supabase.from("suppliers").delete().eq("organization_id", orgId).like("name", "[DEMO]%");

    // 11. Delete Customers
    await supabase.from("customers").delete().eq("organization_id", orgId).like("name", "[DEMO]%");

    // Audit log
    await logAudit({
      module: "settings",
      action: "REMOVE_DEMO_DATA",
      details: "[DEMO] Owner cleaned up and removed all demonstration POS records and products safely"
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/pos");
    revalidatePath("/customers");
    revalidatePath("/invoices");
    revalidatePath("/expenses");
    revalidatePath("/repairs");

    return { success: true, message: "Demo data removed successfully." };
  } catch (error) {
    const err = error as Error;
    console.error("Failed to remove demo data:", err);
    return { success: false, error: err.message || "An unexpected error occurred during demo data removal." };
  }
}
