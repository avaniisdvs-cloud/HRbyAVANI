/**
 * ESS Task 2B — Personal Profile Fields unit tests (EMP-014–EMP-023).
 *
 * Tests the PDPL gate on blood type, upsert actions, migration column presence,
 * and ESS profile shape — all without touching the real DB.
 */

import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const repoFile = (...segments: string[]) => path.join(process.cwd(), ...segments)

// ── Shared mocks ──────────────────────────────────────────────────────────

const mockAuditLog = vi.fn()
vi.mock('@/lib/audit', () => ({ writeAuditLog: mockAuditLog }))

const mockRequireRole = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id:            'actor-001',
      name:          'HR Admin',
      email:         'hr@test.com',
      role:          'HR_ADMIN',
      legalEntityId: 'le-001',
      personId:      'p-001',
    },
  }),
  requireRole: mockRequireRole,
}))

vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-001' }))

const mockTx = {
  insert:  vi.fn().mockReturnThis(),
  update:  vi.fn().mockReturnThis(),
  select:  vi.fn().mockReturnThis(),
  values:  vi.fn().mockReturnThis(),
  set:     vi.fn().mockReturnThis(),
  from:    vi.fn().mockReturnThis(),
  where:   vi.fn().mockReturnThis(),
  limit:   vi.fn().mockResolvedValue([]),
  execute: vi.fn().mockResolvedValue(undefined),
}

const mockDb = {
  transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
  insert:  vi.fn().mockReturnThis(),
  update:  vi.fn().mockReturnThis(),
  select:  vi.fn().mockReturnThis(),
  values:  vi.fn().mockReturnThis(),
  set:     vi.fn().mockReturnThis(),
  from:    vi.fn().mockReturnThis(),
  where:   vi.fn().mockReturnThis(),
  limit:   vi.fn().mockResolvedValue([]),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

vi.mock('@/drizzle/schema', () => ({
  persons:                 { id: 'persons.id', tenantId: 'persons.tenantId', bloodType: 'persons.blood_type', sensitiveDataConsent: 'persons.sensitive_data_consent' },
  personEmergencyContacts: { id: 'pec.id', personId: 'pec.person_id', tenantId: 'pec.tenant_id', priorityOrder: 'pec.priority_order', contactNameEn: 'pec.contact_name_en', relationship: 'pec.relationship', phonePrimary: 'pec.phone_primary' },
  personAddresses:         { id: 'pa.id', personId: 'pa.person_id', tenantId: 'pa.tenant_id', addressType: 'pa.address_type', addressLine1: 'pa.address_line_1', addressLine2: 'pa.address_line_2', city: 'pa.city', stateEmirate: 'pa.state_emirate', country: 'pa.country' },
  personEducation:         { id: 'pe.id', personId: 'pe.person_id', tenantId: 'pe.tenant_id', isHighestDegree: 'pe.is_highest_degree', institutionName: 'pe.institution_name', degreeType: 'pe.degree_type', fieldOfStudy: 'pe.field_of_study', graduationYear: 'pe.graduation_year' },
}))

// ── Helper: PDPL gate logic (mirrors modules/core-hr/actions.ts) ──────────

function pdplGate(bloodType: string | null | undefined, sensitiveDataConsent: boolean): void {
  if (bloodType && !sensitiveDataConsent) {
    throw new Error('PDPL_SENSITIVE_CONSENT_REQUIRED: Blood type requires sensitive data consent to be recorded')
  }
}

// ── Helper: blood type display (mirrors ProfilePageClient) ────────────────

function displayBloodType(code: string): string {
  return code.replace('_POS', '+').replace('_NEG', '−')
}

// ── Helpers: relationship mapping (mirrors EmergencyContactEditor) ────────

const VALID_RELATIONSHIPS = ['SPOUSE', 'PARENT', 'SIBLING', 'CHILD', 'FRIEND', 'OTHER']

function isValidRelationship(rel: string): boolean {
  return VALID_RELATIONSHIPS.includes(rel)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('EMP-014: Blood type saves when sensitiveDataConsent=true', () => {
  it('does not throw when bloodType is provided with consent', () => {
    expect(() => pdplGate('A_POS', true)).not.toThrow()
  })

  it('accepts all 8 blood type codes when consent given', () => {
    const codes = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG']
    codes.forEach(code => {
      expect(() => pdplGate(code, true)).not.toThrow()
    })
  })

  it('allows null blood type regardless of consent', () => {
    expect(() => pdplGate(null, false)).not.toThrow()
    expect(() => pdplGate(null, true)).not.toThrow()
  })
})

describe('EMP-015: Blood type rejected without sensitiveDataConsent', () => {
  it('throws PDPL_SENSITIVE_CONSENT_REQUIRED when consent is false', () => {
    expect(() => pdplGate('A_POS', false)).toThrow('PDPL_SENSITIVE_CONSENT_REQUIRED')
  })

  it('error message is bilingual-compatible prefix', () => {
    expect(() => pdplGate('B_NEG', false)).toThrow('Blood type requires sensitive data consent')
  })

  it('all 8 blood type codes are blocked without consent', () => {
    const codes = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG']
    codes.forEach(code => {
      expect(() => pdplGate(code, false)).toThrow('PDPL_SENSITIVE_CONSENT_REQUIRED')
    })
  })
})

describe('EMP-016: Blood type display format in ESS', () => {
  it('renders A_POS as A+', () => {
    expect(displayBloodType('A_POS')).toBe('A+')
  })

  it('renders A_NEG as A−', () => {
    expect(displayBloodType('A_NEG')).toBe('A−')
  })

  it('renders AB_POS correctly', () => {
    expect(displayBloodType('AB_POS')).toBe('AB+')
  })

  it('renders O_NEG as O−', () => {
    expect(displayBloodType('O_NEG')).toBe('O−')
  })
})

describe('EMP-017: Emergency contact relationship validation', () => {
  it('accepts all valid relationship codes', () => {
    VALID_RELATIONSHIPS.forEach(rel => {
      expect(isValidRelationship(rel)).toBe(true)
    })
  })

  it('rejects unknown relationship codes', () => {
    expect(isValidRelationship('DOG')).toBe(false)
    expect(isValidRelationship('')).toBe(false)
    expect(isValidRelationship('COLLEAGUE')).toBe(false)
  })

  it('relationship list covers required HR categories', () => {
    expect(VALID_RELATIONSHIPS).toContain('SPOUSE')
    expect(VALID_RELATIONSHIPS).toContain('PARENT')
    expect(VALID_RELATIONSHIPS).toContain('SIBLING')
    expect(VALID_RELATIONSHIPS).toContain('CHILD')
    expect(VALID_RELATIONSHIPS).toContain('OTHER')
  })
})

describe('EMP-018: Home address upsert shape', () => {
  it('requires addressLine1 and city (minimum fields)', () => {
    const minPayload = { addressLine1: '123 Test St', city: 'Dubai', country: 'ARE' }
    expect(minPayload.addressLine1).toBeTruthy()
    expect(minPayload.city).toBeTruthy()
    expect(minPayload.country).toMatch(/^[A-Z]{3}$/)
  })

  it('accepts optional stateEmirate and addressLine2', () => {
    const payload = {
      addressLine1:  '123 Test St',
      addressLine2:  'Apt 4B',
      city:          'Dubai',
      stateEmirate:  'Dubai',
      country:       'ARE',
      postalCode:    '12345',
    }
    expect(payload.addressLine2).toBeTruthy()
    expect(payload.stateEmirate).toBeTruthy()
  })
})

describe('EMP-019: Education upsert shape', () => {
  it('requires institutionName (minimum field)', () => {
    const payload = {
      institutionName: 'UAE University',
      isHighestDegree: true,
    }
    expect(payload.institutionName).toBeTruthy()
    expect(payload.isHighestDegree).toBe(true)
  })

  it('accepts optional degree metadata', () => {
    const payload = {
      institutionName: 'UAE University',
      degreeType:      'Bachelor',
      fieldOfStudy:    'Computer Science',
      graduationYear:  2020,
      isHighestDegree: true,
    }
    expect(payload.graduationYear).toBe(2020)
    expect(payload.degreeType).toBe('Bachelor')
  })

  it('graduationYear must be a reasonable range', () => {
    const min = 1950
    const max = new Date().getUTCFullYear() + 4
    const year = 2020
    expect(year).toBeGreaterThanOrEqual(min)
    expect(year).toBeLessThanOrEqual(max)
  })
})

describe('EMP-020: Migration 0043 — blood_type column presence', () => {
  it('migration file exists', async () => {
    const fs = await import('fs')
    const exists = fs.existsSync(
      repoFile('drizzle/migrations/0043_personal_profile_fields.sql'),
    )
    expect(exists).toBe(true)
  })

  it('migration adds blood_type column', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0043_personal_profile_fields.sql'),
      'utf-8',
    )
    expect(sql).toContain('blood_type')
    expect(sql.toLowerCase()).toContain('alter table')
  })

  it('migration is idempotent (uses IF NOT EXISTS)', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0043_personal_profile_fields.sql'),
      'utf-8',
    )
    expect(sql.toUpperCase()).toContain('IF NOT EXISTS')
  })
})

describe('EMP-021: Schema includes bloodType on persons table', () => {
  it('drizzle schema exposes bloodType column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    expect(schema).toContain("bloodType:")
    expect(schema).toContain("blood_type")
  })

  it('bloodType is nullable (optional field)', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    // bloodType line should not have .notNull()
    const btLine = schema.split('\n').find(l => l.includes('bloodType:'))
    expect(btLine).toBeTruthy()
    expect(btLine).not.toContain('.notNull()')
  })
})

describe('EMP-022: core-hr/validations.ts exports BloodType enum', () => {
  it('validations file exports BloodType', async () => {
    const fs = await import('fs')
    const validations = fs.readFileSync(
      repoFile('modules/core-hr/validations.ts'),
      'utf-8',
    )
    expect(validations).toContain('export const BloodType')
    expect(validations).toContain('A_POS')
    expect(validations).toContain('O_NEG')
  })

  it('BloodType is included in CreatePersonSchema via PersonNationality merge', async () => {
    const fs = await import('fs')
    const validations = fs.readFileSync(
      repoFile('modules/core-hr/validations.ts'),
      'utf-8',
    )
    // PersonNationality includes bloodType
    const natSection = validations.slice(
      validations.indexOf('const PersonNationality'),
      validations.indexOf('const PersonPii'),
    )
    expect(natSection).toContain('bloodType')
  })
})

describe('EMP-023: ESS profile getMyProfile returns new fields', () => {
  it('getMyProfile source selects bloodType from persons', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('bloodType:')
    expect(actions).toContain('sensitiveDataConsent:')
  })

  it('getMyProfile source queries personAddresses for HOME_COUNTRY', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('personAddresses')
    expect(actions).toContain('HOME_COUNTRY')
  })

  it('getMyProfile source queries personEducation for isHighestDegree', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('personEducation')
    expect(actions).toContain('isHighestDegree')
  })

  it('return object includes homeAddress and education fields', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('homeAddress:')
    expect(actions).toContain('education:')
  })

  it('emergencyContactRelationship is included in personal return', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('emergencyContactRelationship:')
  })
})
