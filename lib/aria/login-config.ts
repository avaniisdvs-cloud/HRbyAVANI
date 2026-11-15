/**
 * ARIA pre-sign-in configuration loader.
 *
 * Reads AUTH.* rows from policy_settings so the AriaLoginWidget shows
 * live HR contact info and lockout policy instead of hardcoded strings.
 *
 * No auth guard — this is intentionally public: the sign-in page is
 * unauthenticated and these values are non-sensitive operational strings.
 */
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const AUTH_KEYS = [
  'AUTH.hr_contact_en',
  'AUTH.hr_contact_ar',
  'AUTH.lockout_attempts',
  'AUTH.lockout_window_minutes',
  'AUTH.reset_method_en',
  'AUTH.reset_method_ar',
] as const

export interface AriaLoginConfig {
  hrContactEn:          string
  hrContactAr:          string
  lockoutAttempts:      number
  lockoutWindowMinutes: number
  resetMethodEn:        string
  resetMethodAr:        string
}

const DEFAULTS: AriaLoginConfig = {
  hrContactEn:          'HR Support — contact your system administrator',
  hrContactAr:          'الموارد البشرية — تواصل مع مسؤول النظام',
  lockoutAttempts:      5,
  lockoutWindowMinutes: 15,
  resetMethodEn:        'Email + SMS OTP',
  resetMethodAr:        'البريد + رمز SMS',
}

export async function getAriaLoginConfig(): Promise<AriaLoginConfig> {
  try {
    const rows = await db
      .select({
        settingKey:   policySettings.settingKey,
        settingValue: policySettings.settingValue,
      })
      .from(policySettings)
      .where(and(
        eq(policySettings.tenantId, TENANT_ID),
        eq(policySettings.moduleCode, 'AUTH'),
        inArray(policySettings.settingKey, [...AUTH_KEYS]),
        isNull(policySettings.effectiveTo),
      ))

    const map = Object.fromEntries(rows.map(r => [r.settingKey, r.settingValue]))

    return {
      hrContactEn:          map['AUTH.hr_contact_en']          ?? DEFAULTS.hrContactEn,
      hrContactAr:          map['AUTH.hr_contact_ar']          ?? DEFAULTS.hrContactAr,
      lockoutAttempts:      parseInt(map['AUTH.lockout_attempts']      ?? '', 10) || DEFAULTS.lockoutAttempts,
      lockoutWindowMinutes: parseInt(map['AUTH.lockout_window_minutes'] ?? '', 10) || DEFAULTS.lockoutWindowMinutes,
      resetMethodEn:        map['AUTH.reset_method_en']        ?? DEFAULTS.resetMethodEn,
      resetMethodAr:        map['AUTH.reset_method_ar']        ?? DEFAULTS.resetMethodAr,
    }
  } catch {
    // DB unavailable at login time — fall back to defaults silently
    return DEFAULTS
  }
}
