import { enMessages } from '../locales/en'
import { idMessages, type Messages } from '../locales/id'

const STORAGE_KEY = 'baginota.locale'

export type Locale = 'id' | 'en'

export function useI18n() {
  const locale = useState<Locale>('locale', () => readLocale())

  function setLocale(next: Locale) {
    locale.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next)
  }

  function t(path: string, vars?: Record<string, string | number>): string {
    const messages: Messages = locale.value === 'en' ? enMessages : idMessages
    const value = lookup(messages, path)
    if (!vars) return value
    return value.replace(/\{(\w+)\}/g, (token, key: string) => {
      const replacement = vars[key]
      return replacement === undefined ? token : String(replacement)
    })
  }

  return { locale, setLocale, t }
}

function readLocale(): Locale {
  if (!import.meta.client) return 'id'
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'en' ? 'en' : 'id'
}

function lookup(messages: Messages, path: string): string {
  let node: unknown = messages
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object' || !(key in node)) return path
    node = (node as Record<string, unknown>)[key]
  }
  return typeof node === 'string' ? node : path
}
