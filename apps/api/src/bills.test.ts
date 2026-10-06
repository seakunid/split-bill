import { PrismaClient } from "@prisma/client";
import { billResponseSchema, calculateSplit, type BillWrite } from "@split-bill/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadDotenv } from "./env.js";

loadDotenv();
process.env.DATABASE_URL ??= "postgresql://splitbill:splitbill@localhost:5432/splitbill";

const prisma = new PrismaClient();
const app = createApp({ prisma, vision: null, corsOrigin: "http://localhost:3000" });

beforeEach(async () => {
  await prisma.assignment.deleteMany();
  await prisma.item.deleteMany();
  await prisma.payer.deleteMany();
  await prisma.bill.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function bill(overrides: Partial<BillWrite> = {}): BillWrite {
  const base: BillWrite = {
    currency: "IDR",
    items: [
      { id: "nasi", name: "Nasi goreng", quantity: 2, unitPrice: 25_000, lineTotal: 50_000 },
      { id: "teh", name: "Es teh", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 },
      { id: "ayam", name: "Ayam", quantity: 1.5, unitPrice: 40_000, lineTotal: 40_000 },
    ],
    payers: [
      { id: "ani", name: "Ani" },
      { id: "budi", name: "Budi" },
      { id: "citra", name: "Citra" },
    ],
    assignments: [
      { itemId: "nasi", payerId: "ani" },
      { itemId: "teh", payerId: "ani" },
      { itemId: "teh", payerId: "budi" },
      { itemId: "ayam", payerId: "budi" },
      { itemId: "ayam", payerId: "citra" },
    ],
    subtotal: 100_000,
    tax: 11_000,
    serviceCharge: 7_500,
    discount: 3_000,
    rounding: 0,
    total: 115_500,
    imageUrl: null,
  };
  return { ...base, ...overrides };
}

describe("bills", () => {
  it("saves a bill and returns the shared breakdown", async () => {
    const input = bill();
    const created = await postBill(input);
    expect(created.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(created.currency).toBe("IDR");
    expect(created.items.map((item) => item.id)).toEqual(["nasi", "teh", "ayam"]);
    expect(created.items[2]?.quantity).toBe(1.5);
    expect(created.breakdown.map((row) => row.total)).toEqual([63_525, 28_875, 23_100]);
    expect(created.breakdown.reduce((sum, row) => sum + row.total, 0)).toBe(created.total);

    const expected = calculateSplit({
      items: input.items.map((item) => ({
        id: item.id,
        name: item.name,
        lineTotal: item.lineTotal,
        assigneeIds: input.assignments.filter((assignment) => assignment.itemId === item.id).map((assignment) => assignment.payerId),
      })),
      payers: input.payers,
      tax: input.tax,
      serviceCharge: input.serviceCharge,
      discount: input.discount,
    });
    expect(created.breakdown).toEqual(expected.breakdown);

    const fetched = billResponseSchema.parse(await (await app.request(`/bills/${created.id}`)).json());
    expect(fetched).toEqual(created);
  });

  it("puts the rounding remainder on the largest share and keeps payer order", async () => {
    const input = bill({
      items: [
        { id: "a", name: "A", quantity: 1, unitPrice: 1, lineTotal: 1 },
        { id: "b", name: "B", quantity: 1, unitPrice: 1, lineTotal: 1 },
        { id: "c", name: "C", quantity: 1, unitPrice: 1, lineTotal: 1 },
      ],
      assignments: [
        { itemId: "a", payerId: "ani" },
        { itemId: "b", payerId: "budi" },
        { itemId: "c", payerId: "citra" },
      ],
      subtotal: 3,
      tax: 5,
      serviceCharge: 0,
      discount: 0,
      total: 8,
    });
    const created = await postBill(input);
    expect(created.breakdown.map((row) => row.tax)).toEqual([3, 1, 1]);
    expect(created.breakdown.reduce((sum, row) => sum + row.total, 0)).toBe(8);
  });

  it("stores amounts above a 32-bit integer", async () => {
    const input = bill({
      items: [{ id: "big", name: "Banquet", quantity: 1, unitPrice: 2_500_000_000, lineTotal: 2_500_000_000 }],
      payers: [{ id: "ani", name: "Ani" }],
      assignments: [{ itemId: "big", payerId: "ani" }],
      subtotal: 2_500_000_000,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      total: 2_500_000_000,
    });
    const created = await postBill(input);
    expect(created.total).toBe(2_500_000_000);
    expect(created.breakdown[0]?.total).toBe(2_500_000_000);
  });

  it("persists rounding and splits a negative pembulatan", async () => {
    const input = bill({
      items: [{ id: "nasi", name: "Nasi", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 }],
      payers: [
        { id: "ani", name: "Ani" },
        { id: "budi", name: "Budi" },
        { id: "citra", name: "Citra" },
      ],
      assignments: [
        { itemId: "nasi", payerId: "ani" },
        { itemId: "nasi", payerId: "budi" },
        { itemId: "nasi", payerId: "citra" },
      ],
      subtotal: 10_000,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      rounding: -5,
      total: 9_995,
    });
    const created = await postBill(input);
    expect(created.rounding).toBe(-5);
    expect(created.breakdown.map((row) => row.rounding)).toEqual([-3, -1, -1]);
    expect(created.breakdown.reduce((sum, row) => sum + row.total, 0)).toBe(9_995);

    const omitted = await app.request("/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: "teh", name: "Teh", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 }],
        payers: [{ id: "ani2", name: "Ani" }],
        assignments: [{ itemId: "teh", payerId: "ani2" }],
        subtotal: 8_000,
        tax: 0,
        serviceCharge: 0,
        discount: 0,
        total: 8_000,
      }),
    });
    expect(omitted.status).toBe(201);
    const saved = billResponseSchema.parse(await omitted.json());
    expect(saved.rounding).toBe(0);
    expect(saved.breakdown[0]?.rounding).toBe(0);
  });

  it("rejects a total that ignores rounding", async () => {
    const response = await app.request("/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        bill({
          items: [{ id: "nasi", name: "Nasi", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 }],
          payers: [{ id: "ani", name: "Ani" }],
          assignments: [{ itemId: "nasi", payerId: "ani" }],
          subtotal: 10_000,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 100,
          total: 10_000,
        }),
      ),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: Array<{ code: string }> };
    expect(body.issues.map((issue) => issue.code)).toContain("TOTAL_MISMATCH");
  });

  it("rejects unassigned items and inconsistent totals", async () => {
    const unassigned = await app.request("/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bill({ assignments: [{ itemId: "nasi", payerId: "ani" }] })),
    });
    expect(unassigned.status).toBe(400);
    const unassignedBody = (await unassigned.json()) as { issues: Array<{ code: string }> };
    expect(unassignedBody.issues.map((issue) => issue.code)).toContain("UNASSIGNED_ITEM");

    const mismatch = await app.request("/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bill({ total: 1 })),
    });
    expect(mismatch.status).toBe(400);
    const mismatchBody = (await mismatch.json()) as { issues: Array<{ code: string }> };
    expect(mismatchBody.issues.map((issue) => issue.code)).toContain("TOTAL_MISMATCH");
  });

  it("rejects an invalid bill id and unknown bills", async () => {
    const invalid = await app.request("/bills/not valid!");
    expect(invalid.status).toBe(400);
    const missing = await app.request("/bills/doesnotexist");
    expect(missing.status).toBe(404);
  });

  it("updates items and recomputes the breakdown without changing the id", async () => {
    const created = await postBill(bill());
    const next = bill({
      items: [{ id: "jus", name: "Jus", quantity: 1, unitPrice: 15_000, lineTotal: 15_000 }],
      payers: [{ id: "ani", name: "Ani" }],
      assignments: [{ itemId: "jus", payerId: "ani" }],
      subtotal: 15_000,
      tax: 1_500,
      serviceCharge: 0,
      discount: 0,
      total: 16_500,
    });
    const response = await app.request(`/bills/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    expect(response.status).toBe(200);
    const updated = billResponseSchema.parse(await response.json());
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.items.map((item) => item.name)).toEqual(["Jus"]);
    expect(updated.breakdown).toEqual([
      {
        payerId: "ani",
        name: "Ani",
        items: [{ itemId: "jus", name: "Jus", share: 15_000 }],
        subtotal: 15_000,
        tax: 1_500,
        serviceCharge: 0,
        discount: 0,
        rounding: 0,
        total: 16_500,
      },
    ]);

    const missing = await app.request("/bills/doesnotexist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    expect(missing.status).toBe(404);
  });

  it("rejects an item id that already belongs to another bill", async () => {
    await postBill(bill());
    const response = await app.request("/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        bill({
          items: [{ id: "nasi", name: "Other", quantity: 1, unitPrice: 1, lineTotal: 1 }],
          payers: [{ id: "ani", name: "Ani" }],
          assignments: [{ itemId: "nasi", payerId: "ani" }],
          subtotal: 1,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          total: 1,
        }),
      ),
    });
    expect(response.status).toBe(409);
  });
});

async function postBill(input: BillWrite) {
  const response = await app.request("/bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return billResponseSchema.parse(await response.json());
}
