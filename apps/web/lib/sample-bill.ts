import type { ParsedBillDraft } from '@split-bill/shared'

/** Cafe bill returned by the mock parser. Includes a negative pembulatan. */
export const SAMPLE_PARSED_BILL: ParsedBillDraft = {
  currency: 'IDR',
  items: [
    { name: 'Nasi Goreng Spesial', quantity: 2, unitPrice: 28000, lineTotal: 56000 },
    { name: 'Ayam Bakar', quantity: 1, unitPrice: 45000, lineTotal: 45000 },
    { name: 'Es Jeruk', quantity: 3, unitPrice: 12000, lineTotal: 36000 },
    { name: 'Kerupuk', quantity: 1, unitPrice: 8000, lineTotal: 8000 },
  ],
  subtotal: 145000,
  tax: 14500,
  serviceCharge: 7250,
  discount: 5000,
  rounding: -250,
  total: 161500,
}
