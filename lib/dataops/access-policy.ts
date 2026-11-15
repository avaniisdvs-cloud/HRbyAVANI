/**
 * DataOps Console — role-based data access policy.
 *
 * Three tiers of access (cumulative — each tier includes all tiers below it):
 *
 *  SUPER_ADMIN / HR_ADMIN group  → all tables, no row filter
 *  MANAGER                       → public tables + own data + team data
 *  EMPLOYEE                      → public tables + own data only
 *
 * Tables not in any visible set are hidden from the schema browser for that role.
 */

export type DataAccessRole = 'SUPER_ADMIN' | 'HR_ADMIN_GROUP' | 'MANAGER' | 'EMPLOYEE'

// ── Table categorisation ───────────────────────────────────────────────────────

/**
 * Org-wide public/reference data — visible to every role, no row filter.
 * MDM, org structure, leave config, compliance, scheduling.
 */
export const PUBLIC_TABLES = new Set([
  'lookup_values',
  'legal_entities',
  'grades',
  'departments',
  'locations',
  'jobs',
  'business_units',
  'positions',              // non-confidential positions are visible; confidential rows filtered separately
  'work_schedules',
  'work_schedule_patterns',
  'public_holidays',
  'blackout_periods',
  'absence_plans',
  'absence_types',
  'compliance_rules',
])

/**
 * Personal data tables — employees and managers see rows for themselves.
 * Managers additionally see rows for their direct reports (see TEAM_TABLES).
 * Column used for filtering: listed in PERSON_ID_COLUMN (default: 'person_id').
 */
export const SELF_TABLES = new Set([
  'persons',               // uses 'id' column, not person_id
  'worker_assignments',
  'person_contacts',
  'person_addresses',
  'person_documents',
  'person_dependents',
  'person_emergency_contacts',
  'person_education',
  'person_professional_certs',
  'contracts',
  'absence_entries',
  'absence_balances',
  'accommodation_requests',
  'employment_actions',
])

/**
 * Tables where managers additionally see their team's rows
 * (same as SELF_TABLES but team-scoped, plus a few manager-only tables).
 */
export const TEAM_TABLES = new Set([
  ...SELF_TABLES,
  'transfer_requests',     // person_id = team member
  'hiring_requests',       // department_id IN manager's departments
  'timesheet_periods',     // person_id = team member
])

/**
 * Tables visible ONLY to HR_ADMIN roles and above.
 * Not shown in the schema browser for EMPLOYEE or MANAGER.
 */
export const HR_ADMIN_ONLY_TABLES = new Set([
  'payroll_definitions',
  'payroll_runs',
  'payroll_results',
  'eosb_calculations',
  'salary_elements',
  'grade_salary_ranges',
  'person_bank_details',
  'wps_sif_records',
  'dews_contributions',
  'gpssa_contributions',
  'vss_contributions',
  'gl_journal_lines',
  'audit_log',
  'user_accounts',
  'refresh_tokens',
  'sso_provider_config',
  'workflow_instances',
  'workflow_definitions',
  'workflow_stages',
  'workflow_routing_rules',
  'approval_delegations',
  'notification_templates',
  'notification_log',
  'onboarding_checklists',
  'onboarding_checklist_items',
  'custom_field_definitions',
  'form_configurations',
  'page_personalization',
  'feature_permissions',
  'policy_settings',
  'aria_agent_config',
  'aria_model_config',
  'aria_behaviour_config',
  'aria_knowledge_sources',
  'events',
  'medical_insurance_enrolments',
  'medical_insurance_policy_settings',
  'medical_insurance_plans',
  'document_type_configs',
  'timesheet_entries',     // managers see via TEAM_TABLES; HR admins see all
])

/**
 * Tables where the PK column is the person identifier (not a foreign key named person_id).
 */
export const PERSON_PK_TABLES = new Set(['persons'])

// ── Visibility helpers ─────────────────────────────────────────────────────────

export function resolveDataAccessRole(role: string): DataAccessRole {
  if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE'].includes(role)) return 'HR_ADMIN_GROUP'
  if (role === 'MANAGER') return 'MANAGER'
  return 'EMPLOYEE'
}

/**
 * Returns whether a table name in the public schema is visible to the given access role.
 */
export function isTableVisible(tableName: string, accessRole: DataAccessRole): boolean {
  if (accessRole === 'SUPER_ADMIN' || accessRole === 'HR_ADMIN_GROUP') return true

  // EMPLOYEE and MANAGER never see HR-only tables
  if (HR_ADMIN_ONLY_TABLES.has(tableName)) return false

  // Public tables — always visible
  if (PUBLIC_TABLES.has(tableName)) return true

  // SELF tables — employee sees own rows; manager sees team rows
  if (SELF_TABLES.has(tableName)) return true

  // TEAM_TABLES includes SELF_TABLES + extra manager tables
  if (accessRole === 'MANAGER' && TEAM_TABLES.has(tableName)) return true

  return false
}

// ── Row-filter SQL builders ────────────────────────────────────────────────────

/**
 * For non-public schema (e.g. 'dataops') — apply no filter regardless of role.
 * Row-level security only applies to the 'public' HR schema.
 */
export function isHrSchema(schema: string): boolean {
  return schema === 'public'
}

/**
 * Returns a parameterised SQL WHERE fragment to append, plus the parameter values.
 * Returns null if no row filter is needed (public table or full-access role).
 *
 * @param tableName   The SQL table name (unquoted)
 * @param accessRole  The resolved access role
 * @param personId    The current user's person UUID
 * @param teamIds     Array of team member person UUIDs (manager only — may be empty)
 */
export function buildRowFilter(
  tableName: string,
  accessRole: DataAccessRole,
  personId:  string,
  teamIds:   string[],
): { clause: string; values: string[] } | null {
  // Full access — no filter
  if (accessRole === 'SUPER_ADMIN' || accessRole === 'HR_ADMIN_GROUP') return null

  // Public tables — no row filter
  if (PUBLIC_TABLES.has(tableName)) return null

  // Determine the person column for this table
  const personCol = PERSON_PK_TABLES.has(tableName) ? 'id' : 'person_id'

  if (accessRole === 'EMPLOYEE') {
    return { clause: `"${personCol}" = $1`, values: [personId] }
  }

  // MANAGER — sees self + team
  if (accessRole === 'MANAGER') {
    if (tableName === 'hiring_requests') {
      // hiring_requests has no person_id; manager sees requests for their departments.
      // We rely on a subquery based on their worker_assignment department.
      return {
        clause: `"department_id" IN (
          SELECT department_id FROM worker_assignments
          WHERE person_id = $1 AND effective_end_date = DATE '9999-12-31'
          LIMIT 5
        )`,
        values: [personId],
      }
    }

    const allIds = [personId, ...teamIds]
    if (allIds.length === 0) {
      return { clause: `"${personCol}" = $1`, values: [personId] }
    }
    // Parameterised IN clause: $1, $2, ...
    const placeholders = allIds.map((_, i) => `$${i + 1}`).join(', ')
    return { clause: `"${personCol}" IN (${placeholders})`, values: allIds }
  }

  return null
}
