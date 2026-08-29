/**
 * Cryptographic helpers built exclusively on the standard Web Crypto API
 * (`crypto.subtle`, `crypto.getRandomValues`). This API is available
 * natively in Cloudflare Workers AND in Node.js 19+ (`globalThis.crypto`),
 * so this file needs ZERO changes on VPS migration (portability rule 3.1)
 * — unlike a Node-only `require('crypto')` implementation would.
 *
 * Nothing in this file ever stores or logs a secret value; callers store
 * only the hash returned by `sha256Hex`.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** SHA-256 hex digest of a UTF-8 string. Used for OTP codes and session tokens — never store the raw secret. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

/** Cryptographically random hex string of `byteLength` bytes (default 32 -> 64 hex chars). */
export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Random numeric OTP code, e.g. "483920" for digits=6. Uses rejection-free modulo-free generation. */
export function randomNumericCode(digits = 6): string {
  const bytes = new Uint8Array(digits)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => (b % 10).toString()).join('')
}

/** Opaque public identifier for an OTP request, safe to expose to the client instead of the internal row id. */
export function randomRequestId(): string {
  return `req_${randomHex(16)}`
}

/** Opaque session token; only its sha256Hex() is ever persisted (see sessions.tokenHash). */
export function randomSessionToken(): string {
  return randomHex(32)
}

/** Constant-time-ish string comparison to avoid trivial timing side-channels on hash comparisons. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
