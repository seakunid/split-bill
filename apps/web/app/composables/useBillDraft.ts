import { billTotal } from '../../lib/money'
import { createId } from '../../lib/id'
import type { AssignmentInput, BillResponse, BillWrite, ParsedBillDraft, ParsedItem } from '@split-bill/shared'

const STORAGE_KEY = 'baginota.draft.v1'

export interface DraftItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface DraftPayer {
  id: string
  name: string
}

export interface BillDraft {
  billId: string | null
  currency: string
  items: DraftItem[]
  tax: number
  serviceCharge: number
  discount: number
  rounding: number
  payers: DraftPayer[]
  assignments: AssignmentInput[]
}

export function useBillDraft() {
  const draft = useState<BillDraft>('bill-draft', loadDraft)
  const watching = useState('bill-draft-watching', () => false)
  if (import.meta.client && !watching.value) {
    watching.value = true
    watch(draft, persistDraft, { deep: true, flush: 'sync' })
  }

  const subtotal = computed(() => draft.value.items.reduce((sum, item) => sum + item.lineTotal, 0))
  const total = computed(() =>
    billTotal(subtotal.value, draft.value.tax, draft.value.serviceCharge, draft.value.discount, draft.value.rounding),
  )

  function startFromParsed(parsed: ParsedBillDraft) {
    draft.value = {
      billId: null,
      currency: parsed.currency || 'IDR',
      items: parsed.items.map(normalizeParsedItem),
      tax: nonNegative(parsed.tax),
      serviceCharge: nonNegative(parsed.serviceCharge),
      discount: nonNegative(parsed.discount),
      rounding: signedInt(parsed.rounding),
      payers: [],
      assignments: [],
    }
  }

  function startManual() {
    draft.value = {
      billId: null,
      currency: 'IDR',
      items: [blankItem()],
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      rounding: 0,
      payers: [],
      assignments: [],
    }
  }

  function startFromBill(bill: BillResponse) {
    draft.value = {
      billId: bill.id,
      currency: bill.currency || 'IDR',
      items: bill.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      tax: bill.tax,
      serviceCharge: bill.serviceCharge,
      discount: bill.discount,
      rounding: signedInt(bill.rounding),
      payers: bill.payers.map((payer) => ({ id: payer.id, name: payer.name })),
      assignments: bill.assignments.map((assignment) => ({ ...assignment })),
    }
  }

  function clear() {
    draft.value = emptyDraft()
  }

  function addItem() {
    draft.value.items.push(blankItem())
  }

  function removeItem(id: string) {
    draft.value.items = draft.value.items.filter((item) => item.id !== id)
    draft.value.assignments = draft.value.assignments.filter((assignment) => assignment.itemId !== id)
  }

  function setQuantity(item: DraftItem, quantity: number) {
    const next = Math.min(99, Math.max(1, Math.round(quantity) || 1))
    item.quantity = next
    item.lineTotal = Math.round(next * item.unitPrice)
  }

  function setUnitPrice(item: DraftItem, unitPrice: number) {
    item.unitPrice = Math.max(0, Math.round(unitPrice))
    item.lineTotal = Math.round(item.quantity * item.unitPrice)
  }

  function addPayer(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    draft.value.payers.push({ id: createId(), name: trimmed.slice(0, 120) })
  }

  function removePayer(id: string) {
    draft.value.payers = draft.value.payers.filter((payer) => payer.id !== id)
    draft.value.assignments = draft.value.assignments.filter((assignment) => assignment.payerId !== id)
  }

  function isAssigned(itemId: string, payerId: string) {
    return draft.value.assignments.some((assignment) => assignment.itemId === itemId && assignment.payerId === payerId)
  }

  function toggleAssignment(itemId: string, payerId: string) {
    if (isAssigned(itemId, payerId)) {
      draft.value.assignments = draft.value.assignments.filter(
        (assignment) => !(assignment.itemId === itemId && assignment.payerId === payerId),
      )
      return
    }
    draft.value.assignments.push({ itemId, payerId })
  }

  function assignEveryone(itemId: string) {
    for (const payer of draft.value.payers) {
      if (!isAssigned(itemId, payer.id)) draft.value.assignments.push({ itemId, payerId: payer.id })
    }
  }

  return {
    draft,
    subtotal,
    total,
    startFromParsed,
    startManual,
    startFromBill,
    clear,
    addItem,
    removeItem,
    setQuantity,
    setUnitPrice,
    addPayer,
    removePayer,
    isAssigned,
    toggleAssignment,
    assignEveryone,
  }
}

export function toBillWrite(draft: BillDraft): BillWrite {
  const subtotal = draft.items.reduce((sum, item) => sum + item.lineTotal, 0)
  const rounding = draft.rounding ?? 0
  return {
    currency: draft.currency || 'IDR',
    subtotal,
    tax: draft.tax,
    serviceCharge: draft.serviceCharge,
    discount: draft.discount,
    rounding,
    total: billTotal(subtotal, draft.tax, draft.serviceCharge, draft.discount, rounding),
    items: draft.items.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    payers: draft.payers.map((payer) => ({ id: payer.id, name: payer.name.trim() })),
    assignments: draft.assignments.filter(
      (assignment) =>
        draft.items.some((item) => item.id === assignment.itemId) &&
        draft.payers.some((payer) => payer.id === assignment.payerId),
    ),
  }
}

function blankItem(): DraftItem {
  return { id: createId(), name: '', quantity: 1, unitPrice: 0, lineTotal: 0 }
}

function normalizeParsedItem(item: ParsedItem): DraftItem {
  const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1
  return {
    id: createId(),
    name: item.name,
    quantity,
    unitPrice: nonNegative(item.unitPrice),
    lineTotal: nonNegative(item.lineTotal),
  }
}

function signedInt(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.round(value)
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

function emptyDraft(): BillDraft {
  return {
    billId: null,
    currency: 'IDR',
    items: [],
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    rounding: 0,
    payers: [],
    assignments: [],
  }
}

function loadDraft(): BillDraft {
  if (!import.meta.client) return emptyDraft()
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDraft()
    return sanitizeDraft(JSON.parse(raw))
  } catch {
    return emptyDraft()
  }
}

function persistDraft(value: BillDraft) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function sanitizeDraft(value: unknown): BillDraft {
  if (!value || typeof value !== 'object') return emptyDraft()
  const record = value as Record<string, unknown>
  const items = Array.isArray(record.items) ? record.items.map(sanitizeItem).filter((item) => item !== null) : []
  const payers = Array.isArray(record.payers) ? record.payers.map(sanitizePayer).filter((payer) => payer !== null) : []
  const payerIds = new Set(payers.map((payer) => payer.id))
  const itemIds = new Set(items.map((item) => item.id))
  const assignments = Array.isArray(record.assignments)
    ? record.assignments.filter((assignment): assignment is AssignmentInput => {
        if (!assignment || typeof assignment !== 'object') return false
        const row = assignment as Record<string, unknown>
        return typeof row.itemId === 'string' && typeof row.payerId === 'string' && itemIds.has(row.itemId) && payerIds.has(row.payerId)
      })
    : []
  return {
    billId: typeof record.billId === 'string' ? record.billId : null,
    currency: typeof record.currency === 'string' && record.currency ? record.currency : 'IDR',
    items,
    tax: nonNegative(typeof record.tax === 'number' ? record.tax : 0),
    serviceCharge: nonNegative(typeof record.serviceCharge === 'number' ? record.serviceCharge : 0),
    discount: nonNegative(typeof record.discount === 'number' ? record.discount : 0),
    rounding: signedInt(typeof record.rounding === 'number' ? record.rounding : 0),
    payers,
    assignments,
  }
}

function sanitizeItem(value: unknown): DraftItem | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  const quantity = typeof record.quantity === 'number' && record.quantity >= 1 ? Math.round(record.quantity) : 1
  const unitPrice = nonNegative(typeof record.unitPrice === 'number' ? record.unitPrice : 0)
  const lineTotal = quantity * unitPrice
  return { id: record.id, name: record.name, quantity, unitPrice, lineTotal }
}

function sanitizePayer(value: unknown): DraftPayer | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  return { id: record.id, name: record.name }
}
