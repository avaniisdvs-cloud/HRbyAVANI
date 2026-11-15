/**
 * Seed definitions for the 14 platform email templates (Section 6).
 * These are the fallback/default templates. Admins may override the DB rows from
 * Communication Settings → Templates; EmailService prefers the DB row when present
 * and falls back to these seeds, so the platform always has a usable template.
 *
 * Placeholders (Section 6): {{employeeName}} {{managerName}} {{leaveType}}
 *   {{startDate}} {{endDate}} {{duration}} {{reason}} {{workflowRequestId}}
   *   {{approvalStatus}} {{approveLink}} {{rejectLink}} {{delegateLink}}
   *   {{decisionContextHtml}} {{actionButtons}} {{delegationNotice}}
   *   {{companyName}} {{legalEntityName}} {{hrContact}} {{currentDate}}
 */

export interface TemplateSeed {
  templateCode: string
  templateName: string
  module: string
  subjectTemplate: string
  bodyHtmlTemplate: string
  bodyTextTemplate: string
}

const p = (s: string) => s.trim()

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    templateCode: 'LEAVE_SUBMITTED_MANAGER',
    templateName: 'Leave Submitted to Manager',
    module: 'absence',
    subjectTemplate: 'Leave request awaiting your approval — {{employeeName}} ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`
      <p>Dear {{managerName}},</p>
      <p><strong>{{employeeName}}</strong> has submitted a leave request that requires your approval. Review the decision context below before approving, rejecting, or delegating.</p>
      <div>{{actionButtons}}</div>
      <p style="font-size:12px;color:#5B6B70;">Or review in-app for full details. Request ref: {{workflowRequestId}}.</p>`),
    bodyTextTemplate: p(`{{employeeName}} submitted a leave request ({{leaveType}}) from {{startDate}} to {{endDate}} ({{duration}}). Reason: {{reason}}. Ref: {{workflowRequestId}}.`),
  },
  {
    templateCode: 'LEAVE_APPROVED',
    templateName: 'Leave Approved',
    module: 'absence',
    subjectTemplate: 'Your leave request has been approved ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Your {{leaveType}} request from {{startDate}} to {{endDate}} ({{duration}}) has been <strong>approved</strong>.</p>`),
    bodyTextTemplate: p(`Your {{leaveType}} ({{startDate}}–{{endDate}}) has been approved. Ref {{workflowRequestId}}.`),
  },
  {
    templateCode: 'LEAVE_REJECTED',
    templateName: 'Leave Rejected',
    module: 'absence',
    subjectTemplate: 'Your leave request was not approved ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Your {{leaveType}} request from {{startDate}} to {{endDate}} was <strong>not approved</strong>.</p><p>{{reason}}</p>`),
    bodyTextTemplate: p(`Your {{leaveType}} ({{startDate}}–{{endDate}}) was not approved. {{reason}}`),
  },
  {
    templateCode: 'LEAVE_CANCELLED',
    templateName: 'Leave Cancelled',
    module: 'absence',
    subjectTemplate: 'Leave request cancelled ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Your {{leaveType}} request from {{startDate}} to {{endDate}} has been <strong>cancelled</strong>.</p>`),
    bodyTextTemplate: p(`Your {{leaveType}} ({{startDate}}–{{endDate}}) has been cancelled.`),
  },
  {
    templateCode: 'WORKFLOW_PENDING_APPROVAL',
    templateName: 'Workflow Pending Approval',
    module: 'workflow',
    subjectTemplate: 'Action required: approval pending ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{managerName}},</p><p>A request from {{employeeName}} is awaiting your approval. Review the decision context below before approving, rejecting, or delegating.</p><p>{{delegationNotice}}</p><div>{{actionButtons}}</div>`),
    bodyTextTemplate: p(`A request from {{employeeName}} awaits your approval. Ref {{workflowRequestId}}.`),
  },
  {
    templateCode: 'WORKFLOW_APPROVED',
    templateName: 'Workflow Approved',
    module: 'workflow',
    subjectTemplate: 'Request approved ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Your request ({{workflowRequestId}}) has been <strong>approved</strong>.</p>`),
    bodyTextTemplate: p(`Your request {{workflowRequestId}} has been approved.`),
  },
  {
    templateCode: 'WORKFLOW_REJECTED',
    templateName: 'Workflow Rejected',
    module: 'workflow',
    subjectTemplate: 'Request not approved ({{workflowRequestId}})',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Your request ({{workflowRequestId}}) was <strong>not approved</strong>.</p><p>{{reason}}</p>`),
    bodyTextTemplate: p(`Your request {{workflowRequestId}} was not approved. {{reason}}`),
  },
  {
    templateCode: 'BIRTHDAY_GREETING',
    templateName: 'Birthday Greeting',
    module: 'engagement',
    subjectTemplate: 'Happy Birthday, {{employeeName}}! 🎉',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Wishing you a wonderful birthday from everyone at {{companyName}}!</p>`),
    bodyTextTemplate: p(`Happy Birthday, {{employeeName}}! — {{companyName}}`),
  },
  {
    templateCode: 'WORK_ANNIVERSARY',
    templateName: 'Work Anniversary',
    module: 'engagement',
    subjectTemplate: 'Congratulations on your work anniversary, {{employeeName}}!',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Thank you for your dedication to {{companyName}}. Congratulations on your work anniversary!</p>`),
    bodyTextTemplate: p(`Congratulations on your work anniversary, {{employeeName}}! — {{companyName}}`),
  },
  {
    templateCode: 'HR_ANNOUNCEMENT',
    templateName: 'HR Announcement',
    module: 'hr',
    subjectTemplate: '{{subject}}',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><div>{{announcementBody}}</div>`),
    bodyTextTemplate: p(`{{announcementBody}}`),
  },
  {
    templateCode: 'PAYROLL_NOTIFICATION',
    templateName: 'Payroll Notification',
    module: 'payroll',
    subjectTemplate: '{{subject}}',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><div>{{payrollBody}}</div><p style="font-size:12px;color:#5B6B70;">Date: {{currentDate}}</p>`),
    bodyTextTemplate: p(`{{payrollBody}}`),
  },
  {
    templateCode: 'EMPLOYEE_LETTER',
    templateName: 'Employee Letter',
    module: 'letters',
    subjectTemplate: '{{letterTypeName}} — {{letterNumber}}',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Please find your {{letterTypeName}} (Ref: {{letterNumber}}) attached.</p>`),
    bodyTextTemplate: p(`Your {{letterTypeName}} ({{letterNumber}}) is attached.`),
  },
  {
    templateCode: 'DOCUMENT_ACKNOWLEDGEMENT',
    templateName: 'Document Acknowledgement',
    module: 'documents',
    subjectTemplate: 'Acknowledgement required: {{documentName}}',
    bodyHtmlTemplate: p(`<p>Dear {{employeeName}},</p><p>Please review the decision context and acknowledge the document: <strong>{{documentName}}</strong>.</p><div>{{actionButtons}}</div>`),
    bodyTextTemplate: p(`Please acknowledge the document: {{documentName}}.`),
  },
  {
    templateCode: 'SYSTEM_ALERT',
    templateName: 'System Alert',
    module: 'system',
    subjectTemplate: '{{subject}}',
    bodyHtmlTemplate: p(`<div>{{alertBody}}</div><p style="font-size:12px;color:#5B6B70;">{{currentDate}}</p>`),
    bodyTextTemplate: p(`{{alertBody}}`),
  },
]

export const TEMPLATE_SEED_MAP: Record<string, TemplateSeed> = Object.fromEntries(
  TEMPLATE_SEEDS.map(t => [t.templateCode, t]),
)
