/**
 * Single source of truth for workflow status vocabulary (instance + step).
 *
 * Bilingual label + a semantic "tone" (UI maps tone → color token + icon). Kept
 * React-free so it is unit-testable and importable anywhere. Replaces the
 * scattered inline status→label/color maps across the approval surfaces.
 */

export type WorkflowTone = 'approved' | 'rejected' | 'pending' | 'waiting' | 'warning' | 'neutral'

export interface StatusMeta {
  tone:    WorkflowTone
  labelEn: string
  labelAr: string
}

// Covers both instance statuses and step-instance statuses.
const STATUS: Record<string, StatusMeta> = {
  // instance
  PENDING:        { tone: 'pending',  labelEn: 'In progress', labelAr: 'قيد التنفيذ' },
  IN_PROGRESS:    { tone: 'pending',  labelEn: 'In progress', labelAr: 'قيد التنفيذ' },
  APPROVED:       { tone: 'approved', labelEn: 'Approved',     labelAr: 'تمت الموافقة' },
  REJECTED:       { tone: 'rejected', labelEn: 'Rejected',     labelAr: 'مرفوض' },
  CANCELLED:      { tone: 'neutral',  labelEn: 'Cancelled',    labelAr: 'ملغى' },
  RECALLED:       { tone: 'neutral',  labelEn: 'Recalled',     labelAr: 'مُسترجع' },
  COMPLETED:      { tone: 'approved', labelEn: 'Completed',    labelAr: 'مكتمل' },
  ON_HOLD:        { tone: 'warning',  labelEn: 'On hold',      labelAr: 'معلّق' },
  ESCALATED:      { tone: 'warning',  labelEn: 'Escalated',    labelAr: 'مُصعّد' },
  // step
  WAITING:        { tone: 'waiting',  labelEn: 'Waiting',      labelAr: 'في الانتظار' },
  DELEGATED:      { tone: 'neutral',  labelEn: 'Delegated',    labelAr: 'مُفوّض' },
  SKIPPED:        { tone: 'neutral',  labelEn: 'Skipped',      labelAr: 'مُتخطّى' },
  AUTO_APPROVED:  { tone: 'approved', labelEn: 'Auto-approved', labelAr: 'موافقة تلقائية' },
}

/** Returns bilingual label + tone for a workflow/step status (fails soft to neutral). */
export function workflowStatusMeta(status: string): StatusMeta {
  return STATUS[status] ?? { tone: 'neutral', labelEn: status, labelAr: status }
}

export function workflowStatusLabel(status: string, lang: 'en' | 'ar' = 'en'): string {
  const m = workflowStatusMeta(status)
  return lang === 'ar' ? m.labelAr : m.labelEn
}

export { STATUS as WORKFLOW_STATUS_MAP }
