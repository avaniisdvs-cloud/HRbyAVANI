import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import { BRANDING_ENTITY_ID } from '@/lib/branding'

/** Public company artwork, also needed before sign-in. No private settings are exposed. */
export async function GET() {
  const branding = await getPagePersonalization(BRANDING_ENTITY_ID)
  const match = branding.logoUrl?.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match) return new Response(null, { status: 404 })
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > 2 * 1024 * 1024) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': match[1], 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=3600',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  } })
}
