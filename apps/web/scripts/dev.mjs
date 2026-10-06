import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEV_ENV_FILES, shouldEnableDevMock } from './dev-mock.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const envFiles = DEV_ENV_FILES.filter((name) => existsSync(new URL(`../${name}`, import.meta.url))).map((name) =>
  readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
)

if (shouldEnableDevMock(process.env.NUXT_PUBLIC_USE_MOCK_API, envFiles)) {
  process.env.NUXT_PUBLIC_USE_MOCK_API = 'true'
}

const nuxtBin = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url))
const child = spawn(process.execPath, [nuxtBin, 'dev', '--host', '0.0.0.0', '--port', '3000'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
