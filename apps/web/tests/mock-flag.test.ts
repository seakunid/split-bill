import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveUseMockApi } from '../lib/api'
import { envFileDefines, shouldEnableDevMock } from '../scripts/dev-mock.mjs'

describe('resolveUseMockApi', () => {
  it('uses the real API unless the flag is explicitly true', () => {
    expect(resolveUseMockApi(undefined)).toBe(false)
    expect(resolveUseMockApi(null)).toBe(false)
    expect(resolveUseMockApi(false)).toBe(false)
    expect(resolveUseMockApi('')).toBe(false)
    expect(resolveUseMockApi('false')).toBe(false)
    expect(resolveUseMockApi('0')).toBe(false)
    expect(resolveUseMockApi('no')).toBe(false)
    expect(resolveUseMockApi(true)).toBe(true)
    expect(resolveUseMockApi('true')).toBe(true)
    expect(resolveUseMockApi('1')).toBe(true)
    expect(resolveUseMockApi(' TRUE ')).toBe(true)
  })
})

describe('shouldEnableDevMock', () => {
  it('turns the mock on only for local dev when the flag is unset', () => {
    expect(shouldEnableDevMock(undefined, [])).toBe(true)
    expect(shouldEnableDevMock('', ['# NUXT_PUBLIC_USE_MOCK_API=false\n'])).toBe(true)
    expect(shouldEnableDevMock('false', [])).toBe(false)
    expect(shouldEnableDevMock('true', [])).toBe(false)
    expect(shouldEnableDevMock(undefined, ['NUXT_PUBLIC_USE_MOCK_API=false\n'])).toBe(false)
    expect(shouldEnableDevMock(undefined, ['NUXT_PUBLIC_USE_MOCK_API=true\n'])).toBe(false)
  })

  it('ignores comments when reading env files', () => {
    expect(envFileDefines('# NUXT_PUBLIC_USE_MOCK_API=true', 'NUXT_PUBLIC_USE_MOCK_API')).toBe(false)
    expect(envFileDefines('NUXT_PUBLIC_USE_MOCK_API=false', 'NUXT_PUBLIC_USE_MOCK_API')).toBe(true)
  })
})

describe('nuxt runtime default', () => {
  it('ships useMockApi as false', () => {
    const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
    expect(config).toMatch(/useMockApi:\s*false/)
  })
})
