/**
 * Optional `code` on `{ error }` bodies from `POST /bills/parse`.
 *
 * This matches the field PR #4 adds to `@split-bill/shared` `ApiError`
 * (`vision_unavailable` | `vision_unreadable`). That change is not on main
 * yet, so the field is read locally and ignored when it is missing or not a
 * string. After #4 merges, switch this alias to the shared type.
 */
export const parseErrorCodes = ['vision_unavailable', 'vision_unreadable'] as const

export type ParseErrorCode = (typeof parseErrorCodes)[number]

export function readParseErrorCode(value: unknown): ParseErrorCode | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return (parseErrorCodes as readonly string[]).includes(normalized) ? (normalized as ParseErrorCode) : undefined
}

export type UploadErrorInput = {
  /** `0` when `fetch` threw (offline, DNS, or a CORS failure that hides the response). */
  status: number
  /** Client classification such as `NETWORK`, `PARSE_FAILED`, or `CONFIG`. */
  clientCode?: string
  /** Optional body `code`. Unknown values are ignored. */
  serverCode?: unknown
}

/**
 * Message key for the upload screen.
 * A real HTTP status never maps to the offline/CORS message.
 * 429 and 503 keep their existing keys even if a `code` is present.
 */
export function uploadErrorKey(input: UploadErrorInput): string {
  if (input.status > 0) {
    if (input.status === 429) return 'RATE_LIMITED'
    if (input.status === 503) return 'PARSE_UNAVAILABLE'
    const serverCode = readParseErrorCode(input.serverCode)
    if (serverCode === 'vision_unavailable') return 'VISION_UNAVAILABLE'
    if (serverCode === 'vision_unreadable') return 'VISION_UNREADABLE'
    if (input.status >= 500) return 'PARSE_GENERIC'
    return input.clientCode && input.clientCode !== 'NETWORK' ? input.clientCode : 'HTTP'
  }
  return input.clientCode === 'CONFIG' ? 'CONFIG' : 'NETWORK'
}

/** The sample-mode hint is dev-only. Production builds use `NETWORK`. */
export function clientErrorKey(code: string, dev: boolean): string {
  if (code === 'NETWORK' && dev) return 'NETWORK_DEV'
  return code
}
