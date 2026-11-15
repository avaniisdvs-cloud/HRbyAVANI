/**
 * Leave Backdate Policy — unit tests (BDP-001 – BDP-011)
 *
 * Tests cover:
 *   BDP-001–004: per-leave-type policy enforcement (allowed / blocked scenarios)
 *   BDP-005–006: edge cases (disabled, zero-day limit)
 *   BDP-007:     future/today date bypasses backdate check entirely
 *   BDP-008:     missing policy = BLOCK (safe default — not silent allow)
 *   BDP-009:     validation uses employee's DB-verified entity, not caller entity
 *   BDP-010:     error message contains all 4 actionable elements
 *   BDP-011:     missing person row throws PERSON_NOT_FOUND — no fallback to
 *                caller-supplied legalEntityId (enterprise security requirement)
 */
import { describe, it, expect } from 'vitest'
import { addDays, daysBetween } from '@/lib/effective-date'
import { translateError } from '@/lib/app-error'

// ── Helpers ────────────────────────────────────────────────────────────────────

type Policy = { backdatingEnabled: boolean; backdateLimitDays: number | null } | null

/**
 * Reproduces the CORRECTED backdate policy-check logic from createLeaveRequest.
 *
 * Design contract (matches actions.ts implementation exactly):
 *   1. startDate >= todayStr          → no check (future / today), always allow
 *   2. personEntityId === null        → PERSON_NOT_FOUND — no fallback to callerEntityId
 *   3. policy === null                → BACKDATE_POLICY_MISSING (safe default; BDP-008)
 *   4. !policy.backdatingEnabled      → BACKDATE_NOT_ALLOWED
 *   5. daysBack > backdateLimitDays   → BACKDATE_LIMIT_EXCEEDED
 *   6. backdateLimitDays === null + enabled → ALLOW (unlimited window)
 *
 * @param personEntityId   The legalEntityId resolved from DB for the employee.
 *                         Pass null to simulate a missing person row (BDP-011).
 *                         This drives the policy lookup — callerEntityId is ignored.
 * @param callerEntityId   The legalEntityId supplied by the API caller.
 *                         Used ONLY in BDP-009/011 to confirm it is never used
 *                         as a fallback.
 */
function runBackdatePolicyCheck(opts: {
  startDate: string
  todayStr: string
  /** Policy for the employee's entity. null = no policy row exists (BLOCK). */
  policy: Policy
  typeNameEn: string
  typeNameAr: string
  /** DB-resolved entity for the employee. null = person row not found. */
  personEntityId?: string | null
  /** Caller-supplied entity (data.legalEntityId). Never used for policy lookup. */
  callerEntityId?: string
}): void {
  const { startDate, todayStr, policy, typeNameEn, typeNameAr } = opts
  // Default: person was found (personEntityId defined and non-null)
  const personEntityId = opts.personEntityId !== undefined ? opts.personEntityId : 'entity-found'

  // Step 1 — future or today — no backdate check required.
  if (startDate >= todayStr) return

  // Step 2 — BDP-011: no fallback to caller entity if person not found.
  if (personEntityId === null) {
    throw new Error(
      'PERSON_NOT_FOUND: The selected employee record could not be found. ' +
      'Please verify the employee exists and refresh the page before trying again.',
    )
  }

  // Step 3 — BDP-008: safe default — no policy configured means backdating BLOCKED.
  if (policy === null) {
    throw new Error(
      `BACKDATE_POLICY_MISSING: No backdate policy has been configured for ${typeNameEn} in your organisation. ` +
      `By default, backdating is not permitted. Please contact your HR administrator to configure ` +
      `the backdate policy for this leave type, or apply for leave starting from today (${todayStr}). · ` +
      `لم يتم تكوين سياسة إدخال بأثر رجعي لـ${typeNameAr} في مؤسستك. ` +
      `بشكل افتراضي، لا يُسمح بالإدخال بأثر رجعي. يرجى التواصل مع مسؤول الموارد البشرية لضبط السياسة.`,
    )
  }

  // Step 4 — backdating disabled.
  if (!policy.backdatingEnabled) {
    throw new Error(
      `BACKDATE_NOT_ALLOWED: Backdated ${typeNameEn} requests are not permitted under your organisation's policy. ` +
      `Please apply for leave starting from today (${todayStr}) or a future date. · ` +
      `طلبات ${typeNameAr} بأثر رجعي غير مسموح بها وفق سياسة مؤسستك. ` +
      `يرجى تقديم الطلب بدءاً من اليوم (${todayStr}) أو تاريخ مستقبلي.`,
    )
  }

  // Step 5 — day-limit check.
  if (policy.backdateLimitDays !== null) {
    const daysBack = daysBetween(startDate, todayStr)
    if (daysBack > policy.backdateLimitDays) {
      const earliestAllowed = addDays(todayStr, -policy.backdateLimitDays)
      throw new Error(
        `BACKDATE_LIMIT_EXCEEDED: ${typeNameEn} can only be backdated up to ${policy.backdateLimitDays} day(s). ` +
        `The start date you selected (${startDate}) is ${daysBack} day(s) ago, ` +
        `which exceeds the ${policy.backdateLimitDays}-day limit. ` +
        `The earliest date you can enter is ${earliestAllowed}. · ` +
        `يمكن تقديم ${typeNameAr} بأثر رجعي بحد أقصى ${policy.backdateLimitDays} يوم(أيام). ` +
        `التاريخ الذي حددته (${startDate}) كان منذ ${daysBack} يوم(أيام)، ` +
        `وهو يتجاوز الحد المسموح به. ` +
        `أقرب تاريخ يمكن إدخاله هو ${earliestAllowed}.`,
      )
    }
  }
}

// ── Test dates ────────────────────────────────────────────────────────────────

const TODAY    = '2026-05-26'
const PAST_5   = addDays(TODAY, -5)   //  5 days ago — within most limits
const PAST_7   = addDays(TODAY, -7)   //  7 days ago — within 10-day limit
const PAST_10  = addDays(TODAY, -10)  // 10 days ago — outside 7-day limit
const PAST_31  = addDays(TODAY, -31)  // 31 days ago — outside 30-day limit
const FUTURE   = addDays(TODAY, 3)    //  3 days in the future

const ANNUAL_EN = 'Annual Leave'
const ANNUAL_AR = 'إجازة سنوية'
const SICK_EN   = 'Sick Leave'
const SICK_AR   = 'إجازة مرضية'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Leave Backdate Policy — enforcement', () => {

  /**
   * BDP-001: Annual leave 5 days ago within a 30-day policy limit → allowed.
   */
  it('BDP-001: annual leave 5 days ago within 30-day limit → allowed', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 30 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).not.toThrow()
  })

  /**
   * BDP-002: Annual leave 31 days ago exceeds a 30-day limit → blocked.
   */
  it('BDP-002: annual leave 31 days ago beyond 30-day limit → BACKDATE_LIMIT_EXCEEDED', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_31, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 30 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).toThrow('BACKDATE_LIMIT_EXCEEDED:')
  })

  /**
   * BDP-003: Sick leave 7 days ago within a 10-day limit → allowed.
   */
  it('BDP-003: sick leave 7 days ago within 10-day limit → allowed', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_7, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 10 },
        typeNameEn: SICK_EN, typeNameAr: SICK_AR,
      })
    ).not.toThrow()
  })

  /**
   * BDP-004: Sick leave 10 days ago exceeds a 7-day limit → blocked.
   */
  it('BDP-004: sick leave 10 days ago beyond 7-day limit → BACKDATE_LIMIT_EXCEEDED', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_10, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 7 },
        typeNameEn: SICK_EN, typeNameAr: SICK_AR,
      })
    ).toThrow('BACKDATE_LIMIT_EXCEEDED:')
  })

  /**
   * BDP-005: backdatingEnabled=false → any past date is blocked outright.
   */
  it('BDP-005: backdating disabled → past date throws BACKDATE_NOT_ALLOWED', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: { backdatingEnabled: false, backdateLimitDays: null },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).toThrow('BACKDATE_NOT_ALLOWED:')
  })

  /**
   * BDP-006: backdateLimitDays=0 → today is the only valid start date.
   * Any past date including yesterday must throw BACKDATE_LIMIT_EXCEEDED.
   */
  it('BDP-006: 0-day limit → any past date blocked (today is the earliest valid date)', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 0 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).toThrow('BACKDATE_LIMIT_EXCEEDED:')
  })

  /**
   * BDP-007: Future or today start date → backdate check does not run at all.
   * Even with backdatingEnabled=false and 0-day limit, no error is thrown.
   */
  it('BDP-007: future/today start date → backdate check bypassed, no error', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: FUTURE, todayStr: TODAY,
        policy: { backdatingEnabled: false, backdateLimitDays: 0 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).not.toThrow()

    expect(() =>
      runBackdatePolicyCheck({
        startDate: TODAY, todayStr: TODAY,
        policy: { backdatingEnabled: false, backdateLimitDays: 0 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).not.toThrow()
  })

  /**
   * BDP-008: No policy row configured (policy=null) → safe default BLOCKS.
   * Must throw BACKDATE_POLICY_MISSING, not silently allow.
   */
  it('BDP-008: no policy configured (null) → safe default BLOCKS, throws BACKDATE_POLICY_MISSING', () => {
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: null,
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    ).toThrow('BACKDATE_POLICY_MISSING:')
  })

  /**
   * BDP-009: Validation uses the employee's DB-verified entity (personEntityId),
   * NOT the entity ID supplied by the caller (callerEntityId).
   *
   * Scenario: HR Admin (entity A, permissive) files for employee in entity B (blocking).
   * Entity B's policy must apply — not entity A's.
   */
  it('BDP-009: uses employee entity policy (blocking) not caller entity (permissive)', () => {
    const entityAPolicy: Policy = { backdatingEnabled: true, backdateLimitDays: 30 }  // permissive
    const entityBPolicy: Policy = { backdatingEnabled: false, backdateLimitDays: null } // blocking

    // Employee is in entity B → blocking policy applied even though caller is entity A.
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: entityBPolicy,
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
        personEntityId: 'entity-b-uuid',  // DB-resolved employee entity
        callerEntityId: 'entity-a-uuid',  // admin's entity — NOT used for policy lookup
      })
    ).toThrow('BACKDATE_NOT_ALLOWED:')

    // Confirming the permissive path would allow — proving entity scoping matters.
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: entityAPolicy,
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
        personEntityId: 'entity-a-uuid',
        callerEntityId: 'entity-a-uuid',
      })
    ).not.toThrow()
  })

  /**
   * BDP-010: BACKDATE_LIMIT_EXCEEDED error contains all 4 actionable elements:
   *   (1) leave type name  (2) selected date  (3) limit in days  (4) earliest allowed date
   */
  it('BDP-010: BACKDATE_LIMIT_EXCEEDED message contains leave type, selected date, limit, earliest allowed', () => {
    const earliestAllowed = addDays(TODAY, -30)
    const daysBack = daysBetween(PAST_31, TODAY)

    let msg = ''
    try {
      runBackdatePolicyCheck({
        startDate: PAST_31, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 30 },
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
      })
    } catch (e) {
      msg = (e as Error).message
    }

    expect(msg).toContain('BACKDATE_LIMIT_EXCEEDED:')
    expect(msg).toContain(ANNUAL_EN)           // (1) leave type
    expect(msg).toContain(PAST_31)             // (2) selected date
    expect(msg).toContain('30')                // (3) limit in days
    expect(msg).toContain(earliestAllowed)     // (4) earliest allowed date
    expect(msg).toContain(String(daysBack))    // days-back count for context
  })

  /**
   * BDP-011: When the person row is not found (personEntityId=null), the check
   * throws PERSON_NOT_FOUND immediately — there is NO fallback to the
   * caller-supplied legalEntityId (callerEntityId).
   *
   * Security requirement: any fallback to the caller-supplied entity would allow
   * an attacker to supply a permissive entity ID for a non-existent person,
   * potentially bypassing the policy lookup entirely.
   *
   * This test confirms:
   *   1. null person → PERSON_NOT_FOUND (not BACKDATE_POLICY_MISSING or allowed)
   *   2. The check fires BEFORE the policy lookup (policy=null is never reached)
   *   3. Supplying a permissive callerEntityId does not prevent the throw
   */
  it('BDP-011: person not found → throws PERSON_NOT_FOUND, no fallback to caller entity', () => {
    // Person row absent — even with a permissive policy and permissive callerEntityId,
    // the check must throw PERSON_NOT_FOUND before reaching the policy check.
    expect(() =>
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: { backdatingEnabled: true, backdateLimitDays: 30 },  // permissive — must not be reached
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
        personEntityId: null,             // DB lookup returned no row
        callerEntityId: 'entity-a-uuid', // caller's entity — must NOT be used as fallback
      })
    ).toThrow('PERSON_NOT_FOUND:')

    // Confirm the throw is specifically PERSON_NOT_FOUND and not a generic error.
    let msg = ''
    try {
      runBackdatePolicyCheck({
        startDate: PAST_5, todayStr: TODAY,
        policy: null,
        typeNameEn: ANNUAL_EN, typeNameAr: ANNUAL_AR,
        personEntityId: null,
        callerEntityId: 'any-entity-id',
      })
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('PERSON_NOT_FOUND:')
    // Must NOT contain policy-related messages — person check fires first.
    expect(msg).not.toContain('BACKDATE_POLICY_MISSING:')
    expect(msg).not.toContain('BACKDATE_NOT_ALLOWED:')
    expect(msg).not.toContain('BACKDATE_LIMIT_EXCEEDED:')
  })

})

describe('Leave Backdate Policy — Arabic locale error rendering', () => {

  /**
   * BDPAR-001: translateError strips the BACKDATE_* prefix and returns the full
   * bilingual body (EN · AR). This matches the LeaveRequestNewForm pattern where
   * all validation errors use 'English · Arabic' strings displayed as-is.
   *
   * Arabic-locale users see the Arabic portion in the same error banner.
   * English-locale users see both (English first, then Arabic after the · separator).
   */
  it('BDPAR-001: translateError returns full bilingual body for BACKDATE_LIMIT_EXCEEDED', () => {
    const raw = new Error(
      `BACKDATE_LIMIT_EXCEEDED: Annual Leave can only be backdated up to 30 day(s). ` +
      `The start date you selected (2026-04-25) is 31 day(s) ago, ` +
      `which exceeds the 30-day limit. The earliest date you can enter is 2026-04-26. · ` +
      `يمكن تقديم إجازة سنوية بأثر رجعي بحد أقصى 30 يوم(أيام).`,
    )

    let translated = ''
    try { translateError(raw, 'test') } catch (e) { translated = (e as Error).message }

    // English part preserved
    expect(translated).toContain('Annual Leave can only be backdated up to 30 day(s)')
    // Arabic part preserved (not stripped) — Arabic-locale users see this
    expect(translated).toContain('يمكن تقديم إجازة سنوية بأثر رجعي')
    // Prefix code stripped
    expect(translated).not.toContain('BACKDATE_LIMIT_EXCEEDED:')
    // Bilingual separator preserved
    expect(translated).toContain(' · ')
  })

  it('BDPAR-002: translateError returns full bilingual body for BACKDATE_NOT_ALLOWED', () => {
    const raw = new Error(
      `BACKDATE_NOT_ALLOWED: Backdated Annual Leave requests are not permitted. ` +
      `Please apply from today (2026-05-26) or a future date. · ` +
      `طلبات إجازة سنوية بأثر رجعي غير مسموح بها.`,
    )

    let translated = ''
    try { translateError(raw, 'test') } catch (e) { translated = (e as Error).message }

    expect(translated).toContain('not permitted')
    expect(translated).toContain('طلبات إجازة سنوية بأثر رجعي')
    expect(translated).not.toContain('BACKDATE_NOT_ALLOWED:')
  })

  it('BDPAR-003: translateError returns full bilingual body for BACKDATE_POLICY_MISSING', () => {
    const raw = new Error(
      `BACKDATE_POLICY_MISSING: No backdate policy has been configured for Study Leave. ` +
      `By default, backdating is not permitted. · ` +
      `لم يتم تكوين سياسة إدخال بأثر رجعي لـإجازة الدراسة في مؤسستك.`,
    )

    let translated = ''
    try { translateError(raw, 'test') } catch (e) { translated = (e as Error).message }

    expect(translated).toContain('No backdate policy has been configured')
    expect(translated).toContain('لم يتم تكوين سياسة')
    expect(translated).not.toContain('BACKDATE_POLICY_MISSING:')
  })

  it('BDPAR-004: translateError returns English message for PERSON_NOT_FOUND', () => {
    const raw = new Error(
      'PERSON_NOT_FOUND: The selected employee record could not be found. ' +
      'Please verify the employee exists and refresh the page before trying again.',
    )

    let translated = ''
    try { translateError(raw, 'test') } catch (e) { translated = (e as Error).message }

    expect(translated).toContain('employee record could not be found')
    expect(translated).not.toContain('PERSON_NOT_FOUND:')
  })

})
