import type {
  ChartType,
  WidgetColor,
  WidgetFillStyle,
  WidgetSize,
  WidgetTextColor,
} from "./widget-registry";

export const GRID_COLS = { ultra: 12, wide: 8, lg: 4, md: 4, sm: 2, xs: 2, xxs: 2 } as const;
export const GRID_BREAKPOINTS = { ultra: 2600, wide: 1800, lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
export type GridBreakpoint = keyof typeof GRID_COLS;

const MOBILE_BREAKPOINTS = new Set<GridBreakpoint>(["sm", "xs", "xxs"]);

export type WidgetInstance = {
  id: string;
  type: string;
  size: WidgetSize;
  color: WidgetColor;
  fillStyle?: WidgetFillStyle;
  textColor?: WidgetTextColor;
  chartType?: ChartType;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function getWidgetDimsFromSize(size: WidgetSize): { w: number; h: number } {
  switch (size) {
    case "S":
      return { w: 1, h: 1 };
    case "M":
      return { w: 2, h: 1 };
    case "L":
      return { w: 4, h: 2 };
    case "XL":
      return { w: 4, h: 3 };
  }
}

export function getWidgetSizeFromDims(w: number, h: number): WidgetSize {
  if (h >= 4) {
    return "XL";
  }
  if (w >= 4) {
    return h >= 3 ? "XL" : "L";
  }
  if (h >= 3) {
    return "L";
  }
  if (w >= 2) {
    return h >= 2 ? "L" : "M";
  }
  if (h >= 2) {
    return "M";
  }
  return "S";
}

export function isMobileBreakpoint(breakpoint: GridBreakpoint) {
  return MOBILE_BREAKPOINTS.has(breakpoint);
}

function getMobileWidgetDims(size: WidgetSize): { w: number; h: number } {
  switch (size) {
    case "S":
      return { w: 1, h: 1 };
    case "M":
      return { w: 2, h: 2 };
    case "L":
      return { w: 2, h: 3 };
    case "XL":
      return { w: 2, h: 4 };
  }
}

function getLayoutDims(widget: WidgetInstance, cols: number, breakpoint: GridBreakpoint) {
  const size = getWidgetSizeFromDims(widget.w, widget.h);
  if (isMobileBreakpoint(breakpoint)) {
    const mobileDims = getMobileWidgetDims(size);
    return {
      w: Math.min(Math.max(mobileDims.w, 1), cols),
      h: mobileDims.h,
    };
  }

  return {
    w: Math.min(Math.max(widget.w, 1), cols),
    h: Math.max(widget.h, 1),
  };
}

export function getWidgetsInVisualOrder(widgets: WidgetInstance[]) {
  return [...widgets].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

export function packWidgetsForColumns(widgets: WidgetInstance[], cols: number, breakpoint: GridBreakpoint) {
  const sorted = getWidgetsInVisualOrder(widgets);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 1;

  return sorted.map((widget) => {
    const { w, h } = getLayoutDims(widget, cols, breakpoint);

    if (cursorX > 0 && cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 1;
    }

    const item = {
      i: widget.id,
      x: cursorX,
      y: cursorY,
      w,
      h,
      minW: 1,
      minH: 1,
      maxW: cols,
      maxH: 4,
    };

    cursorX += w;
    rowHeight = Math.max(rowHeight, h);

    return item;
  });
}

export function makeLayoutForBreakpoint(widgets: WidgetInstance[], breakpoint: GridBreakpoint) {
  const cols = GRID_COLS[breakpoint];
  const needsRepack =
    isMobileBreakpoint(breakpoint) ||
    cols < 4 ||
    (cols > 4 && widgets.every((widget) => widget.x + widget.w <= 4));

  if (needsRepack) {
    return packWidgetsForColumns(widgets, cols, breakpoint);
  }

  return widgets.map((widget) => {
    const w = Math.min(Math.max(widget.w, 1), cols);

    return {
      i: widget.id,
      x: Math.min(Math.max(widget.x, 0), Math.max(cols - w, 0)),
      y: Math.max(widget.y, 0),
      w,
      h: Math.max(widget.h, 1),
      minW: 1,
      minH: 1,
      maxW: cols,
      maxH: 4,
    };
  });
}

export function packWidgetStateForColumns(widgets: WidgetInstance[], cols: number) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 1;

  return widgets.map((widget) => {
    const dims = getWidgetDimsFromSize(widget.size);
    const w = Math.min(Math.max(dims.w, 1), cols);
    const h = Math.max(dims.h, 1);

    if (cursorX > 0 && cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 1;
    }

    const updated = {
      ...widget,
      x: cursorX,
      y: cursorY,
      w,
      h,
    };

    cursorX += w;
    rowHeight = Math.max(rowHeight, h);

    return updated;
  });
}

export function inferDashboardColumnCount(widgets: WidgetInstance[]) {
  const maxRight = widgets.reduce<number>((max, widget) => {
    const width = Math.max(Math.round(widget.w), 1);
    return Math.max(max, Math.max(Math.round(widget.x), 0) + width);
  }, GRID_COLS.lg);

  if (maxRight > GRID_COLS.wide) return GRID_COLS.ultra;
  if (maxRight > GRID_COLS.lg) return GRID_COLS.wide;
  return GRID_COLS.lg;
}

export function getReorderColumnCount(widgets: WidgetInstance[], breakpoint: GridBreakpoint) {
  const breakpointCols = GRID_COLS[breakpoint];
  const activeCols = isMobileBreakpoint(breakpoint) ? GRID_COLS.lg : breakpointCols;
  return Math.max(inferDashboardColumnCount(widgets), activeCols);
}

export function packWidgetStatePreservingDimensionsForColumns(
  widgets: WidgetInstance[],
  cols: number,
) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 1;

  return widgets.map((widget) => {
    const w = Math.min(Math.max(Math.round(widget.w), 1), cols);
    const h = Math.max(Math.round(widget.h), 1);

    if (cursorX > 0 && cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 1;
    }

    const updated = {
      ...widget,
      x: cursorX,
      y: cursorY,
      w,
      h,
    };

    cursorX += w;
    rowHeight = Math.max(rowHeight, h);

    return updated;
  });
}

export function canMoveWidgetEarlier(widgets: WidgetInstance[], widgetId: string) {
  return getWidgetsInVisualOrder(widgets).findIndex((widget) => widget.id === widgetId) > 0;
}

export function canMoveWidgetLater(widgets: WidgetInstance[], widgetId: string) {
  const orderedWidgets = getWidgetsInVisualOrder(widgets);
  const index = orderedWidgets.findIndex((widget) => widget.id === widgetId);
  return index >= 0 && index < orderedWidgets.length - 1;
}

export function moveWidgetInVisualOrder(
  widgets: WidgetInstance[],
  widgetId: string,
  direction: "earlier" | "later",
  cols: number = GRID_COLS.lg,
) {
  const orderedWidgets = getWidgetsInVisualOrder(widgets);
  const index = orderedWidgets.findIndex((widget) => widget.id === widgetId);
  const targetIndex = direction === "earlier" ? index - 1 : index + 1;

  if (index < 0 || targetIndex < 0 || targetIndex >= orderedWidgets.length) {
    return widgets;
  }

  const reordered = [...orderedWidgets];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return packWidgetStatePreservingDimensionsForColumns(reordered, cols);
}
