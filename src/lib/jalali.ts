/**
 * Jalali (Persian solar) date formatting helpers. Pure functions, zero
 * Cloudflare-specific imports (portability rule 3.1) — used wherever a
 * user-facing or PDF-document date needs to be shown in Persian calendar
 * with Persian digits (see src/routes/pdf-test.ts for the existing
 * hand-written example this generalizes).
 */
import { toJalaali } from 'jalaali-js'

const JALALI_MONTH_NAMES_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function toPersianDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)])
}

/** e.g. "۱۸ شهریور ۱۴۰۵" */
export function formatJalaliDateFa(date: Date = new Date()): string {
  const { jy, jm, jd } = toJalaali(date)
  return `${toPersianDigits(jd)} ${JALALI_MONTH_NAMES_FA[jm - 1]} ${toPersianDigits(jy)}`
}
