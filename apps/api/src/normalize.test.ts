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
      rounding: 0,
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
      rounding: 0,
      total: 0,
    });
  });

  it("keeps an explicit pembulatan, including a negative one", () => {
    const draft = normalizeParsedBill({
      currency: "IDR",
      items: [{ name: "Nasi", quantity: 1, unitPrice: 10_040, lineTotal: 10_040 }],
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      rounding: -40,
      taxIncluded: false,
      total: 10_000,
    });
    expect(draft.rounding).toBe(-40);
    expect(draft.total).toBe(10_000);
  });

  it("infers a small pembulatan when the printed total is only slightly off", () => {
    const draft = normalizeParsedBill({
      currency: "IDR",
      items: [{ name: "Nasi", quantity: 1, unitPrice: 33_350, lineTotal: 33_350 }],
      tax: 3_335,
      serviceCharge: 0,
      discount: 0,
      rounding: 0,
      total: 36_700,
    });
    expect(draft.tax).toBe(3_335);
    expect(draft.rounding).toBe(15);
    expect(draft.total).toBe(36_700);
  });

  it("leaves tax at 0 when prices already include it, and keeps pembulatan separate", () => {
    const flagged = normalizeParsedBill({
      currency: "IDR",
      items: [{ name: "Nasi", quantity: 1, unitPrice: 110_000, lineTotal: 110_000 }],
      tax: 10_000,
      serviceCharge: 0,
      discount: 0,
      rounding: 50,
      taxIncluded: true,
      total: 110_050,
    });
    expect(flagged.tax).toBe(0);
    expect(flagged.rounding).toBe(50);
    expect(flagged.total).toBe(110_050);

    const inferred = normalizeParsedBill({
      currency: "IDR",
      items: [{ name: "Nasi", quantity: 1, unitPrice: 110_000, lineTotal: 110_000 }],
      tax: 10_000,
      serviceCharge: 0,
      discount: 0,
      rounding: 0,
      total: 110_050,
    });
    expect(inferred.tax).toBe(0);
    expect(inferred.rounding).toBe(50);
    expect(inferred.total).toBe(110_050);
  });

  it("does not hide a large total gap inside rounding", () => {
    const draft = normalizeParsedBill({
      currency: "IDR",
      items: [{ name: "Nasi", quantity: 1, unitPrice: 50_000, lineTotal: 50_000 }],
      tax: 5_000,
      serviceCharge: 0,
      discount: 0,
      total: 1,
    });
    expect(draft.rounding).toBe(0);
    expect(draft.tax).toBe(5_000);
    expect(draft.total).toBe(55_000);
  });

  it("rejects a draft whose charges make the total negative", () => {
    expect(() => normalizeParsedBill({ currency: "IDR", items: [], discount: 10 })).toThrow(DraftNormalizationError);
  });
});
