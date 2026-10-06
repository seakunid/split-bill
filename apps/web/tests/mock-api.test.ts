import { describe, expect, it } from 'vitest'
import { createMockApi } from '../lib/api/mock'
import { ApiError } from '../lib/api/errors'
import type { KeyValueStore } from '../lib/api/types'
import { billTotal } from '../lib/money'
import { SAMPLE_PARSED_BILL } from '../lib/sample-bill'
import type { BillWrite } from '@split-bill/shared'

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

function request(overrides: Partial<BillWrite> = {}): BillWrite {
  const subtotal = 30000
  const tax = 3000
  const serviceCharge = 0
  const discount = 0
  const rounding = 0
  return {
    currency: 'IDR',
    subtotal,
    tax,
    serviceCharge,
    discount,
    rounding,
    total: billTotal(subtotal, tax, serviceCharge, discount, rounding),
    items: [
      { id: 'nasi', name: 'Nasi Goreng', quantity: 1, unitPrice: 20000, lineTotal: 20000 },
      { id: 'teh', name: 'Es Teh', quantity: 2, unitPrice: 5000, lineTotal: 10000 },
    ],
    payers: [
      { id: 'raka', name: 'Raka' },
      { id: 'dina', name: 'Dina' },
    ],
    assignments: [
      { itemId: 'nasi', payerId: 'raka' },
      { itemId: 'teh', payerId: 'raka' },
      { itemId: 'teh', payerId: 'dina' },
    ],
    ...overrides,
  }
}

describe('mock bill api', () => {
  it('parses a sample bill and rejects unreadable files', async () => {
    const api = createMockApi({ store: memoryStore(), delayMs: 0 })
    const parsed = await api.parse(new File([Uint8Array.from([1, 2, 3])], 'bon.jpg', { type: 'image/jpeg' }))
    expect(parsed).toEqual(SAMPLE_PARSED_BILL)

    await expect(api.parse(new File([Uint8Array.from([1])], 'notes.txt', { type: 'text/plain' }))).rejects.toMatchObject({
      code: 'NOT_IMAGE',
    })
    await expect(api.parse(new File([Uint8Array.from([1])], 'bon-error.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      code: 'PARSE_FAILED',
    })
    await expect(api.parse(new File([Uint8Array.from([1])], 'unavailable.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      status: 503,
      code: 'PARSE_UNAVAILABLE',
    })
    await expect(api.parse(new File([Uint8Array.from([1])], 'rate-limit.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    })
  })

  it('saves, reads, and updates a bill', async () => {
    const api = createMockApi({ store: memoryStore(), delayMs: 0 })
    const created = await api.create(request())
    expect(created.id).toMatch(/^[0-9a-z]{12}$/)
    expect(created.imageUrl).toBeNull()
    expect(created.rounding).toBe(0)
    expect(created.breakdown).toHaveLength(2)
    expect(created.breakdown.reduce((sum, payer) => sum + payer.total, 0)).toBe(created.total)
    expect(created.items[0]?.id).toBe('nasi')

    const loaded = await api.get(created.id)
    expect(loaded).toEqual(created)

    const updated = await api.update(created.id, request({ tax: 0, total: 30000 }))
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.tax).toBe(0)
    expect(updated.total).toBe(30000)
    expect(await api.get(created.id)).toEqual(updated)
  })

  it('refuses to save unassigned items or an unknown id', async () => {
    const api = createMockApi({ store: memoryStore(), delayMs: 0 })
    await expect(api.create(request({ assignments: [{ itemId: 'nasi', payerId: 'raka' }] }))).rejects.toBeInstanceOf(ApiError)
    await expect(api.create(request({ assignments: [{ itemId: 'nasi', payerId: 'raka' }] }))).rejects.toMatchObject({
      code: 'UNASSIGNED_ITEM',
    })
    await expect(api.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
