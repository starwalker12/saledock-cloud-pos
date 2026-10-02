# Product Restock and stock handoff

Task: 48326. Local-only implementation on main
`039759db3ec465eafa373d938afac1f588422e13`.

## Root cause and correction

The Restock schema trimmed optional text but still validated blank strings with
`min(1)`. Lot number and notes therefore produced raw Zod wording for valid empty
inputs. Only supplier and purchase date were separately normalized in the action.

The schema now normalizes missing, null, empty and whitespace-only optionals.
Required quantity remains a positive integer; cost remains a valid nonnegative
number. Malformed suppliers and impossible calendar dates are rejected with
user-facing messages. Zero purchase cost remains valid.

There was a second boundary issue: the existing lot table requires a non-null
purchase date and `add_stock_lot` inserts its supplied date directly. The isolated
browser reproduction reached that constraint after the text fix. A cleared date
now defaults to today's Asia/Karachi calendar date, matching the form's existing
default. Lot number, supplier and notes are passed as null when absent. A supplied
valid date is preserved. No migration or database function change is needed.

## Handoff architecture

- The Product action returns the exact successful product ID, name and type. No
  client lookup by product name or guessed ID is used.
- ProductsTab owns the Product-to-Inventory handoff. It removes the Product modal
  before mounting the existing Inventory implementation for that ID.
- A clean existing physical product has a local Manage stock action. Any edited
  metadata requires Save & manage stock and confirmed success before handoff.
- New physical products offer both Save product and Save & manage stock. Opening
  stock still uses the existing atomic product/first-lot/movement RPC.
- Current stock remains read-only. Services have neither stock controls nor a
  stock-management handoff.
- InventorySection retains the product-row trigger and its lots default;
  InventoryModal also accepts lots, movements, restock or adjust as its initial
  tab. Product handoffs choose restock.
- Inventory uses the existing body-portaled FormModal. Its focus trap, Escape,
  mobile sheet and scroll locking are reused without shared-component changes.
- Product success is consumed once. Pending submissions disable save/dismissal;
  Inventory's actual action pending states also disable repeated submission and
  dismissal. No opening/handoff operation performs a stock mutation.

## Accepted local validation

All browser runs used the production Next.js server and zero retries against a
new disposable loopback Supabase stack. No original database rows were copied.

| Gate | Result |
| --- | --- |
| Final focused Product/Inventory/FIFO Node tests | 42 passed, no failures/skips |
| Complete serial Node suite | 489 passed, 1 opt-in skip, no failures |
| Separate opt-in POS SQL/RPC matrix | 6 passed, no skips |
| Product stock handoff browser suite | 6 passed |
| Existing opening-stock/FIFO browser suite | 1 passed |
| Existing POS permission/held-bill browser suite | 2 passed |
| Lint | No errors; two existing Privacy Center hook warnings |
| Typecheck | Passed |
| Production build | Passed |
| Diff whitespace check | Passed |

The new browser suite verifies physical create with zero/opening stock, exact-ID
handoff, blank and filled Restock optionals, FIFO OUT adjustment, clean/dirty edit,
failed-save non-handoff, normal Save product, service exclusion, one dialog,
portal/scroll restoration and no horizontal overflow at 1440px and 390px.
Held responses prove there is no premature handoff while Product save is pending,
and no duplicate Restock request or premature dismissal while Restock is pending.

For each blank Restock: stock increases by 5, one lot and one movement are added.
The subsequent explicit Restock adds 2 with trimmed lot/notes. An OUT adjustment
consumes 1 from the older lot, leaving total stock 6. Opening stock 10 creates
exactly one lot and one opening_stock movement; opening Inventory and saving
metadata add no stock, lot or movement.

Existing regression assertions retain opening-stock rollback/atomicity, forged
stock-update rejection, product/service conversion guard, loss protection,
cash/change/replay, customer credit, FIFO allocation, explicit/fallback service
totals and held-bill behavior. Complete Node coverage also retains supplier
purchase stock and return reconciliation contracts; those runtime paths did not
change.

## Harness notes and safety

Discarded setup runs are retained but not counted as accepted gates. They include
an out-of-root node_modules symlink rejected by Turbopack, overlapping fixture
signature tests, and local auth/preference initialization noise. Dependencies
were cloned only into this worktree; accepted signature tests ran serially. The
existing opening-stock browser assertion was not weakened: its login waits for
initial reads before navigating, and disposable default UI preferences were
seeded. The existing POS SQL matrix temporarily installs its expected old body
only in the disposable database, then restores the exact current-main function;
the before/after definition digest matches.

No importer file, migration, POS/financial/ledger writer, permission or shared
FormModal changed. PR #368 remains untouched. Existing worktrees and the original
local database are checked independently by status/file hashes and 45 protected
relation signatures. Task-created fixtures are removed and the disposable stack
is stopped after validation. Production access and mutations are zero.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/product-stock-form-handoff-fix`.
Accepted results, screenshots, preservation checks, privacy scan and the final
report are sealed by that directory's `SHA256SUMS`; its digest is reported with
the draft PR. This QA document does not authorize merge or deployment.
