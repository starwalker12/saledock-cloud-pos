## 2024-05-18 - Memoizing derived state to prevent re-calculations during navigation
**Learning:** In components with keyboard navigation (like command palettes or search modals), derived state (like grouped lists) that depends on the items list should be memoized. Otherwise, simply changing the `highlightIndex` on arrow key presses causes O(N) recalculations on every keystroke, which can feel laggy.
**Action:** Use `useMemo` for derived lists where a separate state (like an active/highlight index) changes frequently.
