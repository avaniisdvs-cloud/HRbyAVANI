import { requireRole } from '@/lib/auth'
import { getAllLetterTypes, getAllTokens, getTemplatesForType } from '@/modules/employee-letters/queries'
import { LetterTemplatesClient } from '@/components/employee-letters/LetterTemplatesClient'

export const metadata = { title: 'Letter Templates · Settings' }

export default async function LetterTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ typeCode?: string }>
}) {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const sp = searchParams ? await searchParams : {} as { typeCode?: string }
  const types     = await getAllLetterTypes()
  const tokens    = await getAllTokens()
  const typeCode  = sp.typeCode ?? types[0]?.typeCode ?? 'PCL'
  const templates = await getTemplatesForType(typeCode)

  return (
    <LetterTemplatesClient
      types={types}
      initialTypeCode={typeCode}
      initialTemplates={templates}
      tokens={tokens}
    />
  )
}
