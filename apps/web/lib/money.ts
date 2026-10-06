/**
 * IDR display: `Rp 12.500` — Indonesian thousands separator, no decimals.
 * Amounts are whole rupiah.
 */

const GROUPED = /\B(?=(\d{3})+(?!\d))/g

export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toString().replace(GROUPED, '.')
  return `${sign}Rp ${digits}`
}

/** Digits only, with thousand separators, for inputs that already show an "Rp" prefix. */
export function formatRupiahDigits(amount: number): string {
  const rounded = Math.abs(Math.round(amount))
  return rounded.toString().replace(GROUPED, '.')
}

/**
 * Accepts `12500`, `12.500`, `Rp 12.500`, and `Rp12.500`.
 * Commas and spaces are ignored. Empty input is 0.
 */
export function parseRupiah(input: string): number {
  const trimmed = input.trim()
  const negative = trimmed.startsWith('-')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return 0
  const value = Number(digits)
  if (!Number.isSafeInteger(value)) return 0
  return negative ? -value : value
}

export function billTotal(
  subtotal: number,
  tax: number,
  serviceCharge: number,
  discount: number,
  rounding = 0,
): number {
  return subtotal + tax + serviceCharge - discount + rounding
}
