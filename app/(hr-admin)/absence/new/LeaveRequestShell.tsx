'use client'

import { useState } from 'react'
import { LeaveRequestNewForm } from './LeaveRequestNewForm'
import { LeaveInsightsPanel, type InsightBalance, type InsightRequest } from './LeaveInsightsPanel'
import { type Locale } from '@/lib/i18n'

interface PersonRow {
  id: string
  personNumber: string
  fullNameEn: string | null
  fullNameAr: string
  legalEntityId: string
}

interface TypeRow {
  id: string
  typeCode: string
  typeNameEn: string
  typeNameAr: string | null
  legalEntityId: string | null
  requiresMedicalCert: boolean
}

interface Props {
  persons: PersonRow[]
  absenceTypes: TypeRow[]
  currentRole: string
  currentLegalEntityId: string
  currentPersonId: string | null
  currentUserId: string
  lockToSelf?: boolean
  certThresholdDays: number
  balances: InsightBalance[]
  recentRequests: InsightRequest[]
  personName: string | null
  personNumber: string | null
  balanceYear: number
  locale?: Locale
}

export function LeaveRequestShell({
  persons,
  absenceTypes,
  currentRole,
  currentLegalEntityId,
  currentPersonId,
  currentUserId,
  lockToSelf,
  certThresholdDays,
  balances,
  recentRequests,
  personName,
  personNumber,
  balanceYear,
  locale = 'en',
}: Props) {
  const [selectedTypeCode, setSelectedTypeCode] = useState(
    absenceTypes[0]?.typeCode ?? '',
  )

  return (
    <div data-responsive-grid="true" style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 24,
      alignItems: 'start',
    }}>
      {/* ── LEFT: Form ── */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            Request details
          </h3>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '2px 0 0' }}>
            Complete the fields below and save or submit.
          </p>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <LeaveRequestNewForm
            persons={persons}
            absenceTypes={absenceTypes}
            currentRole={currentRole}
            currentLegalEntityId={currentLegalEntityId}
            currentPersonId={currentPersonId}
            currentUserId={currentUserId}
            lockToSelf={lockToSelf}
            certThresholdDays={certThresholdDays}
            onTypeChange={setSelectedTypeCode}
            locale={locale}
          />
        </div>
      </div>

      {/* ── RIGHT: Insights ── */}
      <div style={{ position: 'sticky', top: 80 }}>
        <LeaveInsightsPanel
          balances={balances}
          recentRequests={recentRequests}
          personName={personName}
          personNumber={personNumber}
          selectedTypeCode={selectedTypeCode}
          balanceYear={balanceYear}
        />
      </div>
    </div>
  )
}
