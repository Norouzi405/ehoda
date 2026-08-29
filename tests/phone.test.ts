import { describe, it, expect } from 'vitest'
import { normalizeIranPhone, isValidIranPhone } from '../src/lib/phone'

describe('normalizeIranPhone', () => {
  it('normalizes common local formats to E.164', () => {
    expect(normalizeIranPhone('09121234567')).toBe('+989121234567')
    expect(normalizeIranPhone('9121234567')).toBe('+989121234567')
    expect(normalizeIranPhone('00989121234567')).toBe('+989121234567')
    expect(normalizeIranPhone('+989121234567')).toBe('+989121234567')
  })

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizeIranPhone('0912 123 4567')).toBe('+989121234567')
    expect(normalizeIranPhone('0912-123-4567')).toBe('+989121234567')
  })

  it('converts Persian digits', () => {
    expect(normalizeIranPhone('۰۹۱۲۱۲۳۴۵۶۷')).toBe('+989121234567')
  })

  it('rejects invalid numbers', () => {
    expect(normalizeIranPhone('123')).toBeNull()
    expect(normalizeIranPhone('08121234567')).toBeNull() // must start with 9 after leading 0
    expect(normalizeIranPhone('')).toBeNull()
    expect(normalizeIranPhone('+14155552671')).toBeNull() // non-Iranian number
  })
})

describe('isValidIranPhone', () => {
  it('mirrors normalizeIranPhone success/failure', () => {
    expect(isValidIranPhone('09121234567')).toBe(true)
    expect(isValidIranPhone('123')).toBe(false)
  })
})
