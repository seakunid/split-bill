import { parsedBillDraftSchema, type ParsedBillDraft } from "@split-bill/shared";

export class DraftNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftNormalizationError";
  }
}

/**
 * Turn a vision-model payload into the shared draft.
 * Line totals are the source of truth. Subtotal and total are recomputed so
 * the draft obeys the same invariants as a saved bill.
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

  const tax = roundMoney(record.tax) ?? 0;
  const serviceCharge = roundMoney(record.serviceCharge) ?? 0;
  const discount = roundMoney(record.discount) ?? 0;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + tax + serviceCharge - discount;
  const currencyRaw = typeof record.currency === "string" ? record.currency.trim().toUpperCase() : "";
  const currency = currencyRaw.length > 0 ? currencyRaw : "IDR";

  const parsed = parsedBillDraftSchema.safeParse({
    currency,
    items,
    subtotal,
    tax,
    serviceCharge,
    discount,
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
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(Math.max(0, value));
  if (!Number.isSafeInteger(rounded)) return null;
  return rounded;
}
