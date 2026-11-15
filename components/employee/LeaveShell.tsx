'use client'

import { useState } from 'react'
import { LeaveBalanceBand } from './LeaveBalanceBand'
import { LeaveHistoryPanel } from './LeaveHistoryPanel'

interface LeaveBalance {
  code:      string
  label:     string
  remaining: number
  total:     number
  used:      number
}

export function LeaveShell({
  balances,
  locale = 'en',
  isOnProbation = false,
  probationEndDate,
}: {
  balances: LeaveBalance[]
  locale?: string
  isOnProbation?: boolean
  probationEndDate?: string | null
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null)

  const handleCardClick = (typeCode: string) => {
    setSelectedType(prev => prev === typeCode ? null : typeCode)
  }

  return (
    <>
      <LeaveBalanceBand
        balances={balances}
        locale={locale}
        isOnProbation={isOnProbation}
        probationEndDate={probationEndDate}
        onTypeClick={handleCardClick}
        selectedTypeCode={selectedType}
      />
      {selectedType && (
        <LeaveHistoryPanel
          key={selectedType}
          initialTypeCode={selectedType}
          locale={locale}
        />
      )}
    </>
  )
}
