'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { Users, CheckSquare, Square, Loader2, Search, X, AlertTriangle, Calendar, Briefcase } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { bulkGenerateLetters } from '@/modules/employee-letters/actions'

type Language = 'en' | 'ar' | 'both'

interface Employee {
  id:               string
  personNumber:     string | null
  fullNameEn:       string
  fullNameAr:       string | null
  jobTitleEn:       string | null
  departmentNameEn: string | null
  legalEntityId:    string | null
}

interface Job {
  id:         string
  jobCode:    string
  jobTitleEn: string
  jobTitleAr: string | null
}

interface Props {
  typeCode:    string
  employees:   Employee[]
  templateId?: string
  onComplete?: (results: Array<{ personId: string; letterId?: string; error?: string }>) => void
}

const LANG_OPTIONS: { value: Language; label: string; flag: string; desc: string }[] = [
  { value: 'en',   label: 'English',   flag: '🇬🇧', desc: 'English only' },
  { value: 'ar',   label: 'Arabic',    flag: '🇸🇦', desc: 'Arabic only' },
  { value: 'both', label: 'Bilingual', flag: '📄',  desc: 'Both languages' },
]

const TYPES_NEEDING_DATE    = new Set(['DCL', 'PML', 'SAL', 'TER', 'EML'])
const TYPES_NEEDING_NEW_JOB = new Set(['DCL', 'PML'])

export function BulkGeneratePanel({ typeCode, employees, templateId, onComplete }: Props) {
  const locale                            = useLocale()
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [language,      setLanguage]      = useState<Language>('en')
  const [searchQuery,   setSearchQuery]   = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [newJobId,      setNewJobId]      = useState('')
  const [jobSearch,     setJobSearch]     = useState('')
  const [jobs,          setJobs]          = useState<Job[]>([])
  const [isPending,     startTransition]  = useTransition()
  const [results,       setResults]       = useState<Array<{ personId: string; letterId?: string; error?: string }> | null>(null)

  const needsDate   = TYPES_NEEDING_DATE.has(typeCode)
  const needsNewJob = TYPES_NEEDING_NEW_JOB.has(typeCode)

  useEffect(() => {
    if (!needsNewJob) return
    fetch('/api/employee-letters/jobs')
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? []))
      .catch(() => {})
  }, [needsNewJob])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      (e.fullNameEn ?? '').toLowerCase().includes(q) ||
      (e.fullNameAr ?? '').toLowerCase().includes(q) ||
      (e.personNumber ?? '').toLowerCase().includes(q) ||
      (e.jobTitleEn ?? '').toLowerCase().includes(q) ||
      (e.departmentNameEn ?? '').toLowerCase().includes(q),
    )
  }, [employees, searchQuery])

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(j =>
      j.jobTitleEn.toLowerCase().includes(q) ||
      (j.jobTitleAr ?? '').toLowerCase().includes(q) ||
      j.jobCode.toLowerCase().includes(q),
    )
  }, [jobs, jobSearch])

  const selectedJob = jobs.find(j => j.id === newJobId)
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(e => n.delete(e.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(e => n.add(e.id)); return n })
    }
  }

  const missingFields: string[] = []
  if (needsDate && !effectiveDate) missingFields.push(locale === 'ar' ? 'تاريخ السريان' : 'Effective Date')
  if (needsNewJob && !newJobId)    missingFields.push(locale === 'ar' ? 'المسمى الوظيفي الجديد' : 'New Designation')
  const canGenerate = selected.size > 0 && missingFields.length === 0

  function handleGenerate() {
    if (!canGenerate) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('typeCode',  typeCode)
      fd.set('personIds', JSON.stringify(Array.from(selected)))
      if (templateId)    fd.set('templateId',    templateId)
      fd.set('language', language)
      if (effectiveDate) fd.set('effectiveDate', effectiveDate)
      if (newJobId)      fd.set('newJobId',      newJobId)
      const res = await bulkGenerateLetters(fd)
      setResults(res)
      onComplete?.(res)
    })
  }

  const succeeded    = results?.filter(r => r.letterId).length ?? 0
  const failed       = results?.filter(r => r.error).length  ?? 0
  const selectedInView = filtered.filter(e => selected.has(e.id)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Language selector */}
      <div>
        <div style={sectionLabel}>{locale === 'ar' ? 'لغة الخطاب' : 'Letter Language'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {LANG_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setLanguage(opt.value)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 'var(--text-body)',
              fontWeight: language === opt.value ? 600 : 400,
              border: language === opt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: language === opt.value ? 'color-mix(in srgb, var(--accent) 7%, var(--card))' : 'var(--card)',
              color: language === opt.value ? 'var(--brand-active)' : 'var(--ink-2)',
              transition: 'all 120ms',
            }}>
              <span style={{ fontSize: 'var(--text-body)' }}>{opt.flag}</span>
              <span>{locale === 'ar'
                ? (opt.value === 'en' ? 'الإنجليزية' : opt.value === 'ar' ? 'العربية' : 'ثنائي اللغة')
                : opt.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
        marginTop: 5 }}>
          {language === 'en'   && (locale === 'ar' ? 'سيتم إنشاء الخطابات بالإنجليزية فقط.' : 'Letters will be generated in English only.')}
          {language === 'ar'   && (locale === 'ar' ? 'سيتم إنشاء الخطابات بالعربية فقط. سيُترجَم القالب العربي تلقائياً إذا لم يكن مُعرَّفاً.' : 'Letters will be generated in Arabic only. Arabic template will be auto-translated if not defined.')}
          {language === 'both' && (locale === 'ar' ? 'ستتضمن الخطابات صفحات بالإنجليزية والعربية معاً.' : 'Letters will include both English and Arabic pages.')}
        </div>
      </div>

      {/* Effective Date + New Designation side-by-side */}
      {(needsDate || needsNewJob) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: needsDate && needsNewJob ? '220px 1fr' : '1fr',
          gap: 14, alignItems: 'start',
          padding: '16px 18px',
          background: 'color-mix(in srgb, var(--accent) 4%, var(--card))',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))',
          borderRadius: 10,
        }}>

          {/* Effective Date */}
          {needsDate && (
            <div>
              <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} /> {locale === 'ar' ? 'تاريخ السريان' : 'Effective Date'} <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                style={{
                  width: '100%', height: 36, borderRadius: 7,
                  border: `1px solid ${effectiveDate ? 'var(--border)' : '#FCA5A5'}`,
                  background: 'var(--card)', color: 'var(--ink-1)',
                  fontSize: 'var(--text-caption)', padding: '0 10px', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {!effectiveDate && (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--text-caption)', color: '#EF4444' }}>{locale === 'ar' ? 'مطلوب' : 'Required'}</p>
              )}
            </div>
          )}

          {/* New Designation — always-visible scrollable list */}
          {needsNewJob && (
            <div>
              <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Briefcase size={11} /> {locale === 'ar' ? 'المسمى الوظيفي الجديد' : 'New Designation'} <span style={{ color: '#EF4444' }}>*</span>
                {selectedJob && (
                  <span style={{
                    marginLeft: 6, fontSize: 'var(--text-caption)', fontWeight: 600,
                    color: 'var(--brand-active)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    padding: '1px 7px', borderRadius: 4,
                  }}>
                    {selectedJob.jobTitleEn}
                  </span>
                )}
              </label>

              {/* Search within designations */}
              <div style={{ position: 'relative',
              marginBottom: 6 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder={locale === 'ar' ? 'البحث في المسميات الوظيفية…' : 'Search designations…'}
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  style={{
                    width: '100%', height: 32, borderRadius: 6,
                    border: `1px solid ${jobSearch ? 'var(--accent)' : 'var(--border)'}`,
                    background: 'var(--card)', color: 'var(--ink-1)',
                    fontSize: 'var(--text-caption)', padding: '0 28px 0 28px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {jobSearch && (
                  <button type="button" onClick={() => setJobSearch('')} style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-3)', padding: 2, display: 'flex',
                  }}>
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Scrollable designation list */}
              <div style={{
                border: `1px solid ${!newJobId ? '#FCA5A5' : 'var(--border)'}`,
                borderRadius: 8, overflowX: 'hidden',
                maxHeight: 220, overflowY: 'auto',
                background: 'var(--card)',
              }}>
                {filteredJobs.length === 0 ? (
                  <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    {jobs.length === 0
                      ? (locale === 'ar' ? 'جارٍ تحميل المسميات الوظيفية…' : 'Loading designations…')
                      : (locale === 'ar' ? 'لا توجد مسميات وظيفية' : 'No designations found')}
                  </div>
                ) : filteredJobs.map((j, i) => (
                  <div
                    key={j.id}
                    onClick={() => setNewJobId(j.id === newJobId ? '' : j.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer',
                      borderBottom: i < filteredJobs.length - 1 ? '1px solid var(--border)' : 'none',
                      background: newJobId === j.id
                        ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                        : 'transparent',
                      borderLeft: `3px solid ${newJobId === j.id ? 'var(--accent)' : 'transparent'}`,
                      transition: 'background 0.1s',
                    }}
                  >
                    {newJobId === j.id
                      ? <CheckSquare size={15} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
                      : <Square     size={15} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                        fontWeight: newJobId === j.id ? 600 : 400,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {j.jobTitleEn}
                      </div>
                      {j.jobTitleAr && (
                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', textAlign: 'right' }}>
                          {j.jobTitleAr}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                      fontFamily: 'var(--font-mono)', flexShrink: 0,
                    }}>
                      {j.jobCode}
                    </span>
                  </div>
                ))}
              </div>

              {!newJobId && (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--text-caption)', color: '#EF4444' }}>
                  {locale === 'ar' ? 'اختر مسمى وظيفياً للمتابعة' : 'Select a designation to proceed'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Missing fields warning */}
      {selected.size > 0 && missingFields.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 7,
          background: 'color-mix(in srgb, #F59E0B 10%, transparent)',
          border: '1px solid color-mix(in srgb, #F59E0B 30%, transparent)',
        }}>
          <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0,
          marginTop: 1 }} />
          <div style={{ fontSize: 'var(--text-caption)', color: '#92400E' }}>
            <strong>{locale === 'ar' ? 'حقول مطلوبة ناقصة:' : 'Required fields missing:'}</strong> {missingFields.join(locale === 'ar' ? '، ' : ', ')}
          </div>
        </div>
      )}

      {/* Search Employees */}
      <div>
        <label htmlFor="bulk-employee-search" style={sectionLabel}>{locale === 'ar' ? 'البحث عن الموظفين' : 'Search Employees'}</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--ink-3)', pointerEvents: 'none' }} />
          <input
            id="bulk-employee-search"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'البحث بالاسم أو رقم الموظف أو المسمى الوظيفي أو القسم…' : 'Search by name, employee number, designation, or department…'}
            style={{
              width: '100%', height: 36, borderRadius: 7,
              border: `1px solid ${searchQuery ? 'var(--accent)' : 'var(--border)'}`,
              background: 'var(--card)', color: 'var(--ink-1)', fontSize: 'var(--text-caption)',
              padding: '0 32px', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} style={{
              position: 'absolute', right: 8, background: 'none', border: 'none',
              cursor: 'pointer', padding: 2, color: 'var(--ink-3)', display: 'flex',
            }}>
              <X size={13} />
            </button>
          )}
        </div>
        {searchQuery && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 4 }}>
            {filtered.length === 0
              ? (locale === 'ar' ? 'لا يوجد موظفون مطابقون' : 'No employees match')
              : (locale === 'ar' ? `${filtered.length} موظف مطابق` : `${filtered.length} employee${filtered.length !== 1 ? 's' : ''} match`)}
          </div>
        )}
      </div>

      {/* Select-all toolbar + Generate button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={toggleAll} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontSize: 'var(--text-body)',
        }}>
          {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          {locale === 'ar' ? `تحديد الكل (${filtered.length})` : `Select all (${filtered.length})`}
        </button>
        <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>|</span>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          {locale === 'ar' ? `${selected.size} محدَّد` : `${selected.size} selected`}
          {searchQuery && selectedInView !== selected.size && (
            <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}> {locale === 'ar' ? `(${selectedInView} في العرض)` : `(${selectedInView} in view)`}</span>
          )}
        </span>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || isPending}
          title={missingFields.length > 0 ? (locale === 'ar' ? `أكمِل: ${missingFields.join('، ')}` : `Fill in: ${missingFields.join(', ')}`) : undefined}
          style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: 6,
            background: !canGenerate ? 'var(--surface)' : 'var(--accent)',
            color: !canGenerate ? 'var(--ink-4)' : '#fff',
            border: 'none', borderRadius: 6,
            padding: '7px 16px', fontSize: 'var(--text-body)', fontWeight: 500,
            cursor: !canGenerate ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
          <Users size={14} />
          {locale === 'ar'
            ? `إنشاء ${selected.size > 0 ? selected.size : ''} ${language === 'both' ? 'خطاب ثنائي اللغة' : language === 'ar' ? 'خطاب بالعربية' : 'خطاب بالإنجليزية'}`
            : `Generate ${selected.size > 0 ? selected.size : ''} ${language === 'both' ? 'bilingual' : language === 'ar' ? 'Arabic' : 'English'} letter${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Results summary */}
      {results && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: 'var(--text-body)',
          background: failed === 0 ? 'color-mix(in srgb, #16A34A 8%, transparent)' : 'color-mix(in srgb, #D97706 8%, transparent)',
          color: failed === 0 ? '#16A34A' : '#D97706',
        }}>
          {locale === 'ar'
            ? `تم إنشاء ${succeeded} بنجاح${failed > 0 ? `، فشل ${failed}` : ''}`
            : `${succeeded} generated successfully${failed > 0 ? `, ${failed} failed` : ''}`}
        </div>
      )}

      {/* Employee list */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', background: 'var(--card)' }}>
            <Search size={22} style={{ color: 'var(--ink-4)', margin: '0 auto 10px', display: 'block' }} />
            <p style={{ margin: '0 0 4px', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-2)' }}>{locale === 'ar' ? 'لا يوجد موظفون' : 'No employees found'}</p>
            <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{locale === 'ar' ? 'جرّب البحث بالاسم أو رقم الموظف أو المسمى الوظيفي أو القسم.' : 'Try searching by name, employee number, designation, or department.'}</p>
          </div>
        ) : filtered.map(emp => {
          const result = results?.find(r => r.personId === emp.id)
          const isPreflightError = result?.error?.startsWith('Preflight failed')
          return (
            <div key={emp.id} onClick={() => toggle(emp.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              background: selected.has(emp.id)
                ? 'color-mix(in srgb, var(--accent) 5%, transparent)'
                : 'var(--card)',
              transition: 'background 0.1s',
            }}>
              {selected.has(emp.id)
                ? <CheckSquare size={16} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
                : <Square     size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-body)', color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {emp.fullNameEn}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {emp.personNumber} · {emp.jobTitleEn ?? '—'} · {emp.departmentNameEn ?? '—'}
                </div>
                {isPreflightError && (
                  <div style={{ fontSize: 'var(--text-caption)', color: '#EF4444',
                  marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={10} />
                    {result!.error!.replace('Preflight failed — fix required fields: ', '')}
                  </div>
                )}
              </div>
              {result && (
                <span style={{
                  fontSize: 'var(--text-caption)', padding: '2px 7px', borderRadius: 4, fontWeight: 500, flexShrink: 0,
                  ...(result.error
                    ? { background: '#FEE2E2', color: '#DC2626' }
                    : { background: '#DCFCE7', color: '#16A34A' }),
                }}>
                  {result.error ? (locale === 'ar' ? 'فشل' : 'Failed') : (locale === 'ar' ? 'تم' : 'Done')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--ink-3)',
  display: 'block',
  marginBottom: 6,
}
