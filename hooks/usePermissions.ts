'use client'

/**
 * Client-side permission check hook.
 *
 * Usage:
 *   const { can, hasAny } = usePermissions(permsMap, session.user.role)
 *   if (can('LEAVE_REQUEST', 'create')) { ... }
 *
 * The `permsMap` is fetched server-side (via listFeaturePermissions) and
 * passed down as a prop so this hook stays pure and SSR-safe.
 */

import type { PermAction, PermSet } from '@/drizzle/schema'

export type { PermAction }

export interface FeaturePermsMap {
  [featureKey: string]: {
    employee:  PermSet
    manager:   PermSet
    hr_admin:  PermSet
  }
}

const ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN']

function roleKey(role: string): 'employee' | 'manager' | 'hr_admin' {
  if (ADMIN_ROLES.includes(role)) return 'hr_admin'
  if (role === 'MANAGER')         return 'manager'
  return 'employee'
}

export function usePermissions(permsMap: FeaturePermsMap, userRole: string) {
  const key = roleKey(userRole)

  function can(feature: string, action: PermAction): boolean {
    return permsMap[feature]?.[key]?.[action] ?? false
  }

  function hasAny(feature: string): boolean {
    const perms = permsMap[feature]?.[key]
    if (!perms) return false
    return (Object.values(perms) as boolean[]).some(Boolean)
  }

  return { can, hasAny }
}
