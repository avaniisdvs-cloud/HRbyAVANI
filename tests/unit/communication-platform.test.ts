/**
 * Unit tests for the Enterprise Email Communication Platform (DB-free surfaces).
 *
 * Covers: template placeholder substitution + HTML-escaping, branded layout,
 * provider abstraction (type + graceful failure without network), and the
 * 14 seed templates. DB-bound paths (EmailService, settings, actions) are
 * exercised by integration tests against a live DB.
 */
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  if (!process.env.WORKFLOW_JWT_SECRET) process.env.WORKFLOW_JWT_SECRET = 'test-secret'
})

import { substitute, renderTemplate } from '@/modules/communication/templates/render'
import { escapeHtml, ctaButton, wrapBrandedEmail } from '@/modules/communication/templates/base-layout'
import { TEMPLATE_SEEDS, TEMPLATE_SEED_MAP } from '@/modules/communication/templates/seeds'
import { GraphEmailProvider } from '@/modules/communication/providers/graph'
import { SmtpEmailProvider } from '@/modules/communication/providers/smtp'
import {
  buildEmploymentActionDecisionContext,
  buildGenericDecisionContext,
  buildLeaveDecisionContext,
  buildLetterRequestDecisionContext,
  renderDecisionContextHtml,
} from '@/modules/communication/decision-context'

describe('template substitution', () => {
  it('replaces known placeholders', () => {
    expect(substitute('Hi {{name}}', { name: 'Sara' })).toBe('Hi Sara')
  })

  it('renders unknown placeholders as empty (never leaks the raw token)', () => {
    expect(substitute('A {{missing}} B', {})).toBe('A  B')
  })

  it('HTML-escapes substituted values by default (injection-safe)', () => {
    const out = substitute('{{x}}', { x: '<script>alert(1)</script>' })
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('does NOT escape values whose key is declared raw (trusted HTML)', () => {
    const out = substitute('{{buttons}}', { buttons: '<a href="#">Approve</a>' }, ['buttons'])
    expect(out).toBe('<a href="#">Approve</a>')
  })
})

describe('renderTemplate', () => {
  it('produces subject + branded html with the title', () => {
    const r = renderTemplate({
      subjectTemplate: 'Leave for {{employeeName}}',
      bodyHtmlTemplate: '<p>{{employeeName}} requested leave</p>',
      vars: { employeeName: 'Omar' },
    })
    expect(r.subject).toBe('Leave for Omar')
    expect(r.html).toContain('Omar requested leave')
    expect(r.html).toContain('<!DOCTYPE html>')
  })
})

describe('base layout', () => {
  it('escapeHtml neutralises angle brackets and quotes', () => {
    expect(escapeHtml(`<b>"&'`)).toBe('&lt;b&gt;&quot;&amp;&#39;')
  })
  it('ctaButton renders an anchor with the href', () => {
    const html = ctaButton('Approve', 'https://x/approve', 'approve')
    expect(html).toContain('href="https://x/approve"')
    expect(html).toContain('Approve')
  })
  it('wrapBrandedEmail honours rtl direction', () => {
    expect(wrapBrandedEmail({ title: 't', bodyHtml: 'b', dir: 'rtl' })).toContain('dir="rtl"')
  })
})

describe('decision-ready approval email context', () => {
  it('renders bilingual decision context for leave approvals', () => {
    const ctx = buildLeaveDecisionContext({
      requester: { nameEn: 'Bilal Ahmad', personNumber: 'K1036' },
      leaveTypeEn: 'Annual Leave',
      leaveTypeAr: 'إجازة سنوية',
      startDate: '2026-07-15',
      endDate: '2026-07-18',
      duration: '4 day(s)',
      reason: 'Family travel',
      requestNumber: 'LR-0001',
      medicalCertificateRequired: false,
    })
    const html = renderDecisionContextHtml(ctx)

    expect(ctx.type).toBe('LEAVE_REQUEST')
    expect(html).toContain('Who is requesting?')
    expect(html).toContain('من مقدم الطلب؟')
    expect(html).toContain('Bilal Ahmad (K1036)')
    expect(html).toContain('What is the impact?')
    expect(html).toContain('Family travel')
  })

  it('provides builders for employment actions, letters, and future workflow fallback', () => {
    const requester = { nameEn: 'Aisha Khan', personNumber: 'K2001' }
    expect(buildEmploymentActionDecisionContext({
      requester,
      actionType: 'PROMOTION',
      effectiveDate: '2026-08-01',
      currentState: 'Grade 5',
      proposedState: 'Grade 6',
      reason: 'Performance',
      requestNumber: 'TR-001',
    }).type).toBe('EMPLOYMENT_ACTION')
    expect(buildLetterRequestDecisionContext({
      requester,
      letterType: 'Salary Certificate',
      letterNumber: 'LET-001',
      requestedDate: '2026-06-12',
      purpose: 'Bank account opening',
      language: 'en',
    }).type).toBe('LETTER_REQUEST')
    expect(buildGenericDecisionContext({
      requester,
      requestType: 'Generic request',
      reference: 'WF-001',
    }).type).toBe('GENERIC_WORKFLOW')
  })
})

describe('seed templates', () => {
  it('provides all 14 platform templates', () => {
    expect(TEMPLATE_SEEDS).toHaveLength(14)
  })
  it('includes the leave-submitted-to-manager template', () => {
    expect(TEMPLATE_SEED_MAP.LEAVE_SUBMITTED_MANAGER).toBeTruthy()
    expect(TEMPLATE_SEED_MAP.LEAVE_SUBMITTED_MANAGER.subjectTemplate).toContain('{{employeeName}}')
    expect(TEMPLATE_SEED_MAP.LEAVE_SUBMITTED_MANAGER.bodyHtmlTemplate).toContain('decision context')
    expect(TEMPLATE_SEED_MAP.LEAVE_SUBMITTED_MANAGER.bodyHtmlTemplate).toContain('approving, rejecting, or delegating')
  })
  it('every seed has a non-empty subject + html body', () => {
    for (const t of TEMPLATE_SEEDS) {
      expect(t.subjectTemplate.length).toBeGreaterThan(0)
      expect(t.bodyHtmlTemplate.length).toBeGreaterThan(0)
    }
  })
})

describe('provider abstraction', () => {
  it('GraphEmailProvider reports its type', () => {
    expect(new GraphEmailProvider({ providerType: 'GRAPH_API' }).type).toBe('GRAPH_API')
  })
  it('SmtpEmailProvider reports its type', () => {
    expect(new SmtpEmailProvider({ providerType: 'SMTP' }).type).toBe('SMTP')
  })
  it('Graph send fails gracefully (no throw) when unconfigured', async () => {
    const p = new GraphEmailProvider({ providerType: 'GRAPH_API' })
    const r = await p.send({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toBeTruthy()
  })
  it('SMTP send fails gracefully (no throw) when host missing', async () => {
    const p = new SmtpEmailProvider({ providerType: 'SMTP' })
    const r = await p.send({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
