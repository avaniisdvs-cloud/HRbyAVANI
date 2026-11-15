/**
 * lib/org-chart/engines/engine-registry.ts
 *
 * Central registry: maps HierarchyEngine key → resolver function.
 * All consumers call resolveEngine() — they never import engine files directly.
 *
 * Adding a new engine:
 *   1. Create the resolver in its own file
 *   2. Import it here
 *   3. Add it to REGISTRY
 *   4. Add it to HierarchyEngine union in engine-types.ts
 */

import { positionEngineResolver }    from './position-engine'
import { reportingEngineResolver }   from './reporting-engine'
import { departmentEngineResolver }  from './department-engine'
import { myTeamEngineResolver }      from './my-team-engine'
import type { HierarchyEngine, EngineResolver, EngineParams, HierarchyResult } from './engine-types'

// Engines not yet implemented
const notImplemented = (label: string): EngineResolver => async () => {
  throw new Error(`${label} engine is not yet implemented (Phase 2)`)
}

const REGISTRY: Record<HierarchyEngine, EngineResolver> = {
  position:   positionEngineResolver,
  reporting:  reportingEngineResolver,
  department: departmentEngineResolver,   // Session 4 ✅
  'my-team':  myTeamEngineResolver,       // Session 5 ✅
  matrix:     notImplemented('Matrix (Phase 2)'),
}

export async function resolveEngine(
  engine: HierarchyEngine,
  params: EngineParams,
): Promise<HierarchyResult> {
  const resolver = REGISTRY[engine]
  if (!resolver) throw new Error(`Unknown hierarchy engine: "${engine}"`)
  return resolver(params)
}

export type { HierarchyEngine, EngineParams, HierarchyResult }
