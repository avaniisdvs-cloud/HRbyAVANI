'use client'

import { useState, useTransition } from 'react'
import { saveFeaturePermissions } from '@/modules/access/actions'
import { Check, Lock, Save } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { FeaturePermission, PermAction, PermSet } from '@/drizzle/schema'

const ACTIONS: { key: PermAction; label: string; labelAr: string }[] = [
  { key: 'view',    label: 'View',    labelAr: 'عرض'    },
  { key: 'create',  label: 'Create',  labelAr: 'إنشاء'  },
  { key: 'edit',    label: 'Edit',    labelAr: 'تعديل'  },
  { key: 'delete',  label: 'Delete',  labelAr: 'حذف'    },
  { key: 'approve', label: 'Approve', labelAr: 'موافقة' },
  { key: 'export',  label: 'Export',  labelAr: 'تصدير'  },
]

type RoleTab = 'employee' | 'manager' | 'hr_admin'

const ROLE_TABS: { key: RoleTab; label: string; labelAr: string }[] = [
  { key: 'employee', label: 'Employee',  labelAr: 'موظف'   },
  { key: 'manager',  label: 'Manager',   labelAr: 'مدير'   },
  { key: 'hr_admin', label: 'HR Admin',  labelAr: 'مسؤول HR' },
]

type PermKey = 'employeePerms' | 'managerPerms' | 'hrAdminPerms'
const ROLE_PERM_KEY: Record<RoleTab, PermKey> = {
  employee: 'employeePerms',
  manager:  'managerPerms',
  hr_admin: 'hrAdminPerms',
}

interface Props {
  rows: FeaturePermission[]
}

export function FeaturePermissionsClient({ rows }: Props) {
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState<RoleTab>('hr_admin')

  // Local mutable state — indexed by featureKey
  const [perms, setPerms] = useState<Record<string, { employeePerms: PermSet; managerPerms: PermSet; hrAdminPerms: PermSet }>>(() =>
    Object.fromEntries(rows.map(r => [r.featureKey, {
      employeePerms: r.employeePerms as PermSet,
      managerPerms:  r.managerPerms  as PermSet,
      hrAdminPerms:  r.hrAdminPerms  as PermSet,
    }])),
  )

  function toggle(featureKey: string, permKey: PermKey, action: PermAction) {
    setPerms(prev => ({
      ...prev,
      [featureKey]: {
        ...prev[featureKey],
        [permKey]: {
          ...prev[featureKey][permKey],
          [action]: !prev[featureKey][permKey][action],
        },
      },
    }))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const payload = Object.entries(perms)
        .filter(([key]) => {
          const row = rows.find(r => r.featureKey === key)
          return row && !row.isSystemLocked
        })
        .map(([featureKey, p]) => ({
          featureKey,
          employeePerms: p.employeePerms,
          managerPerms:  p.managerPerms,
          hrAdminPerms:  p.hrAdminPerms,
        }))

      const result = await saveFeaturePermissions(payload)
      if (result.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setError(result.error ?? (locale === 'ar' ? 'فشل الحفظ' : 'Save failed'))
      }
    })
  }

  // Group rows
  const groups: Record<string, FeaturePermission[]> = {}
  for (const row of rows) {
    if (!groups[row.featureGroup]) groups[row.featureGroup] = []
    groups[row.featureGroup].push(row)
  }

  const permKey = ROLE_PERM_KEY[activeRole]

  return (
    <div>
      {/* Role tabs */}
      <div style={{ display: 'flex', gap: 4,
      marginBottom: 20, borderBottom: '1px solid var(--border)',
      paddingBottom: 1 }}>
        {ROLE_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveRole(tab.key)}
            style={{
              padding: '8px 18px',
              fontSize: 'var(--text-body)',
              fontWeight: activeRole === tab.key ? 600 : 400,
              color: activeRole === tab.key ? 'var(--brand-active)' : 'var(--ink-3)',
              background: 'none',
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderLeftWidth: "0px",
              borderLeftStyle: "none",
              borderLeftColor: "currentColor",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: (activeRole === tab.key) ? "var(--accent)" : "transparent",
              cursor: 'pointer',
              marginBottom: -1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span>{locale === 'ar' ? tab.labelAr : tab.label}</span>
            {locale !== 'ar' && (
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-arabic)' }}>{tab.labelAr}</span>
            )}
          </button>
        ))}

        {/* Save button — pushed right */}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', fontSize: 'var(--text-body)', fontWeight: 600,
            background: saved ? '#16A34A' : 'var(--accent)',
            color: '#fff', borderRadius: 7, border: 'none',
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
            transition: 'background 0.2s',
            marginBottom: 8,
          }}
        >
          {saved
            ? <><Check size={15} strokeWidth={2.5} /> {locale === 'ar' ? 'تم الحفظ' : 'Saved'}</>
            : <><Save size={15} strokeWidth={1.75} /> {locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}</>}
        </button>
      </div>

      {error && (
        <p style={{ color: '#B33A3A', fontSize: 'var(--text-body)',
        marginBottom: 16 }}>{error}</p>
      )}

      {/* Column headers */}
      <div data-responsive-grid="true" style={{
        display: 'grid',
        gridTemplateColumns: '1fr repeat(6, 80px)',
        gap: 0,
        padding: '0 16px',
        marginBottom: 4,
      }}>
        <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-4)' }}>{locale === 'ar' ? 'الميزة' : 'Feature'}</div>
        {ACTIONS.map(a => (
          <div key={a.key} style={{ textAlign: 'center', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-4)' }}>
            {locale === 'ar' ? a.labelAr : a.label}
          </div>
        ))}
      </div>

      {/* Groups */}
      {Object.entries(groups).map(([group, features]) => (
        <div key={group} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--ink-4)', padding: '6px 16px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}>
            {group}
          </div>

          <div style={{ borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "var(--border)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "var(--border)",
          borderLeftWidth: "1px",
          borderLeftStyle: "solid",
          borderLeftColor: "var(--border)",
          borderTopWidth: "0px",
          borderTopStyle: "none",
          borderTopColor: "currentColor", borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            {features.map((row, i) => {
              const rowPerms = perms[row.featureKey]?.[permKey] ?? {}
              const locked = row.isSystemLocked

              return (
                <div
                  data-responsive-grid="true" key={row.featureKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr repeat(6, 80px)',
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderBottom: i < features.length - 1 ? '1px solid var(--border)' : 'none',
                    background: locked ? 'var(--surface)' : 'var(--card)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>
                      {row.featureLabel}
                    </span>
                    {locked && (
                      <Lock size={12} strokeWidth={1.75} style={{ color: 'var(--ink-4)', flexShrink: 0 }} aria-label={locale === 'ar' ? 'مقفل من النظام' : 'System-locked'} />
                    )}
                  </div>

                  {ACTIONS.map(action => {
                    const checked = !!(rowPerms as Record<string, boolean>)[action.key]
                    return (
                      <div key={action.key} style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`${row.featureLabel} — ${locale === 'ar' ? action.labelAr : action.label}`}
                          disabled={locked}
                          onClick={() => !locked && toggle(row.featureKey, permKey, action.key)}
                          style={{
                            width: 22, height: 22,
                            borderRadius: 5,
                            border: checked ? 'none' : '1.5px solid var(--border)',
                            background: checked ? 'var(--accent)' : 'var(--card)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: locked ? 'default' : 'pointer',
                            opacity: locked ? 0.5 : 1,
                            transition: 'background 0.1s',
                          }}
                        >
                          {checked && <Check size={13} strokeWidth={2.5} color="#fff" aria-hidden />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
