'use client'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/components/providers/LocaleProvider'
// 'use server' actions — imported directly (NOT via the module barrel, which
// re-exports the server-only branch-safety helper).
import { getMigrationStatus, seedMasterData, backfillDepartmentHeads, getResetPreview, resetStagingData } from '@/modules/migration/seed-actions'
import { validateImportFile, confirmImport } from '@/modules/core-hr/bulk-import'
import type { MigrationStatus, SeedResult, BackfillResult, ResetPreview, ResetResult } from '@/modules/migration/types'
import type { ImportPreview, ImportResult } from '@/modules/core-hr/bulk-import'

export function MigrationConsoleClient({ initialStatus }: { initialStatus: MigrationStatus }) {
  const locale = useLocale()
  const STEPS = locale === 'ar'
    ? ['سلامة الفرع', 'إعادة تهيئة الاختبار/UAT', 'مراجعة البيانات الرئيسية', 'تهيئة البيانات الرئيسية', 'رفع المصنّف', 'التحقق', 'تأكيد التحميل', 'رؤساء الأقسام'] as const
    : ['Branch safety', 'Reset Test/UAT / إعادة تهيئة الاختبار', 'Review master data', 'Seed master data', 'Upload workbook', 'Validation', 'Confirm load', 'Department heads'] as const
  const [status, setStatus] = useState<MigrationStatus>(initialStatus)
  const [step, setStep] = useState(() => {
    try { return parseInt(localStorage.getItem('migration_step') ?? '0', 10) || 0 } catch { return 0 }
  })
  const [pending, start] = useTransition()
  const [seedConfirm, setSeedConfirm] = useState('')
  const [headsConfirm, setHeadsConfirm] = useState('')
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null)
  const [headsResult, setHeadsResult] = useState<BackfillResult | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetResult, setResetResult] = useState<ResetResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem('migration_step', String(step)) } catch {}
  }, [step])

  const safe = status.branch.safe
  const refresh = () => start(async () => { setStatus(await getMigrationStatus()) })

  const loadResetPreview = () => start(async () => {
    setErr(null)
    try { setResetPreview(await getResetPreview()) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  })
  const runReset = () => start(async () => {
    setErr(null)
    try { setResetResult(await resetStagingData(resetConfirm)); setStatus(await getMigrationStatus()) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  })

  const runSeed = () => start(async () => {
    setErr(null)
    try { setSeedResult(await seedMasterData(seedConfirm)); setStatus(await getMigrationStatus()) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  })
  const runHeads = () => start(async () => {
    setErr(null)
    try { setHeadsResult(await backfillDepartmentHeads(headsConfirm)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  })
  const onUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      setErr(null)
      try { setPreview(await validateImportFile(fd)) }
      catch (ex) { setErr(ex instanceof Error ? ex.message : String(ex)) }
    })
  }
  const runConfirm = () => start(async () => {
    if (!preview) return
    setErr(null)
    try {
      const res = await confirmImport(preview.validatedRows)
      if ('error' in res) { setErr(res.error); return }
      setImportResult(res)
      setStatus(await getMigrationStatus())
    }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4" style={{ color: 'var(--ink-1)' }}>
      <div>
        <h1 className="text-2xl" style={{ fontFamily: 'var(--font-serif)' }}>{locale === 'ar' ? 'نشاط ترحيل البيانات' : 'Data Migration Activity'}</h1>
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{locale === 'ar' ? 'Super Admin · كل عملية كتابة تتطلب تأكيدًا صريحًا.' : 'Super Admin · every write requires explicit confirmation.'}</p>
      </div>

      {/* Step rail */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className="px-3 py-1 rounded text-sm"
            style={{ background: i === step ? 'var(--accent)' : 'var(--surface)', color: i === step ? '#fff' : 'var(--ink-2)' }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {err && <Card className="p-3" style={{ borderColor: '#EF4444', color: '#B91C1C' }}>⚠ {err}</Card>}

      {/* Step 0 — branch safety */}
      {step === 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Badge style={{ background: !safe ? '#EF4444' : status.branch.isProductionHost ? '#B45309' : '#16A34A', color: '#fff' }}>
              {!safe ? 'BLOCKED / محظور' : 'UAT/TEST WRITES ENABLED / الكتابة مفعلة للاختبار'}
            </Badge>
            <span className="font-mono text-sm">{status.branch.hostMasked}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{status.branch.reason}</p>
          <ul className="text-sm list-disc ml-5" style={{ color: 'var(--ink-2)' }}>
            <li>Console enabled / تفعيل وحدة الترحيل: {String(status.branch.enabled)}</li>
            <li>Governance mode / وضع الحوكمة: {status.branch.governanceMode}</li>
            <li>DATABASE_ENV / بيئة قاعدة البيانات: {status.branch.databaseEnv || '(not set)'}</li>
            <li>Production host detected / تم رصد قاعدة الإنتاج: {String(status.branch.isProductionHost)}</li>
            <li>Production URL configured if available / رابط الإنتاج مضبوط إن وجد: {String(status.branch.prodHostConfigured)}</li>
            <li>Production comparison required / المقارنة مع الإنتاج مطلوبة: {String(status.branch.productionComparisonRequired)}</li>
            <li>Target differs from production / الهدف مختلف عن الإنتاج: {String(status.branch.targetDiffersFromProduction)}</li>
            <li>Non-production write flag / إذن الكتابة لغير الإنتاج: {String(status.branch.allowNonProdCloudWrite)}</li>
            <li>UAT reload flag / إذن إعادة تحميل UAT: {String(status.branch.allowUatReloadWrite)}</li>
          </ul>
          <Button onClick={() => setStep(1)}>{locale === 'ar' ? 'متابعة →' : 'Continue →'}</Button>
        </Card>
      )}

      {/* Step 1 — reset Test/UAT data (DESTRUCTIVE) */}
      {step === 1 && (
        <Card className="p-4 space-y-3" style={{ borderColor: '#EF4444' }}>
          <div className="flex items-center gap-2">
            <Badge style={{ background: '#EF4444', color: '#fff' }}>{locale === 'ar' ? 'مُدمِّر' : 'DESTRUCTIVE'}</Badge>
            <span className="text-sm">Clean-slate the active DEV/UAT database before loading. / إعادة تهيئة قاعدة DEV/UAT الحالية قبل التحميل.</span>
          </div>
          <ul className="text-sm list-disc ml-5" style={{ color: 'var(--ink-2)' }}>
            <li><b>Deletes</b> all people, assignments, user accounts, departments, positions, jobs, grades, locations and related transactional data on <span className="font-mono">{status.branch.hostMasked}</span> (TRUNCATE CASCADE).</li>
            <li><b>Preserves</b> legal entities (AVN-001) and all configuration.</li>
            <li><b>Login safe:</b> <span className="font-mono">super.admin@avaniis.dev</span> is a hardcoded dev account — unaffected.</li>
            <li>This target must be the active DEV/UAT database. Future Production is never touched by this console. / يجب أن يكون الهدف قاعدة DEV/UAT الحالية ولا يتم لمس الإنتاج المستقبلي من هذه الوحدة.</li>
          </ul>
          <Button variant="outline" onClick={loadResetPreview} disabled={pending}>{pending ? (locale === 'ar' ? 'جارٍ العدّ…' : 'Counting…') : (locale === 'ar' ? 'معاينة ما سيُحذف' : 'Preview what will be deleted')}</Button>
          {resetPreview && (
            <div className="text-sm border rounded p-2 max-w-md">
              <p className="mb-1">{locale === 'ar' ? 'الصفوف المراد حذفها (الجداول الجذرية؛ CASCADE يحذف التابعة أيضًا):' : 'Rows to delete (root tables; CASCADE removes dependents too):'}</p>
              <TableScrollRegion><table className="w-full"><tbody>
                {resetPreview.counts.map(c => (
                  <tr key={c.table}><td className="font-mono py-0.5">{c.table}</td><td className="text-right">{c.rows < 0 ? '—' : c.rows}</td></tr>
                ))}
                <tr className="border-t font-semibold"><td className="py-0.5">root total</td><td className="text-right">{resetPreview.totalRows}</td></tr>
              </tbody></table></TableScrollRegion>
            </div>
          )}
          <p className="text-sm">{locale === 'ar' ? <>اكتب <b>DELETE STAGING DATA</b> للتأكيد:</> : <>Type <b>DELETE STAGING DATA</b> to confirm:</>}</p>
          <Input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="DELETE STAGING DATA" className="max-w-72" />
          <Button onClick={runReset} disabled={!safe || resetConfirm !== 'DELETE STAGING DATA' || pending}
            style={{ background: '#EF4444', color: '#fff' }}>
            {pending ? 'Clearing…' : 'Reset Test/UAT data / إعادة تهيئة UAT'}
          </Button>
          {resetResult && (
            <div className="text-sm space-y-1">
              <p style={{ color: '#16A34A' }}>{resetResult.message}</p>
              <Button onClick={() => setStep(2)}>{locale === 'ar' ? 'المتابعة إلى المراجعة →' : 'Continue to review →'}</Button>
            </div>
          )}
          <div><Button variant="outline" onClick={() => setStep(2)}>{locale === 'ar' ? 'تخطّي إعادة التهيئة →' : 'Skip reset →'}</Button></div>
        </Card>
      )}

      {/* Step 2 — review master data */}
      {step === 2 && (
        <Card className="p-4 space-y-3">
          <p className="text-sm">{locale === 'ar' ? <>البيانات الرئيسية المخطّطة — <b>{status.toCreate}</b> للإنشاء، <b>{status.alreadyPresent}</b> موجودة بالفعل.</> : <>Planned master data — <b>{status.toCreate}</b> to create, <b>{status.alreadyPresent}</b> already present.</>}</p>
          <div className="max-h-96 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface)' }}><th className="text-left p-2">Kind</th><th className="text-left p-2">Code</th><th className="text-left p-2">Label</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody>
                {status.items.map((it) => (
                  <tr key={it.kind + it.code} className="border-t">
                    <td className="p-2">{it.kind}</td><td className="p-2 font-mono">{it.code}</td><td className="p-2">{it.label}</td>
                    <td className="p-2">{it.exists ? <Badge style={{ background: 'var(--surface)' }}>exists</Badge> : <Badge style={{ background: 'var(--accent-100)' }}>will create</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={() => setStep(3)} disabled={!safe}>{locale === 'ar' ? 'المتابعة إلى التهيئة →' : 'Continue to seed →'}</Button>
        </Card>
      )}

      {/* Step 3 — seed master data */}
      {step === 3 && (
        <Card className="p-4 space-y-3">
          <p className="text-sm">{locale === 'ar' ? <>إنشاء البيانات الرئيسية المفقودة على <span className="font-mono">{status.branch.hostMasked}</span>. عملية متكرّرة آمنة — تُتخطّى الصفوف الموجودة.</> : <>Creates missing master data on <span className="font-mono">{status.branch.hostMasked}</span>. Idempotent — existing rows are skipped.</>}</p>
          <p className="text-sm">{locale === 'ar' ? <>اكتب <b>SEED</b> للتأكيد:</> : <>Type <b>SEED</b> to confirm:</>}</p>
          <Input value={seedConfirm} onChange={(e) => setSeedConfirm(e.target.value)} placeholder="SEED" className="max-w-40" />
          <Button onClick={runSeed} disabled={!safe || seedConfirm !== 'SEED' || pending}>{pending ? (locale === 'ar' ? 'جارٍ العمل…' : 'Working…') : (locale === 'ar' ? 'تهيئة البيانات الرئيسية' : 'Seed master data')}</Button>
          {seedResult && (
            <div className="text-sm space-y-1">
              <p style={{ color: seedResult.ok ? '#16A34A' : '#B91C1C' }}>{seedResult.message}</p>
              <p>Created: {seedResult.created.length} · Skipped: {seedResult.skipped.length} · Failed: {seedResult.failed.length}</p>
              {seedResult.ok && <Button onClick={() => setStep(4)}>{locale === 'ar' ? 'المتابعة إلى الرفع →' : 'Continue to upload →'}</Button>}
            </div>
          )}
        </Card>
      )}

      {/* Step 4 — upload */}
      {step === 4 && (
        <Card className="p-4 space-y-3">
          <p className="text-sm">{locale === 'ar' ? <>ارفع مصنّف الموظفين التجريبي (.xlsx) — مثال <span className="font-mono">PILOT-BATCH-1-import.xlsx</span>.</> : <>Upload the pilot employee workbook (.xlsx) — e.g. <span className="font-mono">PILOT-BATCH-1-import.xlsx</span>.</>}</p>
          <form onSubmit={onUpload} className="space-y-2">
            <input type="file" name="file" accept=".xlsx,.xls" required />
            <div><Button type="submit" disabled={!safe || pending}>{pending ? (locale === 'ar' ? 'جارٍ التحقق…' : 'Validating…') : (locale === 'ar' ? 'التحقق من الملف' : 'Validate file')}</Button></div>
          </form>
          {preview && <Button onClick={() => setStep(5)}>{locale === 'ar' ? 'عرض التحقق →' : 'View validation →'}</Button>}
        </Card>
      )}

      {/* Step 5 — validation */}
      {step === 5 && (
        <Card className="p-4 space-y-3">
          {!preview ? <p className="text-sm">{locale === 'ar' ? 'لم يُتحقق من أي ملف بعد — انتقل إلى الرفع.' : 'No file validated yet — go to Upload.'}</p> : (
            <>
              <div className="flex gap-2 flex-wrap text-sm">
                <Badge>Total {preview.totalRows}</Badge>
                <Badge style={{ background: '#16A34A', color: '#fff' }}>Valid {preview.validRows}</Badge>
                <Badge style={{ background: preview.errorRows ? '#EF4444' : 'var(--surface)', color: preview.errorRows ? '#fff' : undefined }}>Errors {preview.errorRows}</Badge>
                <Badge style={{ background: '#F59E0B', color: '#fff' }}>Warnings {preview.warningRows}</Badge>
              </div>
              {preview.issues.length > 0 && (
                <div className="max-h-72 overflow-auto border rounded text-sm">
                  <table className="w-full"><thead><tr style={{ background: 'var(--surface)' }}><th className="text-left p-2">Row</th><th className="text-left p-2">Field</th><th className="text-left p-2">Severity</th><th className="text-left p-2">Message</th></tr></thead>
                    <tbody>{preview.issues.map((is, i) => (
                      <tr key={i} className="border-t"><td className="p-2">{is.rowNumber}</td><td className="p-2">{is.field}</td>
                        <td className="p-2" style={{ color: is.severity === 'ERROR' ? '#B91C1C' : '#B45309' }}>{is.severity}</td><td className="p-2">{is.message}</td></tr>
                    ))}</tbody></table>
                </div>
              )}
              {preview.errorRows === 0
                ? <Button onClick={() => setStep(6)}>{locale === 'ar' ? 'المتابعة إلى التأكيد →' : 'Proceed to confirm →'}</Button>
                : <p className="text-sm" style={{ color: '#B91C1C' }}>{locale === 'ar' ? `صحّح ${preview.errorRows} صفًا به أخطاء وأعد الرفع قبل التأكيد.` : `Fix ${preview.errorRows} error row(s) and re-upload before confirming.`}</p>}
            </>
          )}
        </Card>
      )}

      {/* Step 6 — confirm load */}
      {step === 6 && (
        <Card className="p-4 space-y-3">
          <p className="text-sm">{locale === 'ar' ? <>تأكيد استيراد <b>{preview?.validRows ?? 0}</b> موظفًا إلى <span className="font-mono">{status.branch.hostMasked}</span>.</> : <>Confirm import of <b>{preview?.validRows ?? 0}</b> employees into <span className="font-mono">{status.branch.hostMasked}</span>.</>}</p>
          <Button onClick={runConfirm} disabled={!safe || !preview || preview.errorRows > 0 || pending || !!importResult}>
            {pending ? (locale === 'ar' ? 'جارٍ الاستيراد…' : 'Importing…') : (locale === 'ar' ? 'تأكيد واستيراد' : 'Confirm & import')}
          </Button>
          {importResult && (
            <div className="text-sm space-y-2">
              <p style={{ color: '#16A34A' }}>{locale === 'ar' ? `تم استيراد ${importResult.imported} موظفًا · تم إنشاء ${importResult.usersCreated} مستخدمًا.` : `Imported ${importResult.imported} employees · ${importResult.usersCreated} users created.`}</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => { setImportResult(null); setPreview(null); setStep(4) }}>
                  {locale === 'ar' ? 'استيراد دفعة أخرى →' : 'Import another batch →'}
                </Button>
                <Button onClick={() => setStep(7)}>{locale === 'ar' ? 'المتابعة إلى رؤساء الأقسام →' : 'Continue to department heads →'}</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 7 — backfill dept heads */}
      {step === 7 && (
        <Card className="p-4 space-y-3">
          <p className="text-sm">{locale === 'ar' ? <>عيّن رؤساء الأقسام الستة الآن بعد وجود الموظفين. اكتب <b>HEADS</b> للتأكيد:</> : <>Set the 6 department heads now that employees exist. Type <b>HEADS</b> to confirm:</>}</p>
          <Input value={headsConfirm} onChange={(e) => setHeadsConfirm(e.target.value)} placeholder="HEADS" className="max-w-40" />
          <Button onClick={runHeads} disabled={!safe || headsConfirm !== 'HEADS' || pending}>{pending ? (locale === 'ar' ? 'جارٍ العمل…' : 'Working…') : (locale === 'ar' ? 'تعبئة رؤساء الأقسام' : 'Backfill department heads')}</Button>
          {headsResult && (
            <div className="text-sm">
              <p style={{ color: '#16A34A' }}>{headsResult.message}</p>
              {headsResult.skipped.length > 0 && <ul className="list-disc ml-5" style={{ color: 'var(--ink-2)' }}>{headsResult.skipped.map((s, i) => <li key={i}>{s.departmentCode}: {s.reason}</li>)}</ul>}
            </div>
          )}
          <Button variant="outline" onClick={refresh}>{locale === 'ar' ? 'تحديث الحالة' : 'Refresh status'}</Button>
        </Card>
      )}
    </div>
  )
}
