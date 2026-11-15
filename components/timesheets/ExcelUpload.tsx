'use client'

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { processExcelUpload, type ExcelAttendanceRow, type ExcelUploadResult } from '@/modules/timesheets/actions'

export function ExcelUpload() {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [dragging,  setDragging]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<ExcelUploadResult | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  async function processFile(file: File) {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const XLSX = await import('xlsx')
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]!]!
      const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const rows: ExcelAttendanceRow[] = raw.map(r => ({
        employeeNumber: String(r['Employee Number'] ?? r['employee_number'] ?? r['EmployeeNumber'] ?? ''),
        attendanceDate: String(r['Date'] ?? r['attendance_date'] ?? r['AttendanceDate'] ?? ''),
        timeIn:         r['Time In'] || r['time_in']  ? String(r['Time In'] ?? r['time_in'])  : undefined,
        timeOut:        r['Time Out'] || r['time_out'] ? String(r['Time Out'] ?? r['time_out']) : undefined,
        notes:          r['Notes'] || r['notes']       ? String(r['Notes'] ?? r['notes'])       : undefined,
      }))

      const outcome = await processExcelUpload(rows)
      setResult(outcome)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border:         `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius:   '0.5rem',
          padding:        '2rem',
          textAlign:      'center',
          cursor:         'pointer',
          background:     dragging ? 'var(--accent-foreground)' : 'var(--muted)',
          transition:     'all 0.15s',
          color:          'var(--muted-foreground)',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📂</div>
        <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
          {loading ? 'Processing…' : 'Drop Excel / CSV file here'}
        </div>
        <div style={{ fontSize: '0.8rem' }}>
          Columns: Employee Number, Date (YYYY-MM-DD), Time In, Time Out, Notes
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={onChange}
        />
      </div>

      {error && (
        <div
          style={{
            padding:      '0.75rem 1rem',
            borderRadius: '0.375rem',
            background:   'var(--status-rejected-bg)',
            color:        'var(--status-rejected-fg)',
            fontSize:     '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding:      '0.75rem 1rem',
            borderRadius: '0.375rem',
            background:   result.rejected > 0 ? 'var(--status-draft-bg)' : 'var(--status-approved-bg)',
            color:        result.rejected > 0 ? 'var(--status-draft-fg)' : 'var(--status-approved-fg)',
            fontSize:     '0.875rem',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            Upload complete — {result.processed} processed, {result.rejected} rejected
          </div>
          {result.errors.map(e => (
            <div key={e.row} style={{ fontSize: '0.8rem' }}>
              Row {e.row}: {e.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
