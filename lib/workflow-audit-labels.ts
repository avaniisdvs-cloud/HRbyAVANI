/**
 * Business-friendly labels for workflow audit events.
 *
 * The raw event names (TOKEN_ISSUED, STEP_APPROVED, …) are developer-facing and
 * are kept verbatim in audit_log / logs. In the approver UI we show plain-English
 * (and Arabic) phrasing instead so non-technical approvers understand the trail.
 *
 * Unknown actions fall back to a title-cased version of the raw name so we never
 * surface a NULL or a raw ENUM token as the primary user-facing text.
 */

export interface AuditLabel {
  en: string
  ar: string
}

const AUDIT_LABELS: Record<string, AuditLabel> = {
  SUBMITTED:          { en: 'Request submitted',        ar: 'تم تقديم الطلب' },
  TOKEN_ISSUED:       { en: 'Approval request sent',    ar: 'تم إرسال طلب الموافقة' },
  STEP_APPROVED:      { en: 'Approved',                 ar: 'تمت الموافقة' },
  STEP_REJECTED:      { en: 'Rejected',                 ar: 'تم الرفض' },
  STEP_DELEGATED:     { en: 'Delegated',                ar: 'تم التفويض' },
  STEP_ACTIVATED:     { en: 'Sent to next approver',    ar: 'أُرسل إلى الموافق التالي' },
  INSTANCE_APPROVED:  { en: 'Request fully approved',   ar: 'تمت الموافقة على الطلب بالكامل' },
  INSTANCE_REJECTED:  { en: 'Request rejected',         ar: 'تم رفض الطلب' },
  INSTANCE_COMPLETED: { en: 'Request completed',        ar: 'اكتمل الطلب' },
  SLA_ESCALATED:      { en: 'Escalated (deadline passed)', ar: 'تم التصعيد (انتهى الموعد)' },
  REMINDER_SENT:      { en: 'Reminder sent',            ar: 'تم إرسال تذكير' },
  AUTO_APPROVED:      { en: 'Auto-approved',            ar: 'موافقة تلقائية' },
  RECALLED:           { en: 'Request recalled',         ar: 'تم سحب الطلب' },
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Returns the business-friendly label for a workflow audit action.
 * @param action raw audit action (e.g. "TOKEN_ISSUED")
 * @param lang   'en' | 'ar'
 */
export function friendlyAuditLabel(action: string, lang: 'en' | 'ar' = 'en'): string {
  const entry = AUDIT_LABELS[action]
  if (entry) return entry[lang]
  // Fallback: title-case the raw action so we never show ENUM_CASE jargon.
  return titleCase(action)
}

export { AUDIT_LABELS }
