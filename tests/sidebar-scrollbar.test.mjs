import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sidebar = readFileSync(new URL("../src/components/layout/sidebar-nav.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const nav = sidebar.slice(sidebar.indexOf("      <nav "), sidebar.indexOf("      </nav>"));

test("sidebar nav hides native chrome without disabling native vertical scrolling", () => {
  assert.match(nav, /sidebar-nav-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto/);
  assert.match(css, /\.sidebar-nav-scroll\s*\{\s*scrollbar-width: none;\s*\}/);
  assert.match(css, /\.sidebar-nav-scroll::-webkit-scrollbar\s*\{\s*display: none;\s*\}/);
  assert.equal((css.match(/scrollbar-width:/g) || []).length, 1);
  assert.equal((css.match(/::-webkit-scrollbar/g) || []).length, 1);
  assert.doesNotMatch(nav, /onWheel|overflow-y-hidden|overflow-hidden/);
});

test("collapsed links retain accessible names and native titles without off-axis nav tooltips", () => {
  assert.match(nav, /aria-label=\{displayCollapsed \? label : undefined\}/);
  assert.match(nav, /title=\{displayCollapsed \? label : undefined\}/);
  assert.match(nav, /focus-visible:ring-2/);
  assert.doesNotMatch(nav, /left-full|group-hover\/navitem:scale-100/);
  assert.match(sidebar.slice(0, sidebar.indexOf("      <nav ")), /left-full/);
  assert.match(sidebar.slice(sidebar.indexOf("      </nav>")), /group\/archivebtn/);
});

test("widths, height model, active auto-scroll and fixed Archived section remain", () => {
  assert.match(sidebar, /hidden h-dvh shrink-0 flex-col/);
  assert.match(sidebar, /displayCollapsed \? "w-24" : "w-72"/);
  assert.match(sidebar, /el\.scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(sidebar, /<\/nav>\s*<div ref=\{archivePanelRef\} className="relative shrink-0/);
  assert.match(sidebar, /const displayCollapsed = collapsed && !rearrangeMode/);
});

test("reorder and archive controls remain keyboard-accessible and preference-backed", () => {
  for (const action of ["moveVisibleItem(item.href, \"earlier\")", "moveVisibleItem(item.href, \"later\")", "beginDrag(event, item.href)", "handleArchiveAction(item, isConfirmingArchive)", "unarchiveItem(item.href)"]) {
    assert.ok(sidebar.includes(action), action);
  }
  assert.match(sidebar, /saveSidebarPreferences/);
  assert.match(sidebar, /data-sidebar-reorder-control="earlier"/);
  assert.match(sidebar, /data-sidebar-reorder-control="later"/);
});
