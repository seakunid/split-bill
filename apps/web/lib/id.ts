const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

/** Short URL-safe id. Bias from modulo is irrelevant at bill scale. */
export function createId(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let id = ''
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0
    id += ALPHABET[byte % ALPHABET.length]
  }
  return id
}
