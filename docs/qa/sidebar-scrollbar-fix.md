# Sidebar Scrollbar Chrome

Task 23961. Local UI-only change based on main
`53fd2b4c629f49f7a5a4192036c32a14ba40ad0b`.

## Verified Cause

Unchanged main was built and served in production mode against a new disposable
local Supabase stack, using a synthetic Owner with the full 16-item navigation.
Before editing, both `/dashboard` and `/products` reproduced these nav dimensions
at 1366x768:

| Mode | clientWidth / scrollWidth | clientHeight / scrollHeight | attempted scrollLeft |
| --- | --- | --- | --- |
| Expanded | 287 / 287 | 562 / 860 | 0 |
| Collapsed | 95 / 210 | 570 / 860 | 115 |

The nav's vertical overflow was intentional. Native chrome remained enabled:
`scrollbar-width: auto`, WebKit scrollbar `display: inline`, and no custom gutter.
Collapsed off-axis tooltip boxes enlarged the scrollable width despite opacity
zero; all 16 were inside the nav. The browser accepted a 115px sideways scroll.

## Narrow Fix

- Only the nav receives `sidebar-nav-scroll`: `scrollbar-width: none` plus its
  scoped `::-webkit-scrollbar { display: none; }` rule.
- The nav retains `overflow-y-auto` and gains `overflow-x-hidden`.
- Remove only the custom collapsed **nav-list** tooltip boxes. Collapsed links
  instead receive their translated label as `title`, retaining `aria-label` and
  focus-visible rings. Expanded links receive no duplicate title.
- Tooltips outside the nav, preferences, reorder/archive handlers, protected
  destinations, active `scrollIntoView({ block: "nearest" })`, `w-72`/`w-24`,
  `h-dvh`, and the fixed bottom Archived area are unchanged.

## Browser Acceptance

Production-mode local Chromium, Playwright retries **0**:

| Viewport | Expanded nav W / H / content H | Collapsed nav W / H / content H |
| --- | --- | --- |
| 1440x900 | 287 / 694 / 860 | 95 / 702 / 860 |
| 1366x768 | 287 / 562 / 860 | 95 / 570 / 860 |
| 1280x720 | 287 / 514 / 860 | 95 / 522 / 860 |
| 1440x1080 | 287 / 874 / 874 | 95 / 882 / 882 |

All eight cases require scrollWidth == clientWidth, scrollLeft 0, matching
document widths, hidden native scrollbar computed styles, exact sidebar widths,
full viewport height, and the Archived button outside/below the nav. Programmatic
scrollLeft, horizontal wheel, and Shift+wheel cannot move the nav sideways.
Collapsed icon and Archived centering and native title/accessible names pass.

Both modes prove real wheel down/up, Tab reaching off-screen lower links with
focus-visible styling, and active lower-route auto-scroll. Rearrange proves
earlier/later arrows, actual pointer drag, Done, stored-collapsed temporary
expansion, archive confirmation/count, and unarchive. Archived is tested in
expanded and collapsed popovers. Preferences are allowed to persist before route
changes; final measurements wait for the existing width transition to finish.

The focused suite has 14 cases. Existing sidebar reorder and cookie-consent
suites have five more cases; assertions are not weakened. Complete Node suite:
683 tests, 658 passed, 25 existing opt-in accounting/database tests skipped,
zero failures. Focused Node/loading/consent: 22 passed. Lint has zero errors and
two pre-existing `privacy-center.tsx` hook warnings. Typecheck, production build,
and `git diff --check` pass.

## Visual Evidence And Limits

Before/after short and tall viewport screenshots were captured locally and
inspected for bars, white gutter, active highlight, aligned icons and unclipped
Archived control. The macOS headless browser does not continuously paint idle
overlay scrollbars even on baseline. Therefore baseline screenshots alone do
not prove the Owner's exact thick-scrollbar pixels. Actual baseline scroll
ranges and enabled native CSS, plus fixed computed/source contracts **and**
after screenshots, establish the treatment. No Firefox/WebKit engine run or
production verification is claimed. No global document scrollbar is hidden.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/sidebar-scrollbar-fix`.
Its independent manifest is sealed after final delivery metadata and cleanup.
PR #376, prior worktrees/evidence, accounting/database code and migrations are
untouched. This PR remains draft; no merge, deployment or production access.
