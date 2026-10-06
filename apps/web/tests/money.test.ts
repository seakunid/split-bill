import { describe, expect, it } from 'vitest'
import { billTotal, formatRupiah, formatRupiahDigits, parseRupiah } from '../lib/money'

describe('formatRupiah', () => {
  it('formats whole rupiah with an Indonesian thousands separator', () => {
    expect(formatRupiah(12500)).toBe('Rp 12.500')
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(999)).toBe('Rp 999')
    expect(formatRupiah(1000)).toBe('Rp 1.000')
    expect(formatRupiah(1000000)).toBe('Rp 1.000.000')
    expect(formatRupiah(161750)).toBe('Rp 161.750')
  })

  it('rounds to whole rupiah and keeps a leading minus', () => {
    expect(formatRupiah(12.6)).toBe('Rp 13')
    expect(formatRupiah(-12500)).toBe('-Rp 12.500')
  })
})

describe('formatRupiahDigits', () => {
  it('drops the Rp prefix', () => {
    expect(formatRupiahDigits(12500)).toBe('12.500')
    expect(formatRupiahDigits(0)).toBe('0')
  })
})

describe('parseRupiah', () => {
  it('reads grouped and prefixed input', () => {
    expect(parseRupiah('Rp 12.500')).toBe(12500)
    expect(parseRupiah('Rp12.500')).toBe(12500)
    expect(parseRupiah('12.500')).toBe(12500)
    expect(parseRupiah('12500')).toBe(12500)
    expect(parseRupiah('1.000.000')).toBe(1000000)
    expect(parseRupiah('')).toBe(0)
    expect(parseRupiah('Rp')).toBe(0)
    expect(parseRupiah('-Rp 12.500')).toBe(-12500)
  })
})

describe('billTotal', () => {
  it('adds tax and service and subtracts discount', () => {
    expect(billTotal(145000, 14500, 7250, 5000)).toBe(161750)
    expect(billTotal(145000, 14500, 7250, 5000, -250)).toBe(161500)
  })
})
