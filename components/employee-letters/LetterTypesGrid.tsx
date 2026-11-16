'use client'

import Link from 'next/link'
import {
  FileText, Award, Briefcase, ShieldCheck, Star, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

interface LetterTypeCard {
  typeCode:            string
  nameEn:              string
  nameAr:              string
  requiresApproval:    boolean
  allowEssSelfRequest: boolean
}

const ICONS: Record<string, LucideIcon> = {
  PCL: Award,
  SC:  FileText,
  STL: Briefcase,
  NOC: ShieldCheck,
  EXP: Star,
  WL:  AlertTriangle,
}

const COLORS: Record<string, string> = {
  PCL: '#16A34A',
  SC:  '#2563EB',
  STL: '#7C3AED',
  NOC: '#0D7D8C',
  EXP: '#D97706',
  WL:  '#DC2626',
}

export function LetterTypesGrid({ types }: { types: LetterTypeCard[] }) {
  return (
    <div data-responsive-grid="true" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 16,
    }}>
      {types.map(t => {
        const Icon  = ICONS[t.typeCode] ?? FileText
        const color = COLORS[t.typeCode] ?? 'var(--accent)'
        return (
          <Link
            key={t.typeCode}
            href={`/employee-letters/${t.typeCode}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '20px 18px',
              cursor: 'pointer',
              transition: 'box-shadow 0.15s, border-color 0.15s',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
                ;(e.currentTarget as HTMLDivElement).style.borderColor = color
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: `color-mix(in srgb, ${color} 10%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-body)', color: 'var(--ink-1)', marginBottom: 2 }}>
                  {t.nameEn}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', textAlign: 'right' }}>
                  {t.nameAr}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                {t.requiresApproval && (
                  <span style={{
                    fontSize: 'var(--text-caption)', padding: '2px 7px', borderRadius: 4,
                    background: 'color-mix(in srgb, #D97706 12%, transparent)',
                    color: '#D97706', fontWeight: 500,
                  }}>
                    Approval
                  </span>
                )}
                {t.allowEssSelfRequest && (
                  <span style={{
                    fontSize: 'var(--text-caption)', padding: '2px 7px', borderRadius: 4,
                    background: 'color-mix(in srgb, #2563EB 12%, transparent)',
                    color: '#2563EB', fontWeight: 500,
                  }}>
                    ESS
                  </span>
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
