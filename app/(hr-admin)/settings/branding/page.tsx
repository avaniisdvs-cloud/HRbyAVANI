import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import PagePersonalizationCard from '@/components/settings/PagePersonalizationCard'
import type { CarouselImage } from '@/modules/config/actions/page-personalization'

export const metadata = { title: 'Branding · AVANIIS HR' }

const DEFAULT_ENTITY_ID = '11111111-1111-1111-1111-111111111111'

export default async function BrandingPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // SUPER_ADMIN only — global/org-wide visual identity.
  if (session.user.role !== 'SUPER_ADMIN') redirect('/settings')

  const personalization = await getPagePersonalization(DEFAULT_ENTITY_ID)

  return (
    <div className="page-in">
      <PagePersonalizationCard
        entityId={DEFAULT_ENTITY_ID}
        initial={{
          entityId:          personalization.entityId,
          topBannerText:     personalization.topBannerText,
          topBannerVisible:  personalization.topBannerVisible,
          tickerText:        personalization.tickerText,
          tickerVisible:     personalization.tickerVisible,
          tickerSpeed:       personalization.tickerSpeed,
          carouselImages:    (personalization.carouselImages ?? []) as CarouselImage[],
          logoUrl:           personalization.logoUrl ?? null,
          carouselHeightPct: personalization.carouselHeightPct,
        }}
      />
    </div>
  )
}
