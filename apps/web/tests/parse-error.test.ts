import { afterEach, describe, expect, it, vi } from 'vitest'
import { enMessages } from '../app/locales/en'
import { idMessages } from '../app/locales/id'
import { createHttpApi } from '../lib/api/http'
import { ApiError } from '../lib/api/errors'
import { clientErrorKey, readParseErrorCode, uploadErrorKey, type UploadErrorInput } from '../lib/api/parse-error'

const id = idMessages.errors
const en = enMessages.errors

function key(input: UploadErrorInput): keyof typeof id {
  return uploadErrorKey(input) as keyof typeof id
}

describe('readParseErrorCode', () => {
  it('reads the optional code and ignores anything else', () => {
    expect(readParseErrorCode('vision_unavailable')).toBe('vision_unavailable')
    expect(readParseErrorCode(' vision_unreadable ')).toBe('vision_unreadable')
    expect(readParseErrorCode(undefined)).toBeUndefined()
    expect(readParseErrorCode(null)).toBeUndefined()
    expect(readParseErrorCode(502)).toBeUndefined()
    expect(readParseErrorCode('')).toBeUndefined()
    expect(readParseErrorCode('other')).toBeUndefined()
  })
})

describe('upload error messages', () => {
  it('maps vision codes and bare 5xx responses in both languages', () => {
    expect(key({ status: 502, serverCode: 'vision_unavailable' })).toBe('VISION_UNAVAILABLE')
    expect(id.VISION_UNAVAILABLE).toContain('tidak tersedia')
    expect(id.VISION_UNAVAILABLE).toContain('manual')
    expect(en.VISION_UNAVAILABLE).toContain('temporarily unavailable')
    expect(en.VISION_UNAVAILABLE).toContain('manually')

    expect(key({ status: 502, serverCode: 'vision_unreadable' })).toBe('VISION_UNREADABLE')
    expect(key({ status: 422, clientCode: 'PARSE_FAILED', serverCode: 'vision_unreadable' })).toBe('VISION_UNREADABLE')
    expect(id.VISION_UNREADABLE).toContain('terang')
    expect(id.VISION_UNREADABLE).toContain('rata')
    expect(en.VISION_UNREADABLE).toContain('good light')
    expect(en.VISION_UNREADABLE).toContain('flat')

    expect(key({ status: 502, clientCode: 'PARSE_FAILED' })).toBe('PARSE_GENERIC')
    expect(key({ status: 500 })).toBe('PARSE_GENERIC')
    expect(key({ status: 504, serverCode: 'nope' })).toBe('PARSE_GENERIC')
    expect(id.PARSE_GENERIC).toBe('Bon tidak terbaca. Coba lagi, atau isi manual.')
    expect(en.PARSE_GENERIC).toBe('Couldn’t read the bill. Try again, or enter it manually.')
  })

  it('keeps 429 and 503 handling even when a code is present', () => {
    expect(key({ status: 429, serverCode: 'vision_unavailable' })).toBe('RATE_LIMITED')
    expect(key({ status: 503, serverCode: 'vision_unavailable', clientCode: 'PARSE_UNAVAILABLE' })).toBe('PARSE_UNAVAILABLE')
    expect(id.PARSE_UNAVAILABLE).toContain('manual')
    expect(en.RATE_LIMITED).toContain('manually')
  })

  it('uses the offline message only when fetch throws', () => {
    expect(key({ status: 0, clientCode: 'NETWORK' })).toBe('NETWORK')
    expect(key({ status: 0 })).toBe('NETWORK')
    expect(key({ status: 0, clientCode: 'CONFIG' })).toBe('CONFIG')
    expect(key({ status: 502, clientCode: 'NETWORK' })).toBe('PARSE_GENERIC')
    expect(key({ status: 502, clientCode: 'NETWORK', serverCode: 'vision_unavailable' })).toBe('VISION_UNAVAILABLE')
    expect(id.NETWORK).not.toContain('mode contoh')
    expect(en.NETWORK).not.toContain('sample mode')
    expect(clientErrorKey('NETWORK', false)).toBe('NETWORK')
    expect(clientErrorKey('NETWORK', true)).toBe('NETWORK_DEV')
    expect(id.NETWORK_DEV).toContain('mode contoh')
    expect(en.NETWORK_DEV).toContain('sample mode')
  })
})

describe('parse HTTP errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the status and optional code from a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Could not parse the bill image', code: 'vision_unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    const api = createHttpApi('http://localhost:3001')
    const error = await api.parse(new File([Uint8Array.from([1])], 'bon.jpg', { type: 'image/jpeg' })).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, serverCode: 'vision_unavailable' })
    expect(uploadErrorKey({ status: 502, serverCode: (error as ApiError).serverCode })).toBe('VISION_UNAVAILABLE')
  })

  it('treats a 502 without a code as a generic server failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Could not parse the bill image' }), { status: 502 })),
    )
    const api = createHttpApi('http://localhost:3001')
    await expect(api.parse(new File([Uint8Array.from([1])], 'bon.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      status: 502,
      serverCode: undefined,
    })
  })

  it('records a thrown fetch as offline and still reads Retry-After on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const api = createHttpApi('http://localhost:3001')
    await expect(api.parse(new File([Uint8Array.from([1])], 'bon.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Too many parse requests' }), {
            status: 429,
            headers: { 'Retry-After': '12' },
          }),
      ),
    )
    await expect(api.parse(new File([Uint8Array.from([1])], 'bon.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      serverCode: undefined,
      retryAfterSeconds: 12,
    })
  })
})
