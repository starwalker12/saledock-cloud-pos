# Expense datetime preservation fix

Date: 2026-07-24

Branch: `fix/expense-datetime-preservation`

Base main SHA: `afaef696aa7df08cd1e18965e5770f7e00189bb9`

Finding: `LIVE-EXPENSE-DATETIME-001`

Severity: P1

Status: FIXED ON MAIN - VERIFIED LOCALLY AND IN PRODUCTION

Source PR: #310

Reviewed source head: `f7a9eadb132aa4c6736061c8003dcda4ca7e0748`

Squash merge / resulting main: `03eeda4a014852d294bc790b81c308d716802221`

## Production evidence inherited from the live audit

The authenticated production audit recorded one marked expense at 00:17 Asia/Karachi. A
notes-only edit displayed 05:17, an amount-only edit displayed 10:17, and the next edit
form preloaded 15:17. Every mutation committed once, produced the expected audit, and
created no duplicate. The expense was voided after evidence collection.

The live evidence bundle and its SHA-256 manifest were inspected read-only. This task did
not log in to production, alter the production expense, or make any production mutation.

## Local baseline reproduction

The baseline application was built and served with `TZ=UTC`. Chromium ran with
`timezoneId: Asia/Karachi` against loopback Supabase.

The ordinary UI reproduced the conversion:

| Operation        | Submitted `datetime-local` | Stored UTC                 |
| ---------------- | -------------------------- | -------------------------- |
| Create           | `2026-07-24T00:17`         | `2026-07-24T00:17:00.000Z` |
| Notes-only       | `2026-07-24T05:17`         | `2026-07-24T05:17:00.000Z` |
| Amount-only      | `2026-07-24T10:17`         | `2026-07-24T10:17:00.000Z` |
| Payment-only     | `2026-07-24T15:17`         | `2026-07-24T15:17:00.000Z` |
| Category/payment | `2026-07-24T20:17`         | `2026-07-24T20:17:00.000Z` |

An intentional `2026-07-24T05:30` edit was also interpreted as `05:30Z` by the baseline.
Each save made one POST and one database update. Cleanup removed the expense and matching
audits.

## Ambient-timezone differential

The baseline server parser interpreted a timezone-less `2026-07-24T00:17` differently:

- `TZ=UTC`: `2026-07-24T00:17:00.000Z`
- `TZ=America/Los_Angeles`: `2026-07-24T07:17:00.000Z`

The baseline client formatter also followed the browser timezone. The correct stored
instant `2026-07-23T19:17:00.000Z` rendered as `2026-07-24T00:17` in Karachi but as
`2026-07-23T15:17` in New York.

After the correction, both server timezones parse to
`2026-07-23T19:17:00.000Z`, and both browser timezones format that instant as
`2026-07-24T00:17`.

## Root cause

Classification: OUTCOME C - BOTH BOUNDARIES.

The client converted the UTC timestamp using the browser's `getTimezoneOffset()`, and the
server validation parsed the submitted timezone-less value with `new Date(value)`. That
made browser and server ambient timezones control an Asia/Karachi business timestamp.
Each unrelated save therefore converted the already-shifted wall time again.

The minute-precision input also could not preserve existing seconds or milliseconds
without reading the current row.

## Business-timezone contract

- `expenses.spent_at` remains a UTC `timestamptz` instant.
- An Expenses `datetime-local` value is an Asia/Karachi wall time.
- Only exact `YYYY-MM-DDTHH:mm` values are accepted.
- Karachi is converted with the explicit fixed `+05:00` offset.
- Display uses an `Intl.DateTimeFormat` pinned to `Asia/Karachi`.
- Browser and server ambient timezones do not affect the result.

## Source correction

- `src/lib/datetime.ts` now validates, parses, and formats the explicit Karachi
  `datetime-local` contract.
- `src/lib/validation/expenses.ts` no longer parses timezone-less input through ambient
  `new Date(value)`.
- `src/app/expenses/expense-form.tsx` no longer uses the browser timezone offset.
- `src/app/expenses/actions.ts` reads the existing expense by both ID and authenticated
  organization. When the submitted Karachi minute is unchanged, it preserves the exact
  stored instant, including seconds and milliseconds. An intentional change is converted
  exactly once.
- `src/app/expenses/page.tsx` formats list timestamps explicitly in Asia/Karachi.

No Dashboard formula, Reports formula, permission, RLS policy, database object, migration,
package, or workflow changed.

## Corrected action and browser evidence

The accepted production-mode local E2E used one disposable expense and a fresh browser
context for each action.

- Create `00:17` stored `2026-07-23T19:17:00.000Z`.
- Notes, amount, payment, category/payment, and vendor edits all preserved that exact
  instant.
- Intentional `05:30` stored `2026-07-24T00:30:00.000Z`.
- Reopen displayed `05:30`.
- Void and Restore preserved the intentional instant.
- Every authorized save made exactly one POST and one audit.
- Duplicate expenses and audits: 0.
- A forged foreign-organization expense ID was rejected with the generic safe error;
  the foreign row and timestamp were unchanged and no audit was created.
- The July 24 Expenses filter found the row.
- The Dashboard Expenses widget and the July 24 custom Reports range both rendered
  PKR 80.
- Card mutations changed no Cash Drawer signature.

The historical Expenses client-settlement issue remained observable. In the final review
run, amount-only, category/payment, and vendor-only updates committed correctly while the
submitting page did not settle within 30 seconds. The test retained this separately:
database timestamp, one POST, one audit, independent reopen, rendered date, and cleanup
all remained correct. No settlement source was changed in this PR.

## Validation

- Focused datetime/source contracts: 13/13 passed.
- Focused production-mode E2E: 1/1 passed with zero Playwright retries.
- Expenses touch/Void/Restore/permission E2E: 1/1 passed.
- Expenses mobile filter and responsive summary E2E: 1/1 passed.
- Complete Node suite: 222/222 passed after installing the disposable loopback role
  fixtures expected by the existing RPC tests.
- Lint, typecheck, build, diff, secret, and protected-worktree results are recorded in the
  draft PR.

Discarded harness and environment launches are not hidden:

- one baseline build initially rejected a read-only `node_modules` symlink outside the
  worktree;
- early local launches found the expected owner profile/Auth fixture absent;
- one fixed run exposed expected localhost Vercel Analytics 404s;
- one run exposed a private React-fiber hydration probe as unreliable;
- one report assertion matched two legitimate labels;
- the first complete Node-suite run had six fixture/contract failures before the stale
  hash and missing loopback fixtures were corrected;
- no automatic Playwright retry was used.

## Local cleanup and safety

- Marked expenses remaining: 0.
- Matching task audits remaining: 0.
- Foreign organization, branch, and expense rows remaining: 0.
- Disposable local Auth/profile fixtures remaining: 0.
- Cleanup retries: 0.
- Cleanup failures: 0.
- Fourteen unrelated table signatures matched before and after the focused E2E.
- No production request or mutation occurred.

## Preview verification

GitHub CI passed and Vercel reported the draft deployment Ready for the reviewed source
head. Computer Use confirmed that the public preview rendered the SaleDock landing page
and exposed the expected preview-host sign-in route. The preview was not authenticated
because its data environment was not proven isolated from production, so no preview
expense was created or mutated. This public inspection is availability and rendering
evidence only; the complete local production-mode E2E remains the business-workflow
evidence.

## Authenticated production verification

PR #310 was squash-merged at `2026-07-24T08:31:58Z`. GitHub main CI passed, and
Vercel production deployment `dpl_BzokG4NtV3B54E1V7g7bNn7BSdg9` reached Ready for the
exact merge SHA `03eeda4a014852d294bc790b81c308d716802221`.

Codex Chrome computer use exercised `https://saledock.site` through the authenticated
dedicated Owner test account:

- User: Fardan Aatir.
- Organization: Star Shop.
- Branch: Main Branch.
- Currency: PKR.
- Timezone: Asia/Karachi.
- Marker: `LIVE-EXP-DT-20260724-1652-6QBI`.

The supported Expenses UI created one non-cash Card expense at local
`2026-07-24T00:17`. The list and edit form displayed `00:17`, and read-only production
database verification found the exact expected UTC instant:
`2026-07-23T19:17:00.000Z`.

Each unrelated edit was submitted once through the visible form:

- Notes-only update: timestamp preserved byte-for-byte.
- Amount-only update from PKR 75 to PKR 80: timestamp preserved byte-for-byte.
- Payment-only update from Card to Bank transfer: timestamp preserved byte-for-byte.
- Category/payment update to Marketing and Card: timestamp preserved byte-for-byte.

After those four updates, the row remained unique, the list and edit form still displayed
`00:17`, and the stored instant remained `2026-07-23T19:17:00.000Z`. The July 24
Expenses filter found the row, the Dashboard showed one PKR 80 expense for the Karachi
day, and Reports included PKR 80 under Marketing and Card.

The intentional local edit to `2026-07-24T05:30` stored exactly
`2026-07-24T00:30:00.000Z`. The edit form and list displayed `05:30`; reopening and an
ordinary reload preserved it. The July 24 filter, Dashboard, and Reports continued to
place the expense in the correct Karachi date.

The notes-only update briefly remained on `Saving...` after the database and audit had
committed, but it completed truthfully before the 30-second failure boundary. It was not
resubmitted, no diagnostic reload was required, and no duplicate resulted. The historical
Expenses client-settlement risk remains open as P3; this production result does not claim
that risk is fixed.

The fixture was then voided once through the supported confirmation dialog. Final
production truth was:

- One archived expense row, retaining `2026-07-24T00:30:00.000Z` / `05:30` Karachi.
- One `expenses.created` audit.
- Five `expenses.updated` audits.
- One `expenses.voided` audit.
- Duplicate expenses and audits: 0.
- Active July 24 expense total returned to PKR 0.
- Reports returned to PKR 0 operating expenses for the period.
- Cash-shift and daily-closing rows were unchanged.
- Unrelated expense and audit fingerprints matched the opening baseline.
- No schema change or migration.

Sanitized screenshots and results are stored at
`/Users/sw12/Projects/saledock-local-evidence/expense-datetime-live-verification`.
The evidence manifest SHA-256 is
`ad79acf460bd173122428b855e862a8b5faf27c1363913a24dbb401143f56148`.
Database reads were used only to verify exact persisted truth; authenticated workflow
evidence came from the production UI and was not inferred from public HTTP checks.

Live decision: PASS - `LIVE-EXPENSE-DATETIME-001` is fixed on main and verified in
production. The Expense timestamp P1 count is now zero.

## Remaining risk and open findings

PR #310 fixes only `LIVE-EXPENSE-DATETIME-001`. Expenses and the product as a whole are
not declared fully accepted.

- `LIVE-REPORT-RETURN-PROFIT-001` remains open, P1.
- `LIVE-DASHBOARD-NET-CASH-001` remains open, P1.
- `LIVE-CUSTOMER-LEDGER-001` remains open, P2.
- `LIVE-CUSTOMER-AUDIT-001` remains open, P2.
- `LIVE-REPAIR-OPTIONAL-001` remains open, P2.
- `LIVE-INVOICE-FILTER-001` remains open, P2.
- Supplier-payment client settlement remains open, P2.
- Cashier production coverage remains limited, P2.
- Historical Expenses client settlement remains open, P3.

Canonical project synchronization remains blocked until both reporting P1 findings are
resolved and reverified.

## Production delivery result

The exact reviewed source head was delivered, production deployment and authenticated
timestamp behavior were verified, and the marked expense was safely archived. Neither
remaining reporting P1 was investigated or changed.

## Rollback

If this PR is later merged:

```text
git revert <merge_commit_sha> && git push origin main
```
