/**
 * CF-02 — Unit tests for determineSuspensionPayTreatment()
 *
 * Covers:
 *   - Not-suspended employee → FULL_PAY
 *   - DISCIPLINARY suspension → NO_PAY
 *   - INVESTIGATION ≤ 30 days → FULL_PAY
 *   - INVESTIGATION > 30 days → HALF_PAY
 *   - PENDING_TERMINATION → FULL_PAY
 *   - Unknown/missing reason treated as INVESTIGATION path
 *
 * BR-SUSP-001 / UAE FDL 33/2021 Article 39
 */
import { describe, it, expect } from 'vitest'
import {
  determineSuspensionPayTreatment,
  type SuspensionPayInput,
} from '@/modules/payroll/services'

describe('determineSuspensionPayTreatment', () => {
  // ── Not suspended ────────────────────────────────────────────────────────

  it('returns FULL_PAY when employee is not suspended', () => {
    const input: SuspensionPayInput = {
      assignmentStatus: 'ACTIVE',
      suspensionDays: 0,
    }
    const result = determineSuspensionPayTreatment(input)
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
    expect(result.ruleRef).toBe('BR-SUSP-001')
  })

  it('returns FULL_PAY for ON_LEAVE status (not a suspension)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'ON_LEAVE',
      suspensionDays: 10,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
  })

  // ── DISCIPLINARY ─────────────────────────────────────────────────────────

  it('returns NO_PAY for DISCIPLINARY suspension (day 1)', () => {
    const input: SuspensionPayInput = {
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'DISCIPLINARY',
      suspensionDays: 1,
    }
    const result = determineSuspensionPayTreatment(input)
    expect(result.treatment).toBe('NO_PAY')
    expect(result.payMultiplier).toBe(0.0)
    expect(result.ruleRef).toBe('BR-SUSP-001')
  })

  it('returns NO_PAY for DISCIPLINARY suspension (extended period)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'DISCIPLINARY',
      suspensionDays: 60,
    })
    expect(result.treatment).toBe('NO_PAY')
    expect(result.payMultiplier).toBe(0.0)
  })

  // ── INVESTIGATION ≤ 30 days ─────────────────────────────────────────────

  it('returns FULL_PAY for INVESTIGATION on day 1', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays: 1,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
  })

  it('returns FULL_PAY for INVESTIGATION exactly at day 30 (boundary)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays: 30,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
    expect(result.ruleRef).toBe('BR-SUSP-001')
  })

  // ── INVESTIGATION > 30 days ─────────────────────────────────────────────

  it('returns HALF_PAY for INVESTIGATION on day 31 (boundary + 1)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays: 31,
    })
    expect(result.treatment).toBe('HALF_PAY')
    expect(result.payMultiplier).toBe(0.5)
    expect(result.ruleRef).toBe('BR-SUSP-001')
  })

  it('returns HALF_PAY for INVESTIGATION at day 90', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays: 90,
    })
    expect(result.treatment).toBe('HALF_PAY')
    expect(result.payMultiplier).toBe(0.5)
  })

  // ── PENDING_TERMINATION ──────────────────────────────────────────────────

  it('returns FULL_PAY for PENDING_TERMINATION', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'PENDING_TERMINATION',
      suspensionDays: 14,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
    expect(result.ruleRef).toBe('BR-SUSP-001')
  })

  it('returns FULL_PAY for PENDING_TERMINATION regardless of duration', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'PENDING_TERMINATION',
      suspensionDays: 60,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
  })

  // ── Unknown reason falls through to INVESTIGATION path ──────────────────

  it('treats missing suspensionReason as INVESTIGATION (≤30 → FULL_PAY)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionDays: 15,
    })
    expect(result.treatment).toBe('FULL_PAY')
    expect(result.payMultiplier).toBe(1.0)
  })

  it('treats missing suspensionReason as INVESTIGATION (>30 → HALF_PAY)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionDays: 45,
    })
    expect(result.treatment).toBe('HALF_PAY')
    expect(result.payMultiplier).toBe(0.5)
  })

  it('treats unknown reason string as INVESTIGATION (≤30 → FULL_PAY)', () => {
    const result = determineSuspensionPayTreatment({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'SOME_FUTURE_REASON',
      suspensionDays: 20,
    })
    expect(result.treatment).toBe('FULL_PAY')
  })
})
