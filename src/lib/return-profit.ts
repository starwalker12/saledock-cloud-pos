export type ReturnStockCostRow = {
  quantity: number | string | null;
  unit_cost: number | string | null;
};

export function sumRestoredProductCost(rows: ReturnStockCostRow[]): number {
  return rows.reduce(
    (total, row) =>
      total + Number(row.quantity ?? 0) * Number(row.unit_cost ?? 0),
    0,
  );
}

export function calculateEstimatedNetProfit(input: {
  grossProfit: number;
  expenses: number;
  refunds: number;
  restoredProductCost: number;
  writeOffs?: number;
}): number {
  return (
    input.grossProfit -
    input.expenses -
    input.refunds +
    input.restoredProductCost -
    (input.writeOffs ?? 0)
  );
}
