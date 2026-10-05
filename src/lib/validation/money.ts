import { z } from "zod";
import { moneyToMinorUnits, MONEY_PRECISION_MESSAGE } from "../money";

function moneyAmount(message: string, positive: boolean) {
  return z.union([z.string(), z.number()], { message: "Enter a valid amount." })
    .superRefine((value, ctx) => {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount." });
      } else if (positive ? amount <= 0 : amount < 0) {
        ctx.addIssue({ code: "custom", message });
      } else if (moneyToMinorUnits(typeof value === "string" && !value.trim() ? "0" : value) === null) {
        ctx.addIssue({ code: "custom", message: MONEY_PRECISION_MESSAGE });
      }
    })
    .transform((value) => Number(value));
}

export const positiveMoneyAmount = (message: string) => moneyAmount(message, true);
export const nonNegativeMoneyAmount = (message: string) => moneyAmount(message, false);
