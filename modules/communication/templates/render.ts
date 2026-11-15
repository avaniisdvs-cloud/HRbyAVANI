/**
 * Placeholder substitution for email templates.
 *
 * Templates use {{placeholder}} tokens (Section 6). Substitution is HTML-escaped
 * by default to prevent injection; the rendered body is then wrapped in the
 * branded layout. Unknown placeholders render as empty strings (never leak the
 * raw token to recipients).
 */
import { wrapBrandedEmail, escapeHtml } from './base-layout'

export type TemplateVars = Record<string, string | number | null | undefined>

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Substitute {{tokens}}. `raw` keys (e.g. approveLink HTML) bypass escaping. */
export function substitute(template: string, vars: TemplateVars, rawKeys: string[] = []): string {
  return template.replace(TOKEN_RE, (_m, key: string) => {
    const v = vars[key]
    if (v == null) return ''
    return rawKeys.includes(key) ? String(v) : escapeHtml(String(v))
  })
}

export interface RenderedEmail {
  subject: string
  html: string
  text?: string
}

export interface RenderArgs {
  subjectTemplate: string
  bodyHtmlTemplate: string
  bodyTextTemplate?: string | null
  vars: TemplateVars
  /** Keys whose value is pre-built trusted HTML (e.g. action buttons). */
  rawKeys?: string[]
  dir?: 'ltr' | 'rtl'
  companyName?: string
  legalEntityName?: string
  hrContact?: string
  complianceFooter?: string
}

export function renderTemplate(args: RenderArgs): RenderedEmail {
  const subject = substitute(args.subjectTemplate, args.vars).replace(/\s+/g, ' ').trim()
  const innerHtml = substitute(args.bodyHtmlTemplate, args.vars, args.rawKeys)
  const html = wrapBrandedEmail({
    title: subject,
    bodyHtml: innerHtml,
    companyName: args.companyName,
    legalEntityName: args.legalEntityName,
    hrContact: args.hrContact,
    complianceFooter: args.complianceFooter,
    dir: args.dir,
  })
  const text = args.bodyTextTemplate
    ? substitute(args.bodyTextTemplate, args.vars)
    : undefined
  return { subject, html, text }
}
