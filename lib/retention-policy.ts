/**
 * GAP-C04 FIX: UAE PDPL data retention schedules.
 * All retention periods verified against UAE PDPL 2021 and UAE Labour Law.
 */
export const DATA_RETENTION_POLICY = {
  // Employment records: active + 7 years post-separation (financial audit requirement)
  EMPLOYMENT_RECORDS_YEARS: 7,
  // Identity documents (passport, EID): active + 5 years post-separation
  IDENTITY_DOCUMENTS_YEARS: 5,
  // Payroll records: active + 7 years (Federal Tax Authority requirement)
  PAYROLL_RECORDS_YEARS: 7,
  // Audit logs: 7 years (immutable — REVOKE DELETE enforced at DB level)
  AUDIT_LOG_YEARS: 7,
  // ARIA conversation logs: 90 days rolling (employee can request deletion)
  ARIA_CONVERSATION_DAYS: 90,
  // Medical certificates: active + 5 years
  MEDICAL_CERT_YEARS: 5,
} as const
