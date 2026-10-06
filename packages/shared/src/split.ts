import type { PayerBreakdown } from "./schemas.js";

export type SplitItem = {
  id: string;
  name: string;
  lineTotal: number;
  /** Payer ids. Unknown ids are ignored. Duplicates are ignored. */
  assigneeIds: string[];
};

export type SplitPayer = {
  id: string;
  name: string;
};

export type SplitBillInput = {
  items: SplitItem[];
  payers: SplitPayer[];
  tax: number;
  serviceCharge: number;
  discount: number;
  /** Pembulatan in whole rupiah. Omitted or zero leaves the split unchanged. */
  rounding?: number;
};

export type SplitResult = {
  breakdown: PayerBreakdown[];
  /** Items with no assignee that matches a known payer. */
  unassignedItemIds: string[];
  /** Sum of per-payer totals. */
  total: number;
};

/**
 * Split a bill across payers.
 *
 * A shared item's line total is divided as evenly as possible in whole
 * rupiah (shares differ by at most one). Extra rupiah go to the earliest
 * payers in `payers` order.
 *
 * Tax, service charge, discount, and rounding are split in proportion to each
 * payer's item subtotal, including a virtual share for unassigned line totals
 * so a partially assigned bill does not dump those charges onto the people who
 * already claimed items. Each of those amounts is floored, and any leftover
 * rupiah go entirely to the payer with the largest item subtotal (the
 * earliest payer on a tie). A negative rounding uses the same rule on its
 * magnitude, so the largest share also receives the leftover reduction.
 * When every item is assigned, per-payer totals sum to the sum of line totals
 * + tax + service charge - discount + rounding.
 *
 * If every line total is zero, tax, service, discount, and rounding are split
 * equally across payers so a charges-only bill still adds up.
 */
export function calculateSplit(input: SplitBillInput): SplitResult {
  const rounding = input.rounding ?? 0;
  assertUnique(input.payers.map((payer) => payer.id), "payer");
  assertUnique(input.items.map((item) => item.id), "item");
  assertMoney("tax", input.tax);
  assertMoney("serviceCharge", input.serviceCharge);
  assertMoney("discount", input.discount);
  assertSignedMoney("rounding", rounding);

  const payerIndex = new Map(input.payers.map((payer, index) => [payer.id, index]));
  const sharesByPayer: ItemShareDraft[][] = input.payers.map(() => []);
  const subtotals = input.payers.map(() => 0);
  const unassignedItemIds: string[] = [];
  let unassignedWeight = 0;

  for (const item of input.items) {
    assertMoney(`item ${item.id} lineTotal`, item.lineTotal);
    const assignees = uniqueAssignees(item.assigneeIds, payerIndex);
    if (assignees.length === 0) {
      unassignedItemIds.push(item.id);
      unassignedWeight += item.lineTotal;
      continue;
    }
    const shares = splitEvenly(item.lineTotal, assignees.length);
    for (let index = 0; index < assignees.length; index += 1) {
      const payerId = assignees[index];
      const share = shares[index];
      if (payerId === undefined || share === undefined) continue;
      const payerAt = payerIndex.get(payerId);
      if (payerAt === undefined) continue;
      const bucket = sharesByPayer[payerAt];
      if (!bucket) continue;
      bucket.push({ itemId: item.id, name: item.name, share });
      subtotals[payerAt] = (subtotals[payerAt] ?? 0) + share;
    }
  }

  const taxes = allocateCharge(input.tax, subtotals, unassignedWeight);
  const services = allocateCharge(input.serviceCharge, subtotals, unassignedWeight);
  const discounts = allocateCharge(input.discount, subtotals, unassignedWeight);
  const roundings = allocateCharge(rounding, subtotals, unassignedWeight);

  const breakdown: PayerBreakdown[] = input.payers.map((payer, index) => {
    const subtotal = subtotals[index] ?? 0;
    const tax = taxes[index] ?? 0;
    const serviceCharge = services[index] ?? 0;
    const discount = discounts[index] ?? 0;
    const payerRounding = roundings[index] ?? 0;
    return {
      payerId: payer.id,
      name: payer.name,
      items: sharesByPayer[index] ?? [],
      subtotal,
      tax,
      serviceCharge,
      discount,
      rounding: payerRounding,
      total: subtotal + tax + serviceCharge - discount + payerRounding,
    };
  });

  return {
    breakdown,
    unassignedItemIds,
    total: breakdown.reduce((sum, payer) => sum + payer.total, 0),
  };
}

type ItemShareDraft = { itemId: string; name: string; share: number };

function uniqueAssignees(assigneeIds: string[], payerIndex: Map<string, number>): string[] {
  const seen = new Set<string>();
  const assignees: string[] = [];
  for (const id of assigneeIds) {
    if (!payerIndex.has(id) || seen.has(id)) continue;
    seen.add(id);
    assignees.push(id);
  }
  assignees.sort((a, b) => (payerIndex.get(a) ?? 0) - (payerIndex.get(b) ?? 0));
  return assignees;
}

/** Whole-rupiah equal split. The first `amount % count` payers receive one extra rupiah. */
function splitEvenly(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Floor-divide `amount` by weights. The entire leftover goes to the greatest
 * weight, breaking ties toward the earlier index. An unassigned weight soaks
 * up its proportion and is then dropped from the result.
 */
function allocateCharge(amount: number, payerWeights: number[], unassignedWeight: number): number[] {
  if (payerWeights.length === 0) return [];
  const payerSum = payerWeights.reduce((sum, weight) => sum + weight, 0);
  if (payerSum === 0 && unassignedWeight === 0) {
    return distribute(amount, payerWeights.map(() => 1));
  }
  const weights = unassignedWeight > 0 ? [...payerWeights, unassignedWeight] : payerWeights;
  return distribute(amount, weights).slice(0, payerWeights.length);
}

function distribute(amount: number, weights: number[]): number[] {
  const base = weights.reduce((sum, weight) => sum + weight, 0);
  if (base <= 0) {
    throw new Error("Cannot distribute a charge without a positive weight");
  }
  const amountBig = BigInt(amount);
  const baseBig = BigInt(base);
  const floors = weights.map((weight) => Number((amountBig * BigInt(weight)) / baseBig));
  const leftover = amount - floors.reduce((sum, share) => sum + share, 0);
  let largest = 0;
  for (let index = 1; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    const max = weights[largest] ?? 0;
    if (weight > max) largest = index;
  }
  floors[largest] = (floors[largest] ?? 0) + leftover;
  return floors;
}

function assertMoney(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertSignedMoney(label: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
}

function assertUnique(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id "${id}"`);
    seen.add(id);
  }
}
