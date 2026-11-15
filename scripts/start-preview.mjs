import { config } from 'dotenv'
import postgres from 'postgres'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

config({ path: '.env.local' })
if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET || !process.env.ENCRYPTION_KEY) {
  throw new Error('Configure DATABASE_URL, AUTH_SECRET and ENCRYPTION_KEY in .env.local first')
}
const target = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || process.env.DATABASE_ENV !== 'development') {
  throw new Error('The preview command requires a local development database')
}
const root = path.join(homedir(), '.local', 'share', 'avaniis')
const pgCtl = path.join(root, 'postgres16', 'package', 'native', 'bin', 'pg_ctl')
const data = path.join(root, 'database')
async function databaseReady() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 2 })
  try { await sql`SELECT 1`; return true } catch { return false } finally { await sql.end() }
}
if (!await databaseReady()) {
  if (target.port !== '55432' || !existsSync(pgCtl) || !existsSync(data)) {
    throw new Error('Start your local PostgreSQL server before launching the preview')
  }
  const result = spawnSync(pgCtl, ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55432', 'start'], { stdio: 'inherit' })
  if (result.status !== 0 || !await databaseReady()) throw new Error('Local database startup failed')
}
const next = path.resolve('node_modules/next/dist/bin/next')
const production = process.argv.includes('--production')
if (production && !existsSync(path.resolve('.next/BUILD_ID'))) {
  throw new Error('Run pnpm build before starting the compiled preview')
}
const child = spawn(process.execPath, [next, production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '3001'], {
  stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--no-experimental-webstorage' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 0 })
