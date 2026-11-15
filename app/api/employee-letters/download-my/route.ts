/**
 * GET /api/employee-letters/download-my?id={letterId}
 *
 * Employee-facing PDF download for their own signed letters.
 * Any authenticated role can call this — the letter must belong to the
 * calling user's personId (resolved via JWT → person_contacts → user_accounts).
 * An admin using this endpoint for their own personal letter is fine;
 * for downloading other employees' letters, admins use /api/employee-letters/download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { employeeLetters, personContacts, userAccounts } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import path from 'path'
import fs   from 'fs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const letterId = req.nextUrl.searchParams.get('id')
  if (!letterId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Resolve caller's personId — same three-layer chain as signing page
  let personId: string | null = (session.user as { personId?: string }).personId ?? null

  if (!personId && session.user.email) {
    const [c] = await db
      .select({ personId: personContacts.personId })
      .from(personContacts)
      .where(and(
        eq(personContacts.contactType, 'WORK_EMAIL'),
        eq(personContacts.contactValue, session.user.email),
      ))
      .limit(1)
      .catch(() => [])
    personId = c?.personId ?? null
  }

  if (!personId && session.user.email) {
    const [u] = await db
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(eq(userAccounts.primaryEmail, session.user.email.toLowerCase()))
      .limit(1)
      .catch(() => [])
    personId = u?.personId ?? null
  }

  if (!personId) return NextResponse.json({ error: 'Employee profile not found' }, { status: 403 })

  // Load letter — must belong to this person
  const [letter] = await db
    .select()
    .from(employeeLetters)
    .where(and(
      eq(employeeLetters.tenantId, TENANT_ID),
      eq(employeeLetters.id, letterId),
      eq(employeeLetters.personId, personId),
    ))
    .limit(1)

  if (!letter)     return NextResponse.json({ error: 'Letter not found'     }, { status: 404 })
  // Prefer signed PDF, then cloud URL, then durable base64 fallback (migration 0053).
  // Treat empty string (unconfigured cloud storage) as absent.
  const effectivePdfUrl =
    (letter.signedPdfUrl || null) ??
    (letter.pdfUrl || null) ??
    (letter.pdfData || null)
  if (!effectivePdfUrl) return NextResponse.json({ error: 'PDF not available' }, { status: 404 })

  const pdfBytes = await fetchPdfBytes(effectivePdfUrl)

  const safeRef  = letter.letterNumber.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename = `${letter.typeCode}_${safeRef}.pdf`

  // ?mode=view → inline browser display; default → force download
  const mode        = req.nextUrl.searchParams.get('mode') ?? 'download'
  const disposition = mode === 'view'
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`

  return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length':      String(pdfBytes.length),
      'Cache-Control':       'no-store',
    },
  })
}

async function fetchPdfBytes(pdfUrl: string): Promise<Buffer> {
  // Durable base64 data URL (migration 0053) — decode directly, no network/disk.
  if (pdfUrl.startsWith('data:')) {
    const base64 = pdfUrl.slice(pdfUrl.indexOf(',') + 1)
    return Buffer.from(base64, 'base64')
  }
  if (pdfUrl.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', pdfUrl)
    return fs.readFileSync(filePath)
  }
  if (pdfUrl.startsWith('local://')) {
    const storageKey = pdfUrl.replace('local://stub/', '').split('?')[0]
    const filePath   = path.join(process.cwd(), 'public', 'uploads', storageKey)
    return fs.readFileSync(filePath)
  }
  const resp = await fetch(pdfUrl)
  if (!resp.ok) throw new Error(`Failed to fetch PDF: ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}
