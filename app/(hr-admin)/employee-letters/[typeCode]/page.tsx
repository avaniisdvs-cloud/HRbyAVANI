'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { FileText, Clock } from 'lucide-react'
import { ProbationGeneratePanel } from '@/components/employee-letters/ProbationGeneratePanel'
import { BulkGeneratePanel } from '@/components/employee-letters/BulkGeneratePanel'
import { LetterListTable } from '@/components/employee-letters/LetterListTable'
import { LetterPreviewModal } from '@/components/employee-letters/LetterPreviewModal'
import {
  sendLetterEmailAction,
  sendSignRequest,
  getLetterForPreview,
} from '@/modules/employee-letters/actions'

const TYPE_NAMES: Record<string, { en: string; ar: string }> = {
  TER: { en: 'Termination Letter',            ar: 'خطاب إنهاء الخدمة' },
  PCL: { en: 'Probation Confirmation Letter', ar: 'خطاب تأكيد اجتياز فترة التجربة' },
  SAL: { en: 'Salary Amendment Letter',       ar: 'خطاب تعديل الراتب' },
  PML: { en: 'Promotion Letter',              ar: 'خطاب ترقية' },
  DCL: { en: 'Designation Change Letter',     ar: 'خطاب تغيير المسمى الوظيفي' },
  EML: { en: 'Employment Letter',             ar: 'خطاب توظيف' },
  SC:  { en: 'Salary Certificate',            ar: 'شهادة راتب' },
  STL: { en: 'Salary Transfer Letter',        ar: 'خطاب تحويل راتب' },
}

type Tab = 'generate' | 'letters' | 'history'

export default function LetterTypePage() {
  const params   = useParams()
  const typeCode = (params.typeCode as string).toUpperCase()
  const typeMeta = TYPE_NAMES[typeCode] ?? { en: typeCode, ar: typeCode }

  const [activeTab,     setActiveTab]     = useState<Tab>('generate')
  const [employees,     setEmployees]     = useState<any[]>([])
  const [letters,       setLetters]       = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [previewLetter, setPreviewLetter] = useState<any | null>(null)

  async function loadLetters() {
    const res = await fetch(`/api/employee-letters/list?typeCode=${typeCode}`).then(r => r.json())
    setLetters(res.letters ?? [])
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [empRes, letRes] = await Promise.all([
          fetch(`/api/employee-letters/employees?typeCode=${typeCode}`).then(r => r.json()),
          fetch(`/api/employee-letters/list?typeCode=${typeCode}`).then(r => r.json()),
        ])
        setEmployees(empRes.employees ?? [])
        setLetters(letRes.letters ?? [])
      } catch { /* noop */ }
      setLoading(false)
    }
    load()
  }, [typeCode])

  async function handlePreview(id: string) {
    const data = await getLetterForPreview(id)
    setPreviewLetter(data)
  }

  async function handleDownload(id: string) {
    const resp = await fetch(`/api/employee-letters/download?id=${id}`)
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
    const blob     = await resp.blob()
    const filename = resp.headers.get('Content-Disposition')
      ?.match(/filename="([^"]+)"/)?.[1] ?? `letter_${id}.pdf`
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    await loadLetters()
  }

  async function handleSendEmail(id: string) {
    const result = await sendLetterEmailAction(id)
    await loadLetters()
    return result
  }

  async function handleSignRequest(id: string) {
    const result = await sendSignRequest(id)
    if (result.success) await loadLetters()
    return result
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'generate', label: 'Generate', icon: <FileText size={14} /> },
    { key: 'letters',  label: 'Letters',  icon: <FileText size={14} /> },
    { key: 'history',  label: 'History',  icon: <Clock size={14} /> },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400 }}>
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
        marginBottom: 6 }}>
          <a href="/employee-letters" style={{ color: 'var(--ink-3)', textDecoration: 'none' }}>
            Employee Letters
          </a>
          {' / '}
          <span style={{ color: 'var(--ink-1)' }}>{typeMeta.en}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 700,
            color: 'var(--ink-1)', fontFamily: 'var(--font-serif)',
          }}>
            {typeMeta.en}
          </h1>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-serif)' }}>
            {typeMeta.ar}
          </span>
          <span style={{
            marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 600,
            padding: '2px 8px', borderRadius: 4,
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: 'var(--brand-active)', letterSpacing: '0.06em',
          }}>
            {typeCode}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)',
      marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px',
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderLeftWidth: "0px",
              borderLeftStyle: "none",
              borderLeftColor: "currentColor", background: 'none',
              cursor: 'pointer', fontSize: 'var(--text-body)',
              fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? 'var(--brand-active)' : 'var(--ink-2)',
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: (activeTab === t.key) ? "var(--accent)" : "transparent",
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.icon}
            {t.label}
            {t.key !== 'generate' && letters.length > 0 && (
              <span style={{
                fontSize: 'var(--text-caption)', padding: '1px 5px', borderRadius: 10,
                background: 'var(--border)', color: 'var(--ink-2)',
              }}>
                {letters.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)', padding: '32px 0', textAlign: 'center' }}>
          Loading…
        </div>
      ) : (
        <>
          {activeTab === 'generate' && (
            typeCode === 'PCL' ? (
              <ProbationGeneratePanel
                employees={employees}
                onGenerated={() => { loadLetters(); setActiveTab('letters') }}
              />
            ) : (
              <BulkGeneratePanel
                typeCode={typeCode}
                employees={employees}
                onComplete={results => {
                  loadLetters()
                  if (results.some(r => r.letterId)) setActiveTab('letters')
                }}
              />
            )
          )}

          {(activeTab === 'letters' || activeTab === 'history') && (
            <LetterListTable
              letters={letters}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onSendEmail={handleSendEmail}
              onSignRequest={handleSignRequest}
            />
          )}
        </>
      )}

      {previewLetter && (
        <LetterPreviewModal letter={previewLetter} onClose={() => setPreviewLetter(null)} />
      )}
    </div>
  )
}
