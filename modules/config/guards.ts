/**
 * Config module domain guardrails — Task 8b.
 * Six sync helpers that enforce config-layer business rules before any DB write.
 *
 * No `'use server'` directive — these are server-only helpers callable from
 * Server Actions (modules/config/actions.ts). They throw on failure so the
 * caller's Server Action surfaces a typed error to the wire.
 *
 * Auth/RBAC guards live in lib/auth.ts (getCurrentUser, requireRole). These
 * guards handle config-specific invariants only.
 */
import { db } from '@/lib/db'
import { customFieldDefinitions, notificationTemplates } from '@/drizzle/schema'
import { eq, and, count } from 'drizzle-orm'

const MAX_CUSTOM_FIELDS = 50

// Ordered rank list — used by assertEscalationRoleHigher
const VALID_APPROVER_ROLES = [
  'LINE_MANAGER',
  'HOD',
  'HR_HOD',        // HR Head of Department (BR-WF-010)
  'HR_DIRECTOR',
  'HR_ADMIN',
  'CEO',
] as const

type ApproverRole = (typeof VALID_APPROVER_ROLES)[number]

const ROLE_RANK: Record<ApproverRole, number> = {
  LINE_MANAGER: 1,
  HOD:          2,
  HR_HOD:       3,
  HR_DIRECTOR:  4,
  HR_ADMIN:     5,
  CEO:          6,
}

// ── 1. assertNotSystemField ────────────────────────────────────────────────
// Throws if the field is a system field (legalEntityId IS NULL = system-owned).
// System fields are seeded globally and must never be mutated by HR Admins.

export function assertNotSystemField(field: { isSystemField?: boolean | null }): void {
  if (field.isSystemField === true) {
    throw new Error('FORBIDDEN: system fields cannot be modified or deleted')
  }
}

// ── 2. assertLeaveRuleNotBelowMinimum ─────────────────────────────────────
// BR-AL-001: UAE Federal Decree-Law 33/2021 Article 29 — minimum 30 days
// annual leave (for employees with ≥1 year service).
// The spec uses 22 as the minimum per CONFIGURATION_FRAMEWORK.md §5.
// Caller must convert the rule set to { accrualRateDays, uaeMinimumDaysAnnual }.

export function assertLeaveRuleNotBelowMinimum(ruleSet: {
  accrualRateDays:     number  // days credited per month
  uaeMinimumDaysAnnual: number  // floor (typically 22)
}): void {
  // BR-AL-001: annual entitlement = monthly rate × 12
  const annualEntitlement = ruleSet.accrualRateDays * 12
  if (annualEntitlement < ruleSet.uaeMinimumDaysAnnual) {
    throw new Error(
      `COMPLIANCE_VIOLATION: BR-AL-001 — annual entitlement ` +
      `(${annualEntitlement.toFixed(2)} days) is below UAE minimum ` +
      `(${ruleSet.uaeMinimumDaysAnnual} days)`,
    )
  }
}

// ── 3. assertMaxCustomFields ───────────────────────────────────────────────
// Throws if the entity type already has 50 or more active custom field
// definitions, preventing unbounded schema growth.

export async function assertMaxCustomFields(
  entityType: string,
  tenantId:   string,
): Promise<void> {
  const [row] = await db
    .select({ total: count() })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.objectType, entityType),
        eq(customFieldDefinitions.isActive, true),
      ),
    )

  if ((row?.total ?? 0) >= MAX_CUSTOM_FIELDS) {
    throw new Error(
      `LIMIT_EXCEEDED: "${entityType}" already has ${MAX_CUSTOM_FIELDS} active custom fields`,
    )
  }
}

// ── 4. assertWorkflowRoleValid ─────────────────────────────────────────────
// Throws if the given role string is not in the approved approver-role list.

export function assertWorkflowRoleValid(role: string): void {
  if (!(VALID_APPROVER_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      `INVALID_ROLE: "${role}" is not a valid approver role. ` +
      `Must be one of: ${VALID_APPROVER_ROLES.join(', ')}`,
    )
  }
}

// ── 5. assertEscalationRoleHigher ──────────────────────────────────────────
// Throws if the escalation role does not outrank the step role.
// Prevents nonsensical escalation paths (e.g., escalating from CEO to HOD).

export function assertEscalationRoleHigher(
  stepRole:       string,
  escalationRole: string,
): void {
  assertWorkflowRoleValid(stepRole)
  assertWorkflowRoleValid(escalationRole)

  const stepRank       = ROLE_RANK[stepRole as ApproverRole]
  const escalationRank = ROLE_RANK[escalationRole as ApproverRole]

  if (escalationRank <= stepRank) {
    throw new Error(
      `INVALID_ESCALATION: escalation role "${escalationRole}" (rank ${escalationRank}) ` +
      `must outrank step role "${stepRole}" (rank ${stepRank})`,
    )
  }
}

// ── 6. requireCorrectionModePermission ────────────────────────────────────
// Throws unless the actor holds a role that is authorised to make in-place
// corrections to completed effective-dated history records.
//
// Correction Mode must never be available to HR_ADMIN alone — it bypasses the
// normal close+open audit trail and can silently rewrite history. It requires
// at minimum HR_DIRECTOR level. SUPER_ADMIN is always permitted.
//
// Roles authorised: HR_DIRECTOR, SUPER_ADMIN.
// Roles NOT authorised: EMPLOYEE, MANAGER, HOD, HR_ADMIN, PAYROLL_ADMIN.

const CORRECTION_MODE_ROLES = ['HR_DIRECTOR', 'SUPER_ADMIN'] as const

export function requireCorrectionModePermission(actorRole: string): void {
  if (!(CORRECTION_MODE_ROLES as readonly string[]).includes(actorRole)) {
    throw new Error(
      `FORBIDDEN: Correction Mode requires HR_DIRECTOR or SUPER_ADMIN role. ` +
      `Actor role "${actorRole}" is not authorised to make in-place history corrections.`,
    )
  }
}

// ── 7. assertPlaceholdersValid ─────────────────────────────────────────────
// Extracts every {{token}} from body and verifies each token exists in the
// notification template's availableVarsJson for the given triggerEvent.
// Throws listing all unknown tokens so the HR Admin can fix them in one pass.

export async function assertPlaceholdersValid(
  body:         string,
  triggerEvent: string,
): Promise<void> {
  const tokens = [...body.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
  if (tokens.length === 0) return

  const [template] = await db
    .select({ vars: notificationTemplates.availableVarsJson })
    .from(notificationTemplates)
    .where(eq(notificationTemplates.eventType, triggerEvent))
    .limit(1)

  const rawVars = template?.vars
  const allowedVars: string[] = Array.isArray(rawVars)
    ? (rawVars as string[])
    : Object.keys((rawVars as Record<string, unknown>) ?? {})

  const invalid = tokens.filter(t => !allowedVars.includes(t))
  if (invalid.length > 0) {
    throw new Error(
      `INVALID_PLACEHOLDER: unknown tokens in template: ` +
      `{{${invalid.join('}}, {{')}}}`,
    )
  }
}
