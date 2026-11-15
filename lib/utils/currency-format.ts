/**
 * Company-aware money formatting utilities — BR-CCY-002.
 *
 * All functions accept an optional CurrencyConfig to avoid repeated DB look-ups.
 * When called without a config, AED / 2 decimal places / HALF_UP is the default
 * so existing pages continue working before currency setup is configured.
 */

export type RoundingMethod = 'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL' | 'TRUNCATE'

export interface CurrencyConfig {
  currencyCode:   string
  currencySymbol: string
  decimalPlaces:  number
  roundingMethod: RoundingMethod
}

/** BR-CCY-002: System default — AED, 2 dp, HALF_UP */
export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  currencyCode:   'AED',
  currencySymbol: 'AED',
  decimalPlaces:  2,
  roundingMethod: 'HALF_UP',
}

// ── Rounding ────────────────────────────────────────────────────────────────

/**
 * Apply the configured rounding method to `amount` at `decimalPlaces` precision.
 */
export function applyRounding(
  amount: number,
  decimalPlaces: number,
  method: RoundingMethod,
): number {
  const factor = Math.pow(10, decimalPlaces)

  switch (method) {
    case 'HALF_UP':
      return Math.round(amount * factor) / factor

    case 'HALF_EVEN': {
      // Banker's rounding — round half to nearest even digit
      const shifted = amount * factor
      const floor   = Math.floor(shifted)
      const diff    = shifted - floor
      if (Math.abs(diff - 0.5) < Number.EPSILON) {
        return (floor % 2 === 0 ? floor : floor + 1) / factor
      }
      return Math.round(shifted) / factor
    }

    case 'FLOOR':
      return Math.floor(amount * factor) / factor

    case 'CEIL':
      return Math.ceil(amount * factor) / factor

    case 'TRUNCATE':
      return Math.trunc(amount * factor) / factor

    default:
      return Math.round(amount * factor) / factor
  }
}

/**
 * Round an amount using company currency config.
 * Defaults to AED / 2 dp / HALF_UP (BR-CCY-002).
 */
export function roundCompanyMoney(
  amount: number,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): number {
  return applyRounding(amount, config.decimalPlaces, config.roundingMethod)
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format `amount` as a display string using company currency config.
 *
 * Output examples:
 *   formatCompanyMoney(15000.5, aedConfig)   → "AED 15,000.50"
 *   formatCompanyMoney(1500000, kwdConfig)   → "KWD 1,500,000.000"
 *   formatCompanyMoney(1500, jpyConfig)      → "¥ 1,500"
 *
 * @param amount      - Numeric amount (unrounded)
 * @param config      - Currency config; defaults to AED/2dp/HALF_UP
 * @param options.noSymbol  - Omit currency symbol/code prefix
 * @param options.noCommas  - Omit thousands separators (useful for Excel export)
 */
export function formatCompanyMoney(
  amount: number,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
  options: { noSymbol?: boolean; noCommas?: boolean } = {},
): string {
  const rounded = roundCompanyMoney(amount, config)
  const fixed   = rounded.toFixed(config.decimalPlaces)

  let formatted: string
  if (options.noCommas) {
    formatted = fixed
  } else {
    // Add thousands separator
    const [integer, decimal] = fixed.split('.')
    const withCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    formatted = decimal !== undefined ? `${withCommas}.${decimal}` : withCommas
  }

  if (options.noSymbol) return formatted

  const prefix = config.currencySymbol.length <= 3
    ? config.currencySymbol   // e.g. "¥", "€"
    : config.currencyCode     // e.g. "AED", "KWD" — use code when symbol is long

  return `${prefix} ${formatted}`
}

/**
 * Return the number of decimal places for a given config.
 * Defaults to 2 (AED) if config is not supplied — BR-CCY-002.
 */
export function getCurrencyPrecision(
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): number {
  return config.decimalPlaces
}

/**
 * Parse a formatted money string back to a number.
 * Removes currency symbols, commas, and whitespace.
 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  const parsed  = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
