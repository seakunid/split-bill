import { describe, expect, it } from "vitest";
import { calculateSplit, type SplitBillInput, type SplitResult } from "./split.js";
import { validateBillWrite } from "./validate.js";
import { billWriteSchema, type PayerBreakdown } from "./schemas.js";

function payer(id: string, name = id): { id: string; name: string } {
  return { id, name };
}

function item(
  id: string,
  lineTotal: number,
  assigneeIds: string[],
  name = id,
): SplitBillInput["items"][number] {
  return { id, name, lineTotal, assigneeIds };
}

function split(overrides: Partial<SplitBillInput> & Pick<SplitBillInput, "items" | "payers">): SplitResult {
  return calculateSplit({
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    ...overrides,
  });
}

function byId(result: SplitResult, id: string): PayerBreakdown {
  const found = result.breakdown.find((row) => row.payerId === id);
  if (!found) throw new Error(`missing payer ${id}`);
  return found;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("calculateSplit", () => {
  it("gives a single payer the whole bill", () => {
    const result = split({
      payers: [payer("a", "Ani")],
      items: [item("nasi", 45_000, ["a"], "Nasi goreng"), item("teh", 8_000, ["a"], "Es teh")],
      tax: 5_300,
      serviceCharge: 2_650,
      discount: 1_000,
    });

    expect(result.unassignedItemIds).toEqual([]);
    expect(result.breakdown).toHaveLength(1);
    const ani = result.breakdown[0]!;
    expect(ani).toMatchObject({
      payerId: "a",
      name: "Ani",
      subtotal: 53_000,
      tax: 5_300,
      serviceCharge: 2_650,
      discount: 1_000,
      total: 59_950,
    });
    expect(ani.items).toEqual([
      { itemId: "nasi", name: "Nasi goreng", share: 45_000 },
      { itemId: "teh", name: "Es teh", share: 8_000 },
    ]);
    expect(result.total).toBe(59_950);
  });

  it("splits a shared item equally, giving leftover rupiah to the earliest payers", () => {
    const result = split({
      payers: [payer("a"), payer("b"), payer("c")],
      items: [item("shared", 10_000, ["c", "a", "b"])],
    });

    expect(byId(result, "a").items[0]?.share).toBe(3_334);
    expect(byId(result, "b").items[0]?.share).toBe(3_333);
    expect(byId(result, "c").items[0]?.share).toBe(3_333);
    expect(sum(result.breakdown.map((row) => row.subtotal))).toBe(10_000);
    for (const row of result.breakdown) {
      const shares = result.breakdown.map((payerRow) => payerRow.subtotal);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    }
  });

  it("splits several items, some shared and some exclusive", () => {
    const result = split({
      payers: [payer("a", "Ani"), payer("b", "Budi"), payer("c", "Citra")],
      items: [
        item("nasi", 50_000, ["a"], "Nasi goreng"),
        item("teh", 10_000, ["a", "b"], "Es teh"),
        item("ayam", 40_000, ["b", "c"], "Ayam"),
      ],
      tax: 11_000,
      serviceCharge: 7_500,
      discount: 3_000,
    });

    expect(byId(result, "a")).toMatchObject({ subtotal: 55_000, tax: 6_050, serviceCharge: 4_125, discount: 1_650, total: 63_525 });
    expect(byId(result, "b")).toMatchObject({ subtotal: 25_000, tax: 2_750, serviceCharge: 1_875, discount: 750, total: 28_875 });
    expect(byId(result, "c")).toMatchObject({ subtotal: 20_000, tax: 2_200, serviceCharge: 1_500, discount: 600, total: 23_100 });
    expect(result.total).toBe(100_000 + 11_000 + 7_500 - 3_000);
  });

  it("assigns the whole rounding remainder of a proportional charge to the largest share", () => {
    const result = split({
      payers: [payer("small"), payer("large")],
      items: [item("s", 10, ["small"]), item("l", 30, ["large"])],
      tax: 10,
    });

    expect(byId(result, "small").tax).toBe(2);
    expect(byId(result, "large").tax).toBe(8);
    expect(sum(result.breakdown.map((row) => row.tax))).toBe(10);
    expect(result.total).toBe(50);
  });

  it("gives a tied remainder to the earliest payer, even when the leftover is more than one rupiah", () => {
    const result = split({
      payers: [payer("a"), payer("b"), payer("c")],
      items: [item("a", 1, ["a"]), item("b", 1, ["b"]), item("c", 1, ["c"])],
      tax: 5,
      serviceCharge: 5,
      discount: 5,
    });

    expect(result.breakdown.map((row) => row.tax)).toEqual([3, 1, 1]);
    expect(result.breakdown.map((row) => row.serviceCharge)).toEqual([3, 1, 1]);
    expect(result.breakdown.map((row) => row.discount)).toEqual([3, 1, 1]);
    expect(sum(result.breakdown.map((row) => row.tax))).toBe(5);
    expect(sum(result.breakdown.map((row) => row.serviceCharge))).toBe(5);
    expect(sum(result.breakdown.map((row) => row.discount))).toBe(5);
    expect(result.total).toBe(3 + 5 + 5 - 5);
  });

  it("makes payer totals match the bill total exactly on an awkward division", () => {
    const result = split({
      payers: [payer("a"), payer("b"), payer("c")],
      items: [item("shared", 10_000, ["a", "b", "c"])],
      tax: 100,
    });

    expect(result.breakdown.map((row) => row.subtotal)).toEqual([3_334, 3_333, 3_333]);
    expect(result.breakdown.map((row) => row.tax)).toEqual([34, 33, 33]);
    expect(result.total).toBe(10_100);
    expect(sum(result.breakdown.map((row) => row.total))).toBe(result.total);
  });

  it("keeps totals exact when the discount is larger than tax", () => {
    const result = split({
      payers: [payer("a"), payer("b")],
      items: [item("shared", 100_000, ["a", "b"])],
      tax: 10_000,
      serviceCharge: 0,
      discount: 25_000,
    });

    expect(byId(result, "a")).toMatchObject({ subtotal: 50_000, tax: 5_000, discount: 12_500, total: 42_500 });
    expect(byId(result, "b")).toMatchObject({ subtotal: 50_000, tax: 5_000, discount: 12_500, total: 42_500 });
    expect(result.total).toBe(100_000 + 10_000 - 25_000);
    expect(result.breakdown.every((row) => row.discount > row.tax)).toBe(true);
  });

  it("returns zero totals when there are no items and no charges", () => {
    const result = split({
      payers: [payer("a"), payer("b")],
      items: [],
    });

    expect(result.unassignedItemIds).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([
      { payerId: "a", name: "a", items: [], subtotal: 0, tax: 0, serviceCharge: 0, discount: 0, total: 0 },
      { payerId: "b", name: "b", items: [], subtotal: 0, tax: 0, serviceCharge: 0, discount: 0, total: 0 },
    ]);
  });

  it("splits charges across payers when there is no item value, leftover to the earliest payer", () => {
    const even = split({
      payers: [payer("a"), payer("b")],
      items: [],
      tax: 10,
      serviceCharge: 4,
      discount: 2,
    });
    expect(even.breakdown.map((row) => row.total)).toEqual([6, 6]);
    expect(even.total).toBe(12);

    const odd = split({
      payers: [payer("a"), payer("b")],
      items: [],
      tax: 5,
    });
    expect(odd.breakdown.map((row) => row.tax)).toEqual([3, 2]);
    expect(odd.total).toBe(5);
  });

  it("gives nothing to a payer who has no items when someone else does", () => {
    const result = split({
      payers: [payer("a", "Ani"), payer("b", "Budi")],
      items: [item("nasi", 40_000, ["a"])],
      tax: 4_000,
      serviceCharge: 2_000,
      discount: 1_000,
    });

    expect(byId(result, "b")).toEqual({
      payerId: "b",
      name: "Budi",
      items: [],
      subtotal: 0,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      total: 0,
    });
    expect(byId(result, "a").total).toBe(45_000);
    expect(result.total).toBe(45_000);
  });

  it("leaves unassigned items out of payer subtotals and holds back their share of charges", () => {
    const result = split({
      payers: [payer("a")],
      items: [item("claimed", 50, ["a"]), item("open", 50, [])],
      tax: 10,
      serviceCharge: 10,
      discount: 10,
    });

    expect(result.unassignedItemIds).toEqual(["open"]);
    expect(byId(result, "a")).toMatchObject({
      subtotal: 50,
      tax: 5,
      serviceCharge: 5,
      discount: 5,
      total: 55,
    });
    expect(byId(result, "a").items).toEqual([{ itemId: "claimed", name: "claimed", share: 50 }]);
    expect(result.total).toBe(55);
  });

  it("ignores unknown and duplicate assignees", () => {
    const result = split({
      payers: [payer("a"), payer("b")],
      items: [item("shared", 10, ["a", "a", "missing", "b"])],
    });

    expect(result.unassignedItemIds).toEqual([]);
    expect(byId(result, "a").subtotal).toBe(5);
    expect(byId(result, "b").subtotal).toBe(5);
  });

  it("returns an empty breakdown when nobody is paying", () => {
    const result = split({
      payers: [],
      items: [item("nasi", 10_000, ["a"])],
      tax: 1_000,
    });

    expect(result.breakdown).toEqual([]);
    expect(result.unassignedItemIds).toEqual(["nasi"]);
    expect(result.total).toBe(0);
  });

  it("rejects duplicate payer ids and non-integer money", () => {
    expect(() =>
      split({
        payers: [payer("a"), payer("a")],
        items: [],
      }),
    ).toThrow(/Duplicate payer/);

    expect(() =>
      split({
        payers: [payer("a")],
        items: [item("nasi", 10.5, ["a"])],
      }),
    ).toThrow(/lineTotal/);
  });
});

describe("validateBillWrite", () => {
  const valid = {
    currency: "IDR",
    items: [
      { id: "i1", name: "Nasi", quantity: 1, unitPrice: 20_000, lineTotal: 20_000 },
      { id: "i2", name: "Teh", quantity: 2, unitPrice: 5_000, lineTotal: 10_000 },
    ],
    payers: [
      { id: "p1", name: "Ani" },
      { id: "p2", name: "Budi" },
    ],
    assignments: [
      { itemId: "i1", payerId: "p1" },
      { itemId: "i2", payerId: "p1" },
      { itemId: "i2", payerId: "p2" },
    ],
    subtotal: 30_000,
    tax: 3_000,
    serviceCharge: 1_500,
    discount: 500,
    total: 34_000,
  };

  it("accepts a consistent bill and defaults currency to IDR", () => {
    const { currency: _currency, ...withoutCurrency } = valid;
    const parsed = billWriteSchema.parse(withoutCurrency);
    expect(parsed.currency).toBe("IDR");
    expect(validateBillWrite(parsed)).toEqual([]);
  });

  it("reports unassigned items, bad references, and total mismatches", () => {
    const parsed = billWriteSchema.parse({
      ...valid,
      items: [...valid.items, { id: "i3", name: "Jus", quantity: 1, unitPrice: 12_000, lineTotal: 12_000 }],
      assignments: [
        ...valid.assignments,
        { itemId: "missing", payerId: "p1" },
        { itemId: "i1", payerId: "nobody" },
        { itemId: "i1", payerId: "p1" },
      ],
      subtotal: 30_000,
      total: 1,
    });

    const codes = validateBillWrite(parsed).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "UNKNOWN_ITEM",
        "UNKNOWN_PAYER",
        "DUPLICATE_ASSIGNMENT",
        "UNASSIGNED_ITEM",
        "SUBTOTAL_MISMATCH",
        "TOTAL_MISMATCH",
      ]),
    );
  });
});
