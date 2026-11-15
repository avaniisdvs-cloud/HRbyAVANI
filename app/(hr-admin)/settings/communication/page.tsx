/**
 * Administration → Settings → Communication Settings
 *
 * Enterprise email communication platform configuration. Role-protected
 * (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN). Server Component: loads MASKED provider
 * settings (secrets never leave the server), sender defaults, templates, summary
 * metrics, and recent delivery logs; hands them to the client UI.
 */
import { redirect } from 'next/navigation'
import { and, eq, gte, desc, count, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import {
  emailProviderSettings,
  emailSenderDefaults,
  emailTemplates,
  emailMessages,
} from '@/drizzle/schema/communication'
import { TEMPLATE_SEEDS } from '@/modules/communication/templates/seeds'
import CommunicationSettingsClient from './CommunicationSettingsClient'

const ALLOWED = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export const dynamic = 'force-dynamic'

function maskProvider(row: typeof emailProviderSettings.$inferSelect | undefined) {
  if (!row) return null
  // Strip *_enc secret columns; expose only a boolean "is configured" flag.
  const { graphClientSecretEnc, smtpPasswordEnc, ...safe } = row
  return {
    ...safe,
    hasGraphSecret: Boolean(graphClientSecretEnc),
    hasSmtpPassword: Boolean(smtpPasswordEnc),
    // dates → ISO strings for the client component
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
  }
}

export default async function CommunicationSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED.includes(session.user.role)) redirect('/settings')

  const [graphRow] = await db.select().from(emailProviderSettings)
    .where(and(eq(emailProviderSettings.tenantId, TENANT_ID), eq(emailProviderSettings.providerType, 'GRAPH_API'))).limit(1)
  const [smtpRow] = await db.select().from(emailProviderSettings)
    .where(and(eq(emailProviderSettings.tenantId, TENANT_ID), eq(emailProviderSettings.providerType, 'SMTP'))).limit(1)

  const [senderRow] = await db.select().from(emailSenderDefaults)
    .where(eq(emailSenderDefaults.tenantId, TENANT_ID))
    .orderBy(desc(emailSenderDefaults.updatedDate)).limit(1)

  const templates = await db.select().from(emailTemplates)
    .where(eq(emailTemplates.tenantId, TENANT_ID))
    .orderBy(desc(emailTemplates.updatedDate))

  // Summary metrics
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const [sentToday] = await db.select({ c: count() }).from(emailMessages)
    .where(and(eq(emailMessages.tenantId, TENANT_ID), eq(emailMessages.status, 'SENT'), gte(emailMessages.sentAt, startOfToday)))
  const [failedToday] = await db.select({ c: count() }).from(emailMessages)
    .where(and(eq(emailMessages.tenantId, TENANT_ID), eq(emailMessages.status, 'FAILED'), gte(emailMessages.updatedDate, startOfToday)))

  const logs = await db.select({
    id: emailMessages.id,
    sentAt: emailMessages.sentAt,
    createdDate: emailMessages.createdDate,
    recipientEmail: emailMessages.recipientEmail,
    subject: emailMessages.subject,
    templateCode: emailMessages.templateCode,
    module: emailMessages.module,
    providerType: emailMessages.providerType,
    status: emailMessages.status,
    retryCount: emailMessages.retryCount,
    businessObjectType: emailMessages.businessObjectType,
    workflowRequestId: emailMessages.workflowRequestId,
    correlationId: emailMessages.correlationId,
    lastError: emailMessages.lastError,
  }).from(emailMessages)
    .where(eq(emailMessages.tenantId, TENANT_ID))
    .orderBy(desc(emailMessages.createdDate))
    .limit(200)

  const activeProvider =
    graphRow?.isActive ? 'GRAPH_API' : smtpRow?.isActive ? 'SMTP' : null

  return (
    <div className="page-in">
      <CommunicationSettingsClient
        graph={maskProvider(graphRow)}
        smtp={maskProvider(smtpRow)}
        senderDefaults={senderRow ? {
          defaultFromName: senderRow.defaultFromName,
          defaultFromEmail: senderRow.defaultFromEmail,
          defaultReplyTo: senderRow.defaultReplyTo,
          hrSender: senderRow.hrSender,
          payrollSender: senderRow.payrollSender,
          workflowSender: senderRow.workflowSender,
          systemSender: senderRow.systemSender,
          announcementSender: senderRow.announcementSender,
          fallbackSender: senderRow.fallbackSender,
        } : null}
        templates={templates.map(t => ({
          id: t.id, templateCode: t.templateCode, templateName: t.templateName,
          subjectTemplate: t.subjectTemplate, bodyHtmlTemplate: t.bodyHtmlTemplate,
          bodyTextTemplate: t.bodyTextTemplate, module: t.module,
          languageCode: t.languageCode, isActive: t.isActive,
        }))}
        seedTemplates={TEMPLATE_SEEDS.map(s => ({ templateCode: s.templateCode, templateName: s.templateName, module: s.module }))}
        activeProvider={activeProvider}
        canOverride={session.user.role === 'SUPER_ADMIN'}
        metrics={{
          sentToday: sentToday?.c ?? 0,
          failedToday: failedToday?.c ?? 0,
        }}
        logs={logs.map(l => ({
          ...l,
          sentAt: l.sentAt ? l.sentAt.toISOString() : null,
          createdDate: l.createdDate ? l.createdDate.toISOString() : null,
        }))}
      />
    </div>
  )
}
