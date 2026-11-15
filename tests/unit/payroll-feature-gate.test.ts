/**
 * Payroll workstream feature-gate — unit tests.
 * Proves the gate fails closed (disabled unless PAYROLL_WORKSTREAM_ENABLED==='true').
 */
import { describe, it, expect } from 'vitest'
import {
  isPayrollWorkstreamEnabled,
  assertPayrollWorkstreamEnabled,
  PayrollDisabledError,
  PAYROLL_DISABLED_MESSAGE,
  PAYROLL_WORKSTREAM_ENV_FLAG,
} from '@/lib/features/payroll-feature-gate'

describe('payroll feature gate — fails closed', () => {
  it('is DISABLED when the flag is unset', () => {
    expect(isPayrollWorkstreamEnabled({})).toBe(false)
  })

  it('is DISABLED for any value other than exactly "true"', () => {
    for (const v of ['false', 'TRUE', 'True', '1', 'yes', 'enabled', '']) {
      expect(isPayrollWorkstreamEnabled({ [PAYROLL_WORKSTREAM_ENV_FLAG]: v })).toBe(false)
    }
  })

  it('is ENABLED only when the flag is exactly "true"', () => {
    expect(isPayrollWorkstreamEnabled({ [PAYROLL_WORKSTREAM_ENV_FLAG]: 'true' })).toBe(true)
  })

  it('assertPayrollWorkstreamEnabled throws PayrollDisabledError when disabled', () => {
    expect(() => assertPayrollWorkstreamEnabled({})).toThrow(PayrollDisabledError)
    try {
      assertPayrollWorkstreamEnabled({})
    } catch (e) {
      expect((e as PayrollDisabledError).message).toBe(PAYROLL_DISABLED_MESSAGE)
      expect((e as PayrollDisabledError).code).toBe('PAYROLL_WORKSTREAM_DISABLED')
    }
  })

  it('assertPayrollWorkstreamEnabled does NOT throw when enabled', () => {
    expect(() => assertPayrollWorkstreamEnabled({ [PAYROLL_WORKSTREAM_ENV_FLAG]: 'true' })).not.toThrow()
  })
})
