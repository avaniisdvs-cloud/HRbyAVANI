import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AccommodationForm } from './AccommodationForm'

export const metadata = { title: 'My HR · Request Accommodation' }

/**
 * GAP-C07 — UAE FDL 33/2021 Article 30: Employee self-service accommodation
 * request page (disability / parental / nursing-break adjustments).
 *
 * Triggers the ACCOMMODATION_REQUEST workflow → Line Manager → HR Director.
 */
export default async function AccommodationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  return (
    <div className="page-in" style={{
      width: '100%', padding: 'calc(24px * var(--density))', boxSizing: 'border-box',
    }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
        }}>
          Request Accommodation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '4px 0 0' }}>
          UAE Labour Law (FDL 33/2021, Art. 30) — disability, parental, or nursing-break adjustments require HR Director approval after Line Manager review.
        </p>
      </div>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            New accommodation request
          </span>
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: '2px 6px', fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase', letterSpacing: '0.3px',
          }}>
            Art. 30 FDL 33/2021
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <AccommodationForm />
        </div>
      </div>
    </div>
  )
}
