import { createHttpApi } from './http'
import { createMockApi } from './mock'
import type { BillApi } from './types'

export { ApiError } from './errors'
export { createHttpApi } from './http'
export { createMockApi } from './mock'
export type { BillApi, KeyValueStore } from './types'

export function createBillApi(options: { baseUrl: string; useMock: boolean }): BillApi {
  if (options.useMock) return createMockApi()
  return createHttpApi(options.baseUrl)
}

/** Nuxt env overrides arrive as strings. Default is the mock, so the app works before apps/api exists. */
export function resolveUseMockApi(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return true
}
