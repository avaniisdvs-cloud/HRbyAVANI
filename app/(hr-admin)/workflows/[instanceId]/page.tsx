import { redirect } from 'next/navigation'

/**
 * Unified approvals: the canonical review screen is /approvals/[instanceId]
 * (full Leave Request Details + WorkflowTimeline + requester comments + actions,
 * with Phase B row-level authorization). The legacy /workflows/[instanceId] page
 * is retained only as a redirect so every entry point (manager inbox, dashboards,
 * bell notifications, history back-links) lands on the same, complete review page.
 */
export default async function WorkflowInstanceRedirect({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const { instanceId } = await params
  redirect(`/approvals/${instanceId}`)
}
