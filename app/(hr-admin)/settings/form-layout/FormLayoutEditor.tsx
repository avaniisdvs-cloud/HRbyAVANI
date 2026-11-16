'use client'

import { useMemo, useState, useTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
// Direct import of the Server Action: the barrel re-exports server-only
// guards (which pull in lib/db → postgres) that can't end up in the client
// bundle. Next.js 14 RPCs the action via the 'use server' directive on
// actions.ts. Hard Rule 6 is preserved — this is still a public API entry.
import { updateFormConfiguration } from '@/modules/config/actions'
import type { FormSection } from '@/lib/config-resolver'

interface Props {
  entityType:      string
  role:            string
  initialSections: FormSection[]
}

interface SectionDraft {
  sectionCode: string
  labelEn:     string
  labelAr:     string
  fields:      string[]
  // Tracks whether this row was added in the current edit session (so we can
  // delete it locally without a "tombstone" fight against the server).
  isNew?:      boolean
}

const SECTION_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/

function snapshot(sections: SectionDraft[]): string {
  return JSON.stringify(sections.map(s => ({
    sectionCode: s.sectionCode, labelEn: s.labelEn, labelAr: s.labelAr, fields: s.fields,
  })))
}

export function FormLayoutEditor({ entityType, role, initialSections }: Props) {
  const baseline = useMemo<SectionDraft[]>(
    () => initialSections.map(s => ({
      sectionCode: s.sectionCode,
      labelEn:     s.labelEn,
      labelAr:     s.labelAr,
      fields:      s.fields ?? [],
    })),
    [initialSections],
  )
  const [sections, setSections] = useState<SectionDraft[]>(baseline)
  const [pending, start]        = useTransition()
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)

  const { toast } = useToast()
  const router    = useRouter()
  const locale    = useLocale()

  const dirty = snapshot(sections) !== snapshot(baseline)

  function patch(idx: number, key: keyof SectionDraft, value: string | string[]) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s))
  }

  function moveSection(from: number, to: number) {
    if (from === to || to < 0 || to >= sections.length) return
    setSections(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function addSection() {
    setSections(prev => [
      ...prev,
      { sectionCode: 'NEW_SECTION', labelEn: 'New section', labelAr: 'قسم جديد', fields: [], isNew: true },
    ])
  }

  function removeSection(idx: number) {
    setSections(prev => prev.filter((_, i) => i !== idx))
  }

  function resetToBaseline() {
    setSections(baseline)
    setErrors({})
  }

  // ── HTML5 drag-and-drop (no extra runtime dep) ────────────────────────
  function onDragStart(e: DragEvent<HTMLLIElement>, idx: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
    setDraggingIdx(idx)
  }
  function onDragOver(e: DragEvent<HTMLLIElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  function onDrop(e: DragEvent<HTMLLIElement>, idx: number) {
    e.preventDefault()
    const from = Number(e.dataTransfer.getData('text/plain'))
    if (Number.isFinite(from) && from !== idx) moveSection(from, idx)
    setDraggingIdx(null)
  }
  function onDragEnd() { setDraggingIdx(null) }

  // ── Save ─────────────────────────────────────────────────────────────
  function onSave() {
    setErrors({})

    // Validate locally first so we can surface field-level errors.
    const localErrors: Record<string, string> = {}
    const seen = new Set<string>()
    sections.forEach((s, i) => {
      if (!SECTION_CODE_REGEX.test(s.sectionCode)) {
        localErrors[`code:${i}`] = locale === 'ar' ? 'أحرف كبيرة وأرقام وشرطات سفلية فقط (UPPER_SNAKE_CASE).' : 'UPPER_SNAKE_CASE letters/digits/underscores only.'
      }
      if (seen.has(s.sectionCode)) {
        localErrors[`code:${i}`] = locale === 'ar' ? `رمز قسم مكرر: ${s.sectionCode}` : `Duplicate sectionCode: ${s.sectionCode}`
      }
      seen.add(s.sectionCode)
      if (!s.labelEn.trim()) localErrors[`en:${i}`] = locale === 'ar' ? 'مطلوب' : 'Required'
      if (!s.labelAr.trim()) localErrors[`ar:${i}`] = locale === 'ar' ? 'مطلوب' : 'Required'
    })
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      toast({ title: locale === 'ar' ? 'صحّح أخطاء التحقق قبل الحفظ.' : 'Fix validation errors before saving.', variant: 'destructive' })
      return
    }

    start(async () => {
      try {
        const result = await updateFormConfiguration({
          entityType,
          role,
          sections: sections.map(s => ({
            sectionCode: s.sectionCode,
            labelEn:     s.labelEn.trim(),
            labelAr:     s.labelAr.trim(),
            fields:      s.fields,
          })),
        })
        toast({
          title: result.created
            ? (locale === 'ar' ? 'تم إنشاء التخطيط' : 'Layout created')
            : (locale === 'ar' ? 'تم تحديث التخطيط' : 'Layout updated'),
          description: locale === 'ar'
            ? `${entityType} · ${role} — ${sections.length} أقسام. تم إبطال ذاكرة التخزين المؤقت.`
            : `${entityType} · ${role} — ${sections.length} sections. Cache invalidated.`,
        })
        router.refresh()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
        toast({ title: locale === 'ar' ? 'تعذّر حفظ التخطيط' : 'Could not save layout', description: message, variant: 'destructive' })
        if (message.startsWith('[')) {
          try {
            const issues = JSON.parse(message) as Array<{ path: string[]; message: string }>
            const next: Record<string, string> = {}
            for (const i of issues) next[i.path.join('.')] = i.message
            setErrors(next)
          } catch { /* ignore */ }
        }
      }
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'الأقسام' : 'Sections'}
          <Badge className="ms-2 align-middle" variant="secondary">{entityType}</Badge>
          <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'الدور: ' : 'role: '}{role}</Badge>
          {dirty && <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'تغييرات غير محفوظة' : 'unsaved changes'}</Badge>}
        </h3>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <p className="mb-4 text-xs text-ink-3">
          {locale === 'ar'
            ? 'اسحب المقبض على يسار كل صف لإعادة الترتيب. يجب أن تكون رموز الأقسام بصيغة UPPER_SNAKE وفريدة ضمن التخطيط. التسميات ثنائية اللغة مطلوبة (FR-CH-15).'
            : 'Drag the handle on the left of each row to reorder. Section codes must be UPPER_SNAKE and unique within a layout. Bilingual labels are required (FR-CH-15).'}
        </p>

        <ul className="space-y-3">
          {sections.map((s, idx) => (
            <li
              key={`${s.sectionCode}-${idx}`}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragOver={onDragOver}
              onDrop={e => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={`rounded-md border bg-surface p-3 ${
                draggingIdx === idx ? 'border-accent opacity-60' : 'border-border'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  role="img"
                  aria-label={locale === 'ar'
                    ? `مقبض سحب القسم ${s.labelEn}. استخدم زرّي التحريك للأعلى وللأسفل أدناه لإعادة الترتيب باللوحة.`
                    : `Drag handle for section ${s.labelEn}. Use the move-up and move-down buttons below for keyboard reordering.`}
                  title={locale === 'ar' ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
                  className="cursor-grab pt-1.5 text-ink-3 select-none"
                >
                  ⋮⋮
                </div>
                <div className="flex-1 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'رمز القسم' : 'Section code'}</Label>
                      <Input
                        value={s.sectionCode}
                        onChange={e => patch(idx, 'sectionCode', e.target.value.toUpperCase())}
                        className="font-mono uppercase"
                        disabled={pending}
                      />
                      {errors[`code:${idx}`] && <p className="text-xs text-destructive">{errors[`code:${idx}`]}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'التسمية (إنجليزي)' : 'Label (EN)'}</Label>
                      <Input
                        value={s.labelEn}
                        onChange={e => patch(idx, 'labelEn', e.target.value)}
                        disabled={pending}
                      />
                      {errors[`en:${idx}`] && <p className="text-xs text-destructive">{errors[`en:${idx}`]}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'التسمية (عربي)' : 'Label (AR)'}</Label>
                      <Input
                        value={s.labelAr}
                        onChange={e => patch(idx, 'labelAr', e.target.value)}
                        dir="rtl" lang="ar" className="text-end"
                        disabled={pending}
                      />
                      {errors[`ar:${idx}`] && <p className="text-xs text-destructive">{errors[`ar:${idx}`]}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-3">
                    <span>{locale === 'ar' ? `${s.fields.length} حقل معرّف` : `${s.fields.length} field${s.fields.length === 1 ? '' : 's'} declared`}</span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => moveSection(idx, idx - 1)}
                        disabled={pending || idx === 0}
                        aria-label={locale === 'ar' ? `تحريك القسم ${s.labelEn} للأعلى` : `Move section ${s.labelEn} up`}
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => moveSection(idx, idx + 1)}
                        disabled={pending || idx === sections.length - 1}
                        aria-label={locale === 'ar' ? `تحريك القسم ${s.labelEn} للأسفل` : `Move section ${s.labelEn} down`}
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => removeSection(idx)}
                        disabled={pending}
                        aria-label={locale === 'ar' ? `إزالة القسم ${s.labelEn}` : `Remove section ${s.labelEn}`}
                      >
                        {locale === 'ar' ? 'إزالة' : 'Remove'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" onClick={addSection} disabled={pending || sections.length >= 20}>
            {locale === 'ar' ? '+ إضافة قسم' : '+ Add section'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToBaseline} disabled={pending || !dirty}>{locale === 'ar' ? 'تجاهل التغييرات' : 'Discard changes'}</Button>
            <Button onClick={onSave} disabled={pending || !dirty}>
              {pending ? tk(locale, 'common.saving') : (locale === 'ar' ? 'حفظ التخطيط' : 'Save layout')}
            </Button>
          </div>
        </div>

        <p className="mt-4 rounded-md bg-surface p-3 text-xs text-ink-3">
          {locale === 'ar' ? (
            <>عند الحفظ: يُدرَج/يُحدَّث الصف عبر <code className="font-mono">updateFormConfiguration</code>،
            ويُكتب صف تدقيق في المعاملة نفسها، ويُستدعى{' '}
            <code className="font-mono">invalidateConfigCache()</code> بحيث تصل استدعاءات
            <code className="font-mono"> resolveFormConfig</code> اللاحقة إلى قاعدة البيانات وتلتقط التخطيط الجديد.</>
          ) : (
            <>On save: row upserted via <code className="font-mono">updateFormConfiguration</code>,
            audit row written in same transaction, and{' '}
            <code className="font-mono">invalidateConfigCache()</code> is called so subsequent
            <code className="font-mono"> resolveFormConfig</code> calls hit the DB and pick up the new layout.</>
          )}
        </p>
      </div>
    </div>
  )
}
