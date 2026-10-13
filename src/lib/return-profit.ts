export type ReturnStockCostRow = {
  quantity: number | string | null;
  unit_cost: number | string | null;
};

export function sumRestoredProductCost(rows: ReturnStockCostRow[]): number {
  return sumMoney(rows.map(row => multiplyMoney(row.unit_cost ?? 0, Number(row.quantity ?? 0))));
}

export function returnRevenueCredit(row: {
  return_math_version: number | null;
  subtotal: number | string | null;
  refund_amount: number | string | null;
}): number {
  // Historical reports keep the old refund-based interpretation for legacy rows.
  return Number(row.return_math_version === 1 ? row.subtotal ?? 0 : row.refund_amount ?? 0);
}

export function calculateEstimatedNetProfit(input: {
  grossProfit: number;
  expenses: number;
  refunds: number;
  returnCredits?: number;
  restoredProductCost: number;
  writeOffs?: number;
}): number {
  return input.grossProfit - input.expenses - (input.returnCredits ?? input.refunds)
    + input.restoredProductCost - (input.writeOffs ?? 0);
}
import { multiplyMoney, sumMoney } from "@/lib/money";
