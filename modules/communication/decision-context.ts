/**
 * Decision-ready approval email context.
 *
 * The email engine renders this generic contract; workflow modules own the
 * business-specific facts they pass in. This keeps approval emails rich without
 * putting leave/employment/letter logic inside the dispatcher.
 */
import { escapeHtml } from './templates/base-layout'

export type DecisionContextType =
  | 'LEAVE_REQUEST'
  | 'EMPLOYMENT_ACTION'
  | 'LETTER_REQUEST'
  | 'GENERIC_WORKFLOW'

export interface DecisionContextParty {
  nameEn: string
  nameAr?: string | null
  personNumber?: string | null
}

export interface DecisionContextFact {
  labelEn: string
  labelAr: string
  valueEn: string | number | null | undefined
  valueAr?: string | number | null | undefined
}

export interface DecisionContext {
  version: 1
  type: DecisionContextType
  titleEn: string
  titleAr: string
  requester: DecisionContextParty
  requestTypeEn: string
  requestTypeAr: string
  effectiveDateEn: string
  effectiveDateAr?: string
  impactEn: string
  impactAr: string
  reasonEn: string
  reasonAr?: string
  facts: DecisionContextFact[]
  footerEn?: string
  footerAr?: string
}

function partyLabel(party: DecisionContextParty): string {
  return `${party.nameEn}${party.personNumber ? ` (${party.personNumber})` : ''}`
}

function field(labelEn: string, labelAr: string, valueEn: string | number | null | undefined, valueAr?: string | number | null | undefined): DecisionContextFact {
  return { labelEn, labelAr, valueEn, valueAr }
}

function valueText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export function renderDecisionContextHtml(ctx: DecisionContext): string {
  const facts = [
    field('Who is requesting?', 'من مقدم الطلب؟', partyLabel(ctx.requester), ctx.requester.nameAr ?? undefined),
    field('What is requested?', 'ما هو الطلب؟', ctx.requestTypeEn, ctx.requestTypeAr),
    field('When does it take effect?', 'متى يسري؟', ctx.effectiveDateEn, ctx.effectiveDateAr),
    field('What is the impact?', 'ما هو الأثر؟', ctx.impactEn, ctx.impactAr),
    field('Why was it requested?', 'ما سبب الطلب؟', ctx.reasonEn, ctx.reasonAr),
    ...ctx.facts,
  ]

  const rows = facts.map(item => `
    <tr>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid currentColor;vertical-align:top;width:38%;">
        <div style="font-size:12px;font-weight:600;">${escapeHtml(item.labelEn)}</div>
        <div dir="rtl" lang="ar" style="font-size:12px;">${escapeHtml(item.labelAr)}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid currentColor;vertical-align:top;">
        <div style="font-size:14px;">${escapeHtml(valueText(item.valueEn))}</div>
        ${item.valueAr ? `<div dir="rtl" lang="ar" style="font-size:13px;">${escapeHtml(valueText(item.valueAr))}</div>` : ''}
      </td>
    </tr>`).join('')

  return `
    <section aria-label="Decision context" style="margin:16px 0 18px;padding:14px;border:1px solid currentColor;border-radius:8px;">
      <h2 style="margin:0 0 6px;font-size:16px;">${escapeHtml(ctx.titleEn)}</h2>
      <div dir="rtl" lang="ar" style="margin:0 0 12px;font-size:14px;font-weight:600;">${escapeHtml(ctx.titleAr)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        ${rows}
      </table>
      ${ctx.footerEn || ctx.footerAr ? `
        <p style="margin:12px 0 0;font-size:12px;">
          ${ctx.footerEn ? escapeHtml(ctx.footerEn) : ''}
          ${ctx.footerAr ? `<br><span dir="rtl" lang="ar">${escapeHtml(ctx.footerAr)}</span>` : ''}
        </p>` : ''}
    </section>`
}

export function buildLeaveDecisionContext(args: {
  requester: DecisionContextParty
  leaveTypeEn: string
  leaveTypeAr?: string | null
  startDate: string
  endDate: string
  duration: string
  reason?: string | null
  requestNumber: string
  balanceImpact?: string | null
  medicalCertificateRequired?: boolean | null
}): DecisionContext {
  return {
    version: 1,
    type: 'LEAVE_REQUEST',
    titleEn: 'Leave request decision context',
    titleAr: 'سياق قرار طلب الإجازة',
    requester: args.requester,
    requestTypeEn: args.leaveTypeEn,
    requestTypeAr: args.leaveTypeAr ?? args.leaveTypeEn,
    effectiveDateEn: `${args.startDate} to ${args.endDate}`,
    effectiveDateAr: `${args.startDate} إلى ${args.endDate}`,
    impactEn: args.balanceImpact ?? `${args.duration} away from work`,
    impactAr: args.balanceImpact ?? `${args.duration} خارج العمل`,
    reasonEn: args.reason || 'No reason provided',
    reasonAr: args.reason || 'لم يتم تقديم سبب',
    facts: [
      field('Request number', 'رقم الطلب', args.requestNumber),
      field('Duration', 'المدة', args.duration),
      field('Medical certificate', 'الشهادة الطبية', args.medicalCertificateRequired ? 'Required' : 'Not required', args.medicalCertificateRequired ? 'مطلوبة' : 'غير مطلوبة'),
    ],
    footerEn: 'Approve only if the dates, coverage, and reason are acceptable.',
    footerAr: 'وافق فقط إذا كانت التواريخ والتغطية والسبب مقبولة.',
  }
}

export function buildEmploymentActionDecisionContext(args: {
  requester: DecisionContextParty
  actionType: 'TRANSFER' | 'PROMOTION' | 'GRADE_CHANGE' | string
  effectiveDate: string
  currentState: string
  proposedState: string
  reason: string
  requestNumber?: string | null
  impact?: string | null
}): DecisionContext {
  const actionLabel = args.actionType.replaceAll('_', ' ')
  return {
    version: 1,
    type: 'EMPLOYMENT_ACTION',
    titleEn: 'Employment action decision context',
    titleAr: 'سياق قرار الإجراء الوظيفي',
    requester: args.requester,
    requestTypeEn: actionLabel,
    requestTypeAr: actionLabel,
    effectiveDateEn: args.effectiveDate,
    effectiveDateAr: args.effectiveDate,
    impactEn: args.impact ?? `${args.currentState} -> ${args.proposedState}`,
    impactAr: args.impact ?? `${args.currentState} -> ${args.proposedState}`,
    reasonEn: args.reason || 'No reason provided',
    reasonAr: args.reason || 'لم يتم تقديم سبب',
    facts: [
      field('Current state', 'الوضع الحالي', args.currentState),
      field('Proposed state', 'الوضع المقترح', args.proposedState),
      field('Request reference', 'مرجع الطلب', args.requestNumber ?? '-'),
    ],
    footerEn: 'Approve only if the effective date and workforce impact are correct.',
    footerAr: 'وافق فقط إذا كان تاريخ السريان والأثر على القوى العاملة صحيحين.',
  }
}

export function buildLetterRequestDecisionContext(args: {
  requester: DecisionContextParty
  letterType: string
  letterNumber: string
  requestedDate: string
  purpose?: string | null
  language?: string | null
  impact?: string | null
}): DecisionContext {
  return {
    version: 1,
    type: 'LETTER_REQUEST',
    titleEn: 'Letter request decision context',
    titleAr: 'سياق قرار طلب الخطاب',
    requester: args.requester,
    requestTypeEn: args.letterType,
    requestTypeAr: args.letterType,
    effectiveDateEn: args.requestedDate,
    effectiveDateAr: args.requestedDate,
    impactEn: args.impact ?? 'Official HR letter will be generated for the employee',
    impactAr: args.impact ?? 'سيتم إصدار خطاب رسمي من الموارد البشرية للموظف',
    reasonEn: args.purpose || 'No purpose provided',
    reasonAr: args.purpose || 'لم يتم تقديم غرض',
    facts: [
      field('Letter number', 'رقم الخطاب', args.letterNumber),
      field('Language', 'اللغة', args.language ?? '-'),
    ],
    footerEn: 'Approve only if the letter type and employee eligibility are correct.',
    footerAr: 'وافق فقط إذا كان نوع الخطاب وأهلية الموظف صحيحين.',
  }
}

export function buildGenericDecisionContext(args: {
  requester: DecisionContextParty
  requestType: string
  effectiveDate?: string | null
  impact?: string | null
  reason?: string | null
  reference?: string | null
}): DecisionContext {
  return {
    version: 1,
    type: 'GENERIC_WORKFLOW',
    titleEn: 'Workflow decision context',
    titleAr: 'سياق قرار سير العمل',
    requester: args.requester,
    requestTypeEn: args.requestType,
    requestTypeAr: args.requestType,
    effectiveDateEn: args.effectiveDate ?? 'See request details',
    effectiveDateAr: args.effectiveDate ?? 'راجع تفاصيل الطلب',
    impactEn: args.impact ?? 'Review the request details before deciding',
    impactAr: args.impact ?? 'راجع تفاصيل الطلب قبل اتخاذ القرار',
    reasonEn: args.reason ?? 'No reason provided',
    reasonAr: args.reason ?? 'لم يتم تقديم سبب',
    facts: [
      field('Reference', 'المرجع', args.reference ?? '-'),
    ],
  }
}
