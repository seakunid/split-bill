import { describe, expect, it } from 'vitest'
import { parseRetryAfter } from '../lib/api/errors'

describe('parseRetryAfter', () => {
  it('reads delta-seconds and HTTP dates', () => {
    expect(parseRetryAfter('30')).toBe(30)
    expect(parseRetryAfter(null)).toBeUndefined()
    const now = Date.parse('2026-10-06T08:00:00.000Z')
    expect(parseRetryAfter('Tue, 06 Oct 2026 08:00:45 GMT', now)).toBe(45)
  })
})
