/**
 * Absence module — TypeScript view-model interfaces for Sprint 5.
 *
 * The Drizzle row types live in ./schema. These are the shapes the UI
 * consumes (denormalised joins, balance snapshots, accrual results).
 */

export interface LeaveRequestListRow {
  id:                  string
  requestNumber:       string
  personId:            string
  personNumber:        string | null
  personFullNameEn:    string | null
  personFullNameAr:    string | null
  legalEntityId:       string
  absenceTypeId:       string
  absenceTypeCode:     string | null
  absenceTypeNameEn:   string | null
  absenceTypeNameAr:   string | null
  startDate:           string
  endDate:             string
  durationDays:        string
  isHalfDay:           boolean
  halfDayPeriod:       string | null
  status:              string
  submittedVia:        string
  submittedBy:         string
  approvedBy:          string | null
  rejectionReason:     string | null
  workflowInstanceId:  string | null
  createdDate:         Date
}

export interface PaginatedLeaveRequests {
  rows:       LeaveRequestListRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

/** Detailed view used by the leave-request detail page. */
export interface LeaveRequestDetail extends LeaveRequestListRow {
  notes:                  string | null
  rejectionReason:        string | null
  approvalDate:           Date | null
  medicalCertRequired:    boolean
  medicalCertUploaded:    boolean
  medicalCertDocumentId:  string | null
  medicalCertDeadline:    string | null
  balanceBeforeDays:      string | null
  balanceAfterDays:       string | null
  payDeductionAmount:     string | null
  ariaRecommendation:     string | null
  ariaConfidenceScore:    string | null
  extraData:              Record<string, unknown>
}

/** Snapshot of a single (person, absenceType, year) balance row. */
export interface LeaveBalanceSnapshot {
  personId:           string
  absenceTypeId:      string
  absenceTypeCode:    string | null
  absenceTypeNameEn:  string | null
  balanceYear:        number
  openingBalanceDays: number
  accruedDays:        number
  takenDays:          number
  pendingDays:        number
  adjustedDays:       number
  carriedForwardDays: number
  forfeitedDays:      number
  closingBalanceDays: number
  lastAccrualDate:    string | null
  nextAccrualDate:    string | null
}

/** Result of `accrueMonthlyBalance` — what the engine wrote (or chose not to). */
export interface AccrualResult {
  personId:        string
  absenceTypeId:   string
  balanceYear:     number
  monthAccruedFor: string  // YYYY-MM-01
  daysAccrued:     number
  newAccruedDays:  number
  skipped:         boolean
  skipReason?:     string
}

/** Result of `enforceCarryForwardExpiry` per balance row touched. */
export interface CarryForwardExpiryResult {
  balanceId:        string
  personId:         string
  absenceTypeId:    string
  expiredDays:      number
  newCarriedForwardDays: number
}

/** Public-holiday + blackout-period overlay used by the calendar Server Component. */
export interface CalendarOverlay {
  publicHolidays: Array<{
    id:           string
    holidayDate:  string
    endDate:      string | null
    durationDays: number
    holidayCode:  string
    nameEn:       string
    nameAr:       string
    isFloating:   boolean
    isConfirmed:  boolean
  }>
  blackoutPeriods: Array<{
    id:               string
    nameEn:           string
    nameAr:           string | null
    startDate:        string
    endDate:          string
    departmentId:     string | null
    absenceTypeCodes: string[] | null
    minCoveragePct:   number
  }>
  approvedLeave: Array<{
    id:               string
    personId:         string
    personFullNameEn: string | null
    personFullNameAr: string | null
    startDate:        string
    endDate:          string
    durationDays:     string
    absenceTypeCode:  string | null
    absenceTypeNameEn: string | null
  }>
}
