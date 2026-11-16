/**
 * GET /api/persons/import/template
 * Streams an Excel workbook with the employee import template.
 * Access: HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN.
 */
import { getCompanyBranding } from '@/lib/company-branding'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildImportTemplate } from '@/modules/core-hr/bulk-import/template'
import { getTemplateRefData } from '@/modules/core-hr/bulk-import/actions'

const ALLOWED_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (!ALLOWED_ROLES.has(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let refs
    try {
      refs = await getTemplateRefData()
    } catch {
      refs = undefined
    }

    const { companyName } = await getCompanyBranding()
    const buf = buildImportTemplate(refs ?? {
      legalEntities: [], departments: [], positions: [], grades: [], locations: [],
    }, companyName)
    const brandSlug = companyName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'company'
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${brandSlug}-employee-import-template.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[template/route] error:', err)
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
