import { parsedBillDraftSchema, type ParsedBillDraft } from "@split-bill/shared";

export class DraftNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftNormalizationError";
  }
}

/**
 * A printed total within this many rupiah of the formula is treated as
 * pembulatan. Larger gaps stay visible instead of being hidden in rounding.
 */
const MAX_IMPLIED_ROUNDING = 1_000;

/**
 * Turn a vision-model payload into the shared draft.
 * Line totals are the source of truth. Subtotal and total are recomputed so
 * the draft obeys the same invariants as a saved bill.
 *
 * Tax that is already inside the item prices is left at 0. A pembulatan line,
 * or a printed total within Rp 1.000 of the formula, is stored in rounding.
 */
export function normalizeParsedBill(raw: unknown): ParsedBillDraft {
  const record = asRecord(raw);
  if (!record) {
    throw new DraftNormalizationError("Parsed bill was not an object");
  }

  const items = (Array.isArray(record.items) ? record.items : []).flatMap((entry) => {
    const item = asRecord(entry);
    if (!item) return [];
    const name = typeof item.name === "string" ? item.name.trim() : "";
    let quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1;
    const unitPrice = roundMoney(item.unitPrice) ?? 0;
    let lineTotal = roundMoney(item.lineTotal);
    if ((lineTotal === null || lineTotal === 0) && unitPrice > 0 && quantity > 0) {
      const computed = Math.round(unitPrice * quantity);
      lineTotal = Number.isSafeInteger(computed) ? computed : null;
    }
    if (lineTotal === null) return [];
    if (!name && lineTotal === 0 && unitPrice === 0) return [];
    if (quantity <= 0) quantity = 1;
    return [{ name: name || "Item", quantity, unitPrice, lineTotal }];
  });

  let tax = roundMoney(record.tax) ?? 0;
  const serviceCharge = roundMoney(record.serviceCharge) ?? 0;
  const discount = roundMoney(record.discount) ?? 0;
  let rounding = roundSigned(record.rounding) ?? 0;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const printedTotal = roundSigned(record.total);
  if (record.taxIncluded === true) tax = 0;

  const amountDue = (nextTax: number, nextRounding: number) =>
    subtotal + nextTax + serviceCharge - discount + nextRounding;

  if (printedTotal !== null && tax > 0) {
    const withTax = Math.abs(printedTotal - amountDue(tax, rounding));
    const withoutTax = Math.abs(printedTotal - amountDue(0, rounding));
    if (withoutTax < withTax && withoutTax <= MAX_IMPLIED_ROUNDING) tax = 0;
  }
  if (printedTotal !== null) {
    const gap = printedTotal - amountDue(tax, rounding);
    if (gap !== 0 && Math.abs(gap) <= MAX_IMPLIED_ROUNDING && Number.isSafeInteger(rounding + gap)) {
      rounding += gap;
    }
  }

  const total = amountDue(tax, rounding);
  const currencyRaw = typeof record.currency === "string" ? record.currency.trim().toUpperCase() : "";
  const currency = currencyRaw.length > 0 ? currencyRaw : "IDR";

  const parsed = parsedBillDraftSchema.safeParse({
    currency,
    items,
    subtotal,
    tax,
    serviceCharge,
    discount,
    rounding,
    total,
  });
  if (!parsed.success) {
    throw new DraftNormalizationError("Parsed bill did not match the expected shape");
  }
  return parsed.data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function roundMoney(value: unknown): number | null {
  const rounded = roundSigned(value);
  if (rounded === null) return null;
  return Math.max(0, rounded);
}

function roundSigned(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) return null;
  return rounded;
}
