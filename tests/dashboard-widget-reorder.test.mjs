import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/app/dashboard/widgets/widget-layout.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const layoutModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  layoutModule,
  layoutModule.exports,
);

const {
  canMoveWidgetEarlier,
  canMoveWidgetLater,
  getReorderColumnCount,
  getWidgetsInVisualOrder,
  moveWidgetInVisualOrder,
} = layoutModule.exports;

function fixtureWidgets() {
  return [
    {
      id: "widget-a",
      type: "today-profit",
      size: "S",
      color: "success",
      fillStyle: "solid",
      textColor: "white",
      chartType: "bar",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    },
    {
      id: "widget-b",
      type: "gross-sales",
      size: "M",
      color: "info",
      fillStyle: "gradient",
      textColor: "black",
      chartType: "line",
      x: 1,
      y: 0,
      w: 2,
      h: 1,
    },
    {
      id: "widget-c",
      type: "returns",
      size: "L",
      color: "danger",
      fillStyle: "inherit",
      textColor: "auto",
      chartType: "bar",
      x: 0,
      y: 1,
      w: 4,
      h: 2,
    },
  ];
}

function ids(widgets) {
  return widgets.map((widget) => widget.id);
}

function assertNoOverlap(widgets, cols = 4) {
  const occupied = new Set();
  for (const widget of widgets) {
    assert.ok(widget.x >= 0, `${widget.id} x is non-negative`);
    assert.ok(widget.y >= 0, `${widget.id} y is non-negative`);
    assert.ok(widget.x + widget.w <= cols, `${widget.id} fits within columns`);

    for (let x = widget.x; x < widget.x + widget.w; x++) {
      for (let y = widget.y; y < widget.y + widget.h; y++) {
        const key = `${x}:${y}`;
        assert.equal(occupied.has(key), false, `${widget.id} overlaps at ${key}`);
        occupied.add(key);
      }
    }
  }
}

function assertPresentationPropertiesPreserved(before, after) {
  for (const widget of before) {
    const moved = after.find((item) => item.id === widget.id);
    assert.ok(moved, `${widget.id} still exists`);
    assert.equal(moved.type, widget.type);
    assert.equal(moved.size, widget.size);
    assert.equal(moved.color, widget.color);
    assert.equal(moved.fillStyle, widget.fillStyle);
    assert.equal(moved.textColor, widget.textColor);
    assert.equal(moved.chartType, widget.chartType);
    assert.equal(moved.w, widget.w);
    assert.equal(moved.h, widget.h);
  }
}

function maxRight(widgets) {
  return Math.max(...widgets.map((widget) => widget.x + widget.w));
}

test("visual order uses y then x", () => {
  const widgets = [
    { ...fixtureWidgets()[0], id: "bottom", x: 0, y: 3 },
    { ...fixtureWidgets()[1], id: "right", x: 2, y: 0 },
    { ...fixtureWidgets()[2], id: "left", x: 0, y: 0 },
  ];

  assert.deepEqual(ids(getWidgetsInVisualOrder(widgets)), ["left", "right", "bottom"]);
});

test("moves middle widget earlier by one visual position", () => {
  const widgets = fixtureWidgets();
  const before = structuredClone(widgets);
  const moved = moveWidgetInVisualOrder(widgets, "widget-b", "earlier");

  assert.deepEqual(ids(moved), ["widget-b", "widget-a", "widget-c"]);
  assert.deepEqual(widgets, before, "input widgets are not mutated");
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved);
});

test("moves middle widget later by one visual position", () => {
  const widgets = fixtureWidgets();
  const moved = moveWidgetInVisualOrder(widgets, "widget-b", "later");

  assert.deepEqual(ids(moved), ["widget-a", "widget-c", "widget-b"]);
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved);
});

test("first widget cannot move earlier and last widget cannot move later", () => {
  const widgets = fixtureWidgets();

  assert.equal(canMoveWidgetEarlier(widgets, "widget-a"), false);
  assert.equal(canMoveWidgetLater(widgets, "widget-c"), false);
  assert.equal(moveWidgetInVisualOrder(widgets, "widget-a", "earlier"), widgets);
  assert.equal(moveWidgetInVisualOrder(widgets, "widget-c", "later"), widgets);
});

test("one widget remains unchanged", () => {
  const widgets = fixtureWidgets().slice(0, 1);

  assert.equal(canMoveWidgetEarlier(widgets, "widget-a"), false);
  assert.equal(canMoveWidgetLater(widgets, "widget-a"), false);
  assert.equal(moveWidgetInVisualOrder(widgets, "widget-a", "earlier"), widgets);
  assert.equal(moveWidgetInVisualOrder(widgets, "widget-a", "later"), widgets);
});

test("valid move does not create duplicate widget ids", () => {
  const moved = moveWidgetInVisualOrder(fixtureWidgets(), "widget-b", "earlier");
  const uniqueIds = new Set(ids(moved));

  assert.equal(uniqueIds.size, moved.length);
});

test("reorder preserves custom width even when size label has a smaller default", () => {
  const widgets = fixtureWidgets().map((widget) =>
    widget.id === "widget-b" ? { ...widget, size: "M", w: 3, h: 1 } : widget,
  );
  const before = structuredClone(widgets);
  const moved = moveWidgetInVisualOrder(widgets, "widget-b", "earlier", 4);
  const custom = moved.find((widget) => widget.id === "widget-b");

  assert.equal(custom?.w, 3);
  assert.equal(custom?.h, 1);
  assert.deepEqual(widgets, before, "input widgets are not mutated");
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved, 4);
});

test("reorder preserves custom height", () => {
  const widgets = fixtureWidgets().map((widget) =>
    widget.id === "widget-b" ? { ...widget, size: "M", w: 2, h: 3 } : widget,
  );
  const moved = moveWidgetInVisualOrder(widgets, "widget-b", "later", 4);
  const custom = moved.find((widget) => widget.id === "widget-b");

  assert.equal(custom?.w, 2);
  assert.equal(custom?.h, 3);
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved, 4);
});

test("four-column reorder keeps widgets within four columns without overlap", () => {
  const moved = moveWidgetInVisualOrder(fixtureWidgets(), "widget-b", "earlier", 4);

  assert.ok(maxRight(moved) <= 4);
  assertNoOverlap(moved, 4);
});

test("eight-column reorder does not collapse to four columns", () => {
  const widgets = [
    { ...fixtureWidgets()[0], id: "widget-a", size: "M", x: 0, y: 0, w: 2, h: 1 },
    { ...fixtureWidgets()[1], id: "widget-b", size: "M", x: 2, y: 0, w: 3, h: 1 },
    { ...fixtureWidgets()[2], id: "widget-c", size: "M", x: 5, y: 0, w: 3, h: 2 },
  ];
  const moved = moveWidgetInVisualOrder(widgets, "widget-b", "later", 8);
  const custom = moved.find((widget) => widget.id === "widget-b");

  assert.equal(maxRight(moved), 8);
  assert.equal(custom?.w, 3);
  assert.equal(custom?.h, 1);
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved, 8);
});

test("twelve-column reorder does not collapse to four or eight columns", () => {
  const widgets = [
    { ...fixtureWidgets()[0], id: "widget-a", size: "L", x: 0, y: 0, w: 4, h: 1 },
    { ...fixtureWidgets()[1], id: "widget-b", size: "L", x: 4, y: 0, w: 4, h: 2 },
    { ...fixtureWidgets()[2], id: "widget-c", size: "L", x: 8, y: 0, w: 4, h: 1 },
  ];
  const moved = moveWidgetInVisualOrder(widgets, "widget-c", "earlier", 12);

  assert.equal(maxRight(moved), 12);
  assertPresentationPropertiesPreserved(widgets, moved);
  assertNoOverlap(moved, 12);
});

test("reorder column count preserves existing wide and ultra layouts", () => {
  const fourColumn = fixtureWidgets();
  const eightColumn = [
    { ...fixtureWidgets()[0], x: 0, y: 0, w: 2 },
    { ...fixtureWidgets()[1], x: 2, y: 0, w: 3 },
    { ...fixtureWidgets()[2], x: 5, y: 0, w: 3 },
  ];
  const twelveColumn = [
    { ...fixtureWidgets()[0], x: 0, y: 0, w: 4 },
    { ...fixtureWidgets()[1], x: 4, y: 0, w: 4 },
    { ...fixtureWidgets()[2], x: 8, y: 0, w: 4 },
  ];

  assert.equal(getReorderColumnCount(fourColumn, "xs"), 4);
  assert.equal(getReorderColumnCount(eightColumn, "xs"), 8);
  assert.equal(getReorderColumnCount(twelveColumn, "xs"), 12);
  assert.equal(getReorderColumnCount(fourColumn, "wide"), 8);
  assert.equal(getReorderColumnCount(fourColumn, "ultra"), 12);
});
