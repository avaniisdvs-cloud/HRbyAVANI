/**
 * build-full-v2-workbook.mjs
 *
 * Thin CLI shim — delegates to TypeScript service layer (Phase D).
 * Generates the FULL V2 migration package for all 71 employees across 6 departments.
 * Output: hr_data_migration/UAT/full-v2-migration-package.xlsx
 *
 * All transformation logic lives in scripts/build-v2-package.ts
 * which calls modules/migration/source-transformer.ts (Phase A service layer).
 *
 * Usage:
 *   node scripts/build-full-v2-workbook.mjs
 *   pnpm exec tsx scripts/build-v2-package.ts        (direct TS invocation)
 */

import { execSync }         from 'child_process'
import { fileURLToPath }    from 'url'
import { dirname, join }    from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

execSync(
  `npx tsx ${join(__dirname, 'build-v2-package.ts')} --scope=full`,
  { stdio: 'inherit', cwd: join(__dirname, '..') },
)
