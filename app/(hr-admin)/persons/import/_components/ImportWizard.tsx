'use client'

/**
 * ImportWizard — multi-step UI for bulk employee import.
 *
 * Steps:
 *   1. Download template + upload file
 *   2. Validation preview (summary + error table)
 *   3. Confirm import
 *   4. Result summary
 */
import React, { useCallback, useRef, useState } from 'react'
import { Upload, Download, CheckCircle, AlertTriangle, XCircle, FileSpreadsheet, Users, UserCheck, Loader2 } from 'lucide-react'
import { validateImportFile, confirmImport } from '@/modules/core-hr/bulk-import/actions'
import type { ImportPreview, ImportResult, RowIssue, ValidatedImportRow } from '@/modules/core-hr/bulk-import/types'
import { useLocale } from '@/components/providers/LocaleProvider'

// ── Types ─────────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'confirm' | 'result'

// ── Helper components ─────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, accent }: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: 'green' | 'red' | 'amber' | 'blue' | 'default'
}) {
  const colours: Record<string, string> = {
    green:   'var(--status-approved-bg)',
    red:     'var(--status-rejected-bg)',
    amber:   '#FEF9C3',
    blue:    'var(--accent-050)',
    default: 'var(--surface)',
  }
  const bg = colours[accent ?? 'default']
  return (
    <div style={{
      background: bg,
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 140,
    }}>
      <span style={{ color: 'var(--ink-2)' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>{value}</div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{label}</div>
      </div>
    </div>
  )
}

function IssueBadge({ severity }: { severity: RowIssue['severity'] }) {
  const style: React.CSSProperties = severity === 'ERROR'
    ? { background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)', fontWeight: 600 }
    : { background: '#FEF9C3', color: '#92400E', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)', fontWeight: 600 }
  return <span style={style}>{severity}</span>
}

// ── Step indicators ───────────────────────────────────────────────────────

const STEPS = [
  { key: 'upload',  label: 'Upload',  labelAr: 'الرفع' },
  { key: 'preview', label: 'Preview', labelAr: 'المعاينة' },
  { key: 'confirm', label: 'Confirm', labelAr: 'التأكيد' },
  { key: 'result',  label: 'Result',  labelAr: 'النتيجة' },
] as const

function StepBar({ current, isAr }: { current: Step; isAr: boolean }) {
  const stepOrder: Step[] = ['upload', 'preview', 'confirm', 'result']
  const currentIdx = stepOrder.indexOf(current)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {STEPS.map((s, i) => {
        const isActive   = s.key === current
        const isDone     = i < currentIdx
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--surface)',
                border: isActive || isDone ? '2px solid var(--accent)' : '2px solid var(--border)',
                color: isDone || isActive ? '#fff' : 'var(--ink-3)',
                fontWeight: 700, fontSize: 'var(--text-caption)',
              }}>
                {isDone ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 'var(--text-caption)', color: isActive ? 'var(--brand-active)' : 'var(--ink-3)', fontWeight: isActive ? 600 : 400 }}>
                {isAr ? s.labelAr : s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentIdx ? 'var(--accent)' : 'var(--border)', marginBottom: 18 }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────

export function ImportWizard() {
  const locale = useLocale()
  const isAr   = locale === 'ar'
  const [step, setStep]       = useState<Step>('upload')
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult]   = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File selection / drag-drop ─────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    setFile(f)
    setError(null)
    setPreview(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  // ── Validate ───────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await validateImportFile(fd)
      setPreview(result)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : (isAr ? 'فشل التحقّق' : 'Validation failed'))
    } finally {
      setLoading(false)
    }
  }

  // ── Confirm import ─────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!preview?.validatedRows.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await confirmImport(preview.validatedRows)
      if ('error' in res) { setError(res.error); return }
      setResult(res)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : (isAr ? 'فشل الاستيراد' : 'Import failed'))
    } finally {
      setLoading(false)
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  const hasBlockingErrors = preview ? preview.errorRows > 0 : false

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 40px' }}>
      <StepBar current={step} isAr={isAr} />

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-dot)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <XCircle size={16} style={{ color: 'var(--status-rejected-fg)', marginTop: 2, flexShrink: 0 }} />
          <span style={{ color: 'var(--status-rejected-fg)', fontSize: 14 }}>{error}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1 — Upload
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Download template */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-1)' }}>
              {isAr ? 'الخطوة 1 — نزّل القالب' : 'Step 1 — Download the template'}
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--ink-2)', fontSize: 14 }}>
              {isAr
                ? 'نزّل قالب Excel، واملأ بيانات الموظفين، ثم ارفعه أدناه. يتضمّن القالب أوراقاً مرجعية بالرموز الصحيحة للجهات القانونية والأقسام والمناصب والدرجات والمواقع.'
                : 'Download the Excel template, fill in employee data, and upload it below. The template includes reference sheets with valid codes for legal entities, departments, positions, grades, and locations.'}
            </p>
            <a
              href="/api/persons/import/template"
              download
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--accent)', color: '#fff',
                padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                textDecoration: 'none',
              }}
            >
              <Download size={15} />
              {isAr ? 'تنزيل قالب Excel' : 'Download Excel Template'}
            </a>
          </div>

          {/* Upload zone */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-1)' }}>
              {isAr ? 'الخطوة 2 — ارفع الملف المكتمل' : 'Step 2 — Upload completed file'}
            </h2>

            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'var(--accent-050)' : 'var(--surface)',
                transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <FileSpreadsheet size={32} style={{ color: 'var(--brand-active)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{file.name}</span>
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                    {(file.size / 1024).toFixed(0)} KB — {isAr ? 'انقر لتغيير الملف' : 'Click to change file'}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Upload size={32} style={{ color: 'var(--ink-3)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                    {isAr ? 'اسحب ملف Excel وأفلته هنا أو انقر للتصفّح' : 'Drag & drop your Excel file here or click to browse'}
                  </span>
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                    {isAr ? '.xlsx أو .xls · الحد الأقصى 5 ميغابايت · حتى 1,000 صف' : '.xlsx or .xls · max 5 MB · max 1,000 rows'}
                  </span>
                </div>
              )}
            </div>

            {file && (
              <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                <button
                  onClick={handleValidate}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--accent)', color: '#fff',
                    padding: '10px 22px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                    border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  {loading ? (isAr ? 'جارٍ التحقّق…' : 'Validating…') : (isAr ? 'تحقّق من الملف' : 'Validate File')}
                </button>
                <button
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  style={{
                    padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--ink-2)', cursor: 'pointer',
                  }}
                >
                  {isAr ? 'مسح' : 'Clear'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2 — Preview
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'preview' && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Summary cards */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ margin: '0 0 20px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-1)' }}>
              {isAr ? 'ملخّص التحقّق' : 'Validation Summary'}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <SummaryCard icon={<FileSpreadsheet size={18} />} label={isAr ? 'إجمالي الصفوف' : 'Total Rows'} value={preview.totalRows} />
              <SummaryCard icon={<CheckCircle size={18} />} label={isAr ? 'الصفوف الصالحة' : 'Valid Rows'} value={preview.validRows} accent="green" />
              <SummaryCard icon={<XCircle size={18} />} label={isAr ? 'صفوف الأخطاء' : 'Error Rows'} value={preview.errorRows} accent="red" />
              <SummaryCard icon={<AlertTriangle size={18} />} label={isAr ? 'صفوف التحذيرات' : 'Warning Rows'} value={preview.warningRows} accent="amber" />
              <SummaryCard icon={<Users size={18} />} label={isAr ? 'الصفوف المكرّرة' : 'Duplicate Rows'} value={preview.duplicateRows} accent={preview.duplicateRows > 0 ? 'red' : 'default'} />
              <SummaryCard icon={<UserCheck size={18} />} label={isAr ? 'ستحصل على حساب مستخدم' : 'Will Get User Account'} value={preview.rowsRequiringUser} accent="blue" />
              <SummaryCard icon={<Users size={18} />} label={isAr ? 'موظف فقط' : 'Employee Only'} value={preview.rowsWithoutUser} />
            </div>
          </div>

          {/* Issues table */}
          {preview.issues.length > 0 && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
            }}>
              <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-1)' }}>
                {isAr ? 'مشكلات التحقّق' : 'Validation Issues'} ({preview.issues.length})
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)' }}>
                      {(isAr ? ['الصف', 'الخطورة', 'الحقل', 'الرسالة'] : ['Row', 'Severity', 'Field', 'Message']).map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '8px 12px',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--ink-2)', fontWeight: 600, fontSize: 'var(--text-caption)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((issue, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>
                          {issue.rowNumber}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <IssueBadge severity={issue.severity} />
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-1)', fontWeight: 500 }}>
                          {issue.field}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-2)' }}>
                          {issue.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {preview.validatedRows.length > 0 && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
            }}>
              <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-1)' }}>
                {isAr ? 'معاينة الصفوف الصالحة' : 'Valid Rows Preview'} ({preview.validatedRows.length})
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)' }}>
                      {(isAr ? ['الصف', 'الاسم الكامل (EN)', 'بريد العمل', 'نوع التوظيف', 'تاريخ التعيين', 'حساب المستخدم'] : ['Row', 'Full Name EN', 'Work Email', 'Employment Type', 'Hire Date', 'User Account']).map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '8px 12px',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--ink-2)', fontWeight: 600, fontSize: 'var(--text-caption)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.validatedRows.slice(0, 50).map((row: ValidatedImportRow) => (
                      <tr key={row.rowNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.rowNumber}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--ink-1)' }}>{row.fullNameEn}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.workEmail ?? '—'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-2)' }}>{row.employmentType}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.hireDate}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {row.requiresUser ? (
                            <span style={{ background: 'var(--accent-100)', color: 'var(--brand-active)', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)', fontWeight: 600 }}>{isAr ? 'نعم' : 'YES'}</span>
                          ) : (
                            <span style={{ background: 'var(--surface)', color: 'var(--ink-3)', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)' }}>{isAr ? 'لا' : 'NO'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {preview.validatedRows.length > 50 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '10px 12px', color: 'var(--ink-3)', textAlign: 'center', fontSize: 'var(--text-caption)' }}>
                          {isAr ? `… و${preview.validatedRows.length - 50} صفاً إضافياً (غير معروضة)` : `… and ${preview.validatedRows.length - 50} more rows (not shown)`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            {!hasBlockingErrors && preview.validRows > 0 && (
              <button
                onClick={() => setStep('confirm')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--accent)', color: '#fff',
                  padding: '10px 22px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                  border: 'none', cursor: 'pointer',
                }}
              >
                <CheckCircle size={15} />
                {isAr
                  ? `المتابعة للاستيراد (${preview.validRows} ${preview.validRows === 1 ? 'صف' : 'صفوف'})`
                  : `Proceed to Import (${preview.validRows} row${preview.validRows !== 1 ? 's' : ''})`}
              </button>
            )}
            {hasBlockingErrors && (
              <div style={{
                background: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-dot)',
                borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
                color: 'var(--status-rejected-fg)',
              }}>
                <XCircle size={15} />
                {isAr
                  ? `صحّح ${preview.errorRows} ${preview.errorRows === 1 ? 'صف خطأ' : 'صفوف الأخطاء'} قبل الاستيراد.`
                  : `Fix the ${preview.errorRows} error row${preview.errorRows !== 1 ? 's' : ''} before importing.`}
              </div>
            )}
            <button
              onClick={handleReset}
              style={{
                padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              {isAr ? 'رفع ملف آخر' : 'Upload Different File'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3 — Confirm
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'confirm' && preview && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 32,
          display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600,
        }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink-1)' }}>
            {isAr ? 'تأكيد الاستيراد' : 'Confirm Import'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--ink-2)', fontSize: 15 }}>
            <div>
              {isAr
                ? <>أنت على وشك استيراد <strong style={{ color: 'var(--ink-1)' }}>{preview.validRows} {preview.validRows === 1 ? 'موظف' : 'موظفين'}</strong>.</>
                : <>You are about to import <strong style={{ color: 'var(--ink-1)' }}>{preview.validRows} employee{preview.validRows !== 1 ? 's' : ''}</strong>.</>}
            </div>
            <div>
              {isAr
                ? <>سيُنشأ <strong style={{ color: 'var(--ink-1)' }}>{preview.rowsRequiringUser}</strong> {preview.rowsRequiringUser === 1 ? 'حساب مستخدم' : 'حساب مستخدم'} (الدور: <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>EMPLOYEE</code>).</>
                : <><strong style={{ color: 'var(--ink-1)' }}>{preview.rowsRequiringUser}</strong> user account{preview.rowsRequiringUser !== 1 ? 's' : ''} will be created (role: <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>EMPLOYEE</code>).</>}
            </div>
            <div>
              {isAr
                ? <><strong style={{ color: 'var(--ink-1)' }}>{preview.rowsWithoutUser}</strong> {preview.rowsWithoutUser === 1 ? 'سجل موظف فقط' : 'سجل موظف فقط'} (بدون حساب مستخدم).</>
                : <><strong style={{ color: 'var(--ink-1)' }}>{preview.rowsWithoutUser}</strong> employee-only record{preview.rowsWithoutUser !== 1 ? 's' : ''} (no user account).</>}
            </div>
            {preview.warningRows > 0 && (
              <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', color: '#92400E', fontSize: 'var(--text-body)' }}>
                <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
                {isAr
                  ? `يحتوي ${preview.warningRows} ${preview.warningRows === 1 ? 'صف' : 'صفوف'} على تحذيرات وسيُستورد بقيم افتراضية.`
                  : `${preview.warningRows} row${preview.warningRows !== 1 ? 's have' : ' has'} warnings that will be imported with default values.`}
              </div>
            )}
            <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
              {isAr ? 'لا يمكن التراجع عن هذه العملية. ستُدقَّق جميع السجلات.' : 'This operation cannot be undone. All records will be audited.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--accent)', color: '#fff',
                padding: '11px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {loading
                ? (isAr ? `جارٍ استيراد ${preview.validRows} سجلاً…` : `Importing ${preview.validRows} records…`)
                : (isAr ? 'تأكيد الاستيراد' : 'Confirm Import')}
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={loading}
              style={{
                padding: '11px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              {isAr ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 4 — Result
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'result' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{
            background: 'var(--status-approved-bg)', border: '1px solid var(--status-approved-dot)',
            borderRadius: 12, padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start',
          }}>
            <CheckCircle size={24} style={{ color: 'var(--status-approved-fg)', flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--status-approved-fg)' }}>
                {isAr ? 'تم الاستيراد بنجاح' : 'Import Successful'}
              </h2>
              <p style={{ margin: 0, color: 'var(--status-approved-fg)', fontSize: 14 }}>
                {isAr
                  ? `تم استيراد ${result.imported} ${result.imported === 1 ? 'موظف' : 'موظفين'} بنجاح.${result.usersCreated > 0 ? ` وأُنشئ ${result.usersCreated} ${result.usersCreated === 1 ? 'حساب مستخدم' : 'حساب مستخدم'}.` : ''}`
                  : `${result.imported} employee${result.imported !== 1 ? 's were' : ' was'} imported successfully.${result.usersCreated > 0 ? ` ${result.usersCreated} user account${result.usersCreated !== 1 ? 's were' : ' was'} created.` : ''}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <SummaryCard icon={<Users size={18} />} label={isAr ? 'الموظفون المستوردون' : 'Employees Imported'} value={result.imported} accent="green" />
            <SummaryCard icon={<UserCheck size={18} />} label={isAr ? 'حسابات المستخدمين المنشأة' : 'User Accounts Created'} value={result.usersCreated} accent="blue" />
          </div>

          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
          }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--ink-1)' }}>
              {isAr ? 'الموظفون المستوردون' : 'Imported Employees'}
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {(isAr ? ['الصف', 'رقم الموظف', 'الاسم الكامل', 'حساب المستخدم'] : ['Row', 'Employee Number', 'Full Name', 'User Account']).map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--ink-2)', fontWeight: 600, fontSize: 'var(--text-caption)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 100).map(row => (
                    <tr key={row.personId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.rowNumber}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{row.personNumber}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--ink-1)' }}>
                        <a href={`/persons/${row.personId}`} style={{ color: 'var(--brand-active)', textDecoration: 'none' }}>
                          {row.fullNameEn}
                        </a>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {row.userCreated ? (
                          <span style={{ background: 'var(--accent-100)', color: 'var(--brand-active)', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)', fontWeight: 600 }}>{isAr ? 'أُنشئ' : 'Created'}</span>
                        ) : (
                          <span style={{ background: 'var(--surface)', color: 'var(--ink-3)', padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-caption)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="/persons"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--accent)', color: '#fff',
                padding: '10px 22px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                textDecoration: 'none',
              }}
            >
              <Users size={15} />
              {isAr ? 'عرض جميع الموظفين' : 'View All Employees'}
            </a>
            <button
              onClick={handleReset}
              style={{
                padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              {isAr ? 'استيراد ملف آخر' : 'Import Another File'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
