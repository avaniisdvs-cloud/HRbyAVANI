import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import { getAriaLoginConfig } from '@/lib/aria/login-config'
import LoginClient from './_LoginClient'
import { areDevAccountsAllowed } from '@/lib/environment-guardrails'

export const metadata = { title: 'Sign in · AVANIIS HR' }

const DEFAULT_ENTITY_ID = '11111111-1111-1111-1111-111111111111'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const sp = searchParams ? await searchParams : {} as { error?: string; callbackUrl?: string }
  const [p, ariaConfig] = await Promise.all([
    getPagePersonalization(DEFAULT_ENTITY_ID),
    getAriaLoginConfig(),
  ])

  return (
    <LoginClient
      previewAccountsEnabled={areDevAccountsAllowed()}
      personalization={{
        topBannerText:     p.topBannerText,
        topBannerVisible:  p.topBannerVisible,
        tickerText:        p.tickerText,
        tickerVisible:     p.tickerVisible,
        tickerSpeed:       p.tickerSpeed,
        carouselImages:    (p.carouselImages ?? []) as import('@/modules/config/actions/page-personalization').CarouselImage[],
        logoUrl:           p.logoUrl ?? null,
        carouselHeightPct: p.carouselHeightPct,
      }}
      ariaConfig={ariaConfig}
      initialError={sp.error}
    />
  )
}
