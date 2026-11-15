'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  FileText, PlusCircle, Pencil, Star, ChevronRight,
  Briefcase, UserCheck, TrendingUp, Tag, Award, CreditCard, Banknote, XCircle,
} from 'lucide-react'
import { TemplateEditorForm } from './TemplateEditorForm'
import { fetchTemplatesForType } from '@/modules/employee-letters/actions'

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  PCL: { label: 'Probation Confirmation', desc: 'Confirms successful completion of probation period',   icon: <UserCheck  size={14} />, color: '#10B981' },
  EML: { label: 'Employment Letter',      desc: 'Official proof of employment for external use',        icon: <Briefcase  size={14} />, color: '#3B82F6' },
  PML: { label: 'Promotion Letter',       desc: 'Formalises an employee promotion to a new grade/role', icon: <TrendingUp size={14} />, color: '#8B5CF6' },
  DCL: { label: 'Designation Change',     desc: 'Records a change in job title or designation',         icon: <Tag        size={14} />, color: '#F59E0B' },
  SAL: { label: 'Salary Amendment',       desc: 'Documents a change in compensation',                   icon: <CreditCard size={14} />, color: '#06B6D4' },
  SC:  { label: 'Salary Certificate',     desc: 'Certifies current salary for banking/visa purposes',   icon: <Award      size={14} />, color: '#6366F1' },
  STL: { label: 'Salary Transfer',        desc: 'Authorises bank transfer of monthly salary',           icon: <Banknote   size={14} />, color: '#14B8A6' },
  TER: { label: 'Termination Letter',     desc: 'Formal notice of employment termination',              icon: <XCircle    size={14} />, color: '#EF4444' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LetterType {
  typeCode:  string
  nameEn:    string
  nameAr:    string
}

interface Template {
  id:        string
  nameEn:    string
  nameAr:    string | null
  bodyEn:    string
  bodyAr:    string | null
  isDefault: boolean
}

interface Token {
  tokenKey:  string
  labelEn:   string
  category:  string
}

interface Props {
  types:            LetterType[]
  initialTypeCode:  string
  initialTemplates: Template[]
  tokens:           Token[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LetterTemplatesClient({ types, initialTypeCode, initialTemplates, tokens }: Props) {
  const router                              = useRouter()
  const searchParams                        = useSearchParams()
  const [typeCode,      setTypeCode]        = useState(initialTypeCode)
  const [templates,     setTemplates]       = useState<Template[]>(initialTemplates)
  const [editTemplate,  setEditTemplate]    = useState<Template | null>(null)
  const [createMode,    setCreateMode]      = useState(false)
  const [loadingType,   setLoadingType]     = useState<string | null>(null)
  const [, startTransition]                 = useTransition()

  const activeMeta = TYPE_META[typeCode] ?? { label: typeCode, desc: '', icon: <FileText size={14} />, color: 'var(--brand-active)' }
  const editorOpen = editTemplate !== null || createMode

  // ── Tab switch ──────────────────────────────────────────────────────────────

  const switchType = useCallback(async (code: string) => {
    if (code === typeCode) return
    setEditTemplate(null)
    setCreateMode(false)
    setLoadingType(code)
    try {
      const fresh = await fetchTemplatesForType(code)
      setTemplates(fresh as Template[])
      setTypeCode(code)
      // Update URL without hard reload
      const params = new URLSearchParams(searchParams.toString())
      params.set('typeCode', code)
      startTransition(() => router.push(`/settings/letter-templates?${params}`, { scroll: false }))
    } finally {
      setLoadingType(null)
    }
  }, [typeCode, router, searchParams])

  // ── Edit ────────────────────────────────────────────────────────────────────

  function openEdit(t: Template) {
    setCreateMode(false)
    setEditTemplate(t)
  }

  function openCreate() {
    setEditTemplate(null)
    setCreateMode(true)
  }

  function closeEditor() {
    setEditTemplate(null)
    setCreateMode(false)
  }

  // ── After save ──────────────────────────────────────────────────────────────

  async function handleSaved() {
    closeEditor()
    const fresh = await fetchTemplatesForType(typeCode)
    setTemplates(fresh as Template[])
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>

      {/* ── LEFT SIDEBAR: type list ── */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 8,
      }}>
        <div style={{
          padding: '8px 14px 10px',
          fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--ink-4)',
        }}>
          Letter Types
        </div>
        {types.map(t => {
          const meta    = TYPE_META[t.typeCode] ?? { label: t.nameEn, icon: <FileText size={14} />, color: 'var(--brand-active)' }
          const active  = t.typeCode === typeCode
          const loading = loadingType === t.typeCode
          return (
            <button
              key={t.typeCode}
              type="button"
              onClick={() => switchType(t.typeCode)}
              disabled={!!loadingType}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px',
                borderTopWidth: "0px",
                borderTopStyle: "none",
                borderTopColor: "currentColor",
                borderRightWidth: "0px",
                borderRightStyle: "none",
                borderRightColor: "currentColor",
                borderBottomWidth: "0px",
                borderBottomStyle: "none",
                borderBottomColor: "currentColor", cursor: 'pointer',
                background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--bg))' : 'transparent',
                borderLeftWidth: "3px",
                borderLeftStyle: "solid",
                borderLeftColor: (active) ? "var(--accent)" : "transparent",
                textAlign: 'left', width: '100%',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? `color-mix(in srgb, ${meta.color} 15%, transparent)` : 'var(--surface)',
                color: active ? meta.color : 'var(--ink-3)',
                transition: 'background 0.12s, color 0.12s',
              }}>
                {loading ? (
                  <span style={{ width: 10, height: 10,
                  borderTopWidth: "2px",
                  borderTopStyle: "solid",
                  borderRightWidth: "2px",
                  borderRightStyle: "solid",
                  borderRightColor: "currentColor",
                  borderBottomWidth: "2px",
                  borderBottomStyle: "solid",
                  borderBottomColor: "currentColor",
                  borderLeftWidth: "2px",
                  borderLeftStyle: "solid",
                  borderLeftColor: "currentColor",
                  borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                ) : meta.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--text-caption)', fontWeight: active ? 700 : 500,
                  color: active ? 'var(--ink-1)' : 'var(--ink-2)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {meta.label}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                  {t.typeCode}
                </div>
              </div>
              {active && <ChevronRight size={13} style={{ marginLeft: 'auto', color: 'var(--brand-active)', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>

      {/* ── RIGHT CONTENT AREA ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Section header */}
        <div style={{
          padding: '16px 24px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `color-mix(in srgb, ${activeMeta.color} 12%, transparent)`,
              color: activeMeta.color,
            }}>
              {activeMeta.icon}
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
                {activeMeta.label}
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                {activeMeta.desc || types.find(t => t.typeCode === typeCode)?.nameAr}
              </p>
            </div>
          </div>
          {!editorOpen && (
            <button
              type="button"
              onClick={openCreate}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff',
                fontSize: 'var(--text-caption)', fontWeight: 600,
              }}
            >
              <PlusCircle size={13} /> New Template
            </button>
          )}
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Existing templates list ── */}
          {templates.length === 0 && !editorOpen ? (
            <EmptyState typeLabel={activeMeta.label} onCreate={openCreate} />
          ) : templates.length > 0 && (
            <div>
              <div style={{
                fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--ink-4)',
                marginBottom: 8,
              }}>
                {templates.length} Template{templates.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {templates.map(t => {
                  const isEditing = editTemplate?.id === t.id
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '11px 16px',
                        background: isEditing ? `color-mix(in srgb, ${activeMeta.color} 5%, var(--card))` : 'var(--card)',
                        border: `1px solid ${isEditing ? activeMeta.color : 'var(--border)'}`,
                        borderRadius: 9,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                            {t.nameEn}
                          </div>
                          {t.nameAr && (
                            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', textAlign: 'left' }}>
                              {t.nameAr}
                            </div>
                          )}
                        </div>
                        {t.isDefault && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            fontSize: 'var(--text-caption)', padding: '2px 7px', borderRadius: 4,
                            background: `color-mix(in srgb, ${activeMeta.color} 12%, transparent)`,
                            color: activeMeta.color, fontWeight: 600,
                          }}>
                            <Star size={9} /> Default
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => isEditing ? closeEditor() : openEdit(t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 6,
                          border: `1px solid ${isEditing ? activeMeta.color : 'var(--border)'}`,
                          background: isEditing ? `color-mix(in srgb, ${activeMeta.color} 10%, transparent)` : 'var(--surface)',
                          color: isEditing ? activeMeta.color : 'var(--ink-2)',
                          fontSize: 'var(--text-caption)', cursor: 'pointer', fontWeight: 500,
                        }}
                      >
                        <Pencil size={12} />
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Editor panel ── */}
          {editorOpen && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10,
              background: 'var(--card)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 18px', borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {editTemplate ? `Editing: ${editTemplate.nameEn}` : `New ${activeMeta.label} Template`}
                </span>
                <button
                  type="button"
                  onClick={closeEditor}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ padding: '20px 18px' }}>
                <TemplateEditorForm
                  typeCode={typeCode}
                  typeName={activeMeta.label}
                  template={editTemplate ?? undefined}
                  tokens={tokens}
                  onSaved={handleSaved}
                  onCancel={closeEditor}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ typeLabel, onCreate }: { typeLabel: string; onCreate: () => void }) {
  return (
    <div style={{
      textAlign: 'center', padding: '56px 24px',
      border: '1px dashed var(--border)', borderRadius: 10,
      background: 'var(--surface)',
    }}>
      <FileText size={36} style={{ color: 'var(--ink-4)', margin: '0 auto 12px' }} />
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
        No templates for {typeLabel}
      </p>
      <p style={{ margin: '0 0 18px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
        Create your first template. Use the auto-generate option to start from a standard structure.
      </p>
      <button
        type="button"
        onClick={onCreate}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', fontSize: 'var(--text-body)', fontWeight: 600,
        }}
      >
        <PlusCircle size={14} /> Create Template
      </button>
    </div>
  )
}
