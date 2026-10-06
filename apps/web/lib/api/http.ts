import type { BillResponse, BillWrite, ParsedBillDraft } from '@split-bill/shared'
import { ApiError, parseRetryAfter } from './errors'
import type { BillApi } from './types'

export function createHttpApi(baseUrl: string): BillApi {
  const base = baseUrl.replace(/\/+$/, '')

  return {
    parse(file) {
      const body = new FormData()
      body.append('image', file)
      return request<ParsedBillDraft>(`${base}/bills/parse`, { method: 'POST', body })
    },
    create(payload) {
      return request<BillResponse>(`${base}/bills`, { method: 'POST', json: payload })
    },
    get(id) {
      return request<BillResponse>(`${base}/bills/${encodeURIComponent(id)}`)
    },
    update(id, payload) {
      return request<BillResponse>(`${base}/bills/${encodeURIComponent(id)}`, {
        method: 'PUT',
        json: payload,
      })
    },
  }
}

async function request<T>(url: string, init: { method?: string; body?: BodyInit; json?: BillWrite } = {}): Promise<T> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new ApiError('API base URL is not configured', 0, 'CONFIG')
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      body: init.json ? JSON.stringify(init.json) : init.body,
      headers: init.json
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      credentials: 'omit',
    })
  } catch {
    throw new ApiError('Network error', 0, 'NETWORK')
  }

  if (!response.ok) {
    const parsed = await readError(response)
    throw new ApiError(parsed.message, response.status, statusCode(response.status), {
      issues: parsed.issues,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    })
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('Response was not JSON', response.status, 'INVALID_RESPONSE')
  }
}

async function readError(response: Response): Promise<{ message: string; issues?: ApiError['issues'] }> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      const message = typeof record.error === 'string' && record.error
        ? record.error
        : typeof record.message === 'string' && record.message
          ? record.message
          : response.statusText || `HTTP ${response.status}`
      const issues = Array.isArray(record.issues) ? record.issues.filter(isIssue) : undefined
      return { message, issues }
    }
  } catch {
    // Fall through to the status text.
  }
  return { message: response.statusText || `HTTP ${response.status}` }
}

function isIssue(value: unknown): value is ApiError['issues'][number] {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.code === 'string' && typeof record.message === 'string'
}

function statusCode(status: number): string {
  if (status === 503) return 'PARSE_UNAVAILABLE'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 404) return 'NOT_FOUND'
  if (status === 415) return 'NOT_IMAGE'
  if (status === 413) return 'TOO_LARGE'
  if (status === 422 || status === 502) return 'PARSE_FAILED'
  if (status === 400 || status === 409) return 'VALIDATION'
  return 'HTTP'
}
