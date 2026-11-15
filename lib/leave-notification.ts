/**
 * Pure helpers for building enriched leave decision notification bodies.
 * No server directive — safe to import in both server and test contexts.
 */

export interface LeaveDecisionParams {
  isApproved:       boolean
  actorDisplayName: string
  typeNameEn?:      string | null
  typeNameAr?:      string | null
  startDate?:       string | Date | null
  endDate?:         string | Date | null
  durationDays?:    number | string | null
  decisionNote?:    string | null
}

/** Format a date string/Date as "15 Mar 2026" (UTC, no timezone shift). */
export function fmtLeaveDate(d: string | Date | null | undefined): string {
  if (!d) return ''
  try {
    const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  } catch { return String(d) }
}

/**
 * Build localised notification body strings for a leave approval or rejection.
 *
 * English example (approved):
 *   "Your Annual Leave request from 15 Mar 2026 to 18 Mar 2026, 4 days, has been approved by Mahendra Kumar."
 *
 * English example (rejected with reason):
 *   "Your Annual Leave request from 15 Mar 2026 to 18 Mar 2026, 4 days, has been rejected by Mahendra Kumar. Reason: Insufficient balance."
 */
export function buildLeaveDecisionNotificationBody(
  params: LeaveDecisionParams,
): { bodyEn: string; bodyAr: string } {
  const {
    isApproved, actorDisplayName,
    typeNameEn, typeNameAr,
    startDate, endDate, durationDays, decisionNote,
  } = params

  const leaveTypeEn = typeNameEn?.trim() || 'Leave'
  const leaveTypeAr = typeNameAr?.trim() || 'الإجازة'

  const fromEn = fmtLeaveDate(startDate)
  const toEn   = fmtLeaveDate(endDate)

  // Duration: "1 day" vs "N days"
  const days     = durationDays !== null && durationDays !== undefined ? Number(durationDays) : null
  const daysEn   = days !== null ? `${days} ${days === 1 ? 'day' : 'days'}` : null
  const daysAr   = days !== null ? `${days} ${days === 1 ? 'يوم' : 'أيام'}` : null

  // Date range clause
  const dateRangeEn = fromEn && toEn
    ? `from ${fromEn} to ${toEn}${daysEn ? `, ${daysEn}` : ''}`
    : daysEn ?? ''
  const dateRangeAr = fromEn && toEn
    ? `من ${fromEn} إلى ${toEn}${daysAr ? `، ${daysAr}` : ''}`
    : daysAr ?? ''

  const reasonSuffix = !isApproved && decisionNote?.trim()
    ? ` Reason: ${decisionNote.trim()}`
    : ''
  const reasonSuffixAr = !isApproved && decisionNote?.trim()
    ? ` السبب: ${decisionNote.trim()}`
    : ''

  const verbEn = isApproved ? 'approved' : 'rejected'
  const verbAr = isApproved ? 'موافقة عليه' : 'رفضه'

  const bodyEn = dateRangeEn
    ? `Your ${leaveTypeEn} request ${dateRangeEn} has been ${verbEn} by ${actorDisplayName}.${reasonSuffix}`
    : `Your ${leaveTypeEn} request has been ${verbEn} by ${actorDisplayName}.${reasonSuffix}`

  const bodyAr = dateRangeAr
    ? `تم ${verbAr} طلب ${leaveTypeAr} الخاص بك ${dateRangeAr} بواسطة ${actorDisplayName}.${reasonSuffixAr}`
    : `تم ${verbAr} طلب ${leaveTypeAr} الخاص بك بواسطة ${actorDisplayName}.${reasonSuffixAr}`

  return { bodyEn, bodyAr }
}
