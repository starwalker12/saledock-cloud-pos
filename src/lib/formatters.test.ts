import { formatCurrency, formatNumber } from "./formatters";

describe("formatters", () => {
  describe("formatCurrency", () => {
    it("formats a standard positive number with the default PKR currency code", () => {
      expect(formatCurrency(1234)).toBe("PKR 1,234");
    });

    it("formats a standard positive number with a custom currency code", () => {
      expect(formatCurrency(1234, "USD")).toBe("USD 1,234");
    });

    it("formats zero correctly", () => {
      expect(formatCurrency(0)).toBe("PKR 0");
    });

    it("formats negative numbers correctly", () => {
      expect(formatCurrency(-1234.5)).toBe("PKR -1,234.5");
    });

    it("preserves up to two decimal places", () => {
      expect(formatCurrency(1234.56)).toBe("PKR 1,234.56");
      expect(formatCurrency(1234.5)).toBe("PKR 1,234.5");
      expect(formatCurrency(1234)).toBe("PKR 1,234");
    });

    it("rounds numbers with more than two decimal places", () => {
      expect(formatCurrency(1234.567)).toBe("PKR 1,234.57");
    });

    it("handles non-finite numbers safely by treating them as 0", () => {
      expect(formatCurrency(Infinity)).toBe("PKR 0");
      expect(formatCurrency(-Infinity)).toBe("PKR 0");
      expect(formatCurrency(NaN)).toBe("PKR 0");
    });
  });

  describe("formatNumber", () => {
    it("formats a standard positive number", () => {
      expect(formatNumber(1234)).toBe("1,234");
    });

    it("formats zero correctly", () => {
      expect(formatNumber(0)).toBe("0");
    });

    it("formats negative numbers correctly", () => {
      expect(formatNumber(-1234.5)).toBe("-1,234.5");
    });

    it("handles non-finite numbers safely by treating them as 0", () => {
      expect(formatNumber(Infinity)).toBe("0");
      expect(formatNumber(-Infinity)).toBe("0");
      expect(formatNumber(NaN)).toBe("0");
    });
  });
});
