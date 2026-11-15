/**
 * AVANIIS HCM — Dashboard Drill-Down & Data Integrity Tests
 *
 * Verifies that every HR-Admin / Super-Admin dashboard metric card is clickable
 * and drills down using the SAME filter logic as its summary count, that the
 * Headcount-by-department rows filter by departmentId (not name), that 0-count
 * departments are not clickable, and that no hardcoded/guessed holiday data
 * remains anywhere in the dashboard or holiday-admin paths.
 *
 * Tests are source-inspection only (fs.readFileSync) — no module imports, no DB.
 *
 * Tests:
 *   DASH-DRILL-001: Active Headcount card links to /persons?status=ACTIVE&isActive=1
 *   DASH-DRILL-002: On Leave Today card links to /absence?status=APPROVED with today range
 *   DASH-DRILL-003: dashboard passes server-computed `today` into AdminDashboard
 *   DASH-DRILL-004: Pending Approvals card remains a clickable Link
 *   DASH-DRILL-005: Overtime Alerts is NOT a Link and shows a "coming soon" state
 *   DASH-DRILL-006: DeptBarRow drill-down uses departmentId (not department name)
 *   DASH-DRILL-007: DeptBarRow drill-down scopes to ACTIVE employees (reconciles with count)
 *   DASH-DRILL-008: DeptBarRow with count === 0 renders no <Link> (non-clickable)
 *   DASH-DRILL-009: dashboard dept query selects departments.id (so id can drill down)
 *   DASH-DRILL-010: On-Leave-Today count is entity-scoped for non-SUPER_ADMIN
 *   DASH-DRILL-011: persons page parses the isActive search param (tri-state)
 *   DASH-DRILL-012: persons page preserves isActive across pagination links
 *   DASH-DRILL-013: persons page shows an "Active Headcount" context chip
 *   DASH-DRILL-014: HolidayClient no longer contains the hardcoded UAE_2026_HOLIDAYS array
 *   DASH-DRILL-015: HolidayClient contains no hardcoded Eid Al Adha / 2026-06-06 dates
 *   DASH-DRILL-016: dashboard holidays come only from the publicHolidays DB query
 *   DASH-DRILL-017: AdminDashboard renders no hardcoded holiday strings/dates
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const dashboardPageSrc = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/dashboard/page.tsx'),                     'utf-8')
const adminDashSrc     = fs.readFileSync(path.join(ROOT, 'components/dashboard/AdminDashboard.tsx'),               'utf-8')
const deptBarSrc       = fs.readFileSync(path.join(ROOT, 'components/dashboard/DeptBarRow.tsx'),                   'utf-8')
const kpiCardSrc       = fs.readFileSync(path.join(ROOT, 'components/dashboard/KpiCardLink.tsx'),                  'utf-8')
const personsPageSrc   = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/persons/page.tsx'),                      'utf-8')
const holidayClientSrc = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/master-data/holiday-calendars/components/HolidayClient.tsx'), 'utf-8')

describe('Dashboard drill-down & data integrity', () => {
  it('DASH-DRILL-001: Active Headcount links to active employees list', () => {
    expect(adminDashSrc).toMatch(/href="\/persons\?status=ACTIVE&isActive=1"/)
  })

  it('DASH-DRILL-002: On Leave Today links to approved absences overlapping today', () => {
    expect(adminDashSrc).toMatch(/\/absence\?status=APPROVED&fromDate=\$\{today\}&toDate=\$\{today\}/)
  })

  it('DASH-DRILL-003: dashboard passes server-computed today into AdminDashboard', () => {
    expect(dashboardPageSrc).toMatch(/today=\{today\}/)
    // today is derived from new Date()...toISOString().slice(0,10)
    expect(dashboardPageSrc).toMatch(/const today\s*=\s*new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
  })

  it('DASH-DRILL-004: Pending Approvals remains a clickable drill-down', () => {
    expect(adminDashSrc).toMatch(/href="\/workflows"/)
  })

  it('DASH-DRILL-005: Overtime Alerts is not a Link and is marked coming soon', () => {
    // The Overtime card must not be wrapped in a Link to a fake metric route.
    expect(adminDashSrc).not.toMatch(/href="\/timesheets/)
    // It must be explicitly disabled and labelled.
    expect(adminDashSrc).toMatch(/aria-disabled="true"/)
    expect(adminDashSrc).toMatch(/Coming soon/)
    // No fake em-dash metric value masquerading as data.
    expect(adminDashSrc).not.toMatch(/numStyle[^}]*\}\}>—<\/div>/)
  })

  it('DASH-DRILL-006: DeptBarRow drills down by departmentId, not department name', () => {
    expect(deptBarSrc).toMatch(/departmentId=\$\{encodeURIComponent\(id\)\}/)
    // The old name-based param must be gone.
    expect(deptBarSrc).not.toMatch(/department=\$\{encodeURIComponent\(name\)\}/)
  })

  it('DASH-DRILL-007: DeptBarRow drill-down scopes to ACTIVE employees', () => {
    expect(deptBarSrc).toMatch(/status=ACTIVE&isActive=1/)
  })

  it('DASH-DRILL-008: DeptBarRow with count 0 is not clickable', () => {
    expect(deptBarSrc).toMatch(/if \(count === 0\)/)
    // The zero branch returns a plain <div>, not a <Link>.
    const zeroBranch = deptBarSrc.slice(deptBarSrc.indexOf('if (count === 0)'))
    const firstReturn = zeroBranch.slice(0, zeroBranch.indexOf('}'))
    expect(firstReturn).not.toMatch(/<Link/)
  })

  it('DASH-DRILL-009: dashboard dept query selects departments.id', () => {
    expect(dashboardPageSrc).toMatch(/id:\s*departments\.id/)
  })

  it('DASH-DRILL-010: On-Leave-Today count is entity-scoped for non-SUPER_ADMIN', () => {
    const block = dashboardPageSrc.slice(
      dashboardPageSrc.indexOf('const leaveTodayConds'),
      dashboardPageSrc.indexOf('const balanceConds'),
    )
    expect(block).toMatch(/!isSuperAdmin && entityId/)
    expect(block).toMatch(/eq\(absenceEntries\.legalEntityId, entityId\)/)
  })

  it('DASH-DRILL-011: persons page parses the isActive search param (tri-state)', () => {
    expect(personsPageSrc).toMatch(/sp\.isActive === '1'\s*\?\s*true\s*:\s*sp\.isActive === '0'\s*\?\s*false\s*:\s*undefined/)
    expect(personsPageSrc).toMatch(/isActive,/)
  })

  it('DASH-DRILL-012: persons page applies isActive server-side via listPersons', () => {
    // Option D redesign (2026-06): the page has no pagination links any more —
    // the master–detail list loads one server-filtered page. isActive must be
    // passed INTO listPersons so drill-down rows are filtered at the source.
    expect(personsPageSrc).toMatch(/listPersons\(\{[\s\S]*?isActive,[\s\S]*?\}\)/)
  })

  it('DASH-DRILL-013: persons page shows an Active Headcount context chip', () => {
    expect(personsPageSrc).toMatch(/isActiveHeadcountView/)
    expect(personsPageSrc).toMatch(/Active Headcount/)
    // Department context chip resolves a real department name from fetched rows.
    expect(personsPageSrc).toMatch(/deptRows\.find\(d => d\.id === filter\.departmentId\)/)
  })

  it('DASH-DRILL-014: HolidayClient no longer contains hardcoded UAE_2026_HOLIDAYS', () => {
    expect(holidayClientSrc).not.toMatch(/const UAE_2026_HOLIDAYS\s*=/)
    expect(holidayClientSrc).not.toMatch(/UAE_2026_HOLIDAYS\.map/)
  })

  it('DASH-DRILL-015: HolidayClient contains no hardcoded holiday date literals', () => {
    // The wrong guessed Eid Al Adha date must be gone.
    expect(holidayClientSrc).not.toMatch(/2026-06-06/)
    // No holiday-object literal carrying a hardcoded ISO date may remain.
    // (Form-field placeholders like "e.g. EID_FITR_2026" are fine — they are
    //  example hints, not injected data.)
    expect(holidayClientSrc).not.toMatch(/date:\s*'20\d\d-\d\d-\d\d'/)
  })

  it('DASH-DRILL-016: dashboard holidays come only from the publicHolidays DB query', () => {
    expect(dashboardPageSrc).toMatch(/\.from\(publicHolidays\)/)
    expect(dashboardPageSrc).toMatch(/rawHolidays\.map/)
  })

  it('DASH-DRILL-017: AdminDashboard renders no hardcoded holiday strings/dates', () => {
    expect(adminDashSrc).not.toMatch(/Eid Al Adha/)
    expect(adminDashSrc).not.toMatch(/2026-0[0-9]-[0-9]{2}/)
    // Holidays are received as a prop and rendered via LeaveUtilCard only.
    expect(adminDashSrc).toMatch(/holidays=\{holidays\}/)
  })

  // ── Visible affordances (the change must be testable by eye) ──────────────

  it('DASH-DRILL-018: KpiCardLink has a persistent ↗ affordance + hover lift', () => {
    expect(kpiCardSrc).toMatch(/ArrowUpRight/)
    // Arrow is rendered unconditionally (not gated on hover state).
    expect(kpiCardSrc).toMatch(/<ArrowUpRight/)
    // Hover lift / accent border feedback present.
    expect(kpiCardSrc).toMatch(/translateY\(-2px\)/)
    expect(kpiCardSrc).toMatch(/borderColor: 'var\(--accent\)'/)
    expect(kpiCardSrc).toMatch(/cursor: 'pointer'/)
  })

  it('DASH-DRILL-019: the 3 clickable KPI cards use KpiCardLink', () => {
    expect(adminDashSrc).toMatch(/import \{ KpiCardLink \}/)
    const kpiLinks = adminDashSrc.match(/<KpiCardLink/g) ?? []
    expect(kpiLinks.length).toBe(3)
  })

  it('DASH-DRILL-020: clickable dept rows show a chevron; 0-count rows do not', () => {
    expect(deptBarSrc).toMatch(/ChevronRight/)
    // The 0-count branch (returned before the <Link>) must not render a chevron.
    const zeroBranch = deptBarSrc.slice(
      deptBarSrc.indexOf('if (count === 0)'),
      deptBarSrc.indexOf('return (\n    <Link'),
    )
    expect(zeroBranch).not.toMatch(/<ChevronRight/)
    // data-clickable markers distinguish the two states for UAT/inspection.
    expect(deptBarSrc).toMatch(/data-clickable="true"/)
    expect(deptBarSrc).toMatch(/data-clickable="false"/)
  })

  it('DASH-DRILL-021: dept section has a "click to view" discoverability hint', () => {
    expect(adminDashSrc).toMatch(/Click a department to view its active employees/)
  })
})
