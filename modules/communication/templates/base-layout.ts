/**
 * Branded, email-client-safe HTML layout. Email clients ignore external CSS and
 * CSS custom properties, so brand colours are inlined as literals that MIRROR the
 * AVANIIS design tokens (--accent #2E6170 etc.). This is the ONE sanctioned place
 * where literal hex appears — every other surface uses var(--token).
 */

const BRAND = {
  accent: '#2E6170', // var(--accent)
  ink: '#1F2A2E', // var(--ink-1)
  inkSoft: '#5B6B70', // var(--ink-2)
  border: '#E3E8EA', // var(--border)
  surface: '#F6F8F9', // var(--surface)
}

export interface LayoutArgs {
  title: string
  bodyHtml: string
  companyName?: string
  legalEntityName?: string
  hrContact?: string
  complianceFooter?: string
  dir?: 'ltr' | 'rtl'
}

export function wrapBrandedEmail(args: LayoutArgs): string {
  const {
    title, bodyHtml,
    companyName = 'AVANIIS HR',
    legalEntityName,
    hrContact,
    complianceFooter,
    dir = 'ltr',
  } = args

  return `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'ar' : 'en'}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND.accent};padding:20px 28px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:.2px;">${escapeHtml(companyName)}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:${BRAND.ink};">${escapeHtml(title)}</h1>
          <div style="font-size:14px;line-height:1.6;color:${BRAND.ink};">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.inkSoft};">
          ${legalEntityName ? `<div>${escapeHtml(legalEntityName)}</div>` : ''}
          ${hrContact ? `<div>HR Contact: ${escapeHtml(hrContact)}</div>` : ''}
          ${complianceFooter ? `<div style="margin-top:8px;color:${BRAND.inkSoft};">${escapeHtml(complianceFooter)}</div>` : ''}
          <div style="margin-top:8px;">This is an automated message from ${escapeHtml(companyName)}. Please do not reply.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Renders a primary call-to-action button safe across email clients. */
export function ctaButton(label: string, href: string, kind: 'approve' | 'reject' | 'neutral' = 'neutral'): string {
  const bg = kind === 'approve' ? '#2E6170' : kind === 'reject' ? '#9B2C2C' : '#5B6B70'
  return `<a href="${escapeAttr(href)}" style="display:inline-block;background:${bg};color:#FFFFFF;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;margin:6px 8px 6px 0;">${escapeHtml(label)}</a>`
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function escapeAttr(s: string): string {
  return escapeHtml(s)
}
