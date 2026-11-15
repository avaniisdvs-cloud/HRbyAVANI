'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PersonSelect, type PersonOption } from '@/components/forms/PersonSelect'

interface FilterState {
  search?: string
  legalEntityId?: string
  departmentId?: string
  departmentHeadId?: string
  projectId?: string
  status?: string
  emiratisationEligibleOnly?: boolean
}

interface Props {
  filter:      FilterState
  entities:    Array<{ id: string; code: string | null; nameEn: string; nameAr: string | null }>
  departments: Array<{ id: string; code: string; nameEn: string; nameAr: string | null; legalEntityId: string }>
  projects:    Array<{ id: string; code: string; nameEn: string }>
  heads:       PersonOption[]
  headValueLabel?: string | null
  locale?:     string
}

/**
 * Client filter bar for /persons.
 *
 * Pushes selected filters to the URL search params; the Server Component
 * picks them back up on the next render. This keeps the page bookmarkable
 * and shareable without duplicating filter logic in client and server.
 *
 * S3-12 — the "Emiratisation eligible only" toggle wires through the
 * existing `listPersons` filter (which already joins jobs and gates by
 * nationality_category=UAE_NATIONAL AND jobs.is_emiratisation_target=true).
 */
export function PersonFilterBar({ filter, entities, departments, projects, heads, headValueLabel, locale = 'en' }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [search, setSearch] = useState(filter.search ?? '')

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString())
      if (search) sp.set('search', search)
      else        sp.delete('search')
      sp.delete('page')
      router.push(`/persons?${sp.toString()}`)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const sp = new URLSearchParams(params.toString())
      if (value && value !== '__any__') sp.set(key, value)
      else                              sp.delete(key)
      sp.delete('page')
      router.push(`/persons?${sp.toString()}`)
    },
    [params, router],
  )

  const toggleEmiratisation = useCallback(
    (next: boolean) => {
      const sp = new URLSearchParams(params.toString())
      if (next) sp.set('emiratisationEligibleOnly', '1')
      else      sp.delete('emiratisationEligibleOnly')
      sp.delete('page')
      router.push(`/persons?${sp.toString()}`)
    },
    [params, router],
  )

  return (
    <div className="mb-4 grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="lg:col-span-2 space-y-1.5" style={{ gridColumn: 'span 2' }}>
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'بحث' : 'Search'}</Label>
        <Input
          placeholder={locale === 'ar' ? 'بحث...' : 'Person #, name (EN), name (AR)…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الكيان القانوني' : 'Legal entity'}</Label>
        <Select value={filter.legalEntityId ?? '__any__'} onValueChange={v => setParam('legalEntityId', v)}>
          <SelectTrigger aria-label={locale === 'ar' ? 'تصفية حسب الكيان القانوني' : 'Filter by legal entity'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{locale === 'ar' ? 'كل الكيانات' : 'All entities'}</SelectItem>
            {entities.map(e => (
              <SelectItem key={e.id} value={e.id}>
                {e.code} — {e.nameEn}{e.nameAr ? ` · ${e.nameAr}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'القسم' : 'Department'}</Label>
        <Select value={filter.departmentId ?? '__any__'} onValueChange={v => setParam('departmentId', v)}>
          <SelectTrigger aria-label={locale === 'ar' ? 'تصفية حسب القسم' : 'Filter by department'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{locale === 'ar' ? 'كل الأقسام' : 'All departments'}</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.code} — {d.nameEn}{d.nameAr ? ` · ${d.nameAr}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'رئيس القسم' : 'Department Head'}</Label>
          {filter.departmentHeadId && (
            <button
              type="button"
              onClick={() => setParam('departmentHeadId', undefined)}
              className="text-xs text-accent hover:underline"
            >
              {locale === 'ar' ? 'مسح' : 'Clear'}
            </button>
          )}
        </div>
        <PersonSelect
          value={filter.departmentHeadId ?? null}
          valueLabel={headValueLabel ?? null}
          options={heads}
          onChange={id => setParam('departmentHeadId', id || undefined)}
          placeholder={locale === 'ar' ? 'كل رؤساء الأقسام' : 'All department heads'}
          id="filter-department-head"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المشروع' : 'Project'}</Label>
        <Select value={filter.projectId ?? '__any__'} onValueChange={v => setParam('projectId', v)}>
          <SelectTrigger aria-label={locale === 'ar' ? 'تصفية حسب المشروع' : 'Filter by project'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{locale === 'ar' ? 'كل المشاريع' : 'All projects'}</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الحالة' : 'Status'}</Label>
        <Select value={filter.status ?? '__any__'} onValueChange={v => setParam('status', v)}>
          <SelectTrigger aria-label={locale === 'ar' ? 'تصفية حسب الحالة' : 'Filter by status'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{locale === 'ar' ? 'أي حالة' : 'Any status'}</SelectItem>
            <SelectItem value="ACTIVE">{locale === 'ar' ? 'نشط' : 'Active'}</SelectItem>
            <SelectItem value="ON_LEAVE">{locale === 'ar' ? 'في إجازة' : 'On leave'}</SelectItem>
            <SelectItem value="SUSPENDED">{locale === 'ar' ? 'موقوف' : 'Suspended'}</SelectItem>
            <SelectItem value="TERMINATED">{locale === 'ar' ? 'منتهي' : 'Terminated'}</SelectItem>
            <SelectItem value="RETIRED">{locale === 'ar' ? 'متقاعد' : 'Retired'}</SelectItem>
            <SelectItem value="PENDING_HIRE">{locale === 'ar' ? 'قيد التعيين' : 'Pending hire'}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="lg:col-span-6 flex items-center gap-2 pt-1 text-sm text-ink-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-accent"
          checked={!!filter.emiratisationEligibleOnly}
          onChange={e => toggleEmiratisation(e.target.checked)}
        />
        {locale === 'ar'
          ? 'المؤهلون للتوطين فقط — مواطنو الإمارات في وظائف مستهدفة بنافس (BR-NAF-002)'
          : 'Emiratisation-eligible only — UAE Nationals on Nafis-target jobs (BR-NAF-002)'}
      </label>
    </div>
  )
}
