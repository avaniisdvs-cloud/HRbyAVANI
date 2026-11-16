import { PageTitle } from '@/components/ui/typography'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  onboardingChecklists, onboardingChecklistItems,
  persons, legalEntities,
} from '@/drizzle/schema'
import { and, eq, desc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { ExitClearanceItemActions } from './ExitClearanceItemActions'
import { ArrowLeft, LogOut, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Exit Clearance · AVANIIS HR' }

const ALLOWED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] as const

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'Pending',     color: 'var(--ink-3)', bg: 'var(--surface)' },
  IN_PROGRESS: { label: 'In Progress', color: '#d97706',      bg: 'rgba(217,119,6,0.08)' },
  COMPLETED:   { label: 'Completed',   color: '#16a34a',      bg: 'rgba(22,163,74,0.08)' },
  WAIVED:      { label: 'Waived',      color: '#6366f1',      bg: 'rgba(99,102,241,0.08)' },
  OVERDUE:     { label: 'Overdue',     color: '#dc2626',      bg: 'rgba(220,38,38,0.08)' },
}

const CATEGORY_ORDER = ['IT', 'MANAGER', 'HR', 'PAYROLL', 'DOCUMENT', 'TRAINING']

export default async function ExitClearanceDetailPage({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    redirect('/dashboard')
  }

  const { personId } = await params

  const [person] = await db
    .select({
      id:              persons.id,
      personNumber:    persons.personNumber,
      fullNameEn:      persons.fullNameEn,
      fullNameAr:      persons.fullNameAr,
      separationDate:  persons.separationDate,
      legalEntityName: legalEntities.nameEn,
    })
    .from(persons)
    .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)

  if (!person) notFound()

  const [checklist] = await db
    .select()
    .from(onboardingChecklists)
    .where(
      and(
        eq(onboardingChecklists.tenantId,      TENANT_ID),
        eq(onboardingChecklists.personId,      personId),
        eq(onboardingChecklists.checklistType, 'OFFBOARDING'),
      ),
    )
    .orderBy(desc(onboardingChecklists.initiatedDate))
    .limit(1)

  if (!checklist) notFound()

  const items = await db
    .select()
    .from(onboardingChecklistItems)
    .where(
      and(
        eq(onboardingChecklistItems.tenantId,     TENANT_ID),
        eq(onboardingChecklistItems.checklistId,  checklist.id),
      ),
    )
    .orderBy(onboardingChecklistItems.dueDaysFromStart)

  // Group by category in defined order
  const byCategory = CATEGORY_ORDER.reduce<Record<string, typeof items>>((acc, cat) => {
    const group = items.filter(i => i.category === cat)
    if (group.length > 0) acc[cat] = group
    return acc
  }, {})
  const otherItems = items.filter(i => !CATEGORY_ORDER.includes(i.category ?? ''))
  if (otherItems.length > 0) byCategory['OTHER'] = otherItems

  const pct       = checklist.completionPct ?? 0
  const isComplete = checklist.status === 'COMPLETED'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      {/* Back link */}
      <Link
        href="/admin/exit-clearance"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-body)', color: 'var(--ink-3)', textDecoration: 'none', marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> Exit Clearance
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: isComplete ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)',
          color: isComplete ? '#16a34a' : '#d97706',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-lead)', fontWeight: 800, flexShrink: 0,
        }}>
          {(person.fullNameEn || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <PageTitle style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            {person.fullNameEn ?? '—'}
          </PageTitle>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            {person.personNumber} · {person.legalEntityName ?? '—'}
          </p>
          {person.separationDate && (
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              Last working day: {new Date(person.separationDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Progress ring summary */}
        <div style={{ textAlign: 'right', minWidth: 140 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: pct === 100 ? '#16a34a' : 'var(--ink-1)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>
            {pct}%
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
            {items.filter(i => i.status === 'COMPLETED' || i.status === 'WAIVED').length} / {items.length} items done
          </div>
          <div style={{ height: 6, borderRadius: 6, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 6,
              background: pct === 100 ? '#16a34a' : pct >= 60 ? 'var(--accent)' : '#d97706',
              width: `${pct}%`, transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      {/* Items by category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {Object.entries(byCategory).map(([cat, catItems]) => (
          <CategorySection
            key={cat}
            category={cat}
            items={catItems}
          />
        ))}
      </div>
    </div>
  )
}

const CATEGORY_LABELS: Record<string, { en: string; ar: string; color: string }> = {
  IT:       { en: 'IT & Access',       ar: 'تقنية المعلومات والوصول',    color: '#3b82f6' },
  MANAGER:  { en: 'Manager Tasks',     ar: 'مهام المدير',                color: '#8b5cf6' },
  HR:       { en: 'HR',                ar: 'الموارد البشرية',            color: 'var(--brand-active)' },
  PAYROLL:  { en: 'Payroll',           ar: 'الرواتب',                   color: '#16a34a' },
  DOCUMENT: { en: 'Documents',         ar: 'المستندات',                  color: '#d97706' },
  TRAINING: { en: 'Training',          ar: 'التدريب',                   color: '#ec4899' },
  OTHER:    { en: 'Other',             ar: 'أخرى',                      color: 'var(--ink-3)' },
}

function CategorySection({
  category, items,
}: {
  category: string
  items: { id: string; itemNameEn: string; itemNameAr: string | null; status: string | null; isMandatory: boolean | null; notes: string | null; completedDate: string | null; dueDaysFromStart: number | null; assignedToRole: string | null }[]
}) {
  const meta = CATEGORY_LABELS[category] ?? { en: category, ar: category, color: 'var(--ink-3)' }
  const done = items.filter(i => i.status === 'COMPLETED' || i.status === 'WAIVED').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {meta.en}
        </span>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>({meta.ar})</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          {done}/{items.length}
        </span>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, idx) => {
          const s = STATUS_CONFIG[item.status ?? 'PENDING'] ?? STATUS_CONFIG.PENDING

          return (
            <div
              data-responsive-grid="true" key={item.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                gap: 12, alignItems: 'center', padding: '12px 16px',
                background: idx % 2 === 0 ? 'var(--card)' : 'var(--surface)',
                borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                    {item.itemNameEn}
                  </span>
                  {item.isMandatory && (
                    <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '1px 6px', borderRadius: 10 }}>
                      MANDATORY
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 2 }}>
                  {item.assignedToRole && <span>Assigned: {item.assignedToRole.replace('_', ' ')}</span>}
                  {item.completedDate && <span style={{ marginLeft: 10 }}>· Completed {new Date(item.completedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                  {item.notes && <span style={{ marginLeft: 10, fontStyle: 'italic', color: 'var(--ink-3)' }}>· {item.notes}</span>}
                </div>
              </div>

              <ExitClearanceItemActions
                itemId={item.id}
                status={item.status ?? 'PENDING'}
                isMandatory={item.isMandatory ?? true}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
