'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database, RefreshCw, Plus, Pencil, Trash2, Play, Sparkles,
  ChevronRight, ChevronDown, ChevronLeft, Search, X, Save,
  Shield, AlertTriangle, Check, Loader2, Table2, Code2,
  Sun, Moon,
} from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import './dataops.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColumnDef {
  column_name:              string
  udt_name:                 string
  data_type:                string
  is_nullable:              'YES' | 'NO'
  column_default:           string | null
  character_maximum_length: number | null
  is_pk:                    boolean
  fk?: { foreign_table_schema: string; foreign_table_name: string; foreign_column_name: string }
}

interface TableMeta {
  schema:      string
  name:        string
  row_count:   number
  size_pretty: string
  columns:     ColumnDef[]
  indexes:     string[]
}

interface SchemaTree { schema: string; tables: TableMeta[] }

interface AuditEntry {
  id:          string
  ts:          string
  actor_id:    string
  actor_role:  string
  operation:   string
  schema_name: string
  table_name:  string
  pk_value:    string | null
  sql_text:    string | null
  row_count:   number
}

interface SavedQuery {
  id:          string
  name:        string
  description: string | null
  sql_text:    string
  tags:        string[]
  updated_at:  string
}

type DataAccessRole = 'SUPER_ADMIN' | 'HR_ADMIN_GROUP' | 'MANAGER' | 'EMPLOYEE'

interface DataOpsAppProps {
  canWrite:    boolean
  accessRole?: DataAccessRole
  personId?:   string
}

// ── API client ────────────────────────────────────────────────────────────────

const api = {
  async fetchSchemas()                        { return (await fetch('/api/dataops/schema')).json() },
  async refreshSchemas()                      { return (await fetch('/api/dataops/schema/refresh', { method: 'POST' })).json() },
  async fetchRows(schema: string, table: string, opts: { limit?: number; offset?: number; search?: string; sortBy?: string; sortDir?: string }) {
    const p = new URLSearchParams({ limit: String(opts.limit ?? 200), offset: String(opts.offset ?? 0), ...(opts.search ? { search: opts.search } : {}), ...(opts.sortBy ? { sortBy: opts.sortBy, sortDir: opts.sortDir ?? 'asc' } : {}) })
    return (await fetch(`/api/dataops/tables/${schema}/${table}/rows?${p}`)).json()
  },
  async insertRow(schema: string, table: string, data: Record<string, unknown>)                  { return (await fetch(`/api/dataops/tables/${schema}/${table}/rows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json() },
  async updateRow(schema: string, table: string, id: string, data: Record<string, unknown>)      { return (await fetch(`/api/dataops/tables/${schema}/${table}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json() },
  async createSnapshot(schema: string, table: string, pkValue: string)                           { return (await fetch(`/api/dataops/tables/${schema}/${table}/snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pkValue }) })).json() },
  async deleteRow(schema: string, table: string, id: string, snapshotId: string)                 { return (await fetch(`/api/dataops/tables/${schema}/${table}/${id}?snapshot_id=${snapshotId}`, { method: 'DELETE' })).json() },
  async execute(sql: string)                                                                       { return (await fetch('/api/dataops/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) })).json() },
  async nl2sql(prompt: string)                                                                     { return (await fetch('/api/dataops/nl2sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })).json() },
  async fetchAudit(limit = 50)                                                                     { return (await fetch(`/api/dataops/audit?limit=${limit}`)).json() },
  async saveQuery(data: { name: string; description?: string; sql_text: string; tags?: string[] }){ return (await fetch('/api/dataops/saved-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json() },
  async fetchSavedQueries()                                                                        { return (await fetch('/api/dataops/saved-queries')).json() },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVal(val: unknown, col: ColumnDef): { text: string; cls: string } {
  if (val === null || val === undefined) return { text: 'NULL', cls: 'null' }
  if (typeof val === 'boolean') return { text: String(val), cls: val ? 'bool-true' : 'bool-false' }
  if (col.is_pk) return { text: String(val), cls: 'pk' }
  if (typeof val === 'object') return { text: JSON.stringify(val), cls: '' }
  const str = String(val)
  return { text: str.length > 80 ? str.slice(0, 80) + '…' : str, cls: '' }
}

function pgTypeToInputType(col: ColumnDef): 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'readonly' {
  if (col.column_default?.includes('nextval(') || col.column_default?.includes('gen_random_uuid()')) return 'readonly'
  if (['json', 'jsonb'].includes(col.udt_name)) return 'json'
  if (['bool', 'boolean'].includes(col.udt_name)) return 'boolean'
  if (col.udt_name === 'date') return 'date'
  if (['timestamp', 'timestamptz', 'timetz'].includes(col.udt_name)) return 'datetime'
  if (['int2','int4','int8','float4','float8','numeric','decimal'].includes(col.udt_name)) return 'number'
  return 'text'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OpBadge({ op }: { op: string }) {
  return <span className={`do-op do-op-${op}`}>{op}</span>
}

interface RecordDrawerProps {
  columns:  ColumnDef[]
  initial?: Record<string, unknown>
  isEdit:   boolean
  canWrite: boolean
  onSave:   (data: Record<string, unknown>) => Promise<void>
  onClose:  () => void
}

function RecordDrawer({ columns, initial, isEdit, canWrite, onSave, onClose }: RecordDrawerProps) {
  const locale = useLocale()
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const col of columns) init[col.column_name] = initial?.[col.column_name] ?? ''
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWrite) return
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed'))
      setSaving(false)
    }
  }

  return (
    <div className="do-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="do-drawer">
        <div className="do-drawer-header">
          <Database size={15} style={{ color: '#6ab0ff' }} />
          <span className="do-drawer-title">{isEdit ? (locale === 'ar' ? 'تعديل السجل' : 'Edit Record') : (locale === 'ar' ? 'سجل جديد' : 'New Record')}</span>
          <button className="do-btn do-btn-ghost" style={{ padding: '0 8px', height: 26 }} onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <form className="do-drawer-body" onSubmit={submit} style={{ overflow: 'auto' }}>
          {columns.map(col => {
            const inputType = pgTypeToInputType(col)
            const isReadonly = inputType === 'readonly' && !isEdit
            return (
              <div className="do-field" key={col.column_name}>
                <label className="do-label">
                  {col.column_name}
                  {col.is_pk && <span className="pk-badge">PK</span>}
                  {col.fk && <span className="pk-badge" style={{ color: '#f59e0b' }}>FK</span>}
                  <span style={{ marginInlineStart: 6, fontWeight: 400, color: 'var(--do-mute)' }}>{col.udt_name}</span>
                </label>

                {inputType === 'boolean' ? (
                  <div className="do-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form[col.column_name])}
                      onChange={e => setForm(p => ({ ...p, [col.column_name]: e.target.checked }))}
                      disabled={!canWrite}
                    />
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)' }}>{String(form[col.column_name])}</span>
                  </div>
                ) : inputType === 'json' ? (
                  <textarea
                    className="do-textarea"
                    value={form[col.column_name] == null ? '' : typeof form[col.column_name] === 'string' ? form[col.column_name] as string : JSON.stringify(form[col.column_name], null, 2)}
                    onChange={e => setForm(p => ({ ...p, [col.column_name]: e.target.value }))}
                    disabled={!canWrite}
                    placeholder={isReadonly ? (locale === 'ar' ? '(يُنشأ تلقائيًا)' : '(auto-generated)') : (locale === 'ar' ? 'قيمة JSON' : 'JSON value')}
                  />
                ) : (
                  <input
                    className="do-input"
                    type={inputType === 'number' ? 'number' : inputType === 'date' ? 'date' : inputType === 'datetime' ? 'datetime-local' : 'text'}
                    value={form[col.column_name] == null ? '' : String(form[col.column_name])}
                    onChange={e => setForm(p => ({ ...p, [col.column_name]: e.target.value }))}
                    disabled={!canWrite || isReadonly}
                    placeholder={isReadonly ? (locale === 'ar' ? '(يُنشأ تلقائيًا)' : '(auto-generated)') : ''}
                    required={col.is_nullable === 'NO' && !isReadonly && !col.column_default}
                  />
                )}
              </div>
            )
          })}
          {error && <p style={{ color: '#ef4444', fontSize: 'var(--text-caption)', marginTop: 4 }}>{error}</p>}
        </form>

        <div className="do-drawer-footer">
          <button type="button" className="do-btn do-btn-ghost" onClick={onClose}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          {canWrite && (
            <button
              type="button"
              className="do-btn do-btn-primary"
              onClick={submit as unknown as React.MouseEventHandler}
              disabled={saving}
            >
              {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {isEdit ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (locale === 'ar' ? 'إدراج صف' : 'Insert Row')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface ConfirmDeleteProps {
  schema:     string
  table:      string
  pkValue:    string
  row:        Record<string, unknown>
  onConfirm:  (snapshotId: string) => Promise<void>
  onClose:    () => void
}

function ConfirmDelete({ schema, table, pkValue, row, onConfirm, onClose }: ConfirmDeleteProps) {
  const locale = useLocale()
  const [confirmText, setConfirmText] = useState('')
  const [step, setStep]               = useState<'preview' | 'confirm'>('preview')
  const [snapshotId, setSnapshotId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function takeSnapshot() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.createSnapshot(schema, table, pkValue)
      if (res.error) throw new Error(res.error)
      setSnapshotId(res.snapshot_id)
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشلت اللقطة' : 'Snapshot failed'))
    } finally {
      setLoading(false)
    }
  }

  async function commitDelete() {
    if (!snapshotId || confirmText !== 'CONFIRM') return
    setLoading(true)
    setError(null)
    try {
      await onConfirm(snapshotId)
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحذف' : 'Delete failed'))
      setLoading(false)
    }
  }

  return (
    <div className="do-modal-overlay">
      <div className="do-modal">
        <div className="do-modal-header">
          <AlertTriangle size={16} style={{ color: '#ef4444' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#ef4444' }}>
            {step === 'preview' ? (locale === 'ar' ? 'مراجعة قبل الحذف' : 'Review Before Delete') : (locale === 'ar' ? 'تأكيد الحذف' : 'Confirm Deletion')}
          </span>
        </div>

        <div className="do-modal-body">
          {step === 'preview' ? (
            <>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)', marginBottom: 12 }}>
                {locale === 'ar' ? 'أنت على وشك حذف الصف' : 'You are about to delete row'} <code style={{ color: '#6ab0ff' }}>{pkValue}</code> {locale === 'ar' ? 'من' : 'from'}{' '}
                <code style={{ color: '#6ab0ff' }}>{schema}.{table}</code>.
                {' '}{locale === 'ar' ? 'سيتم حفظ لقطة قبل الحذف.' : 'A snapshot will be saved before deletion.'}
              </p>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: 10, fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', maxHeight: 200, overflow: 'auto' }}>
                {Object.entries(row).slice(0, 12).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                    <span style={{ color: '#7faaff', minWidth: 120 }}>{k}</span>
                    <span style={{ color: '#c8d0de' }}>{v === null ? 'NULL' : String(v).slice(0, 60)}</span>
                  </div>
                ))}
              </div>
              {error && <p style={{ color: '#ef4444', fontSize: 'var(--text-caption)', marginTop: 8 }}>{error}</p>}
            </>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)', marginBottom: 4 }}>
                {locale === 'ar' ? <>تم حفظ اللقطة. اكتب <code style={{ color: '#ef4444' }}>CONFIRM</code> لحذف هذا الصف نهائياً.</> : <>Snapshot saved. Type <code style={{ color: '#ef4444' }}>CONFIRM</code> to permanently delete this row.</>}
              </p>
              <input
                className="do-confirm-input"
                placeholder={locale === 'ar' ? 'اكتب CONFIRM' : 'Type CONFIRM'}
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                autoFocus
              />
              {error && <p style={{ color: '#ef4444', fontSize: 'var(--text-caption)', marginTop: 8 }}>{error}</p>}
            </>
          )}
        </div>

        <div className="do-modal-footer">
          <button className="do-btn do-btn-ghost" onClick={onClose} disabled={loading}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          {step === 'preview' ? (
            <button className="do-btn do-btn-warn" onClick={takeSnapshot} disabled={loading}>
              {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
              {locale === 'ar' ? 'حفظ اللقطة والمتابعة' : 'Save Snapshot & Continue'}
            </button>
          ) : (
            <button
              className="do-btn do-btn-danger"
              onClick={commitDelete}
              disabled={loading || confirmText !== 'CONFIRM'}
            >
              {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
              {locale === 'ar' ? 'حذف الصف' : 'Delete Row'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Table panel ───────────────────────────────────────────────────────────────

interface TablePanelProps {
  meta:        TableMeta
  canWrite:    boolean
  accessRole:  DataAccessRole
  onAuditRefresh: () => void
}

function TablePanel({ meta, canWrite, accessRole, onAuditRefresh }: TablePanelProps) {
  const locale                = useLocale()
  const [rows, setRows]       = useState<Record<string, unknown>[]>([])
  const [total, setTotal]     = useState(0)
  const [teamSize, setTeamSize] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [offset, setOffset]   = useState(0)
  const [sortBy, setSortBy]   = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const limit = 100

  const [drawerOpen, setDrawerOpen]           = useState(false)
  const [editRow, setEditRow]                 = useState<Record<string, unknown> | null>(null)
  const [deleteTarget, setDeleteTarget]       = useState<Record<string, unknown> | null>(null)
  const [toast, setToast]                     = useState<string | null>(null)

  const pkCol = meta.columns.find(c => c.is_pk)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.fetchRows(meta.schema, meta.name, { limit, offset, search, sortBy, sortDir })
      if (!res.error) {
        setRows(res.rows ?? [])
        setTotal(Number(res.total ?? 0))
        if (res.teamSize != null) setTeamSize(Number(res.teamSize))
      }
    } finally {
      setLoading(false)
    }
  }, [meta.schema, meta.name, offset, search, sortBy, sortDir])

  useEffect(() => { setOffset(0) }, [search, sortBy, sortDir])
  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleSave(data: Record<string, unknown>) {
    if (editRow && pkCol) {
      const id = String(editRow[pkCol.column_name])
      const res = await api.updateRow(meta.schema, meta.name, id, data)
      if (res.error) throw new Error(res.error)
      showToast(locale === 'ar' ? 'تم تحديث الصف' : 'Row updated')
    } else {
      const res = await api.insertRow(meta.schema, meta.name, data)
      if (res.error) throw new Error(res.error)
      showToast(locale === 'ar' ? 'تم إدراج الصف' : 'Row inserted')
    }
    setDrawerOpen(false)
    setEditRow(null)
    await load()
    onAuditRefresh()
  }

  async function handleDelete(snapshotId: string) {
    if (!deleteTarget || !pkCol) return
    const id  = String(deleteTarget[pkCol.column_name])
    const res = await api.deleteRow(meta.schema, meta.name, id, snapshotId)
    if (res.error) throw new Error(res.error)
    setDeleteTarget(null)
    showToast(locale === 'ar' ? 'تم حذف الصف' : 'Row deleted')
    await load()
    onAuditRefresh()
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const pages = Math.ceil(total / limit)
  const page  = Math.floor(offset / limit)

  return (
    <div className="do-table-panel">
      {/* toolbar */}
      <div className="do-table-toolbar">
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, color: 'var(--do-mute)' }} />
          <input
            className="do-search"
            placeholder={locale === 'ar' ? `بحث في ${meta.name}…` : `Search ${meta.name}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <X size={12} style={{ position: 'absolute', right: 8, color: 'var(--do-mute)', cursor: 'pointer' }}
              onClick={() => setSearch('')} />
          )}
        </div>

        <button className="do-btn do-btn-ghost" onClick={load} title={locale === 'ar' ? 'تحديث' : 'Refresh'}>
          <RefreshCw size={12} />
        </button>

        {canWrite && (
          <button className="do-btn do-btn-primary" onClick={() => { setEditRow(null); setDrawerOpen(true) }}>
            <Plus size={13} /> {locale === 'ar' ? 'إدراج صف' : 'Insert Row'}
          </button>
        )}

        {(accessRole === 'EMPLOYEE' || accessRole === 'MANAGER') && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)', color: accessRole === 'MANAGER' ? '#f59e0b' : '#a78bfa', background: accessRole === 'MANAGER' ? 'rgba(245,158,11,0.08)' : 'rgba(167,139,250,0.08)', padding: '3px 8px', borderRadius: 4, border: `1px solid ${accessRole === 'MANAGER' ? 'rgba(245,158,11,0.2)' : 'rgba(167,139,250,0.2)'}` }}>
            <Shield size={10} />
            {accessRole === 'MANAGER'
              ? (locale === 'ar'
                  ? `بياناتك + ${teamSize ?? '…'} من المرؤوسين المباشرين`
                  : `Your data + ${teamSize ?? '…'} direct report${teamSize !== 1 ? 's' : ''}`)
              : (locale === 'ar' ? 'سجلاتك فقط' : 'Your records only')}
          </span>
        )}

        <span style={{ marginInlineStart: 'auto', fontSize: 'var(--text-caption)', color: 'var(--do-mute)' }}>
          {total.toLocaleString()} {locale === 'ar' ? 'صف' : 'rows'} · {meta.size_pretty}
        </span>
      </div>

      {/* grid */}
      <div className="do-grid-wrap">
        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(6)].map((_, i) => <div key={i} className="do-shimmer" style={{ width: `${60 + (i % 3) * 15}%` }} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="do-empty">
            <Table2 size={28} style={{ opacity: 0.35 }} />
            <span>{locale === 'ar' ? 'لم يتم العثور على صفوف' : 'No rows found'}</span>
          </div>
        ) : (
          <TableScrollRegion><table className="do-grid">
            <thead>
              <tr>
                {canWrite && <th style={{ width: 60 }}>{locale === 'ar' ? 'إجراءات' : 'ACTIONS'}</th>}
                {meta.columns.map(col => (
                  <th
                    key={col.column_name}
                    onClick={() => toggleSort(col.column_name)}
                    className={sortBy === col.column_name ? 'sorted' : ''}
                  >
                    {col.column_name}
                    {col.is_pk && <span style={{ color: '#6ab0ff', marginInlineStart: 4 }}>🔑</span>}
                    {sortBy === col.column_name && (
                      <span style={{ marginInlineStart: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const pk = pkCol ? String(row[pkCol.column_name]) : String(ri)
                return (
                  <tr key={pk}>
                    {canWrite && (
                      <td style={{ display: 'flex', gap: 4, padding: '4px 6px' }}>
                        <button
                          className="do-btn do-btn-ghost"
                          style={{ height: 22, padding: '0 6px', fontSize: 'var(--text-caption)' }}
                          title={locale === 'ar' ? 'تعديل' : 'Edit'}
                          onClick={() => { setEditRow(row); setDrawerOpen(true) }}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          className="do-btn do-btn-danger"
                          style={{ height: 22, padding: '0 6px', fontSize: 'var(--text-caption)' }}
                          title={locale === 'ar' ? 'حذف' : 'Delete'}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    )}
                    {meta.columns.map(col => {
                      const { text, cls } = formatVal(row[col.column_name], col)
                      return <td key={col.column_name} className={cls} title={text}>{text}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* pagination */}
      {total > limit && (
        <div className="do-pager">
          <button onClick={() => setOffset(0)} disabled={page === 0}>
            <ChevronLeft size={12} />
            <ChevronLeft size={12} style={{ marginInlineStart: -8 }} />
          </button>
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={page === 0}>
            <ChevronLeft size={12} />
          </button>
          <span style={{ flex: 1, textAlign: 'center' }}>{locale === 'ar' ? `صفحة ${page + 1} من ${pages}` : `Page ${page + 1} of ${pages}`}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={page >= pages - 1}>
            <ChevronRight size={12} />
          </button>
          <button onClick={() => setOffset((pages - 1) * limit)} disabled={page >= pages - 1}>
            <ChevronRight size={12} />
            <ChevronRight size={12} style={{ marginInlineStart: -8 }} />
          </button>
        </div>
      )}

      {/* drawers / modals */}
      {drawerOpen && (
        <RecordDrawer
          columns={meta.columns}
          initial={editRow ?? undefined}
          isEdit={editRow !== null}
          canWrite={canWrite}
          onSave={handleSave}
          onClose={() => { setDrawerOpen(false); setEditRow(null) }}
        />
      )}

      {deleteTarget && pkCol && (
        <ConfirmDelete
          schema={meta.schema}
          table={meta.name}
          pkValue={String(deleteTarget[pkCol.column_name])}
          row={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          background: '#10b981', color: '#fff', padding: '8px 16px',
          borderRadius: 8, fontSize: 'var(--text-body)', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <Check size={13} style={{ marginInlineEnd: 6 }} /> {toast}
        </div>
      )}
    </div>
  )
}

// ── SQL write-confirmation helpers ────────────────────────────────────────────

function isWriteStatement(sql: string): boolean {
  return /^\s*(DELETE|UPDATE|INSERT|DROP|TRUNCATE|ALTER)\b/i.test(sql.trim())
}

function isDeleteStatement(sql: string): boolean {
  return /^\s*DELETE\b/i.test(sql.trim())
}

function deleteToSelectPreview(sql: string): string | null {
  const m = sql.trim().match(/DELETE\s+FROM\s+(\S+)(?:\s+WHERE\s+([\s\S]+?))?(?:;?\s*)$/i)
  if (!m) return null
  const table = m[1]
  const where = m[2] ? ` WHERE ${m[2].replace(/;+\s*$/, '')}` : ''
  return `SELECT * FROM ${table}${where} LIMIT 20`
}

interface SqlWriteConfirmProps {
  sql:          string
  previewRows:  Record<string, unknown>[]
  previewError: string | null
  onConfirm:    () => void
  onCancel:     () => void
  running:      boolean
}

function SqlWriteConfirm({ sql, previewRows, previewError, onConfirm, onCancel, running }: SqlWriteConfirmProps) {
  const locale = useLocale()
  const [confirmText, setConfirmText] = useState('')
  const isDelete = isDeleteStatement(sql)

  return (
    <div className="do-modal-overlay">
      <div className="do-modal" style={{ maxWidth: 560, width: '90vw' }}>
        <div className="do-modal-header">
          <AlertTriangle size={16} style={{ color: '#ef4444' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#ef4444' }}>{locale === 'ar' ? 'تأكيد عملية الكتابة' : 'Confirm Write Operation'}</span>
        </div>

        <div className="do-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)', margin: 0 }}>
            {locale === 'ar' ? 'أنت على وشك تنفيذ عبارة' : 'You are about to execute a'} <strong style={{ color: '#ef4444' }}>{sql.trim().split(/\s/)[0].toUpperCase()}</strong>{locale === 'ar' ? '.' : ' statement.'}
            {' '}{locale === 'ar' ? <>لا يمكن <strong style={{ color: '#ef4444' }}>التراجع</strong> عن هذا الإجراء.</> : <>This action <strong style={{ color: '#ef4444' }}>cannot be undone</strong>.</>}
          </p>

          <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: '#c8d0de', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto' }}>
            {sql.trim()}
          </div>

          {isDelete && (
            <div>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--do-mute)', marginBottom: 6 }}>
                {locale === 'ar' ? 'الصفوف التي سيتم حذفها' : 'Rows that will be deleted'} ({previewRows.length > 0 ? (locale === 'ar' ? `${previewRows.length} معروض` : `${previewRows.length} shown`) : previewError ? (locale === 'ar' ? 'فشلت المعاينة' : 'preview failed') : (locale === 'ar' ? 'لا يوجد تطابق' : 'none matched')})
              </div>
              {previewError ? (
                <p style={{ fontSize: 'var(--text-caption)', color: '#f59e0b', margin: 0 }}>{previewError}</p>
              ) : previewRows.length === 0 ? (
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)', margin: 0 }}>{locale === 'ar' ? 'لا توجد صفوف تطابق هذا الشرط — لن يؤثّر الحذف على أي صف.' : 'No rows match this condition — delete will affect 0 rows.'}</p>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: 8, fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', maxHeight: 160, overflow: 'auto' }}>
                  {Object.keys(previewRows[0]).slice(0, 6).map(k => (
                    <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 1, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 1 }}>
                      <span style={{ color: '#7faaff', minWidth: 100, flexShrink: 0 }}>{k}</span>
                      {previewRows.map((row, i) => (
                        <span key={i} style={{ color: '#c8d0de', marginRight: 16 }}>{row[k] == null ? 'NULL' : String(row[k]).slice(0, 30)}</span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--do-mute)', margin: '0 0 6px 0' }}>
              {locale === 'ar' ? <>اكتب <code style={{ color: '#ef4444' }}>CONFIRM</code> للتنفيذ:</> : <>Type <code style={{ color: '#ef4444' }}>CONFIRM</code> to execute:</>}
            </p>
            <input
              className="do-confirm-input"
              placeholder={locale === 'ar' ? 'اكتب CONFIRM' : 'Type CONFIRM'}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="do-modal-footer">
          <button className="do-btn do-btn-ghost" onClick={onCancel} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button
            className="do-btn do-btn-danger"
            onClick={onConfirm}
            disabled={running || confirmText !== 'CONFIRM'}
          >
            {running
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <Trash2 size={13} />}
            {locale === 'ar' ? 'تنفيذ' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SQL Editor panel ──────────────────────────────────────────────────────────

interface SqlPanelProps {
  canWrite:       boolean
  onAuditRefresh: () => void
}

function SqlPanel({ canWrite, onAuditRefresh }: SqlPanelProps) {
  const locale                    = useLocale()
  const [sql, setSql]             = useState('SELECT 1;')
  const [nlPrompt, setNlPrompt]   = useState('')
  const [running, setRunning]     = useState(false)
  const [nlLoading, setNlLoading] = useState(false)
  const [result, setResult]       = useState<{ rows: Record<string, unknown>[]; rowCount: number; elapsed: number; isDml?: boolean } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [saveOpen, setSaveOpen]   = useState(false)
  const [saveName, setSaveName]   = useState('')
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  const [pendingSql, setPendingSql]         = useState<string | null>(null)
  const [previewRows, setPreviewRows]       = useState<Record<string, unknown>[]>([])
  const [previewError, setPreviewError]     = useState<string | null>(null)
  const [confirmRunning, setConfirmRunning] = useState(false)

  useEffect(() => {
    api.fetchSavedQueries().then(r => { if (!r.error) setSavedQueries(r.queries ?? []) })
  }, [])

  async function runSql() {
    if (!sql.trim()) return

    // Intercept write operations — show confirmation first
    if (canWrite && isWriteStatement(sql)) {
      setPreviewRows([])
      setPreviewError(null)
      setPendingSql(sql)

      if (isDeleteStatement(sql)) {
        const previewSql = deleteToSelectPreview(sql)
        if (previewSql) {
          const res = await api.execute(previewSql)
          if (res.error) setPreviewError(res.error)
          else setPreviewRows(res.rows ?? [])
        }
      }
      return
    }

    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.execute(sql)
      if (res.error) { setError(res.error); return }
      setResult(res)
      onAuditRefresh()
    } finally {
      setRunning(false)
    }
  }

  async function executeConfirmed() {
    if (!pendingSql) return
    setConfirmRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.execute(pendingSql)
      setPendingSql(null)
      if (res.error) { setError(res.error); return }
      setResult(res)
      onAuditRefresh()
    } finally {
      setConfirmRunning(false)
    }
  }

  async function generateSql() {
    if (!nlPrompt.trim()) return
    setNlLoading(true)
    setError(null)
    try {
      const res = await api.nl2sql(nlPrompt)
      if (res.error) { setError(res.error); return }
      setSql(res.sql)
      setNlPrompt('')
      setTimeout(() => textareaRef.current?.focus(), 50)
    } finally {
      setNlLoading(false)
    }
  }

  async function saveQuery() {
    if (!saveName.trim()) return
    const res = await api.saveQuery({ name: saveName, sql_text: sql })
    if (!res.error) {
      setSavedQueries(prev => [res.query, ...prev])
      setSaveOpen(false)
      setSaveName('')
    }
  }

  return (
    <div className="do-sql-panel">
      {/* NL bar */}
      <div className="do-nl-bar">
        <Sparkles size={14} style={{ color: '#6ab0ff', flexShrink: 0 }} />
        <input
          className="do-nl-input"
          placeholder={locale === 'ar' ? "اسأل بلغة طبيعية… (مثال: 'show all employees hired this year')" : "Ask in plain English… (e.g. 'show all employees hired this year')"}
          value={nlPrompt}
          onChange={e => setNlPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateSql() } }}
        />
        <button className="do-btn do-btn-ghost" onClick={generateSql} disabled={nlLoading || !nlPrompt.trim()}>
          {nlLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : (locale === 'ar' ? 'توليد' : 'Generate')}
        </button>
      </div>

      {/* SQL textarea */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          ref={textareaRef}
          className="do-sql-area"
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runSql() } }}
          spellCheck={false}
          rows={8}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="do-btn do-btn-primary" onClick={runSql} disabled={running}>
            {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
            {locale === 'ar' ? 'تشغيل' : 'Run'}  <kbd style={{ fontSize: 'var(--text-caption)', opacity: 0.7, marginInlineStart: 4 }}>⌘↵</kbd>
          </button>
          <button className="do-btn do-btn-ghost" onClick={() => setSaveOpen(true)} disabled={!sql.trim()}>
            <Save size={13} /> {locale === 'ar' ? 'حفظ' : 'Save'}
          </button>
          {!canWrite && (
            <span className="do-readonly-note">
              <Shield size={11} /> {locale === 'ar' ? 'للقراءة فقط — استعلامات SELECT فقط' : 'Read-only — SELECT queries only'}
            </span>
          )}
        </div>
      </div>

      {/* Result / error */}
      {error && (
        <div className="do-result-err">
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="do-result-ok">
            <Check size={12} />
            {result.isDml
              ? (locale === 'ar'
                  ? `${result.rowCount} صف متأثّر · ${result.elapsed}ms`
                  : `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} affected · ${result.elapsed}ms`)
              : (locale === 'ar'
                  ? `${result.rowCount} صف · ${result.elapsed}ms`
                  : `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} · ${result.elapsed}ms`)
            }
          </div>
          {result.rows.length > 0 && (
            <div className="do-result-grid">
              <TableScrollRegion><table className="do-grid">
                <thead>
                  <tr>
                    {Object.keys(result.rows[0]).map(k => <th key={k}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 500).map((row, ri) => (
                    <tr key={ri}>
                      {Object.values(row).map((v, ci) => (
                        <td key={ci}>{v === null ? <span className="null">NULL</span> : String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table></TableScrollRegion>
            </div>
          )}
        </div>
      )}

      {/* Saved queries */}
      {savedQueries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="do-saved-head">{locale === 'ar' ? 'الاستعلامات المحفوظة' : 'Saved Queries'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {savedQueries.slice(0, 8).map(q => (
              <div key={q.id} className="do-saved-item" onClick={() => setSql(q.sql_text)}>
                <Code2 size={11} className="do-saved-item-icon" />
                <span className="do-saved-item-name">{q.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write confirmation modal */}
      {pendingSql && (
        <SqlWriteConfirm
          sql={pendingSql}
          previewRows={previewRows}
          previewError={previewError}
          onConfirm={executeConfirmed}
          onCancel={() => setPendingSql(null)}
          running={confirmRunning}
        />
      )}

      {/* Save dialog */}
      {saveOpen && (
        <div className="do-modal-overlay">
          <div className="do-modal">
            <div className="do-modal-header" style={{ background: 'rgba(0,102,255,0.08)', borderBottomColor: 'rgba(0,102,255,0.2)' }}>
              <Save size={15} style={{ color: '#6ab0ff' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{locale === 'ar' ? 'حفظ الاستعلام' : 'Save Query'}</span>
            </div>
            <div className="do-modal-body">
              <div className="do-field">
                <label className="do-label">{locale === 'ar' ? 'الاسم' : 'Name'}</label>
                <input
                  className="do-input"
                  placeholder={locale === 'ar' ? 'اسم الاستعلام…' : 'Query name…'}
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="do-modal-footer">
              <button className="do-btn do-btn-ghost" onClick={() => setSaveOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button className="do-btn do-btn-primary" onClick={saveQuery} disabled={!saveName.trim()}>
                <Save size={13} /> {locale === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

const ACCESS_LABELS: Record<DataAccessRole, { label: string; labelAr: string; sublabel: string; sublabelAr: string; color: string; bg: string; border: string }> = {
  SUPER_ADMIN:    { label: 'Full Access',        labelAr: 'وصول كامل',          sublabel: 'All tables · read + write',  sublabelAr: 'كل الجداول · قراءة + كتابة', color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
  HR_ADMIN_GROUP: { label: 'Read-Only (HR)',      labelAr: 'للقراءة فقط (موارد بشرية)', sublabel: 'All tables visible',     sublabelAr: 'كل الجداول مرئية',           color: '#6ab0ff', bg: 'rgba(0,102,255,0.1)',   border: 'rgba(0,102,255,0.25)' },
  MANAGER:        { label: 'Read-Only (Manager)', labelAr: 'للقراءة فقط (مدير)',   sublabel: 'Org-wide + team data',   sublabelAr: 'بيانات المؤسسة + الفريق',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  EMPLOYEE:       { label: 'Read-Only (Employee)', labelAr: 'للقراءة فقط (موظف)',  sublabel: 'Public data + own records', sublabelAr: 'البيانات العامة + سجلاتك',  color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
}

export function DataOpsApp({ canWrite, accessRole = 'HR_ADMIN_GROUP', personId }: DataOpsAppProps) {
  const locale     = useLocale()
  const accessInfo = ACCESS_LABELS[accessRole]
  const [schemas, setSchemas]           = useState<SchemaTree[]>([])
  const [loading, setLoading]           = useState(true)
  const [selectedTable, setSelectedTable] = useState<TableMeta | null>(null)
  const [activeTab, setActiveTab]       = useState<'table' | 'sql'>('table')
  const [openSchemas, setOpenSchemas]   = useState<Set<string>>(new Set())
  const [audit, setAudit]               = useState<AuditEntry[]>([])
  const [refreshing, setRefreshing]     = useState(false)
  const [theme, setTheme]               = useState<'dark' | 'light'>('light')
  const [sidebarSearch, setSidebarSearch] = useState('')

  async function loadSchemas() {
    setLoading(true)
    try {
      const res = await api.fetchSchemas()
      if (!res.error) {
        setSchemas(res.schemas ?? [])
        // Open first schema by default
        if (res.schemas?.length > 0) {
          setOpenSchemas(new Set([res.schemas[0].schema]))
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadAudit() {
    const res = await api.fetchAudit(30)
    if (!res.error) setAudit(res.entries ?? [])
  }

  async function refreshSchemas() {
    setRefreshing(true)
    try {
      const res = await api.refreshSchemas()
      if (!res.error) setSchemas(res.schemas ?? [])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSchemas()
    loadAudit()
    const interval = setInterval(loadAudit, 15_000)
    return () => clearInterval(interval)
  }, [])

  function toggleSchema(schema: string) {
    setOpenSchemas(prev => {
      const next = new Set(prev)
      if (next.has(schema)) next.delete(schema)
      else next.add(schema)
      return next
    })
  }

  return (
    <div className={`do-wrap${theme === 'dark' ? ' dark' : ''}`}>
      {/* Top toolbar */}
      <div className="do-toolbar">
        <Database size={16} className="do-toolbar-icon" />
        <span className="do-toolbar-title">{locale === 'ar' ? 'مركز البيانات المؤسسي' : 'Enterprise Data Hub'}</span>

        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: '3px 8px', borderRadius: 4, border: `1px solid ${accessInfo.border}`, background: accessInfo.bg }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)', fontWeight: 600, color: accessInfo.color }}>
            <Shield size={11} /> {locale === 'ar' ? accessInfo.labelAr : accessInfo.label}
          </span>
          <span style={{ fontSize: 'var(--text-caption)', color: accessInfo.color, opacity: 0.7 }}>{locale === 'ar' ? accessInfo.sublabelAr : accessInfo.sublabel}</span>
        </span>

        <button className="do-theme-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={locale === 'ar' ? 'تبديل المظهر' : 'Toggle theme'}>
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          {theme === 'dark' ? (locale === 'ar' ? 'فاتح' : 'Light') : (locale === 'ar' ? 'داكن' : 'Dark')}
        </button>

        <button className="do-btn do-btn-ghost" onClick={refreshSchemas} disabled={refreshing} title={locale === 'ar' ? 'تحديث ذاكرة المخطط' : 'Refresh schema cache'}>
          <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          {locale === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Body */}
      <div className="do-body">
        {/* Left sidebar */}
        <div className="do-sidebar">
          <div className="do-sidebar-header">
            <Database size={11} />
            {locale === 'ar' ? 'متصفّح المخطط' : 'Schema Browser'}
          </div>

          {/* Schema filter */}
          <div className="do-schema-filter">
            <Search size={11} className="do-schema-filter-icon" />
            <input
              className="do-schema-filter-input"
              placeholder={locale === 'ar' ? 'تصفية الجداول…' : 'Filter tables…'}
              value={sidebarSearch}
              onChange={e => {
                setSidebarSearch(e.target.value)
                // Auto-expand all schemas when filtering
                if (e.target.value) setOpenSchemas(new Set(schemas.map(s => s.schema)))
              }}
            />
            {sidebarSearch && (
              <button className="do-schema-filter-clear" onClick={() => setSidebarSearch('')}>
                <X size={10} />
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="do-shimmer" style={{ height: 10, width: `${50 + i * 10}%` }} />
              ))}
            </div>
          ) : schemas.length === 0 ? (
            <div style={{ padding: 16, fontSize: 'var(--text-caption)', color: 'var(--do-mute)', textAlign: 'center' }}>
              {locale === 'ar' ? 'لم يتم العثور على مخططات' : 'No schemas found'}
            </div>
          ) : (
            schemas.map(s => {
              const filteredTables = sidebarSearch
                ? s.tables.filter(t => t.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
                : s.tables
              if (sidebarSearch && filteredTables.length === 0) return null
              return (
                <div className="do-schema-group" key={s.schema}>
                  <div className="do-schema-label" onClick={() => toggleSchema(s.schema)}>
                    {openSchemas.has(s.schema)
                      ? <ChevronDown size={11} style={{ flexShrink: 0 }} />
                      : <ChevronRight size={11} style={{ flexShrink: 0 }} />
                    }
                    {s.schema}
                    <span style={{ marginInlineStart: 'auto', fontSize: 'var(--text-caption)', color: 'var(--do-mute)', fontWeight: 400 }}>
                      {filteredTables.length}{sidebarSearch ? `/${s.tables.length}` : ''}t
                    </span>
                  </div>
                  {openSchemas.has(s.schema) && filteredTables.map(t => (
                    <div
                      key={t.name}
                      className={`do-table-item ${selectedTable?.schema === t.schema && selectedTable?.name === t.name ? 'active' : ''}`}
                      onClick={() => { setSelectedTable(t); setActiveTab('table') }}
                    >
                      <Table2 size={11} style={{ flexShrink: 0 }} />
                      <span className="do-table-item-name">{t.name}</span>
                      <span className="do-table-item-count">{t.row_count > 1000 ? `${(t.row_count / 1000).toFixed(1)}k` : t.row_count}</span>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Main content */}
        <div className="do-main">
          {/* Tabs */}
          <div className="do-tabs">
            {selectedTable && (
              <div
                className={`do-tab ${activeTab === 'table' ? 'active' : ''}`}
                onClick={() => setActiveTab('table')}
              >
                <Table2 size={13} />
                {selectedTable.schema}.{selectedTable.name}
              </div>
            )}
            <div
              className={`do-tab ${activeTab === 'sql' ? 'active' : ''}`}
              onClick={() => setActiveTab('sql')}
            >
              <Code2 size={13} /> {locale === 'ar' ? 'استوديو الاستعلامات' : 'Query Studio'}
            </div>
          </div>

          {/* Panel content */}
          {activeTab === 'table' && selectedTable ? (
            <TablePanel
              key={`${selectedTable.schema}.${selectedTable.name}`}
              meta={selectedTable}
              canWrite={canWrite}
              accessRole={accessRole}
              onAuditRefresh={loadAudit}
            />
          ) : activeTab === 'sql' ? (
            <SqlPanel canWrite={canWrite} onAuditRefresh={loadAudit} />
          ) : (
            <div className="do-empty">
              <Database size={36} className="do-empty-icon" />
              <span className="do-empty-title">{locale === 'ar' ? 'اختر جدولاً للتصفّح' : 'Select a table to browse'}</span>
              <span className="do-empty-sub">{locale === 'ar' ? 'أو افتح استوديو الاستعلامات لكتابة SQL مخصّص' : 'or open Query Studio to write custom SQL'}</span>
              <button className="do-btn do-btn-ghost" style={{ marginTop: 8 }} onClick={() => setActiveTab('sql')}>
                <Code2 size={13} /> {locale === 'ar' ? 'فتح استوديو الاستعلامات' : 'Open Query Studio'}
              </button>
            </div>
          )}
        </div>

        {/* Right audit panel */}
        <div className="do-right-panel">
          <div className="do-sidebar-header">
            <Shield size={11} />
            {locale === 'ar' ? 'سجل التدقيق' : 'Audit Log'}
          </div>

          {audit.length === 0 ? (
            <div className="do-audit-empty">
              {locale === 'ar' ? 'لا يوجد نشاط بعد' : 'No activity yet'}
            </div>
          ) : (
            audit.map(entry => (
              <div key={entry.id} className="do-audit-entry">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <OpBadge op={entry.operation} />
                  <span className="do-audit-ts">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="do-audit-info">
                  {entry.schema_name}.{entry.table_name}
                  {entry.pk_value && <span className="do-audit-pk">#{entry.pk_value}</span>}
                </div>
                <div className="do-audit-meta">
                  {entry.actor_role} · {entry.row_count} {locale === 'ar' ? 'صف' : `row${entry.row_count !== 1 ? 's' : ''}`}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
