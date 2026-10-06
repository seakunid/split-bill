/** Dev-only env files Nuxt loads for `nuxt dev`. Production builds do not use these. */
export const DEV_ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local']

export function envFileDefines(text, name) {
  return text.split('\n').some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return false
    const eq = trimmed.indexOf('=')
    if (eq === -1) return false
    return trimmed.slice(0, eq).trim() === name
  })
}

/**
 * Local `pnpm dev` turns the mock on only when the flag is unset in the
 * shell and in the dev env files. An explicit false keeps the real API.
 */
export function shouldEnableDevMock(envValue, envFileTexts) {
  const unset = envValue === undefined || String(envValue).trim() === ''
  if (!unset) return false
  return !envFileTexts.some((text) => envFileDefines(text, 'NUXT_PUBLIC_USE_MOCK_API'))
}
