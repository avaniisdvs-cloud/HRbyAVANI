import { describe, it, expect } from 'vitest'
import {
  formatCompanyMoney,
  roundCompanyMoney,
  getCurrencyPrecision,
  parseMoney,
  applyRounding,
  DEFAULT_CURRENCY_CONFIG,
} from '@/lib/utils/currency-format'
import type { CurrencyConfig } from '@/lib/utils/currency-format'

// ── Fixture configs ──────────────────────────────────────────────────────────

const AED: CurrencyConfig = {
  currencyCode:   'AED',
  currencySymbol: 'AED',
  decimalPlaces:  2,
  roundingMethod: 'HALF_UP',
}

const KWD: CurrencyConfig = {
  currencyCode:   'KWD',
  currencySymbol: 'KD',
  decimalPlaces:  3,
  roundingMethod: 'HALF_UP',
}

const JPY: CurrencyConfig = {
  currencyCode:   'JPY',
  currencySymbol: '¥',
  decimalPlaces:  0,
  roundingMethod: 'HALF_UP',
}

const USD_HALF_EVEN: CurrencyConfig = {
  currencyCode:   'USD',
  currencySymbol: '$',
  decimalPlaces:  2,
  roundingMethod: 'HALF_EVEN',
}

// ── DEFAULT_CURRENCY_CONFIG ──────────────────────────────────────────────────

describe('DEFAULT_CURRENCY_CONFIG', () => {
  it('defaults to AED / 2 dp / HALF_UP — BR-CCY-002', () => {
    expect(DEFAULT_CURRENCY_CONFIG.currencyCode).toBe('AED')
    expect(DEFAULT_CURRENCY_CONFIG.decimalPlaces).toBe(2)
    expect(DEFAULT_CURRENCY_CONFIG.roundingMethod).toBe('HALF_UP')
  })
})

// ── Decimal places: 0–6 ─────────────────────────────────────────────────────

describe('decimal places range validation', () => {
  it('formats correctly with 0 decimal places (JPY)', () => {
    expect(formatCompanyMoney(1500.9, JPY, { noSymbol: true })).toBe('1,501')
  })

  it('formats correctly with 2 decimal places (AED)', () => {
    expect(formatCompanyMoney(15000.5, AED, { noSymbol: true })).toBe('15,000.50')
  })

  it('formats correctly with 3 decimal places (KWD)', () => {
    expect(formatCompanyMoney(1500.1234, KWD, { noSymbol: true })).toBe('1,500.123')
  })

  it('formats correctly with 6 decimal places', () => {
    const sixDp: CurrencyConfig = { ...AED, decimalPlaces: 6 }
    expect(formatCompanyMoney(1.123456789, sixDp, { noSymbol: true })).toBe('1.123457')
  })
})

// ── formatCompanyMoney ───────────────────────────────────────────────────────

describe('formatCompanyMoney', () => {
  it('includes currency code prefix for AED', () => {
    expect(formatCompanyMoney(1000, AED)).toBe('AED 1,000.00')
  })

  it('uses symbol for short symbols (JPY ¥)', () => {
    expect(formatCompanyMoney(1000, JPY)).toBe('¥ 1,000')
  })

  it('uses currency code for KWD (multi-char symbol KD)', () => {
    // KD is 2 chars, ≤ 3, so it uses the symbol
    expect(formatCompanyMoney(1000.123, KWD)).toBe('KD 1,000.123')
  })

  it('adds thousands separators', () => {
    expect(formatCompanyMoney(1_000_000, AED, { noSymbol: true })).toBe('1,000,000.00')
  })

  it('noSymbol option returns only number string', () => {
    expect(formatCompanyMoney(5000.5, AED, { noSymbol: true })).toBe('5,000.50')
  })

  it('noCommas option skips thousands separators (Excel export)', () => {
    expect(formatCompanyMoney(1_234_567.89, AED, { noCommas: true })).toBe('AED 1234567.89')
  })

  it('defaults to AED config when called with no config — BR-CCY-002', () => {
    expect(formatCompanyMoney(100)).toBe('AED 100.00')
  })

  it('handles zero correctly', () => {
    expect(formatCompanyMoney(0, AED)).toBe('AED 0.00')
  })

  it('handles negative amounts', () => {
    expect(formatCompanyMoney(-500.5, AED, { noSymbol: true })).toBe('-500.50')
  })

  it('KWD 3-decimal config formats correctly', () => {
    expect(formatCompanyMoney(10_000.500, KWD, { noSymbol: true })).toBe('10,000.500')
  })

  it('JPY 0-decimal rounds and formats correctly', () => {
    expect(formatCompanyMoney(999.9, JPY, { noSymbol: true })).toBe('1,000')
  })
})

// ── roundCompanyMoney — rounding methods ────────────────────────────────────

describe('roundCompanyMoney', () => {
  it('HALF_UP: 2.345 → 2.35 at 2dp', () => {
    expect(roundCompanyMoney(2.345, AED)).toBe(2.35)
  })

  it('HALF_UP: 2.344 → 2.34 at 2dp', () => {
    expect(roundCompanyMoney(2.344, AED)).toBe(2.34)
  })

  it('FLOOR: 2.999 → 2.99 at 2dp', () => {
    const cfg: CurrencyConfig = { ...AED, roundingMethod: 'FLOOR' }
    expect(roundCompanyMoney(2.999, cfg)).toBe(2.99)
  })

  it('CEIL: 2.001 → 2.01 at 2dp', () => {
    const cfg: CurrencyConfig = { ...AED, roundingMethod: 'CEIL' }
    expect(roundCompanyMoney(2.001, cfg)).toBe(2.01)
  })

  it('TRUNCATE: 2.999 → 2.99 at 2dp', () => {
    const cfg: CurrencyConfig = { ...AED, roundingMethod: 'TRUNCATE' }
    expect(roundCompanyMoney(2.999, cfg)).toBe(2.99)
  })

  it('HALF_EVEN (banker\'s): 2.5 rounds to 2 (even) at 0dp', () => {
    expect(applyRounding(2.5, 0, 'HALF_EVEN')).toBe(2)
  })

  it('HALF_EVEN (banker\'s): 3.5 rounds to 4 (even) at 0dp', () => {
    expect(applyRounding(3.5, 0, 'HALF_EVEN')).toBe(4)
  })

  it('defaults to AED / HALF_UP with no config — BR-CCY-002', () => {
    expect(roundCompanyMoney(10.555)).toBe(10.56)
  })
})

// ── getCurrencyPrecision ─────────────────────────────────────────────────────

describe('getCurrencyPrecision', () => {
  it('returns decimalPlaces from config', () => {
    expect(getCurrencyPrecision(KWD)).toBe(3)
    expect(getCurrencyPrecision(JPY)).toBe(0)
    expect(getCurrencyPrecision(AED)).toBe(2)
  })

  it('defaults to 2 when no config provided — BR-CCY-002', () => {
    expect(getCurrencyPrecision()).toBe(2)
  })
})

// ── parseMoney ───────────────────────────────────────────────────────────────

describe('parseMoney', () => {
  it('parses formatted AED strings', () => {
    expect(parseMoney('AED 1,000.00')).toBe(1000)
  })

  it('parses plain numeric strings', () => {
    expect(parseMoney('15000.50')).toBe(15000.5)
  })

  it('parses negative values', () => {
    expect(parseMoney('-500.25')).toBe(-500.25)
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('N/A')).toBe(0)
  })
})

// ── Validation rule coverage ─────────────────────────────────────────────────

describe('currency code validation (mirrors Zod schema)', () => {
  it('accepts valid 3-uppercase-letter codes', () => {
    const validCodes = ['AED', 'USD', 'KWD', 'JPY', 'EUR', 'SAR']
    validCodes.forEach(code => {
      expect(/^[A-Z]{3}$/.test(code)).toBe(true)
    })
  })

  it('rejects lowercase, numeric, or wrong-length codes', () => {
    const invalid = ['aed', 'US', 'USDT', '123', '']
    invalid.forEach(code => {
      expect(/^[A-Z]{3}$/.test(code)).toBe(false)
    })
  })
})

describe('decimal places boundary validation', () => {
  it('accepts 0 (minimum)', () => {
    const cfg: CurrencyConfig = { ...AED, decimalPlaces: 0 }
    expect(formatCompanyMoney(100.999, cfg, { noSymbol: true })).toBe('101')
  })

  it('accepts 6 (maximum)', () => {
    const cfg: CurrencyConfig = { ...AED, decimalPlaces: 6 }
    expect(formatCompanyMoney(1.1, cfg, { noSymbol: true })).toBe('1.100000')
  })
})
