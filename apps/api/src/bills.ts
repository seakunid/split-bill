import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateSplit, validateBillWrite, type BillResponse, type BillWrite } from "@split-bill/shared";
import { HttpError } from "./http.js";
import { newBillId } from "./ids.js";

const billInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: { assignments: true },
  },
  payers: { orderBy: { position: "asc" as const } },
} satisfies Prisma.BillInclude;

type StoredBill = Prisma.BillGetPayload<{ include: typeof billInclude }>;

export async function createBill(prisma: PrismaClient, input: BillWrite): Promise<BillResponse> {
  assertValid(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = newBillId();
    try {
      const stored = await prisma.$transaction(async (tx) => {
        await tx.bill.create({ data: billCreateData(id, input) });
        if (input.assignments.length > 0) {
          await tx.assignment.createMany({ data: input.assignments });
        }
        return tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude });
      });
      return toResponse(stored);
    } catch (error) {
      if (isUniqueConflict(error, "Bill") && attempt < 2) continue;
      rethrowUnique(error);
    }
  }
  throw new HttpError("Could not allocate a bill id", 500);
}

export async function getBill(prisma: PrismaClient, id: string): Promise<BillResponse> {
  const stored = await prisma.bill.findUnique({ where: { id }, include: billInclude });
  if (!stored) throw new HttpError("Bill not found", 404);
  return toResponse(stored);
}

export async function updateBill(prisma: PrismaClient, id: string, input: BillWrite): Promise<BillResponse> {
  assertValid(input);
  try {
    const stored = await prisma.$transaction(async (tx) => {
      const existing = await tx.bill.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new HttpError("Bill not found", 404);
      await tx.item.deleteMany({ where: { billId: id } });
      await tx.payer.deleteMany({ where: { billId: id } });
      await tx.bill.update({
        where: { id },
        data: {
          ...scalars(input),
          items: { create: itemCreates(input) },
          payers: { create: payerCreates(input) },
        },
      });
      if (input.assignments.length > 0) {
        await tx.assignment.createMany({ data: input.assignments });
      }
      return tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude });
    });
    return toResponse(stored);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    rethrowUnique(error);
  }
}

function assertValid(input: BillWrite): void {
  const issues = validateBillWrite(input);
  if (issues.length > 0) {
    throw new HttpError("Bill failed validation", 400, issues);
  }
}

function scalars(input: BillWrite) {
  return {
    currency: input.currency,
    subtotal: BigInt(input.subtotal),
    tax: BigInt(input.tax),
    serviceCharge: BigInt(input.serviceCharge),
    discount: BigInt(input.discount),
    rounding: BigInt(input.rounding),
    total: BigInt(input.total),
    imageUrl: input.imageUrl ?? null,
  };
}

function itemCreates(input: BillWrite) {
  return input.items.map((item, position) => ({
    id: item.id,
    position,
    name: item.name,
    quantity: item.quantity,
    unitPrice: BigInt(item.unitPrice),
    lineTotal: BigInt(item.lineTotal),
  }));
}

function payerCreates(input: BillWrite) {
  return input.payers.map((payer, position) => ({
    id: payer.id,
    position,
    name: payer.name,
  }));
}

function billCreateData(id: string, input: BillWrite): Prisma.BillCreateInput {
  return {
    id,
    ...scalars(input),
    items: { create: itemCreates(input) },
    payers: { create: payerCreates(input) },
  };
}

function toResponse(bill: StoredBill): BillResponse {
  const items = bill.items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    lineTotal: money(item.lineTotal),
  }));
  const payers = bill.payers.map((payer) => ({ id: payer.id, name: payer.name }));
  const assignments = bill.items.flatMap((item) =>
    item.assignments.map((assignment) => ({ itemId: assignment.itemId, payerId: assignment.payerId })),
  );
  const split = calculateSplit({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      lineTotal: item.lineTotal,
      assigneeIds: assignments.filter((assignment) => assignment.itemId === item.id).map((assignment) => assignment.payerId),
    })),
    payers,
    tax: money(bill.tax),
    serviceCharge: money(bill.serviceCharge),
    discount: money(bill.discount),
    rounding: signedAmount(bill.rounding),
  });
  return {
    id: bill.id,
    currency: bill.currency,
    items,
    payers,
    assignments,
    subtotal: money(bill.subtotal),
    tax: money(bill.tax),
    serviceCharge: money(bill.serviceCharge),
    discount: money(bill.discount),
    rounding: signedAmount(bill.rounding),
    total: money(bill.total),
    imageUrl: bill.imageUrl,
    breakdown: split.breakdown,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

function money(value: bigint): number {
  const amount = signedAmount(value);
  if (amount < 0) {
    throw new HttpError("Stored amount is outside the supported range", 500);
  }
  return amount;
}

function signedAmount(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new HttpError("Stored amount is outside the supported range", 500);
  }
  return amount;
}

function isUniqueConflict(error: unknown, model?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!model) return true;
  const modelName = error.meta?.modelName;
  return modelName === model;
}

function rethrowUnique(error: unknown): never {
  if (isUniqueConflict(error)) {
    throw new HttpError("Item or payer id already exists", 409);
  }
  throw error;
}
