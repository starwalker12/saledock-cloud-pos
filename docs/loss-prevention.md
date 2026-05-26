# Loss Prevention / Below-Cost Sale Protection

This document outlines the detailed architecture, business rules, and technical mechanics of the **Loss Prevention / Below-Cost Sale Protection** system in Gadget Zone Online POS.

---

## 1. Core Objectives
- Prevent cashiers or staff from selling physical products below their cost by mistake.
- Ensure discounts (both item-level and bill-level) cannot bypass cost protections.
- Provide a secure, audited administrative override system for special cases.
- Maintain a clear audit trail for any modifications or completed below-cost sales.

---

## 2. Business Rules & Scope

### Physical Products
- **Guard Enforcement:** Direct checkout or saving is strictly blocked if the final price or effective revenue falls below the unit cost.
- **Save Guard:** Saving a product where `purchase_price >= sale_price` is blocked unless `allow_sell_at_loss` is enabled.
- **Checkout Guard:** Enforced securely inside the transaction layer (PL/pgSQL database `pos_checkout` RPC function).

### Service Transactions
- **Exclusion:** Services are strictly pass-through and excluded from loss-prevention calculations.
- **Pass-through Cost:** Service `purchase_price` and stock are always forced to `0`. Profit on services equals the commission amount. Services cannot absorb product discounts or be used to mask physical product losses.

### Administrative Override
- **Permissions:** Restricted strictly to **Owner** and **Admin** roles. Managers, cashiers, and technicians cannot enable, disable, or save products with overrides.
- **Required Reason:** Enabling an override requires a documented business reason (e.g. clearance, promotional bundle, damaged stock).
- **Auditing:** 
  - Every toggle of the override state is audit-logged with actor, timestamp, and product ID.
  - Every completed checkout of a below-cost sale under approved override is dynamically captured and audit logged.

---

## 3. Discount Allocation Engine
When a bill-level discount (`discount_total`) is applied, it must not bypass below-cost guards. The system dynamically allocates the bill-level discount proportionally across physical product lines based on their line revenue:

1. **Physical Product Revenue (`v_total_product_revenue`):**
   Sum of line-level revenue for all physical products in the cart:
   $$\text{Line Revenue} = \max((\text{unit\_price} \times \text{qty}) - \text{item\_discount}, 0)$$
2. **Bill Discount Share (`v_allocated_bill_discount`):**
   Proportional share calculated per physical line:
   $$\text{Allocated Share} = \text{round}\left( \left(\frac{\text{Line Revenue}}{\text{Total Physical Revenue}}\right) \times \text{discount\_total}, 2 \right)$$
3. **Effective Revenue:**
   $$\text{Effective Line Revenue} = \max(\text{Line Revenue} - \text{Allocated Share}, 0)$$
4. **Validation Guard:**
   Checks if the line's effective revenue is less than its exact FIFO lot cost:
   $$\text{Effective Line Revenue} < \text{Total Line FIFO Cost}$$
   If true and `allow_sell_at_loss` is `false`, the database aborts the transaction and rolls back all operations.

---

## 4. Audit Log Specifications
The Loss Prevention module fires four specialized audit trail events using the centralized `logAudit` logging interface:

1. **`product.loss_override_enabled`:** Enabled below-cost sale capability for a product. Includes the admin's override reason.
2. **`product.loss_override_disabled`:** Disabled below-cost sale capability for a product.
3. **`product.loss_override_reason_changed`:** Modified the approved reason for below-cost sales.
4. **`pos.loss_sale_completed`:** Fired automatically at the database level when a checkout is completed below cost under an approved override. Includes exact FIFO cost, effective revenue, loss amount, and the override reason.
