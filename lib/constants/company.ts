export const COMPANY = {

  // ── Legal Names ──────────────────────────────────────────────────────────
  // Use in: contracts, payslips, WPS SIF, GPSSA, GL journals, official letters
  LEGAL_NAME:    'Avaniis',
  LEGAL_NAME_AR: 'أفانيس',

  // ── Short / Display Names ─────────────────────────────────────────────────
  // Use in: nav sidebar, UI headers, informal comms
  SHORT_NAME:    'AVANIIS',
  SHORT_NAME_AR: 'أفانيس',

  // ── Group ─────────────────────────────────────────────────────────────────
  GROUP_NAME:    'Avaniis',
  GROUP_NAME_AR: 'أفانيس',

  // ── Entity Identifiers ────────────────────────────────────────────────────
  ENTITY_CODE:  'AVN-001',
  TRADE_LICENCE: '',   // fill when available
  LABOUR_CARD:   '',   // fill when available
  MOL_CODE:      '',   // MoHRE establishment code
  WPS_AGENT_ID:  '',   // WPS bank agent ID
  GPSSA_REG:     '',   // GPSSA registration number

  // ── Address ───────────────────────────────────────────────────────────────
  ADDRESS_EN: 'Dubai, United Arab Emirates',
  ADDRESS_AR: 'دبي، الإمارات العربية المتحدة',

  // ── Pre-built Strings ─────────────────────────────────────────────────────
  // Use these directly — never concatenate manually

  FOOTER_EN: 'Avaniis · Confidential © 2026',
  FOOTER_AR: 'أفانيس · سري © 2026',

  PAYSLIP_EMPLOYER_EN: 'Avaniis',
  PAYSLIP_EMPLOYER_AR: 'أفانيس',

  GL_ENTITY_PREFIX: 'Avaniis',
  WPS_EMPLOYER_NAME: 'Avaniis',

  ARIA_COMPANY_EN: 'Avaniis',
  ARIA_COMPANY_AR: 'أفانيس',

  EMAIL_FROM_NAME: 'AVANIIS HR · Avaniis',

  OFFICIAL_NAME_EN: 'Avaniis',
  OFFICIAL_NAME_AR: 'أفانيس',

} as const

export type CompanyConstants = typeof COMPANY
