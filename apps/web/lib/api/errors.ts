import type { ApiError as ApiErrorBody } from '@split-bill/shared'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Optional parse `code` from the JSON body. Absent on older responses and on 429. */
  readonly serverCode?: ApiErrorBody['code']
  readonly issues: NonNullable<ApiErrorBody['issues']>
  readonly retryAfterSeconds?: number

  constructor(
    message: string,
    status: number,
    code: string,
    extras?: {
      issues?: NonNullable<ApiErrorBody['issues']>
      retryAfterSeconds?: number
      serverCode?: ApiErrorBody['code']
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.serverCode = extras?.serverCode
    this.issues = extras?.issues ?? []
    this.retryAfterSeconds = extras?.retryAfterSeconds
  }
}

/** `Retry-After` may be delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - now) / 1000))
}
