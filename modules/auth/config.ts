export type KRole =
  | 'HR_ADMIN'
  | 'HR_DIRECTOR'
  | 'PAYROLL_ADMIN'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'FINANCE'
  | 'SUPER_ADMIN'

export const ALL_ROLES: { value: KRole; label: string }[] = [
  { value: 'EMPLOYEE',      label: 'Employee' },
  { value: 'MANAGER',       label: 'Line Manager' },
  { value: 'HR_ADMIN',      label: 'HR Admin' },
  { value: 'HR_DIRECTOR',   label: 'HR Director' },
  { value: 'PAYROLL_ADMIN', label: 'Payroll Admin' },
  { value: 'FINANCE',       label: 'Finance' },
  { value: 'SUPER_ADMIN',   label: 'Super Admin' },
]

export type UserRow = {
  accountId:        string
  personId:         string
  personNumber:     string | null   // e.g. AVN-000123
  fullNameEn:       string | null
  primaryEmail:     string
  avaniisRole:      string
  departmentId:     string | null
  departmentNameEn: string | null
  isActive:         boolean
  lastLoginAt:      string | null
  loginCount:       number
  mfaEnrolled:      boolean
  // Person-level type info for user-type filter
  isSystemUser:     boolean
  employmentType:   string | null
  // WHO / audit columns
  createdByName:    string | null
  createdDate:      string | null
  updatedByName:    string | null
  updatedDate:      string | null
}

export type DepartmentOption = {
  id:           string
  nameEn:       string | null
  entityNameEn: string | null
  isInactive?:  boolean   // true when dept or entity is inactive but user is currently assigned there
}

export type PersonOption = {
  id:               string
  fullNameEn:       string | null
  departmentNameEn: string | null
  legalEntityId:    string
}

export type EntityOption = {
  id:     string
  nameEn: string
}
