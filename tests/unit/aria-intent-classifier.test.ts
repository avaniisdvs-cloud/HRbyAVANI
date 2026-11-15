/**
 * ISSUE-012 — ARIA intent classifier tests
 *
 * Static/structural tests for the ARIA_INTENT_CLASSIFIER_PROMPT and
 * AriaIntentCode type definitions. No live Claude API required.
 *
 * Tests:
 *   AIC-001: "pending with whom" is listed as a LEAVE_REQUEST_STATUS trigger
 *   AIC-002: "who needs to approve my leave" is listed as a LEAVE_REQUEST_STATUS trigger
 *   AIC-003: "where is my leave request pending" is listed as a trigger
 *   AIC-004: "who is my leave pending with" is listed as a trigger
 *   AIC-005: "show my pending leave" is listed as a trigger
 *   AIC-006: Disambiguation note separates LEAVE_REQUEST_STATUS from WORKFLOW_QUERY
 *   AIC-007: LEAVE_REQUEST_STATUS is a valid AriaIntentCode (type coverage)
 */

import { describe, it, expect } from 'vitest'
import { ARIA_INTENT_CLASSIFIER_PROMPT } from '@/lib/aria/system-prompt'
import type { AriaIntentResult } from '@/modules/aria/types'

describe('ISSUE-012 — ARIA intent classifier: LEAVE_REQUEST_STATUS triggers', () => {

  it('AIC-001: classifier prompt contains "pending with whom" trigger for LEAVE_REQUEST_STATUS', () => {
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('pending with whom')
  })

  it('AIC-002: classifier prompt contains "who needs to approve my leave" trigger', () => {
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('who needs to approve my leave')
  })

  it('AIC-003: classifier prompt contains "where is my leave request pending" trigger', () => {
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('where is my leave request pending')
  })

  it('AIC-004: classifier prompt contains "who is my leave pending with" trigger', () => {
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('who is my leave pending with')
  })

  it('AIC-005: classifier prompt contains "show my pending leave" trigger', () => {
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('show my pending leave')
  })

  it('AIC-006: classifier prompt disambiguates personal vs org-wide by scope (first-person → STATUS, aggregate → WORKFLOW_QUERY)', () => {
    // First-person/single-record stays personal; aggregate/org-wide routes to WORKFLOW_QUERY
    // so SUPER_ADMIN/managers get org-level approval visibility from natural phrasing.
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('DISAMBIGUATION')
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toContain('AGGREGATE / ORGANISATION-WIDE')
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toMatch(/how many leaves are pending/i)
    expect(ARIA_INTENT_CLASSIFIER_PROMPT).toMatch(/overdue approvals/i)
  })

  it('AIC-007: LEAVE_REQUEST_STATUS is a valid AriaIntentCode (type coverage)', () => {
    // Structural check: the intent code used by the classifier is representable in the type system.
    const intentResult: AriaIntentResult = {
      intent:     'LEAVE_REQUEST_STATUS',
      language:   'en',
      confidence: 0.95,
      entities:   {},
    }
    expect(intentResult.intent).toBe('LEAVE_REQUEST_STATUS')
    expect(intentResult.confidence).toBeGreaterThan(0)
    expect(intentResult.entities).toBeDefined()
  })

})
