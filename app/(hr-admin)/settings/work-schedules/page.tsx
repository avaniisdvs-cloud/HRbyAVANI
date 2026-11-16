import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { workSchedules } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Work schedules · AVANIIS HR' }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * S10-08 — Work schedules admin (Server Component).
 *
 * Lists all work_schedules rows. Shows per-schedule: code, bilingual name,
 * type, hours/week, weekend days, and the Mon–Sun start/end times in a
 * compact grid. Default and Ramadan schedules are flagged.
 */
export default async function WorkSchedulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const locale = await resolveLocale(session.user.personId)

  const schedules = await db
    .select({
      id:                  workSchedules.id,
      scheduleCode:        workSchedules.scheduleCode,
      scheduleNameEn:      workSchedules.scheduleNameEn,
      scheduleNameAr:      workSchedules.scheduleNameAr,
      scheduleType:        workSchedules.scheduleType,
      totalHoursPerWeek:   workSchedules.totalHoursPerWeek,
      weekendDays:         workSchedules.weekendDays,
      breakMinutes:        workSchedules.breakMinutes,
      isRamadanSchedule:   workSchedules.isRamadanSchedule,
      ramadanHoursPerDay:  workSchedules.ramadanHoursPerDay,
      isActive:            workSchedules.isActive,
      isDefault:           workSchedules.isDefault,
      mondayStart:    workSchedules.mondayStart,    mondayEnd:    workSchedules.mondayEnd,
      tuesdayStart:   workSchedules.tuesdayStart,   tuesdayEnd:   workSchedules.tuesdayEnd,
      wednesdayStart: workSchedules.wednesdayStart, wednesdayEnd: workSchedules.wednesdayEnd,
      thursdayStart:  workSchedules.thursdayStart,  thursdayEnd:  workSchedules.thursdayEnd,
      fridayStart:    workSchedules.fridayStart,    fridayEnd:    workSchedules.fridayEnd,
      saturdayStart:  workSchedules.saturdayStart,  saturdayEnd:  workSchedules.saturdayEnd,
      sundayStart:    workSchedules.sundayStart,    sundayEnd:    workSchedules.sundayEnd,
    })
    .from(workSchedules)
    .where(eq(workSchedules.tenantId, TENANT_ID))
    .orderBy(asc(workSchedules.scheduleCode))

  // Build day slots from a schedule row
  function daySlots(s: typeof schedules[0]) {
    return [
      { day: 'Mon', start: s.mondayStart,    end: s.mondayEnd    },
      { day: 'Tue', start: s.tuesdayStart,   end: s.tuesdayEnd   },
      { day: 'Wed', start: s.wednesdayStart, end: s.wednesdayEnd },
      { day: 'Thu', start: s.thursdayStart,  end: s.thursdayEnd  },
      { day: 'Fri', start: s.fridayStart,    end: s.fridayEnd    },
      { day: 'Sat', start: s.saturdayStart,  end: s.saturdayEnd  },
      { day: 'Sun', start: s.sundayStart,    end: s.sundayEnd    },
    ]
  }

  const typeTone: Record<string, string> = {
    STANDARD:   'text-accent',
    RAMADAN:    'text-accent-700',
    SHIFT:      'text-ink-2',
    FLEXIBLE:   'text-ink-3',
    PART_TIME:  'text-ink-3',
  }

  return (
    <div className="page-in">
      <div>
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'جداول العمل' : 'Work schedules'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          UAE standard work week: Sun–Thu, 48 h. Weekend = Fri + Sat.
          Ramadan schedule applies reduced hours (Article 65, FDL 33/2021).
        </p>
      </div>

      {schedules.length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div className="px-5 py-8 text-center text-sm text-ink-3">
            No work schedules seeded yet.
          </div>
        </div>
      )}

      {schedules.map(s => (
        <div key={s.id} style={{ background: 'var(--card)', border: s.isDefault ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono text-xs">{s.scheduleCode}</Badge>
                <div>
                  <p className="font-sans text-sm font-medium text-ink-1">{s.scheduleNameEn}</p>
                  {s.scheduleNameAr && (
                    <p className="text-xs text-ink-3" dir="rtl" lang="ar">{s.scheduleNameAr}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${typeTone[s.scheduleType] ?? 'text-ink-2'}`}>
                  {s.scheduleType}
                </span>
                <Badge variant="outline" className="font-mono text-xs">
                  {String(s.totalHoursPerWeek)} h/wk
                </Badge>
                {s.isDefault        && <Badge variant="outline" className="text-xs text-accent">DEFAULT</Badge>}
                {s.isRamadanSchedule && <Badge variant="secondary" className="text-xs">RAMADAN</Badge>}
                {!s.isActive         && <Badge variant="destructive" className="text-xs">INACTIVE</Badge>}
              </div>
            </header>
            <div className="px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {daySlots(s).map(slot => {
                  const isWeekend = (s.weekendDays ?? []).includes(DAY_NAMES.indexOf(slot.day))
                  return (
                    <div
                      key={slot.day}
                      className={`flex flex-col items-center rounded-md border px-3 py-2 text-xs ${
                        isWeekend
                          ? 'border-border bg-surface text-ink-3'
                          : slot.start
                            ? 'border-accent/30 bg-accent-100/40 text-accent-700'
                            : 'border-border text-ink-3'
                      }`}
                    >
                      <span className="font-medium">{slot.day}</span>
                      {slot.start && slot.end
                        ? <span className="mt-0.5 font-mono text-xs">{slot.start}–{slot.end}</span>
                        : <span className="mt-0.5 text-xs">{isWeekend ? 'off' : '—'}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-ink-3">
                <span>Break: <span className="font-mono">{s.breakMinutes} min</span></span>
                {s.isRamadanSchedule && s.ramadanHoursPerDay && (
                  <span>Ramadan: <span className="font-mono">{String(s.ramadanHoursPerDay)} h/day</span></span>
                )}
                <span>
                  Weekend:{' '}
                  {(s.weekendDays ?? []).map(d => DAY_NAMES[d]).join(' + ')}
                </span>
              </div>
            </div>
        </div>
      ))}
    </div>
  )
}
