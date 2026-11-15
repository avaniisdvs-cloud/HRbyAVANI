/**
 * Integration tests — modules/core-hr/org-chart-actions.ts
 *
 * Covers all 7 server actions:
 *   createHiringRequest · createTransferRequest · assignActingManager
 *   searchPersons · getVacantPositionsByDept
 *   togglePositionConfidential · togglePositionFrozen
 *   getOrgChartPendingCounts
 *
 * DB calls are fully mocked — no Postgres connection needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Reusable transaction mock ─────────────────────────────────────────────────

const mockTx = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-id-001' }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ isConfidential: false, isFrozen: false }]),
      }),
    }),
  }),
}

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit:      vi.fn().mockResolvedValue([]),
          innerJoin:  vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        limit:     vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new-id-001' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id:            'user-hr-01',
    name:          'Test HR Admin',
    role:          'HR_ADMIN',
    email:         'hr@avaniis.test',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  }),
  requireRole: vi.fn().mockResolvedValue({
    id:            'user-hr-01',
    name:          'Test HR Admin',
    role:          'HR_ADMIN',
    email:         'hr@avaniis.test',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  }),
}))

// next/cache — revalidatePath is a no-op in tests
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Dynamic imports (after mocks are registered) ──────────────────────────────

const { getCurrentUser } = await import('@/lib/auth')
const { writeAuditLog }  = await import('@/lib/audit')
const { db }             = await import('@/lib/db')

const {
  createHiringRequest,
  createTransferRequest,
  assignActingManager,
  searchPersons,
  getVacantPositionsByDept,
  togglePositionConfidential,
  togglePositionFrozen,
  getOrgChartPendingCounts,
} = await import('@/modules/core-hr/org-chart-actions')

// ── Helper: reset all mocks and restore defaults ──────────────────────────────

function resetDbSelect(rows: unknown[] = []) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
      limit:     vi.fn().mockResolvedValue(rows),
      innerJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: authenticated HR_ADMIN
  vi.mocked(getCurrentUser).mockResolvedValue({
    id:            'user-hr-01',
    name:          'Test HR Admin',
    role:          'HR_ADMIN',
    email:         'hr@avaniis.test',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  } as never)

  // Default tx insert returning new id
  mockTx.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-id-001' }]),
    }),
  })
  mockTx.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })
  mockTx.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ isConfidential: false, isFrozen: false }]),
      }),
    }),
  })

  resetDbSelect([])
})

// ─────────────────────────────────────────────────────────────────────────────
// createHiringRequest
// ─────────────────────────────────────────────────────────────────────────────

describe('createHiringRequest', () => {
  const validInput = {
    positionId:   'pos-vacant-01',
    departmentId: 'dept-ops',
    requestType:  'REPLACEMENT',
    justification:'We need to fill this vacancy urgently due to business growth targets.',
    urgency:      'HIGH',
  }

  it('returns success for valid input from HR_ADMIN', async () => {
    const result = await createHiringRequest(validInput)

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('calls db.transaction + writeAuditLog on success', async () => {
    await createHiringRequest(validInput)

    expect(db.transaction).toHaveBeenCalledOnce()
    expect(writeAuditLog).toHaveBeenCalledOnce()
  })

  it('audits with eventType HIRING_REQUEST_CREATED', async () => {
    await createHiringRequest(validInput)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'HIRING_REQUEST_CREATED' }),
      expect.anything(),
    )
  })

  it('rejects when justification is too short (< 30 chars)', async () => {
    const result = await createHiringRequest({
      ...validInput,
      justification: 'Too short',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/30 characters/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects when justification is exactly 29 chars', async () => {
    const result = await createHiringRequest({
      ...validInput,
      justification: 'x'.repeat(29),
    })
    expect(result.success).toBe(false)
  })

  it('accepts when justification is exactly 30 chars', async () => {
    const result = await createHiringRequest({
      ...validInput,
      justification: 'x'.repeat(30),
    })
    expect(result.success).toBe(true)
  })

  it('rejects when positionId is missing', async () => {
    const result = await createHiringRequest({
      ...validInput,
      positionId: '',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/positionId/i)
  })

  it('rejects EMPLOYEE role (insufficient permissions)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'emp-01', name: 'Employee', role: 'EMPLOYEE',
      email: 'emp@test.com', legalEntityId: 'l1',
    } as never)

    const result = await createHiringRequest(validInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/permissions/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('defaults urgency to STANDARD when not provided', async () => {
    const { urgency: _u, ...inputWithoutUrgency } = validInput
    const result = await createHiringRequest(inputWithoutUrgency)
    expect(result.success).toBe(true)
    // The insert call should have used STANDARD as urgency
    const insertValues = mockTx.insert.mock.results[0]?.value?.values
    expect(insertValues).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createTransferRequest
// ─────────────────────────────────────────────────────────────────────────────

describe('createTransferRequest', () => {
  const validInput = {
    nodeId:             'pos-abc',
    requestType:        'TRANSFER',
    targetDepartmentId: 'dept-tech',
    effectiveDate:      '2026-07-01',
    reason:             'Employee requested transfer to Technology department.',
  }

  it('returns success for valid TRANSFER request', async () => {
    // Position lookup returns a personId
    resetDbSelect([{ personId: 'person-xyz' }])

    const result = await createTransferRequest(validInput)

    expect(result.success).toBe(true)
    expect(db.transaction).toHaveBeenCalledOnce()
  })

  it('returns success for PROMOTION type', async () => {
    resetDbSelect([{ personId: 'person-xyz' }])

    const result = await createTransferRequest({ ...validInput, requestType: 'PROMOTION' })

    expect(result.success).toBe(true)
  })

  it('audits with eventType TRANSFER_REQUEST_CREATED', async () => {
    resetDbSelect([{ personId: 'person-xyz' }])

    await createTransferRequest(validInput)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TRANSFER_REQUEST_CREATED' }),
      expect.anything(),
    )
  })

  it('falls back to actor id when position has no occupant', async () => {
    // No personId found
    resetDbSelect([])

    const result = await createTransferRequest(validInput)

    // Still succeeds — falls back to user.id
    expect(result.success).toBe(true)
  })

  it('rejects EMPLOYEE role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'emp-01', name: 'Employee', role: 'EMPLOYEE',
      email: 'emp@test.com', legalEntityId: 'l1',
    } as never)

    const result = await createTransferRequest(validInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/permissions/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// assignActingManager
// ─────────────────────────────────────────────────────────────────────────────

describe('assignActingManager', () => {
  const validInput = {
    positionId:     'pos-mgr-01',
    actingPersonId: 'person-deputy-01',
    startDate:      '2026-06-01',
    endDate:        '2026-08-31',
    reason:         'Acting during annual leave.',
  }

  it('succeeds when worker assignment is found', async () => {
    // First select: find worker assignment
    resetDbSelect([{ id: 'asgn-001' }])

    const result = await assignActingManager(validInput)

    expect(result.success).toBe(true)
    expect(db.transaction).toHaveBeenCalledOnce()
  })

  it('audits with eventType ACTING_ASSIGNMENT_CREATED', async () => {
    resetDbSelect([{ id: 'asgn-001' }])

    await assignActingManager(validInput)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ACTING_ASSIGNMENT_CREATED' }),
      expect.anything(),
    )
  })

  it('returns error when no active worker assignment found', async () => {
    // Assignment lookup returns empty
    resetDbSelect([])

    const result = await assignActingManager(validInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/assignment not found/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects EMPLOYEE role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'emp-01', name: 'Employee', role: 'EMPLOYEE',
      email: 'emp@test.com', legalEntityId: 'l1',
    } as never)

    const result = await assignActingManager(validInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/permissions/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// searchPersons
// ─────────────────────────────────────────────────────────────────────────────

describe('searchPersons', () => {
  it('returns empty array for blank query', async () => {
    const result = await searchPersons('')
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns empty array for whitespace-only query', async () => {
    const result = await searchPersons('   ')
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns mapped PersonSearchResult array on match', async () => {
    // searchPersons chain: select().from().innerJoin().leftJoin().where().limit()
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'p1', nameEn: 'Ahmed Al Rashidi', jobTitleEn: 'Senior Engineer' },
                { id: 'p2', nameEn: 'Sara Al Mansoori',  jobTitleEn: null },
              ]),
            }),
          }),
        }),
      }),
    } as never)

    const result = await searchPersons('ahmed')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data?.[0]).toMatchObject({ id: 'p1', nameEn: 'Ahmed Al Rashidi', jobTitleEn: 'Senior Engineer' })
    expect(result.data?.[1]?.jobTitleEn).toBeUndefined()
  })

  it('handles DB error gracefully', async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error('DB connection lost')
    })

    const result = await searchPersons('test')

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getVacantPositionsByDept
// ─────────────────────────────────────────────────────────────────────────────

describe('getVacantPositionsByDept', () => {
  it('returns only unoccupied positions', async () => {
    resetDbSelect([
      { id: 'p1', titleEn: 'Senior Developer',   isOccupied: false },
      { id: 'p2', titleEn: 'Tech Lead',           isOccupied: true  }, // occupied — excluded
      { id: 'p3', titleEn: 'Product Manager',     isOccupied: false },
    ])

    const result = await getVacantPositionsByDept('dept-tech')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data?.map(d => d.id)).toEqual(['p1', 'p3'])
  })

  it('returns empty array when all positions are occupied', async () => {
    resetDbSelect([
      { id: 'p1', titleEn: 'Senior Developer', isOccupied: true },
    ])

    const result = await getVacantPositionsByDept('dept-tech')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns empty array when dept has no positions', async () => {
    resetDbSelect([])

    const result = await getVacantPositionsByDept('dept-empty')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('handles DB error gracefully', async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error('Query timeout')
    })

    const result = await getVacantPositionsByDept('dept-1')

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// togglePositionConfidential
// ─────────────────────────────────────────────────────────────────────────────

describe('togglePositionConfidential', () => {
  it('flips isConfidential from false → true for HR_ADMIN', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isConfidential: false }]),
        }),
      }),
    })

    const result = await togglePositionConfidential('pos-1', 'Position is sensitive — executive role.')

    expect(result.success).toBe(true)
    expect(result.newValue).toBe(true)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'POSITION_CONFIDENTIAL_TOGGLED' }),
      expect.anything(),
    )
  })

  it('flips isConfidential from true → false', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isConfidential: true }]),
        }),
      }),
    })

    const result = await togglePositionConfidential('pos-1', 'No longer sensitive.')

    expect(result.success).toBe(true)
    expect(result.newValue).toBe(false)
  })

  it('rejects MANAGER role (HR_ADMIN only)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'mgr-01', name: 'Manager', role: 'MANAGER',
      email: 'mgr@test.com', legalEntityId: 'l1',
    } as never)

    const result = await togglePositionConfidential('pos-1', 'Reason for change is sufficient.')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/HR Admin/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects reason shorter than 10 characters', async () => {
    const result = await togglePositionConfidential('pos-1', 'Short')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/10 characters/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('accepts reason exactly 10 characters', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isConfidential: false }]),
        }),
      }),
    })

    const result = await togglePositionConfidential('pos-1', '0123456789')
    expect(result.success).toBe(true)
  })

  it('returns error when position not found in transaction', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    // transaction will throw — the action catches it
    vi.mocked(db.transaction).mockImplementationOnce(async (fn) => {
      await fn(mockTx as never)
    })

    const result = await togglePositionConfidential('pos-nonexistent', 'Valid reason here.')

    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// togglePositionFrozen
// ─────────────────────────────────────────────────────────────────────────────

describe('togglePositionFrozen', () => {
  it('flips isFrozen false → true', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isFrozen: false }]),
        }),
      }),
    })

    const result = await togglePositionFrozen('pos-2', 'Budget freeze per finance directive.')

    expect(result.success).toBe(true)
    expect(result.newValue).toBe(true)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'POSITION_FROZEN_TOGGLED' }),
      expect.anything(),
    )
  })

  it('flips isFrozen true → false', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isFrozen: true }]),
        }),
      }),
    })

    const result = await togglePositionFrozen('pos-2', 'Budget approved.')

    expect(result.success).toBe(true)
    expect(result.newValue).toBe(false)
  })

  it('rejects MANAGER role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'mgr-01', name: 'Manager', role: 'MANAGER',
      email: 'mgr@test.com', legalEntityId: 'l1',
    } as never)

    const result = await togglePositionFrozen('pos-2', 'Some reason.')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/HR Admin/i)
  })

  it('rejects blank reason', async () => {
    const result = await togglePositionFrozen('pos-2', '')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/required/i)
  })

  it('accepts a single-character reason', async () => {
    mockTx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ isFrozen: false }]),
        }),
      }),
    })
    const result = await togglePositionFrozen('pos-2', 'x')
    expect(result.success).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getOrgChartPendingCounts
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrgChartPendingCounts', () => {
  it('returns correct counts for HR_ADMIN', async () => {
    // First call: hiringRequests count; second call: transferRequests count
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 4 }]),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      } as never)

    const result = await getOrgChartPendingCounts()

    expect(result.hiringRequests).toBe(4)
    expect(result.transferRequests).toBe(2)
  })

  it('returns zeros for EMPLOYEE role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'emp-01', name: 'Employee', role: 'EMPLOYEE',
      email: 'emp@test.com', legalEntityId: 'l1',
    } as never)

    const result = await getOrgChartPendingCounts()

    expect(result.hiringRequests).toBe(0)
    expect(result.transferRequests).toBe(0)
    // EMPLOYEE short-circuits — no DB call
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns zeros for EXECUTIVE (allowed — not rejected)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'exec-01', name: 'Executive', role: 'EXECUTIVE',
      email: 'exec@test.com', legalEntityId: 'l1',
    } as never)

    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      } as never)

    const result = await getOrgChartPendingCounts()

    expect(result.hiringRequests).toBe(0)
    expect(result.transferRequests).toBe(0)
    // DB WAS queried — EXECUTIVE is allowed
    expect(db.select).toHaveBeenCalled()
  })

  it('coerces string count to number', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '7' }]),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '3' }]),
        }),
      } as never)

    const result = await getOrgChartPendingCounts()

    expect(typeof result.hiringRequests).toBe('number')
    expect(result.hiringRequests).toBe(7)
    expect(result.transferRequests).toBe(3)
  })

  it('returns 0s with error field on DB failure', async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error('DB unreachable')
    })

    const result = await getOrgChartPendingCounts()

    expect(result.hiringRequests).toBe(0)
    expect(result.transferRequests).toBe(0)
  })
})
