import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'app/(hr-admin)/master-data/grades/components/GradeActions.ts'), 'utf8')

describe('grade master-data hardening', () => {
  it('server actions use role gates instead of trusting page-only access', () => {
    const src = source()
    expect(src).toContain("requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])")
    expect(src).toContain("requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])")
    expect(src).not.toContain('const session = await auth()')
  })

  it('HR Admin grade writes are entity-scoped and cannot create enterprise-wide grades', () => {
    const src = source()
    expect(src).toContain('function assertGradeEntityScope')
    expect(src).toContain('HR Admins cannot create or modify enterprise-wide grades')
    expect(src).toContain('HR Admins can only manage grades in their own legal entity')
    expect(src.match(/assertGradeEntityScope\(actor/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('salary band validation rejects non-numeric and negative values server-side', () => {
    const src = source()
    expect(src).toContain('Number.isFinite(value)')
    expect(src).toContain('value < 0')
    expect(src).toContain('`${label} cannot be negative.`')
  })
})
