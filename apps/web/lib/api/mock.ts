import { calculateSplit, validateBillWrite, type BillResponse, type BillWrite } from '@split-bill/shared'
import { createId } from '../id'
import { SAMPLE_PARSED_BILL } from '../sample-bill'
import { ApiError } from './errors'
import type { BillApi, KeyValueStore } from './types'

const STORAGE_KEY = 'baginota.bills.v1'

export function createMockApi(options?: { store?: KeyValueStore; delayMs?: number }): BillApi {
  const store = options?.store ?? browserStore()
  const delayMs = options?.delayMs ?? 800

  return {
    async parse(file) {
      await wait(delayMs)
      if (file.size === 0) throw new ApiError('Empty file', 400, 'EMPTY_FILE')
      if (!file.type.startsWith('image/')) throw new ApiError('Image must be JPEG, PNG, WebP, or GIF', 415, 'NOT_IMAGE')
      if (file.size > 8 * 1024 * 1024) throw new ApiError('Image exceeds the 8 MB limit', 413, 'TOO_LARGE')
      if (/unavailable|not-configured|503/i.test(file.name)) {
        throw new ApiError('Bill parsing is not configured', 503, 'PARSE_UNAVAILABLE')
      }
      if (/rate|429/i.test(file.name)) {
        throw new ApiError('Too many parse requests', 429, 'RATE_LIMITED', { retryAfterSeconds: 30 })
      }
      if (/fail|error/i.test(file.name)) throw new ApiError('Could not parse the bill image', 422, 'PARSE_FAILED')
      return structuredClone(SAMPLE_PARSED_BILL)
    },

    async create(body) {
      await wait(delayMs)
      const saved = buildBill(createId(12), body, new Date().toISOString(), null)
      const all = readAll(store)
      all[saved.id] = saved
      writeAll(store, all)
      return structuredClone(saved)
    },

    async get(id) {
      await wait(Math.min(delayMs, 200))
      const bill = readAll(store)[id]
      if (!bill) throw new ApiError('Bill not found', 404, 'NOT_FOUND')
      return structuredClone(bill)
    },

    async update(id, body) {
      await wait(delayMs)
      const all = readAll(store)
      const existing = all[id]
      if (!existing) throw new ApiError('Bill not found', 404, 'NOT_FOUND')
      const saved = buildBill(id, body, new Date().toISOString(), existing.createdAt)
      all[id] = saved
      writeAll(store, all)
      return structuredClone(saved)
    },
  }
}

function buildBill(id: string, body: BillWrite, now: string, createdAt: string | null): BillResponse {
  const issues = validateBillWrite(normalizeWrite(body))
  if (issues.length > 0) {
    const first = issues[0]
    throw new ApiError(first?.message ?? 'Bill failed validation', 400, first?.code ?? 'VALIDATION', {
      issues: issues.map((issue) => ({ code: issue.code, message: issue.message, itemId: issue.itemId, payerId: issue.payerId })),
    })
  }

  const rounding = body.rounding ?? 0
  const items = body.items.map((item) => ({
    id: item.id,
    name: item.name.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }))
  const payers = body.payers.map((payer) => ({ id: payer.id, name: payer.name.trim() }))
  const assignments = dedupeAssignments(body)
  const split = calculateSplit({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      lineTotal: item.lineTotal,
      assigneeIds: assignments.filter((assignment) => assignment.itemId === item.id).map((assignment) => assignment.payerId),
    })),
    payers,
    tax: body.tax,
    serviceCharge: body.serviceCharge,
    discount: body.discount,
    rounding,
  })

  return {
    id,
    currency: body.currency,
    items,
    payers,
    assignments,
    subtotal: body.subtotal,
    tax: body.tax,
    serviceCharge: body.serviceCharge,
    discount: body.discount,
    rounding,
    total: body.total,
    imageUrl: body.imageUrl ?? null,
    breakdown: split.breakdown,
    createdAt: createdAt ?? now,
    updatedAt: now,
  }
}

function normalizeWrite(body: BillWrite): BillWrite {
  return { ...body, rounding: body.rounding ?? 0 }
}

function dedupeAssignments(body: BillWrite): BillResponse['assignments'] {
  const seen = new Set<string>()
  const assignments: BillResponse['assignments'] = []
  for (const assignment of body.assignments) {
    const key = `${assignment.itemId}:${assignment.payerId}`
    if (seen.has(key)) continue
    seen.add(key)
    assignments.push({ itemId: assignment.itemId, payerId: assignment.payerId })
  }
  return assignments
}

function readAll(store: KeyValueStore): Record<string, BillResponse> {
  const raw = store.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, BillResponse>
  } catch {
    return {}
  }
}

function writeAll(store: KeyValueStore, bills: Record<string, BillResponse>): void {
  store.setItem(STORAGE_KEY, JSON.stringify(bills))
}

function browserStore(): KeyValueStore {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
