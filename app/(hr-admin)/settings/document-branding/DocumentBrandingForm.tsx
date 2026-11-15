'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, CheckCircle2, XCircle, ImageIcon, Trash2, ChevronDown, Search, X } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { saveDocumentBranding, uploadBrandingImage } from './actions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Entity { id: string; nameEn: string }

interface Employee {
  id:           string
  fullNameEn:   string
  personNumber: string | null
}

interface EntityData {
  id:                    string
  primaryLogoUrl:        string | null
  secondaryLogoUrl:      string | null
  headerImageUrl:        string | null
  footerImageUrl:        string | null
  signatoryName:         string | null
  signatoryTitle:        string | null
  signatorySignatureUrl: string | null
  letterEmailFooter:     string | null
  letterLogoChoice:      string | null
}

interface Props {
  entities:         Entity[]
  selectedEntityId: string | null
  entityData:       EntityData | null
  employees:        Employee[]
}

type ImageField =
  | 'primaryLogoUrl'
  | 'secondaryLogoUrl'
  | 'footerImageUrl'
  | 'signatorySignatureUrl'

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentBrandingForm({ entities, selectedEntityId, entityData, employees }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [saving, startSave] = useTransition()
  const [toast,  setToast]  = useState<{ ok: boolean; msg: string } | null>(null)

  // Text fields
  const [sigName,    setSigName]    = useState(entityData?.signatoryName    ?? '')
  const [sigTitle,   setSigTitle]   = useState(entityData?.signatoryTitle   ?? '')
  const [footer,     setFooter]     = useState(entityData?.letterEmailFooter ?? '')
  const [logoChoice, setLogoChoice] = useState<'primary' | 'secondary'>(
    (entityData?.letterLogoChoice as 'primary' | 'secondary') ?? 'primary',
  )

  // Image URL state
  const [urls, setUrls] = useState<Record<ImageField, string | null>>({
    primaryLogoUrl:        entityData?.primaryLogoUrl        ?? null,
    secondaryLogoUrl:      entityData?.secondaryLogoUrl      ?? null,
    footerImageUrl:        entityData?.footerImageUrl        ?? null,
    signatorySignatureUrl: entityData?.signatorySignatureUrl ?? null,
  })
  const [busy, setBusy] = useState<Partial<Record<ImageField, boolean>>>({})

  function flash(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleUpload(field: ImageField, file: File) {
    if (!selectedEntityId) return
    setBusy(p => ({ ...p, [field]: true }))
    try {
      const fd = new FormData()
      fd.set('entityId', selectedEntityId)
      fd.set('field',    field)
      fd.set('file',     file)
      const { url } = await uploadBrandingImage(fd)
      setUrls(p => ({ ...p, [field]: url }))
      flash(true, locale === 'ar' ? 'تم رفع الصورة وحفظها' : 'Image uploaded and saved')
    } catch (err) {
      flash(false, err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الرفع' : 'Upload failed'))
    } finally {
      setBusy(p => ({ ...p, [field]: false }))
    }
  }

  async function handleSave() {
    if (!selectedEntityId) return
    startSave(async () => {
      try {
        await saveDocumentBranding({
          entityId:          selectedEntityId,
          signatoryName:     sigName.trim()  || undefined,
          signatoryTitle:    sigTitle.trim() || undefined,
          letterEmailFooter: footer.trim()   || undefined,
          letterLogoChoice:  logoChoice,
        })
        flash(true, locale === 'ar' ? 'تم حفظ العلامة التجارية' : 'Branding saved')
        router.refresh()
      } catch (err) {
        flash(false, err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed'))
      }
    })
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 34, borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--ink-1)', fontSize: 'var(--text-body)', padding: '0 10px',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 7, fontSize: 'var(--text-caption)',
          background: toast.ok ? '#DCFCE7' : '#FEE2E2',
          color:      toast.ok ? '#166534' : '#991B1B',
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Entity selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}
        </span>
        <select
          value={selectedEntityId ?? ''}
          onChange={e => router.push(`/settings/document-branding?entityId=${e.target.value}`)}
          style={{ ...inp, width: 260, height: 32 }}
        >
          {entities.map(e => <option key={e.id} value={e.id}>{e.nameEn}</option>)}
        </select>
      </div>

      {selectedEntityId && (
        <>
          {/* ── Card 1: Logos + signature ─────────────────────────── */}
          <Card title={locale === 'ar' ? 'الشعارات واختيار الخطاب' : 'Logos & Letter Selection'}>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <ImageSlot
                label={locale === 'ar' ? 'الشعار الأساسي' : 'Primary Logo'}
                url={urls.primaryLogoUrl}
                busy={!!busy.primaryLogoUrl}
                onUpload={f => handleUpload('primaryLogoUrl', f)}
                onRemove={() => setUrls(p => ({ ...p, primaryLogoUrl: null }))}
                radioLabel={locale === 'ar' ? 'استخدام في الخطابات' : 'Use for letters'}
                radioChecked={logoChoice === 'primary'}
                onRadio={() => setLogoChoice('primary')}
              />
              <ImageSlot
                label={locale === 'ar' ? 'الشعار الثانوي' : 'Secondary Logo'}
                url={urls.secondaryLogoUrl}
                busy={!!busy.secondaryLogoUrl}
                onUpload={f => handleUpload('secondaryLogoUrl', f)}
                onRemove={() => setUrls(p => ({ ...p, secondaryLogoUrl: null }))}
                radioLabel={locale === 'ar' ? 'استخدام في الخطابات' : 'Use for letters'}
                radioChecked={logoChoice === 'secondary'}
                onRadio={() => setLogoChoice('secondary')}
              />
              <ImageSlot
                label={locale === 'ar' ? 'توقيع المُوقِّع' : 'Signatory Signature'}
                url={urls.signatorySignatureUrl}
                busy={!!busy.signatorySignatureUrl}
                onUpload={f => handleUpload('signatorySignatureUrl', f)}
                onRemove={() => setUrls(p => ({ ...p, signatorySignatureUrl: null }))}
              />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              {locale === 'ar'
                ? 'اختر الشعار الذي سيُستخدم في الخطابات المُنشأة باستخدام زر الاختيار. كما يُستخدم الشعار المُحدّد كصورة الرأس.'
                : 'Select which logo to use on generated letters using the radio button. The selected logo also serves as the header image.'}
            </p>
          </Card>

          {/* ── Card 2: Footer only ───────────────────────────────── */}
          <Card title={locale === 'ar' ? 'صور الرأس والتذييل' : 'Header & Footer Images'}>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ImageSlot
                label={locale === 'ar' ? 'بانر التذييل' : 'Footer Banner'}
                url={urls.footerImageUrl}
                busy={!!busy.footerImageUrl}
                onUpload={f => handleUpload('footerImageUrl', f)}
                onRemove={() => setUrls(p => ({ ...p, footerImageUrl: null }))}
              />
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16, borderRadius: 8,
                border: '1px dashed var(--border)',
                background: 'var(--surface)',
              }}>
                <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5 }}>
                  {locale === 'ar' ? (
                    <>يُستخدم <strong style={{ color: 'var(--ink-2)' }}>الشعار الأساسي</strong> كصورة رأس الخطاب.
                      <br />اضبطه في قسم الشعارات أعلاه.</>
                  ) : (
                    <>The <strong style={{ color: 'var(--ink-2)' }}>Primary Logo</strong> is used as the letter header image.
                      <br />Configure it in the Logos section above.</>
                  )}
                </p>
              </div>
            </div>
          </Card>

          {/* ── Card 3: Signatory + Email footer ─────────────────── */}
          <Card title={locale === 'ar' ? 'المُوقِّع والبريد الإلكتروني' : 'Signatory & Email'}>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FieldLabel label={locale === 'ar' ? 'اسم المُوقِّع' : 'Signatory Name'}>
                  <EmployeePicker
                    employees={employees}
                    value={sigName}
                    onChange={setSigName}
                  />
                </FieldLabel>
                <FieldLabel label={locale === 'ar' ? 'منصب المُوقِّع' : 'Signatory Title'}>
                  <input value={sigTitle} onChange={e => setSigTitle(e.target.value)}
                    placeholder={locale === 'ar' ? 'مدير الموارد البشرية' : 'Director, Human Resources'} style={inp} />
                </FieldLabel>
              </div>
              <FieldLabel label={locale === 'ar' ? 'نص تذييل البريد الإلكتروني' : 'Email Footer Text'}>
                <textarea value={footer} onChange={e => setFooter(e.target.value)}
                  rows={4} placeholder={locale === 'ar' ? 'نص التذييل المُلحق بجميع رسائل الخطابات…' : 'Footer text appended to all letter emails…'}
                  style={{ ...inp, height: 'auto', padding: '8px 10px', resize: 'none' }} />
              </FieldLabel>
            </div>
          </Card>

          {/* Save row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 'var(--text-body)', fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.75 : 1,
            }}>
              {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              {saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ العلامة التجارية' : 'Save Branding')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── EmployeePicker ─────────────────────────────────────────────────────────────

function EmployeePicker({
  employees,
  value,
  onChange,
}: {
  employees: Employee[]
  value:     string
  onChange:  (v: string) => void
}) {
  const locale = useLocale()
  const [open,       setOpen]       = useState(false)
  const [search,     setSearch]     = useState('')
  const containerRef                = useRef<HTMLDivElement>(null)
  const searchRef                   = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? employees.filter(e =>
        e.fullNameEn.toLowerCase().includes(search.toLowerCase()) ||
        (e.personNumber ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : employees

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  function select(emp: Employee) {
    onChange(emp.fullNameEn)
    setOpen(false)
    setSearch('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center',
          height: 34, borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--bg)',
          padding: '0 8px 0 10px',
          transition: 'border-color 0.12s',
          boxSizing: 'border-box',
        }}
      >
        <span style={{
          flex: 1, fontSize: 'var(--text-body)',
          color: value ? 'var(--ink-1)' : 'var(--ink-4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value || (locale === 'ar' ? 'اختر موظفاً…' : 'Select employee…')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {value && (
            <button
              onClick={clear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-4)', display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={13} style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 200, overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', borderBottom: '1px solid var(--border)',
          }}>
            <Search size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={locale === 'ar' ? 'بحث عن موظفين…' : 'Search employees…'}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 'var(--text-caption)', color: 'var(--ink-1)', outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-4)', display: 'flex' }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center' }}>
                {locale === 'ar' ? 'لم يُعثر على موظفين' : 'No employees found'}
              </div>
            ) : filtered.map(emp => {
              const isSelected = emp.fullNameEn === value
              return (
                <div
                  key={emp.id}
                  onClick={() => select(emp)}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    padding: '8px 12px', cursor: 'pointer',
                    background: isSelected ? 'color-mix(in srgb, var(--accent) 8%, var(--card))' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--brand-active)' : 'var(--ink-1)' }}>
                    {emp.fullNameEn}
                  </span>
                  {emp.personNumber && (
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                      {emp.personNumber}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ImageSlot ─────────────────────────────────────────────────────────────────

function ImageSlot({
  label, url, busy, onUpload, onRemove,
  radioLabel, radioChecked, onRadio,
}: {
  label:         string
  url:           string | null
  busy:          boolean
  onUpload:      (f: File) => void
  onRemove:      () => void
  radioLabel?:   string
  radioChecked?: boolean
  onRadio?:      () => void
}) {
  const locale = useLocale()
  const ref = useRef<HTMLInputElement>(null)
  const isReal = url && !url.startsWith('local://')
  const isActive = radioChecked === true

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
      borderRadius: 8,
      border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
      background: isActive
        ? 'color-mix(in srgb, var(--accent) 4%, var(--bg))'
        : 'var(--bg)',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {/* Label + radio */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 }}>
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {label}
        </span>
        {radioLabel && onRadio && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="radio"
              name="letterLogo"
              checked={radioChecked}
              onChange={onRadio}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer', margin: 0 }}
            />
            <span style={{
              fontSize: 'var(--text-caption)', color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
              fontWeight: isActive ? 700 : 400,
            }}>
              {radioLabel}
            </span>
          </label>
        )}
      </div>

      {/* Preview box */}
      <div style={{
        height: 60, borderRadius: 6, overflow: 'hidden', position: 'relative',
        border: '1px dashed var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isReal ? (
          <>
            <img src={url} alt={label}
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            <button onClick={onRemove} title={locale === 'ar' ? 'إزالة' : 'Remove'} style={{
              position: 'absolute', top: 3, right: 3,
              background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%',
              width: 16, height: 16, cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626',
            }}>
              <Trash2 size={9} />
            </button>
          </>
        ) : url ? (
          <span style={{ fontSize: 'var(--text-caption)', color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3 }}>
            <CheckCircle2 size={11} /> {locale === 'ar' ? 'محفوظ' : 'Saved'}
          </span>
        ) : (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ImageIcon size={13} /> {locale === 'ar' ? 'غير مُحدَّد' : 'Not set'}
          </span>
        )}
      </div>

      {/* Hidden file input + Upload button */}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) { onUpload(f); e.target.value = '' }
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '5px 0', borderRadius: 6, width: '100%',
          border: '1px solid var(--border)', background: 'var(--card)',
          color: 'var(--ink-1)', fontSize: 'var(--text-caption)', cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy
          ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…'}</>
          : <><Upload size={11} /> {url ? (locale === 'ar' ? 'استبدال' : 'Replace') : (locale === 'ar' ? 'رفع' : 'Upload')}</>}
      </button>
    </div>
  )
}

// ── Shared layout helpers ─────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: 'var(--ink-3)',
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--ink-3)', marginBottom: 5,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
