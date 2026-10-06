import type { BillResponse, BillWrite, ParsedBillDraft } from '@split-bill/shared'

export interface BillApi {
  parse(file: File): Promise<ParsedBillDraft>
  create(body: BillWrite): Promise<BillResponse>
  get(id: string): Promise<BillResponse>
  update(id: string, body: BillWrite): Promise<BillResponse>
}

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
