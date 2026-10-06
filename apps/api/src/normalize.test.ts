import { describe, expect, it } from "vitest";
import { DraftNormalizationError, normalizeParsedBill } from "./normalize.js";

describe("normalizeParsedBill", () => {
  it("rounds rupiah, recomputes subtotal and total, and uppercases currency", () => {
    const draft = normalizeParsedBill({
      currency: "idr",
      items: [
        { name: " Nasi goreng ", quantity: 2, unitPrice: 25_000.4, lineTotal: 50_000.2 },
        { name: "Es teh", quantity: 1, unitPrice: 8_000, lineTotal: 0 },
      ],
      subtotal: 1,
      tax: 5_000.6,
      serviceCharge: 2_500.2,
      discount: 1_000,
      total: 9,
    });

    expect(draft).toEqual({
      currency: "IDR",
      items: [
        { name: "Nasi goreng", quantity: 2, unitPrice: 25_000, lineTotal: 50_000 },
        { name: "Es teh", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 },
      ],
      subtotal: 58_000,
      tax: 5_001,
      serviceCharge: 2_500,
      discount: 1_000,
      total: 64_501,
    });
  });

  it("defaults a missing currency to IDR and drops empty lines", () => {
    const draft = normalizeParsedBill({
      items: [{ name: "  ", quantity: 1, unitPrice: 0, lineTotal: 0 }],
      tax: 0,
      serviceCharge: 0,
      discount: 0,
    });
    expect(draft).toEqual({
      currency: "IDR",
      items: [],
      subtotal: 0,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      total: 0,
    });
  });

  it("rejects a draft whose charges make the total negative", () => {
    expect(() => normalizeParsedBill({ currency: "IDR", items: [], discount: 10 })).toThrow(DraftNormalizationError);
  });
});
