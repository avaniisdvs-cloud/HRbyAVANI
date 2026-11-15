/**
 * lib/app-error.ts — Universal error firewall for AVANIIS HR.
 *
 * Rules (mandatory across the entire codebase):
 *  1. Server Actions must NEVER let raw DB or system errors reach the client.
 *  2. Every exported Server Action must have:
 *       try { ... return result } catch (e) { translateError(e, 'actionName') }
 *     as its outermost layer.
 *  3. translateError() logs the full technical detail on the server and re-throws
 *     an AppError whose `.message` is plain English any employee can understand.
 *  4. UI catch blocks display `e instanceof Error ? e.message : FALLBACK_MSG`.
 *     Because AppError extends Error, this pattern automatically shows the
 *     human-readable message — no UI changes needed after the action is wrapped.
 */

// ─────────────────────────────────────────────────────────────────────────────
// AppError
// ─────────────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  /** Marker so callers can distinguish from generic Error if needed. */
  readonly isAppError = true
  constructor(userMessage: string) {
    super(userMessage)
    this.name = 'AppError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Postgres wire-protocol error codes → plain English
// ─────────────────────────────────────────────────────────────────────────────

const PG_MESSAGES: Record<string, string> = {
  // Integrity constraint violations
  '23505': 'This record already exists. Please check for duplicates and try again.',
  '23503': 'A required reference is missing or has been deleted. Please refresh the page and try again.',
  '23502': 'A required field is missing. Please fill in all required fields and try again.',
  '23514': 'The submitted data does not meet a validation rule. Please check your entries.',
  '23001': 'This record is referenced by other data and cannot be removed.',
  '23P01': 'This effective-dated change overlaps an existing timeline row. Please choose a non-overlapping effective date.',
  // Serialisation / locking
  '40001': 'Another request was processed at the same time. Please try again.',
  '40P01': 'Another request was processed at the same time. Please try again.',
  // Connection / resource
  '53300': 'The system is temporarily busy. Please try again in a moment.',
  '57014': 'The request took too long to process. Please try again.',
  // Auth
  '28000': 'Database access was denied. Please contact your IT administrator.',
  '28P01': 'Database access was denied. Please contact your IT administrator.',
  // Syntax / internal (should never reach users, but catch just in case)
  '42601': 'An internal query error occurred. Please contact IT support.',
  '42703': 'An internal query error occurred. Please contact IT support.',
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal error-code prefix → plain English
// Maps every `throw new Error('PREFIX: ...')` used across all modules.
// Order matters: more specific prefixes first.
// ─────────────────────────────────────────────────────────────────────────────

function translateInternalMessage(msg: string): string | null {
  const lowerMsg = msg.toLowerCase()

  // ── Leave / Absence ────────────────────────────────────────────────────────

  if (msg.startsWith('OVERLAP:')) {
    return (
      'You already have an existing leave request that covers some or all of these dates. ' +
      'You cannot apply for another leave on the same period while the existing request is ' +
      'pending, approved, or already taken. Please cancel or wait for the existing request ' +
      'to be resolved before applying again.'
    )
  }

  if (msg.startsWith('INSUFFICIENT_BALANCE:')) {
    const m = msg.match(/available balance \(([^)]+)\)/)
    const avail = m ? `${m[1]} day(s)` : 'insufficient days'
    return (
      `You do not have enough leave balance for this request. ` +
      `Your available balance is ${avail}. ` +
      `Please adjust your dates, or contact HR if you believe your balance is incorrect.`
    )
  }

  if (msg.startsWith('BALANCE_NOT_INITIALIZED:')) {
    // Strip the prefix; the message body is already bilingual (EN · AR).
    return msg.slice('BALANCE_NOT_INITIALIZED:'.length).trim()
  }

  if (msg.startsWith('ONE_TIME_LEAVE_EXCEEDED:')) {
    return (
      'This type of leave can only be taken once during your employment. ' +
      'Our records show you have already used this entitlement.'
    )
  }

  if (msg.startsWith('GENDER_RESTRICTION:')) {
    return 'This leave type is not available for your employment category. Please select a different leave type.'
  }

  if (msg.startsWith('MATERNITY_CANNOT_REJECT:')) {
    return (
      'Maternity leave cannot be rejected under UAE Federal Decree-Law No. 33/2021 (Article 30). ' +
      'The full entitlement must be granted. Please contact your HR Director if you have questions.'
    )
  }

  if (msg.startsWith('MEDICAL_CERT_REQUIRED:')) {
    const body = msg.replace('MEDICAL_CERT_REQUIRED:', '').trim()
    return body.split('·')[0].trim()
  }

  if (msg.startsWith('STUDY_ENROLMENT_CERT_REQUIRED:')) {
    const body = msg.replace('STUDY_ENROLMENT_CERT_REQUIRED:', '').trim()
    return body.split('·')[0].trim()
  }

  if (msg.startsWith('BR-AL-002:')) {
    return (
      'The number of leave days does not match the selected dates. ' +
      'Please recheck the start and end dates and try again.'
    )
  }

  // ── Contracts ──────────────────────────────────────────────────────────────

  if (msg.startsWith('BR-CT-DATE-001:')) {
    return 'The contract end date must be after the contract start date. Please adjust the dates and try again.'
  }

  if (msg.startsWith('BR-CT-DATE-002:')) {
    return 'The contract start date cannot be before the employee hire date. Please align the contract to the employment start date.'
  }

  if (msg.startsWith('BR-CT-DATE-003:')) {
    return 'This employee already has an active contract covering this date range. Please amend the existing contract or choose non-overlapping dates.'
  }

  if (msg.startsWith('BR-CT-DATE-004:')) {
    return 'The amendment effective date must be after the current contract start date.'
  }

  if (msg.startsWith('BR-CT-DATE-005:')) {
    return 'The amended contract end date must be after the amendment effective date.'
  }

  if (msg.startsWith('BR-CT-DATE-006:')) {
    return 'The termination date cannot be before the contract start date.'
  }

  if (msg.startsWith('BR-CT-002:')) {
    return (
      'The amended contract end date would exceed three years from the original start date, ' +
      'which is not permitted under UAE labour regulations. Please adjust the term.'
    )
  }

  if (msg.includes('only ACTIVE contracts can be amended')) {
    return 'Only active contracts can be amended. This contract is no longer active.'
  }

  if (msg.includes('contract is already terminated')) {
    return 'This contract has already been terminated and cannot be modified.'
  }

  if (msg.includes('contract not found')) {
    return 'The contract record could not be found. It may have been removed or the link is no longer valid.'
  }

  // ── Insurance ──────────────────────────────────────────────────────────────

  if (msg.startsWith('BR-INS-001:')) {
    return (
      'No eligible insurance plan was found for this employee. ' +
      'Please ensure an active insurance plan is configured for this company and the employee\'s grade.'
    )
  }

  if (msg.startsWith('BR-INS-002:')) {
    return (
      'A Dependent Visa document is required before a dependent can be enrolled in insurance. ' +
      'Please upload the dependent\'s visa document first.'
    )
  }

  if (msg.startsWith('BR-INS-003:')) {
    return 'The selected insurance plan does not cover dependents. Please select a plan with dependent coverage.'
  }

  if (msg.startsWith('BR-INS-005:')) {
    return (
      'This dependent has exceeded the maximum age limit for insurance coverage. ' +
      'Children are covered up to age 18 (or 25 if enrolled as a full-time student).'
    )
  }

  if (msg.startsWith('CONFLICT: enrolment is already CANCELLED')) {
    return 'This insurance enrolment has already been cancelled and cannot be cancelled again.'
  }

  // ── Dependents ─────────────────────────────────────────────────────────────

  if (msg.startsWith('BR-INS-004:')) {
    return (
      'An employee may have a maximum of 9 dependents on record. ' +
      'The maximum limit has been reached for this employee.'
    )
  }

  // ── Documents / File uploads ───────────────────────────────────────────────

  if (lowerMsg.includes('file is required') || lowerMsg === 'file is required') {
    return 'Please select a file to upload before continuing.'
  }

  if (lowerMsg.includes('file exceeds maximum size')) {
    const m = msg.match(/\((\d+) bytes\)/)
    const mb = m ? ` (maximum is ${Math.round(Number(m[1]) / 1_048_576)} MB)` : ''
    return `The file you selected is too large${mb}. Please choose a smaller file and try again.`
  }

  if (lowerMsg === 'file is empty') {
    return 'The selected file appears to be empty. Please choose a valid file and try again.'
  }

  if (
    lowerMsg.includes('unsupported file type')
    || lowerMsg.includes('file type not allowed')
    || lowerMsg.includes('unsupported mime type')
  ) {
    return 'This file type is not supported. Please upload a PDF, JPG, or PNG file.'
  }

  if (lowerMsg.includes('metadata is required') || lowerMsg.includes('invalid metadata payload')) {
    return 'Some document details are missing. Please fill in all required fields and try again.'
  }

  // ── Departments / Positions / Jobs (MDM) ───────────────────────────────────

  if (msg.startsWith('BR-DEPT-001:')) {
    return 'A department with this code already exists for this company. Please use a different department code.'
  }

  if (msg.startsWith('BR-DEPT-004:')) {
    return 'The selected parent department belongs to a different company. Parent and child departments must be in the same company.'
  }

  if (msg.startsWith('BR-DEPT-005:')) {
    return 'The GL account code must contain only digits and be between 4 and 10 characters long.'
  }

  if (msg.startsWith('BR-POS-001:') && msg.includes('already exists')) {
    return 'A position with this code already exists for this company. Please use a different position code.'
  }

  if (msg.startsWith('BR-POS-001:') && msg.includes('cannot be changed')) {
    return 'The position code cannot be changed after the position has been created.'
  }

  if (msg.startsWith('BR-POS-003:')) {
    return 'This position is currently occupied by an employee. Please unassign the employee before disabling the position.'
  }

  if (msg.startsWith('BR-JOB-001:')) {
    return 'A job with this code already exists. Please use a different job code.'
  }

  if (msg.startsWith('BR-HOL-001:')) {
    return 'A public holiday on this date already exists for the selected year. Please check the holiday calendar.'
  }

  if (msg.startsWith('BR-LV-006:')) {
    return 'Statutory leave types required by UAE law cannot be disabled.'
  }

  if (msg.includes('Position not found')) {
    return 'The position record could not be found. It may have been removed or the link is no longer valid.'
  }

  if (msg.includes('Department not found')) {
    return 'The department record could not be found. Please refresh and try again.'
  }

  if (msg.includes('Job not found')) {
    return 'The job record could not be found. Please refresh and try again.'
  }

  if (msg.includes('Leave type not found')) {
    return 'The leave type record could not be found. Please refresh and try again.'
  }

  if (msg.includes('circular') || msg.includes('Circular')) {
    return 'This change would create a circular reporting relationship in the organisational hierarchy. Please choose a different parent.'
  }

  // ── Workflow & Approvals ───────────────────────────────────────────────────

  if (msg.startsWith('Workflow engine error:')) {
    if (msg.includes('No active workflow')) {
      return (
        'The leave approval workflow has not been configured for your organisation. ' +
        'Your request has been saved as a draft — you can find it in Leave & Time → Leave Requests. ' +
        'Please ask your HR Administrator to configure the approval workflow, then open the draft and submit.'
      )
    }
    return (
      'The approval workflow could not be started. Your request may have been saved as a draft. ' +
      'Please check Leave Requests and try submitting again, or contact IT support.'
    )
  }

  if (msg.startsWith('DELEGATE_TO_SELF_FORBIDDEN:') || msg.startsWith('DELEGATE_REQUIRES_TARGET:')) {
    return 'You cannot delegate an approval to yourself. Please select a different person.'
  }

  if (msg.startsWith('INVALID_TARGET:')) {
    return 'The selected delegate person is not valid. Please select a valid active employee.'
  }

  if (msg.startsWith('INVALID_STAGES:')) {
    return 'The workflow stage order is not valid. Stages must be numbered consecutively starting from 1.'
  }

  if (msg.includes('request has no workflow instance') || msg.includes('submit it first')) {
    return 'This request has not been submitted for approval yet. Please submit it first.'
  }

  if (msg.startsWith('only DRAFT or REJECTED requests may be submitted')) {
    return 'Only draft or returned requests can be submitted for approval. This request is already in progress.'
  }

  if (msg.startsWith('CONFLICT:')) {
    if (msg.includes('already APPROVED')) {
      return 'This request has already been approved. Please refresh the page to see its current status.'
    }
    if (msg.includes('already REJECTED')) {
      return 'This request has already been rejected. Please refresh the page to see its current status.'
    }
    return 'This request has already been processed and cannot be actioned again. Please refresh the page to see its current status.'
  }

  if (msg.startsWith('NOT_IMPLEMENTED:')) {
    return 'This feature is not yet available. It is scheduled for a future update.'
  }

  if (msg.startsWith('duplicate sectionCode:')) {
    return 'Two sections cannot share the same code. Please use a unique code for each section.'
  }

  // ── Compliance ─────────────────────────────────────────────────────────────

  if (msg.startsWith('NOT_FOUND: compliance rule')) {
    return 'The compliance rule could not be found. Please refresh and try again.'
  }

  if (msg === 'GOVERNANCE_LOCK' || msg.startsWith('GOVERNANCE_LOCK:')) {
    return 'This compliance rule is locked and cannot be modified at this time. Please contact your Governance Officer.'
  }

  // ── Workflow templates ─────────────────────────────────────────────────────

  if (msg.startsWith('INVALID_ROLE:') || msg === 'INVALID_ROLE') {
    return 'The specified approver role is not recognised. Please select a valid role from the list.'
  }

  // Only match COMPLIANCE_VIOLATION for workflow/escalation-specific violations.
  // Leave rule minimum violations use 'below minimum' or 'UAE minimum' and are caught below.
  if (msg.includes('escalation role must outrank') || msg.includes('escalation role') ||
      (msg.startsWith('COMPLIANCE_VIOLATION:') && (msg.includes('escalation') || msg.includes('workflow')))) {
    return 'This workflow configuration violates a compliance rule. The escalation role must have higher authority than the approver role.'
  }

  // ── MDM / System fields ────────────────────────────────────────────────────

  // Specific FORBIDDEN: SYSTEM_ONLY must come before the generic FORBIDDEN: handler
  if (msg.startsWith('FORBIDDEN:') && msg.includes('SYSTEM_ONLY')) {
    return 'This item is reserved for system use and cannot be modified.'
  }

  if (msg.startsWith('SYSTEM_ONLY:') || msg === 'SYSTEM_ONLY') {
    return 'This item is reserved for system use and cannot be modified.'
  }

  // ── Database constraint violations (plain-text error messages) ─────────────

  if (msg.includes('CHECK constraint')) {
    return 'The submitted data does not meet a validation rule. Please check your entries.'
  }

  // ── Person / probation ─────────────────────────────────────────────────────

  if (msg.startsWith('BR-PR-001:') || msg.includes('probation period exceeds') || msg.includes('probation end date')) {
    return 'The probation period cannot exceed 6 months from the hire date under UAE Labour regulations.'
  }

  // ── Work schedules ────────────────────────────────────────────────────────

  if (msg.startsWith('WORK_SCHEDULE_FUTURE_DATED_UNSUPPORTED:')) {
    return 'Future-dated work schedule changes are not supported from this screen yet. Please use today or an earlier effective date.'
  }

  if (msg.startsWith('WORK_SCHEDULE_PERSON_NOT_FOUND:')) {
    return 'The employee record could not be found. Please refresh the page and try again.'
  }

  if (msg.startsWith('WORK_SCHEDULE_NOT_FOUND:')) {
    return 'The selected work schedule could not be found. Please refresh the page and select an active schedule.'
  }

  if (msg.startsWith('WORK_SCHEDULE_INACTIVE:')) {
    return 'The selected work schedule is inactive. Please choose an active schedule.'
  }

  if (msg.startsWith('WORK_SCHEDULE_ENTITY_MISMATCH:')) {
    return 'The work schedule must belong to the same legal entity as the employee.'
  }

  if (msg.startsWith('WORK_SCHEDULE_EFFECTIVE_DATE_ORDER:')) {
    return 'The new work schedule effective date must be after the current schedule start date.'
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  if (msg === 'unauthenticated' || msg === 'UNAUTHENTICATED') {
    return 'Your session has expired. Please sign in again to continue.'
  }

  if (msg === 'forbidden' || msg === 'FORBIDDEN') {
    return 'You do not have permission to perform this action. Please contact your HR administrator.'
  }

  if (msg === 'notification not found') {
    return 'This notification could not be found. It may have already been dismissed.'
  }

  // ── Timesheets ─────────────────────────────────────────────────────────────

  if (msg.includes('No person linked to this account')) {
    return 'Your account is not linked to an employee profile yet. Please contact HR to complete your setup.'
  }

  if (msg.includes('Exception not found')) {
    return 'The timesheet exception could not be found. Please refresh and try again.'
  }

  // ── Effective-date / accommodation ────────────────────────────────────────

  if (msg.startsWith('BR-ACM-002:')) {
    return 'The effective date must be today or a future date.'
  }

  // ── PDPL / Legal ───────────────────────────────────────────────────────────

  if (msg.startsWith('PDPL_CONSENT_REQUIRED:')) {
    return (
      'Employee consent under the UAE Personal Data Protection Law (PDPL) must be recorded ' +
      'before creating this record. Please obtain and record the employee\'s consent first.'
    )
  }

  // ── ARIA / AI Agent ────────────────────────────────────────────────────────

  if (msg.startsWith('ENTITY_NOT_RESOLVED:')) {
    return 'Your company account could not be identified. Please contact HR to ensure your profile is complete.'
  }

  if (msg.startsWith('NO_PERSON_LINK:') || msg.startsWith('NO_PERSON_RECORD:')) {
    return 'Your employee profile is not fully set up yet. Please contact HR to link your account.'
  }

  // ── Leave Backdate Policy ──────────────────────────────────────────────────
  //
  // Arabic rendering design:
  // The leave request form (LeaveRequestNewForm) displays errors via setError(rawMsg)
  // exactly as received — same pattern as its own inline validation messages which
  // use 'English · Arabic' bilingual strings (lines 156, 160, 163 in the form).
  // Returning the full bilingual body here means Arabic-locale users see the Arabic
  // portion in the same error banner, consistent with all other form validation errors.
  // The prefix code is always stripped; the '·' separator is preserved as-is.

  if (msg.startsWith('PERSON_NOT_FOUND:')) {
    // Person record not found during backdate policy pre-flight lookup.
    // Thrown when data.personId does not resolve to a person row — which also
    // means the transaction would fail, but we fail fast before acquiring any lock.
    return msg.replace('PERSON_NOT_FOUND:', '').trim()
  }

  if (msg.startsWith('BACKDATE_POLICY_MISSING:')) {
    // Safe-default block: no policy row configured for this leave type.
    // Return the full bilingual body (EN · AR) — the form displays both languages.
    return msg.replace('BACKDATE_POLICY_MISSING:', '').trim()
  }

  if (msg.startsWith('BACKDATE_NOT_ALLOWED:')) {
    // Backdating disabled for this leave type.
    // Return the full bilingual body (EN · AR).
    return msg.replace('BACKDATE_NOT_ALLOWED:', '').trim()
  }

  if (msg.startsWith('BACKDATE_LIMIT_EXCEEDED:')) {
    // Request start date exceeds the configured day limit.
    // Return the full bilingual body (EN · AR).
    return msg.replace('BACKDATE_LIMIT_EXCEEDED:', '').trim()
  }

  // ── Config / Guards ────────────────────────────────────────────────────────

  if (msg.startsWith('FORBIDDEN: system fields cannot be modified or deleted')) {
    return 'System-defined fields cannot be modified or deleted. Only custom fields can be changed.'
  }

  if (msg.includes('assertLeaveRuleNotBelowMinimum') || msg.includes('below minimum') || msg.includes('UAE minimum') ||
      msg.startsWith('BR-AL-001') ||
      (msg.startsWith('COMPLIANCE_VIOLATION:') && (msg.includes('below') || msg.includes('BR-AL-001') || msg.includes('annual') || msg.includes('minimum')))) {
    return (
      'This configuration would set leave entitlement below the UAE statutory minimum of 22 days per year. ' +
      'Please increase the entitlement to comply with UAE Federal Decree-Law No. 33/2021.'
    )
  }

  // ── Permission / Cross-entity (generic FORBIDDEN) ─────────────────────────

  if (msg.startsWith('FORBIDDEN: employees may only file leave for themselves')) {
    return 'You can only apply for leave on your own behalf.'
  }
  if (msg.startsWith('FORBIDDEN: employees may only submit their own leave')) {
    return 'You can only submit leave requests on your own behalf.'
  }
  if (msg.startsWith('FORBIDDEN: employees may only cancel their own leave')) {
    return 'You can only cancel your own leave requests.'
  }
  if (msg.startsWith('FORBIDDEN: employees may only view their own leave')) {
    return 'You can only view your own leave requests.'
  }
  if (msg.startsWith('FORBIDDEN: employees may only read their own record')) {
    return 'You can only view your own employee record.'
  }
  if (msg.startsWith('FORBIDDEN: employees may only read their own bank details') ||
      msg.startsWith('FORBIDDEN: employees may only retrieve their own')) {
    return 'You can only view your own information.'
  }
  if (msg.startsWith('FORBIDDEN: Can only request your own personal data')) {
    return 'You can only request a copy of your own personal data.'
  }
  if (msg.startsWith('FORBIDDEN: only the delegator') || msg.includes('deactivate this delegation')) {
    return 'Only the person who created this delegation, or an HR administrator, can deactivate it.'
  }
  if (msg.startsWith('FORBIDDEN: cannot delegate across legal entities')) {
    return 'Approval delegations cannot cross company boundaries. Please select a delegate from the same company.'
  }
  if (msg.startsWith('FORBIDDEN:')) {
    return 'You do not have permission to perform this action. If you believe this is incorrect, please contact your HR administrator.'
  }

  // ── Record not found (generic) ─────────────────────────────────────────────

  if (msg.startsWith('NOT_FOUND:') || msg.includes('not found')) {
    const subject = msg
      .replace(/^NOT_FOUND:\s*/i, '')
      .replace('not found', '')
      .trim()
    const label = subject ? `"${subject}"` : 'The record'
    return `${label.charAt(0).toUpperCase() + label.slice(1)} could not be found. It may have been deleted or the link is no longer valid. Please refresh and try again.`
  }

  // ── Legal entity / legalEntityId mismatches ────────────────────────────────

  if (msg.includes('legalEntityId not found') || msg.includes('legalEntityId is inactive')) {
    return 'The selected company entity is inactive or does not exist. Please contact your HR administrator.'
  }

  if (msg.includes('legalEntityId must match') || msg.includes('must match the person\'s entity')) {
    return 'An internal data mismatch was detected. Please refresh the page and try again.'
  }

  // ── Assignment / Employment ────────────────────────────────────────────────

  if (msg.includes('no current assignment for this person')) {
    return 'This employee does not have an active position assignment. Please assign a position first.'
  }

  // ── Account / Entity not linked ────────────────────────────────────────────

  if (msg.startsWith('NO_ENTITY:')) {
    return 'Your account is not linked to a company entity. Please contact your HR administrator.'
  }

  // ── Validation prefix ──────────────────────────────────────────────────────

  if (msg.startsWith('VALIDATION:')) {
    return msg.replace('VALIDATION:', '').trim()
  }

  // Status transition: leave request already in terminal state
  if (msg.startsWith('request is already') && msg.includes('cannot cancel')) {
    const match = msg.match(/already (\w+)/)
    const status = match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : 'processed'
    return `This request is already ${status} and cannot be cancelled.`
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// toUserMessage — convert any caught value to a displayable string.
// Use this in UI catch blocks for consistent fallback display.
// ─────────────────────────────────────────────────────────────────────────────

export function toUserMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return GENERIC_ERROR
}

// ─────────────────────────────────────────────────────────────────────────────
// getErrorMessage — for Server Actions that return { error } instead of throwing.
// Translates any caught value to a plain-English string, logs technical detail.
// Usage in catch blocks:
//   } catch (err) { return { success: false, error: getErrorMessage(err, 'actionName') } }
// ─────────────────────────────────────────────────────────────────────────────

export function getErrorMessage(e: unknown, context: string): string {
  // Reuse the full translateError logic — catch the AppError it throws
  try {
    translateError(e, context)
    return GENERIC_ERROR // unreachable — translateError always throws
  } catch (translated) {
    if (translated instanceof AppError) return translated.message
    return GENERIC_ERROR
  }
}

export const GENERIC_ERROR =
  'Something went wrong. Please try again. If this continues, contact IT support and quote the action you were performing.'

// ─────────────────────────────────────────────────────────────────────────────
// translateError — call in every Server Action's outermost catch block.
// Logs full technical detail server-side; throws AppError with human message.
// This function NEVER returns — it always throws.
// ─────────────────────────────────────────────────────────────────────────────

export function translateError(e: unknown, context: string): never {
  // Already translated — rethrow as-is so the message stays clean
  if (e instanceof AppError) throw e

  // Postgres / Drizzle DB errors carry a numeric `code` property
  if (e && typeof e === 'object' && 'code' in e) {
    const code = String((e as Record<string, unknown>).code)
    const detail = String((e as Record<string, unknown>).detail ?? '')
    console.error(`[AVANIIS:${context}] DB error ${code}:`, (e as unknown as Error).message ?? e)

    // 23503 — FK violation: parse the `detail` field to surface a meaningful message
    // rather than the generic "reference missing" fallback.
    if (code === '23503') {
      if (detail.includes('submitted_by') || detail.includes('initiated_by_person_id')) {
        throw new AppError(
          'Your user account is not linked to an employee record. ' +
          'Please contact your HR administrator to complete your profile setup ' +
          'before submitting leave requests.',
        )
      }
      if (detail.includes('absence_type_id')) {
        throw new AppError(
          'The selected leave type is no longer active or does not exist. ' +
          'Please refresh the page and select a valid leave type.',
        )
      }
      if (detail.includes('legal_entity_id') || detail.includes('legal_entity')) {
        throw new AppError(
          'The employee\'s company entity reference is missing or invalid. ' +
          'Please contact your HR administrator.',
        )
      }
      if (detail.includes('person_id') || detail.includes('person')) {
        throw new AppError(
          'The employee record could not be found or is no longer active. ' +
          'Please refresh the page and try again.',
        )
      }
    }

    const pgMsg = PG_MESSAGES[code]
    throw new AppError(
      pgMsg ??
      'A database error occurred. Please try again. If this continues, contact IT support.',
    )
  }

  if (e instanceof Error) {
    // Zod validation errors — parse errors come from Schema.parse() calls
    if (e.name === 'ZodError') {
      console.error(`[AVANIIS:${context}] Validation error:`, e.message)
      throw new AppError(
        'Some required fields are missing or contain invalid values. Please check your entries and try again.',
      )
    }

    const friendly = translateInternalMessage(e.message)
    if (friendly) {
      console.error(`[AVANIIS:${context}] Business rule:`, e.message)
      throw new AppError(friendly)
    }

    // Unrecognised Error — log full stack for IT, show generic message to user
    console.error(`[AVANIIS:${context}] Unhandled error:`, e)
    throw new AppError(GENERIC_ERROR)
  }

  console.error(`[AVANIIS:${context}] Unknown throw (non-Error):`, e)
  throw new AppError(GENERIC_ERROR)
}

// ─────────────────────────────────────────────────────────────────────────────
// safeAction — thin wrapper for Server Actions that use the return-object
// pattern { success, error } instead of throwing.
// Usage:
//   return safeAction(() => { ...logic... return { id } }, 'actionName')
// ─────────────────────────────────────────────────────────────────────────────

export async function safeAction<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    translateError(e, context) // always throws AppError
  }
}
