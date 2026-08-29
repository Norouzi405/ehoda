/**
 * Iranian mobile phone number normalization/validation (spec §8.1: login by
 * mobile number). Accepts common local input formats and normalizes to
 * E.164 (+989xxxxxxxxx) — the only format ever persisted to `users.phoneNumber`.
 */
const IRAN_MOBILE_E164 = /^\+989\d{9}$/

/**
 * Normalizes user-entered Iranian mobile numbers to E.164.
 * Accepts: 09121234567, 9121234567, 00989121234567, +989121234567.
 * Returns null if the input cannot be normalized to a valid Iranian mobile number.
 */
export function normalizeIranPhone(raw: string): string | null {
  if (!raw) return null
  let digits = raw.trim().replace(/[\s\-()]/g, '')

  // Convert Persian/Arabic-Indic digits to ASCII first.
  digits = digits.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  digits = digits.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

  if (digits.startsWith('+98')) digits = digits.slice(3)
  else if (digits.startsWith('0098')) digits = digits.slice(4)
  else if (digits.startsWith('98')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)

  if (!/^9\d{9}$/.test(digits)) return null

  const normalized = `+98${digits}`
  return IRAN_MOBILE_E164.test(normalized) ? normalized : null
}

export function isValidIranPhone(raw: string): boolean {
  return normalizeIranPhone(raw) !== null
}
