import { notFound } from 'next/navigation'
import { getLetterByToken } from '@/modules/employee-letters/queries'
import { db } from '@/lib/db'
import { legalEntities } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { SigningPageClient } from './SigningPageClient'
import { getLocale } from '@/lib/locale-server'

export const metadata = { title: 'Sign Your Letter | AVANIIS HR' }

export default async function SigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locale = await getLocale()
  const letter = await getLetterByToken(token)

  if (!letter) notFound()

  if (letter.status === 'SIGNED') {
    const signedOn = letter.signedAt ? new Date(letter.signedAt).toLocaleDateString('en-GB') : '—'
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>{locale === 'ar' ? 'تم التوقيع مسبقاً' : 'Already Signed'}</h2>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            {locale === 'ar'
              ? `تم توقيع هذا الخطاب بتاريخ ${signedOn} بواسطة ${letter.signedByName}.`
              : `This letter was signed on ${signedOn} by ${letter.signedByName}.`}
          </p>
        </div>
      </div>
    )
  }

  if (letter.signingTokenExpiresAt && new Date() > new Date(letter.signingTokenExpiresAt)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <h2 style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>{locale === 'ar' ? 'انتهت صلاحية الرابط' : 'Link Expired'}</h2>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            {locale === 'ar'
              ? 'انتهت صلاحية رابط التوقيع هذا. يرجى التواصل مع الموارد البشرية لإنشاء رابط جديد.'
              : 'This signing link has expired. Please contact HR to generate a new link.'}
          </p>
        </div>
      </div>
    )
  }

  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(eq(legalEntities.id, letter.legalEntityId))
    .limit(1)

  return (
    <SigningPageClient
      token={token}
      letter={{
        letterNumber:          letter.letterNumber,
        resolvedBodyEn:        letter.resolvedBodyEn ?? '',
        effectiveDate:         letter.effectiveDate?.toString(),
        companyNameEn:         entity?.nameEn ?? '',
        primaryLogoUrl:        entity?.primaryLogoUrl ?? undefined,
        signatoryName:         entity?.signatoryName ?? undefined,
        signatoryTitle:        entity?.signatoryTitle ?? undefined,
        signatorySignatureUrl: entity?.signatorySignatureUrl ?? undefined,
      }}
    />
  )
}
