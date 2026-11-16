'use client'
/**
 * Communication Settings — client UI.
 * Premium enterprise admin layout: summary cards, tabbed configuration, provider
 * selection, Graph/SMTP forms with masked secrets, sender defaults, templates,
 * delivery logs, test email, and audit notes. Uses ONLY design tokens (no raw hex)
 * so light + dark mode stay readable.
 */
import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { useState, useTransition } from 'react'
import {
  Mail, Server, ShieldCheck, Send, FileText, ListChecks, Settings2,
  AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, Copy, Users,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import type { Locale } from '@/lib/i18n'
import {
  saveProviderSettings, setActiveProvider, saveSenderDefaults,
  saveTemplate, sendTestEmailAction, retryEmailMessageAction,
} from '@/modules/communication/actions'

// ── Types (mirror page props) ─────────────────────────────────────────────────
type ProviderType = 'GRAPH_API' | 'SMTP'
interface ProviderView {
  id: string
  providerType: ProviderType
  isActive: boolean
  graphTenantId: string | null
  graphClientId: string | null
  graphSenderMailbox: string | null
  graphSenderName: string | null
  graphAuthorityUrl: string | null
  graphBaseUrl: string | null
  graphMailSendEndpoint: string | null
  graphScope: string | null
  graphUseSharedMailbox: boolean
  smtpHost: string | null
  smtpPort: number | null
  smtpUsername: string | null
  smtpEncryption: 'NONE' | 'SSL' | 'TLS' | 'STARTTLS' | null
  smtpSenderEmail: string | null
  smtpSenderName: string | null
  smtpAuthRequired: boolean
  replyToEmail: string | null
  enableTracking: boolean
  enableWorkflowActions: boolean
  tokenExpiryMinutes: number
  retryCount: number
  retryIntervalSec: number
  lastTestedAt: string | null
  lastTestStatus: 'UNTESTED' | 'PASSED' | 'FAILED'
  lastTestError: string | null
  hasGraphSecret: boolean
  hasSmtpPassword: boolean
}
interface SenderView {
  defaultFromName: string | null; defaultFromEmail: string | null; defaultReplyTo: string | null
  hrSender: string | null; payrollSender: string | null; workflowSender: string | null
  systemSender: string | null; announcementSender: string | null; fallbackSender: string | null
}
interface TemplateView {
  id: string; templateCode: string; templateName: string; subjectTemplate: string
  bodyHtmlTemplate: string; bodyTextTemplate: string | null; module: string
  languageCode: string; isActive: boolean
}
interface LogView {
  id: string; sentAt: string | null; createdDate: string | null; recipientEmail: string
  subject: string | null; templateCode: string | null; module: string | null
  providerType: ProviderType | null; status: string; retryCount: number
  businessObjectType: string | null; workflowRequestId: string | null
  correlationId: string; lastError: string | null
}

interface Props {
  graph: ProviderView | null
  smtp: ProviderView | null
  senderDefaults: SenderView | null
  templates: TemplateView[]
  seedTemplates: { templateCode: string; templateName: string; module: string }[]
  activeProvider: ProviderType | null
  canOverride: boolean
  metrics: { sentToday: number; failedToday: number }
  logs: LogView[]
}

const MASK = '••••••••'
const TABS = [
  { id: 'provider', label: 'Provider', labelAr: 'المزوّد', icon: Settings2 },
  { id: 'graph', label: 'Graph API', labelAr: 'Graph API', icon: Mail },
  { id: 'smtp', label: 'SMTP', labelAr: 'SMTP', icon: Server },
  { id: 'senders', label: 'Sender Defaults', labelAr: 'إعدادات المرسل الافتراضية', icon: Users },
  { id: 'templates', label: 'Templates', labelAr: 'القوالب', icon: FileText },
  { id: 'logs', label: 'Delivery Logs', labelAr: 'سجلات التسليم', icon: ListChecks },
  { id: 'test', label: 'Test Email', labelAr: 'بريد اختبار', icon: Send },
  { id: 'audit', label: 'Audit', labelAr: 'التدقيق', icon: ShieldCheck },
] as const
type TabId = (typeof TABS)[number]['id']

// ── Shared atoms ──────────────────────────────────────────────────────────────
const card = 'rounded-xl border border-border bg-card p-6'
const labelCls = 'block text-xs font-medium text-ink-2 mb-1.5'
const inputCls = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-1 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/40'
const btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50'
const btnGhost = 'inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-1 hover:bg-accent-050 disabled:opacity-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>
}

function StatusBadge({ status, locale }: { status: ProviderView['lastTestStatus'] | 'ACTIVE' | 'INACTIVE' | 'NOT_CONFIGURED'; locale: Locale }) {
  const ar = locale === 'ar'
  const map: Record<string, { c: string; t: string; Icon: typeof CheckCircle2 }> = {
    PASSED: { c: 'text-[color:var(--accent-700)] bg-accent-050', t: ar ? 'مُختبَر' : 'Tested', Icon: CheckCircle2 },
    FAILED: { c: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300', t: ar ? 'فشل' : 'Failed', Icon: XCircle },
    UNTESTED: { c: 'text-ink-3 bg-surface', t: ar ? 'غير مُختبَر' : 'Untested', Icon: Clock },
    ACTIVE: { c: 'text-[color:var(--accent-700)] bg-accent-050', t: ar ? 'نشط' : 'Active', Icon: CheckCircle2 },
    INACTIVE: { c: 'text-ink-3 bg-surface', t: ar ? 'غير نشط' : 'Inactive', Icon: Clock },
    NOT_CONFIGURED: { c: 'text-ink-3 bg-surface', t: ar ? 'غير مُكوَّن' : 'Not Configured', Icon: AlertTriangle },
  }
  const s = map[status] ?? map.UNTESTED
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${s.c}`}>
      <s.Icon className="h-3.5 w-3.5" />{s.t}
    </span>
  )
}

export default function CommunicationSettingsClient(props: Props) {
  const { toast } = useToast()
  const locale = useLocale()
  const [tab, setTab] = useState<TabId>('provider')
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const r = await fn()
      if (r.ok) toast({ title: okMsg })
      else toast({ title: locale === 'ar' ? 'فشل الإجراء' : 'Action failed', description: r.error, variant: 'destructive' })
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2">
      {/* Header */}
      <header className="space-y-1">
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'إعدادات الاتصالات' : 'Communication Settings'}</PageTitle>
        <p className="text-sm text-ink-3">
          {locale === 'ar'
            ? 'تهيئة كيفية إرسال AVANIIS HR لرسائل سير العمل والموارد البشرية والرواتب والإعلانات والنظام. اختر Microsoft Graph API أو SMTP، وأدر القوالب، وراقب التسليم.'
            : 'Configure how AVANIIS HR sends workflow, HR, payroll, announcement, and system emails. Choose Microsoft Graph API or SMTP, manage templates, and monitor delivery.'}
        </p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label={locale === 'ar' ? 'المزوّد النشط' : 'Active Provider'}
          value={props.activeProvider === 'GRAPH_API' ? 'Microsoft Graph' : props.activeProvider === 'SMTP' ? 'SMTP' : (locale === 'ar' ? 'لا يوجد' : 'None')}
          Icon={Mail} />
        <SummaryCard label={locale === 'ar' ? 'حالة آخر اختبار' : 'Last Test Status'}
          value={(props.activeProvider === 'GRAPH_API' ? props.graph : props.smtp)?.lastTestStatus ?? '—'}
          Icon={ShieldCheck} />
        <SummaryCard label={locale === 'ar' ? 'الرسائل المُرسَلة اليوم' : 'Emails Sent Today'} value={String(props.metrics.sentToday)} Icon={Send} />
        <SummaryCard label={locale === 'ar' ? 'الفاشلة اليوم' : 'Failed Today'} value={String(props.metrics.failedToday)} Icon={AlertTriangle}
          tone={props.metrics.failedToday > 0 ? 'warn' : undefined} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink-1'
            }`}>
            <t.icon className="h-4 w-4" />{locale === 'ar' ? t.labelAr : t.label}
          </button>
        ))}
      </div>

      {tab === 'provider' && <ProviderTab {...props} pending={pending} run={run} />}
      {tab === 'graph' && <GraphForm row={props.graph} pending={pending} run={run} />}
      {tab === 'smtp' && <SmtpForm row={props.smtp} pending={pending} run={run} />}
      {tab === 'senders' && <SendersForm row={props.senderDefaults} pending={pending} run={run} />}
      {tab === 'templates' && <TemplatesTab templates={props.templates} seeds={props.seedTemplates} pending={pending} run={run} />}
      {tab === 'logs' && <LogsTab logs={props.logs} pending={pending} run={run} toast={toast} />}
      {tab === 'test' && <TestEmailTab graph={props.graph} smtp={props.smtp} pending={pending} run={run} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

function SummaryCard({ label, value, Icon, tone }: { label: string; value: string; Icon: typeof Mail; tone?: 'warn' }) {
  return (
    <div className={card + ' flex items-center gap-4'}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone === 'warn' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300' : 'bg-accent-050 text-accent'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-ink-3">{label}</div>
        <div className="text-lg font-semibold text-ink-1">{value}</div>
      </div>
    </div>
  )
}

// ── Provider selection + activation ───────────────────────────────────────────
function ProviderTab(props: Props & { pending: boolean; run: ReturnType<typeof useRunType> }) {
  const { graph, smtp, activeProvider, canOverride, pending, run } = props
  const locale = useLocale()
  const [override, setOverride] = useState('')

  function activate(p: ProviderType, tested: boolean) {
    if (!tested && !canOverride) {
      props.run(async () => ({ ok: false, error: locale === 'ar' ? 'يجب أن يجتاز المزوّد اختبار بريد إلكتروني قبل التفعيل.' : 'Provider must pass a test email before activation.' }), '')
      return
    }
    run(() => setActiveProvider({ providerType: p, overrideReason: tested ? undefined : override }), `${p === 'GRAPH_API' ? 'Graph API' : 'SMTP'} ${locale === 'ar' ? 'تم التفعيل' : 'activated'}`)
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle className="mb-1 text-base font-semibold text-ink-1">{locale === 'ar' ? 'مزوّد تسليم البريد الإلكتروني' : 'Email Delivery Provider'}</SectionTitle>
        <p className="mb-5 text-sm text-ink-3">{locale === 'ar' ? 'يمكن أن يكون مزوّد واحد فقط نشطاً في كل مرة. قم بتهيئة المزوّد في علامة تبويبه، وأرسل بريد اختبار، ثم فعّله هنا.' : 'Only one provider can be active at a time. Configure a provider in its tab, run a test email, then activate it here.'}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProviderCard
            title="Microsoft Graph API" desc={locale === 'ar' ? 'الإرسال عبر Microsoft 365 / تسجيل تطبيق Entra.' : 'Send via Microsoft 365 / Entra app registration.'}
            Icon={Mail} row={graph} active={activeProvider === 'GRAPH_API'}
            onActivate={() => activate('GRAPH_API', graph?.lastTestStatus === 'PASSED')}
            pending={pending} locale={locale}
          />
          <ProviderCard
            title="SMTP" desc={locale === 'ar' ? 'الإرسال عبر أي خادم SMTP قياسي (Office 365، مُرحِّل، محلي).' : 'Send via any standard SMTP server (Office 365, relay, on-prem).'}
            Icon={Server} row={smtp} active={activeProvider === 'SMTP'}
            onActivate={() => activate('SMTP', smtp?.lastTestStatus === 'PASSED')}
            pending={pending} locale={locale}
          />
        </div>
        {canOverride && (
          <div className="mt-5 rounded-lg border border-dashed border-border bg-surface p-4">
            <label className={labelCls}>{locale === 'ar' ? 'سبب تجاوز التفعيل لمسؤول النظام الأعلى (يُستخدم فقط إذا لم يجتز المزوّد الاختبار)' : 'SUPER_ADMIN activation override reason (only used if the provider hasn’t passed a test)'}</label>
            <input className={inputCls} value={override} onChange={e => setOverride(e.target.value)} placeholder={locale === 'ar' ? 'مثال: تم التحقق من بيانات الاعتماد خارج النظام؛ التفعيل قبل نافذة الاختبار' : 'e.g. credentials verified out-of-band; activating ahead of test window'} />
          </div>
        )}
      </div>
    </div>
  )
}

function ProviderCard({ title, desc, Icon, row, active, onActivate, pending, locale }: {
  title: string; desc: string; Icon: typeof Mail; row: ProviderView | null; active: boolean
  onActivate: () => void; pending: boolean; locale: Locale
}) {
  const configured = Boolean(row)
  return (
    <div className={`rounded-xl border p-5 ${active ? 'border-accent ring-1 ring-accent/30' : 'border-border'} bg-card`}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-050 text-accent"><Icon className="h-5 w-5" /></div>
          <div><div className="font-semibold text-ink-1">{title}</div><div className="text-xs text-ink-3">{desc}</div></div>
        </div>
        <StatusBadge status={active ? 'ACTIVE' : configured ? 'INACTIVE' : 'NOT_CONFIGURED'} locale={locale} />
      </div>
      <div className="mb-4 flex items-center gap-2 text-xs text-ink-3">
        <StatusBadge status={row?.lastTestStatus ?? 'UNTESTED'} locale={locale} />
        {row?.lastTestedAt && <span>· {locale === 'ar' ? 'آخر اختبار' : 'last tested'} {new Date(row.lastTestedAt).toLocaleString()}</span>}
      </div>
      <button className={btnPrimary} disabled={pending || !configured || active} onClick={onActivate}>
        {active ? (locale === 'ar' ? 'نشط حالياً' : 'Currently Active') : (locale === 'ar' ? 'تفعيل' : 'Activate')}
      </button>
    </div>
  )
}

// helper type for run()
function useRunType() { return (_fn: () => Promise<{ ok: boolean; error?: string }>, _ok: string) => {} }

// ── Graph form ────────────────────────────────────────────────────────────────
function GraphForm({ row, pending, run }: { row: ProviderView | null; pending: boolean; run: ReturnType<typeof useRunType> }) {
  const locale = useLocale()
  const [f, setF] = useState({
    graphTenantId: row?.graphTenantId ?? '',
    graphClientId: row?.graphClientId ?? '',
    graphClientSecret: row?.hasGraphSecret ? MASK : '',
    graphSenderMailbox: row?.graphSenderMailbox ?? '',
    graphSenderName: row?.graphSenderName ?? '',
    graphAuthorityUrl: row?.graphAuthorityUrl ?? 'https://login.microsoftonline.com',
    graphBaseUrl: row?.graphBaseUrl ?? 'https://graph.microsoft.com/v1.0',
    graphMailSendEndpoint: row?.graphMailSendEndpoint ?? '',
    graphScope: row?.graphScope ?? 'https://graph.microsoft.com/.default',
    graphUseSharedMailbox: row?.graphUseSharedMailbox ?? false,
    replyToEmail: row?.replyToEmail ?? '',
    enableTracking: row?.enableTracking ?? false,
    enableWorkflowActions: row?.enableWorkflowActions ?? true,
    tokenExpiryMinutes: row?.tokenExpiryMinutes ?? 2880,
    retryCount: row?.retryCount ?? 3,
    retryIntervalSec: row?.retryIntervalSec ?? 300,
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  function save() {
    run(() => saveProviderSettings({ providerType: 'GRAPH_API', ...f }), locale === 'ar' ? 'تم حفظ إعدادات Graph API' : 'Graph API settings saved')
  }

  return (
    <div className="space-y-4">
      <SecretBanner />
      <div className={card + ' space-y-5'}>
        <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'إعدادات Microsoft Graph API' : 'Microsoft Graph API Settings'}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={locale === 'ar' ? 'معرّف المستأجر (Tenant ID)' : 'Tenant ID'}><input className={inputCls} value={f.graphTenantId} onChange={set('graphTenantId')} /></Field>
          <Field label={locale === 'ar' ? 'معرّف العميل (Client ID)' : 'Client ID'}><input className={inputCls} value={f.graphClientId} onChange={set('graphClientId')} /></Field>
          <Field label={locale === 'ar' ? 'سر العميل (Client Secret)' : 'Client Secret'}><input type="password" className={inputCls} value={f.graphClientSecret} onChange={set('graphClientSecret')} placeholder={locale === 'ar' ? 'أدخل قيمة للتعيين / التدوير' : 'Enter to set / rotate'} /></Field>
          <Field label={locale === 'ar' ? 'صندوق بريد المرسِل' : 'Sender Mailbox'}><input className={inputCls} value={f.graphSenderMailbox} onChange={set('graphSenderMailbox')} placeholder="hr@company.com" /></Field>
          <Field label={locale === 'ar' ? 'الاسم المعروض للمرسِل' : 'Sender Display Name'}><input className={inputCls} value={f.graphSenderName} onChange={set('graphSenderName')} /></Field>
          <Field label={locale === 'ar' ? 'بريد الرد (Reply-To)' : 'Reply-To Email'}><input className={inputCls} value={f.replyToEmail} onChange={set('replyToEmail')} /></Field>
          <Field label={locale === 'ar' ? 'عنوان الجهة المصدِّقة (Authority URL)' : 'Authority URL'}><input className={inputCls} value={f.graphAuthorityUrl} onChange={set('graphAuthorityUrl')} /></Field>
          <Field label={locale === 'ar' ? 'عنوان Graph الأساسي' : 'Graph Base URL'}><input className={inputCls} value={f.graphBaseUrl} onChange={set('graphBaseUrl')} /></Field>
          <Field label={locale === 'ar' ? 'نقطة إرسال البريد (تجاوز اختياري)' : 'Mail Send Endpoint (optional override)'}><input className={inputCls} value={f.graphMailSendEndpoint} onChange={set('graphMailSendEndpoint')} placeholder={locale === 'ar' ? 'يُشتق تلقائياً من العنوان الأساسي + صندوق البريد' : 'auto-derived from base + mailbox'} /></Field>
          <Field label={locale === 'ar' ? 'النطاق (Scope)' : 'Scope'}><input className={inputCls} value={f.graphScope} onChange={set('graphScope')} /></Field>
          <Field label={locale === 'ar' ? 'مدة انتهاء رمز روابط الاعتماد (دقائق)' : 'Token Expiry for Approval Links (minutes)'}><input type="number" className={inputCls} value={f.tokenExpiryMinutes} onChange={set('tokenExpiryMinutes')} /></Field>
          <Field label={locale === 'ar' ? 'عدد محاولات الإعادة' : 'Retry Count'}><input type="number" className={inputCls} value={f.retryCount} onChange={set('retryCount')} /></Field>
          <Field label={locale === 'ar' ? 'فاصل الإعادة (ثوانٍ)' : 'Retry Interval (seconds)'}><input type="number" className={inputCls} value={f.retryIntervalSec} onChange={set('retryIntervalSec')} /></Field>
        </div>
        <div className="flex flex-wrap gap-5">
          <Toggle label={locale === 'ar' ? 'استخدام صندوق بريد مشترك' : 'Use Shared Mailbox'} checked={f.graphUseSharedMailbox} onChange={set('graphUseSharedMailbox')} />
          <Toggle label={locale === 'ar' ? 'تفعيل تتبع البريد' : 'Enable Email Tracking'} checked={f.enableTracking} onChange={set('enableTracking')} />
          <Toggle label={locale === 'ar' ? 'تفعيل إجراءات البريد لسير العمل' : 'Enable Workflow Email Actions'} checked={f.enableWorkflowActions} onChange={set('enableWorkflowActions')} />
        </div>
        <div><button className={btnPrimary} disabled={pending} onClick={save}>{locale === 'ar' ? 'حفظ إعدادات Graph' : 'Save Graph Settings'}</button></div>
      </div>
    </div>
  )
}

// ── SMTP form ─────────────────────────────────────────────────────────────────
function SmtpForm({ row, pending, run }: { row: ProviderView | null; pending: boolean; run: ReturnType<typeof useRunType> }) {
  const locale = useLocale()
  const [f, setF] = useState({
    smtpHost: row?.smtpHost ?? '',
    smtpPort: row?.smtpPort ?? 587,
    smtpUsername: row?.smtpUsername ?? '',
    smtpPassword: row?.hasSmtpPassword ? MASK : '',
    smtpEncryption: row?.smtpEncryption ?? 'STARTTLS',
    smtpSenderEmail: row?.smtpSenderEmail ?? '',
    smtpSenderName: row?.smtpSenderName ?? '',
    smtpAuthRequired: row?.smtpAuthRequired ?? true,
    replyToEmail: row?.replyToEmail ?? '',
    enableTracking: row?.enableTracking ?? false,
    enableWorkflowActions: row?.enableWorkflowActions ?? true,
    tokenExpiryMinutes: row?.tokenExpiryMinutes ?? 2880,
    retryCount: row?.retryCount ?? 3,
    retryIntervalSec: row?.retryIntervalSec ?? 300,
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  function save() {
    run(() => saveProviderSettings({ providerType: 'SMTP', ...f, smtpPort: Number(f.smtpPort) }), locale === 'ar' ? 'تم حفظ إعدادات SMTP' : 'SMTP settings saved')
  }

  return (
    <div className="space-y-4">
      <SecretBanner />
      <div className={card + ' space-y-5'}>
        <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'إعدادات SMTP' : 'SMTP Settings'}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={locale === 'ar' ? 'مضيف SMTP' : 'SMTP Host'}><input className={inputCls} value={f.smtpHost} onChange={set('smtpHost')} placeholder="smtp.office365.com" /></Field>
          <Field label={locale === 'ar' ? 'منفذ SMTP' : 'SMTP Port'}><input type="number" className={inputCls} value={f.smtpPort} onChange={set('smtpPort')} /></Field>
          <Field label={locale === 'ar' ? 'اسم المستخدم' : 'Username'}><input className={inputCls} value={f.smtpUsername} onChange={set('smtpUsername')} /></Field>
          <Field label={locale === 'ar' ? 'كلمة المرور' : 'Password'}><input type="password" className={inputCls} value={f.smtpPassword} onChange={set('smtpPassword')} placeholder={locale === 'ar' ? 'أدخل قيمة للتعيين / التدوير' : 'Enter to set / rotate'} /></Field>
          <Field label={locale === 'ar' ? 'نوع التشفير' : 'Encryption Type'}>
            <select className={inputCls} value={f.smtpEncryption} onChange={e => setF({ ...f, smtpEncryption: e.target.value as typeof f.smtpEncryption })}>
              <option value="NONE">{locale === 'ar' ? 'بدون' : 'None'}</option><option value="SSL">SSL</option><option value="TLS">TLS</option><option value="STARTTLS">STARTTLS</option>
            </select>
          </Field>
          <Field label={locale === 'ar' ? 'بريد المرسِل' : 'Sender Email'}><input className={inputCls} value={f.smtpSenderEmail} onChange={set('smtpSenderEmail')} /></Field>
          <Field label={locale === 'ar' ? 'الاسم المعروض للمرسِل' : 'Sender Display Name'}><input className={inputCls} value={f.smtpSenderName} onChange={set('smtpSenderName')} /></Field>
          <Field label={locale === 'ar' ? 'بريد الرد (Reply-To)' : 'Reply-To Email'}><input className={inputCls} value={f.replyToEmail} onChange={set('replyToEmail')} /></Field>
          <Field label={locale === 'ar' ? 'مدة انتهاء رمز روابط الاعتماد (دقائق)' : 'Token Expiry for Approval Links (minutes)'}><input type="number" className={inputCls} value={f.tokenExpiryMinutes} onChange={set('tokenExpiryMinutes')} /></Field>
          <Field label={locale === 'ar' ? 'عدد محاولات الإعادة' : 'Retry Count'}><input type="number" className={inputCls} value={f.retryCount} onChange={set('retryCount')} /></Field>
          <Field label={locale === 'ar' ? 'فاصل الإعادة (ثوانٍ)' : 'Retry Interval (seconds)'}><input type="number" className={inputCls} value={f.retryIntervalSec} onChange={set('retryIntervalSec')} /></Field>
        </div>
        <div className="flex flex-wrap gap-5">
          <Toggle label={locale === 'ar' ? 'المصادقة مطلوبة' : 'Authentication Required'} checked={f.smtpAuthRequired} onChange={set('smtpAuthRequired')} />
          <Toggle label={locale === 'ar' ? 'تفعيل تتبع البريد' : 'Enable Email Tracking'} checked={f.enableTracking} onChange={set('enableTracking')} />
          <Toggle label={locale === 'ar' ? 'تفعيل إجراءات البريد لسير العمل' : 'Enable Workflow Email Actions'} checked={f.enableWorkflowActions} onChange={set('enableWorkflowActions')} />
        </div>
        <div><button className={btnPrimary} disabled={pending} onClick={save}>{locale === 'ar' ? 'حفظ إعدادات SMTP' : 'Save SMTP Settings'}</button></div>
      </div>
    </div>
  )
}

// ── Sender defaults ───────────────────────────────────────────────────────────
function SendersForm({ row, pending, run }: { row: SenderView | null; pending: boolean; run: ReturnType<typeof useRunType> }) {
  const locale = useLocale()
  const [f, setF] = useState({
    defaultFromName: row?.defaultFromName ?? '',
    defaultFromEmail: row?.defaultFromEmail ?? '',
    defaultReplyTo: row?.defaultReplyTo ?? '',
    hrSender: row?.hrSender ?? '',
    payrollSender: row?.payrollSender ?? '',
    workflowSender: row?.workflowSender ?? '',
    systemSender: row?.systemSender ?? '',
    announcementSender: row?.announcementSender ?? '',
    fallbackSender: row?.fallbackSender ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className={card + ' space-y-5'}>
      <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'إعدادات مرسِل البريد الافتراضية' : 'Email Sender Defaults'}</SectionTitle>
      <p className="text-sm text-ink-3">{locale === 'ar' ? 'هويات المرسِل لكل وحدة. اتركها فارغة للعودة إلى عنوان المرسِل الافتراضي.' : 'Per-module sender identities. Leave blank to fall back to the default from-address.'}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={locale === 'ar' ? 'اسم المرسِل الافتراضي' : 'Default From Name'}><input className={inputCls} value={f.defaultFromName} onChange={set('defaultFromName')} /></Field>
        <Field label={locale === 'ar' ? 'بريد المرسِل الافتراضي' : 'Default From Email'}><input className={inputCls} value={f.defaultFromEmail} onChange={set('defaultFromEmail')} /></Field>
        <Field label={locale === 'ar' ? 'بريد الرد الافتراضي' : 'Default Reply-To'}><input className={inputCls} value={f.defaultReplyTo} onChange={set('defaultReplyTo')} /></Field>
        <Field label={locale === 'ar' ? 'مرسِل اتصالات الموارد البشرية' : 'HR Communication Sender'}><input className={inputCls} value={f.hrSender} onChange={set('hrSender')} /></Field>
        <Field label={locale === 'ar' ? 'مرسِل اتصالات الرواتب' : 'Payroll Communication Sender'}><input className={inputCls} value={f.payrollSender} onChange={set('payrollSender')} /></Field>
        <Field label={locale === 'ar' ? 'مرسِل إشعارات سير العمل' : 'Workflow Notification Sender'}><input className={inputCls} value={f.workflowSender} onChange={set('workflowSender')} /></Field>
        <Field label={locale === 'ar' ? 'مرسِل إشعارات النظام' : 'System Notification Sender'}><input className={inputCls} value={f.systemSender} onChange={set('systemSender')} /></Field>
        <Field label={locale === 'ar' ? 'مرسِل أعياد الميلاد/الإعلانات' : 'Birthday/Announcement Sender'}><input className={inputCls} value={f.announcementSender} onChange={set('announcementSender')} /></Field>
        <Field label={locale === 'ar' ? 'المرسِل الاحتياطي' : 'Fallback Sender'}><input className={inputCls} value={f.fallbackSender} onChange={set('fallbackSender')} /></Field>
      </div>
      <div><button className={btnPrimary} disabled={pending} onClick={() => run(() => saveSenderDefaults(f), locale === 'ar' ? 'تم حفظ مرسلي البريد الافتراضيين' : 'Sender defaults saved')}>{locale === 'ar' ? 'حفظ المرسلين' : 'Save Senders'}</button></div>
    </div>
  )
}

// ── Templates ─────────────────────────────────────────────────────────────────
function TemplatesTab({ templates, seeds, pending, run }: {
  templates: TemplateView[]; seeds: { templateCode: string; templateName: string; module: string }[]
  pending: boolean; run: ReturnType<typeof useRunType>
}) {
  const locale = useLocale()
  const [edit, setEdit] = useState<TemplateView | null>(null)
  const byCode = new Map(templates.map(t => [t.templateCode, t]))

  if (edit) {
    return <TemplateEditor t={edit} pending={pending} onCancel={() => setEdit(null)}
      onSave={(payload) => run(() => saveTemplate(payload), locale === 'ar' ? 'تم حفظ القالب' : 'Template saved')} />
  }

  return (
    <div className={card}>
      <SectionTitle className="mb-1 text-base font-semibold text-ink-1">{locale === 'ar' ? 'قوالب البريد الإلكتروني' : 'Email Templates'}</SectionTitle>
      <p className="mb-4 text-sm text-ink-3">{locale === 'ar' ? '14 قالباً للمنصة. تُخزَّن التجاوزات في قاعدة البيانات؛ وتستخدم القوالب غير المُعدَّلة الإعدادات الافتراضية المدمجة ذات العلامة التجارية.' : '14 platform templates. Overrides are stored in the database; unedited templates use built-in branded defaults.'}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-ink-3">
            <th className="py-2 pr-4">{locale === 'ar' ? 'القالب' : 'Template'}</th><th className="py-2 pr-4">{locale === 'ar' ? 'الرمز' : 'Code'}</th><th className="py-2 pr-4">{locale === 'ar' ? 'الوحدة' : 'Module'}</th><th className="py-2 pr-4">{locale === 'ar' ? 'الحالة' : 'Status'}</th><th className="py-2"></th>
          </tr></thead>
          <tbody>
            {seeds.map(s => {
              const override = byCode.get(s.templateCode)
              return (
                <tr key={s.templateCode} className="border-b border-border/60">
                  <td className="py-2.5 pr-4 text-ink-1">{s.templateName}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink-3">{s.templateCode}</td>
                  <td className="py-2.5 pr-4 text-ink-3">{s.module}</td>
                  <td className="py-2.5 pr-4">{override ? <StatusBadge status="ACTIVE" locale={locale} /> : <span className="text-xs text-ink-4">{locale === 'ar' ? 'افتراضي' : 'Default'}</span>}</td>
                  <td className="py-2.5 text-right">
                    <button className={btnGhost} onClick={() => setEdit(override ?? {
                      id: '', templateCode: s.templateCode, templateName: s.templateName,
                      subjectTemplate: '', bodyHtmlTemplate: '', bodyTextTemplate: '', module: s.module,
                      languageCode: 'en', isActive: true,
                    })}>{tk(locale, 'common.edit')}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TemplateEditor({ t, pending, onSave, onCancel }: {
  t: TemplateView; pending: boolean
  onSave: (p: Record<string, unknown>) => void; onCancel: () => void
}) {
  const locale = useLocale()
  const [f, setF] = useState({
    templateName: t.templateName, subjectTemplate: t.subjectTemplate,
    bodyHtmlTemplate: t.bodyHtmlTemplate, bodyTextTemplate: t.bodyTextTemplate ?? '',
    languageCode: t.languageCode as 'en' | 'ar', isActive: t.isActive,
  })
  return (
    <div className={card + ' space-y-4'}>
      <div className="flex items-center justify-between">
        <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'تعديل القالب — ' : 'Edit Template — '}<span className="font-mono text-sm text-ink-3">{t.templateCode}</span></SectionTitle>
        <button className={btnGhost} onClick={onCancel}>{tk(locale, 'common.back')}</button>
      </div>
      <Field label={locale === 'ar' ? 'اسم القالب' : 'Template Name'}><input className={inputCls} value={f.templateName} onChange={e => setF({ ...f, templateName: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'قالب الموضوع' : 'Subject Template'}><input className={inputCls} value={f.subjectTemplate} onChange={e => setF({ ...f, subjectTemplate: e.target.value })} placeholder="Leave for {{employeeName}}" /></Field>
      <Field label={locale === 'ar' ? 'النص (HTML) — يدعم {{placeholders}}' : 'Body (HTML) — supports {{placeholders}}'}>
        <textarea className={inputCls + ' min-h-[220px] font-mono text-xs'} value={f.bodyHtmlTemplate} onChange={e => setF({ ...f, bodyHtmlTemplate: e.target.value })} />
      </Field>
      <Field label={locale === 'ar' ? 'النص (نص عادي، اختياري)' : 'Body (plain text, optional)'}>
        <textarea className={inputCls + ' min-h-[100px] font-mono text-xs'} value={f.bodyTextTemplate} onChange={e => setF({ ...f, bodyTextTemplate: e.target.value })} />
      </Field>
      <div className="flex items-center gap-5">
        <Field label={locale === 'ar' ? 'اللغة' : 'Language'}>
          <select className={inputCls} value={f.languageCode} onChange={e => setF({ ...f, languageCode: e.target.value as 'en' | 'ar' })}>
            <option value="en">English</option><option value="ar">العربية</option>
          </select>
        </Field>
      </div>
      <button className={btnPrimary} disabled={pending} onClick={() => onSave({
        id: t.id || undefined, templateCode: t.templateCode, module: t.module, ...f,
      })}>{locale === 'ar' ? 'حفظ القالب' : 'Save Template'}</button>
    </div>
  )
}

// ── Delivery logs ─────────────────────────────────────────────────────────────
function LogsTab({ logs, pending, run, toast }: {
  logs: LogView[]; pending: boolean; run: ReturnType<typeof useRunType>
  toast: ReturnType<typeof useToast>['toast']
}) {
  const locale = useLocale()
  const [q, setQ] = useState({ status: '', provider: '', recipient: '', failedOnly: false })
  const filtered = logs.filter(l =>
    (!q.status || l.status === q.status) &&
    (!q.provider || l.providerType === q.provider) &&
    (!q.recipient || l.recipientEmail.toLowerCase().includes(q.recipient.toLowerCase())) &&
    (!q.failedOnly || l.status === 'FAILED'),
  )
  return (
    <div className={card}>
      <SectionTitle className="mb-4 text-base font-semibold text-ink-1">{locale === 'ar' ? 'سجلات التسليم' : 'Delivery Logs'}</SectionTitle>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={locale === 'ar' ? 'المستلِم' : 'Recipient'}><input className={inputCls + ' w-56'} value={q.recipient} onChange={e => setQ({ ...q, recipient: e.target.value })} placeholder={locale === 'ar' ? 'بحث بالبريد الإلكتروني' : 'search email'} /></Field>
        <Field label={locale === 'ar' ? 'الحالة' : 'Status'}>
          <select className={inputCls + ' w-40'} value={q.status} onChange={e => setQ({ ...q, status: e.target.value })}>
            <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>{['QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={locale === 'ar' ? 'المزوّد' : 'Provider'}>
          <select className={inputCls + ' w-40'} value={q.provider} onChange={e => setQ({ ...q, provider: e.target.value })}>
            <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option><option value="GRAPH_API">Graph API</option><option value="SMTP">SMTP</option>
          </select>
        </Field>
        <Toggle label={locale === 'ar' ? 'الفاشلة فقط' : 'Failed only'} checked={q.failedOnly} onChange={e => setQ({ ...q, failedOnly: e.target.checked })} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-ink-3">
            {(locale === 'ar'
              ? ['الوقت', 'المستلِم', 'الموضوع', 'المزوّد', 'القالب', 'الحالة', 'الإعادات', 'الكائن', '']
              : ['Time', 'Recipient', 'Subject', 'Provider', 'Template', 'Status', 'Retries', 'Object', '']
            ).map((h, idx) => <th key={h || `col-${idx}`} className="py-2 pr-3">{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-sm text-ink-4">{locale === 'ar' ? 'لا توجد رسائل مطابقة لهذه المرشحات.' : 'No emails match these filters.'}</td></tr>}
            {filtered.map(l => (
              <tr key={l.id} className="border-b border-border/60 align-top">
                <td className="py-2.5 pr-3 text-xs text-ink-3">{new Date(l.sentAt ?? l.createdDate ?? '').toLocaleString()}</td>
                <td className="py-2.5 pr-3 text-ink-1">{l.recipientEmail}</td>
                <td className="py-2.5 pr-3 text-ink-2">{l.subject ?? '—'}</td>
                <td className="py-2.5 pr-3 text-ink-3">{l.providerType ?? '—'}</td>
                <td className="py-2.5 pr-3 font-mono text-xs text-ink-3">{l.templateCode ?? '—'}</td>
                <td className="py-2.5 pr-3"><LogStatus status={l.status} /></td>
                <td className="py-2.5 pr-3 text-ink-3">{l.retryCount}</td>
                <td className="py-2.5 pr-3 text-xs text-ink-3">{l.businessObjectType ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex gap-2">
                    <button title={locale === 'ar' ? 'نسخ معرّف الارتباط' : 'Copy correlation ID'} className={btnGhost + ' px-2 py-1'} onClick={() => { navigator.clipboard?.writeText(l.correlationId); toast({ title: locale === 'ar' ? 'تم نسخ معرّف الارتباط' : 'Correlation ID copied' }) }}><Copy className="h-3.5 w-3.5" /></button>
                    {l.status === 'FAILED' && <button title={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} className={btnGhost + ' px-2 py-1'} disabled={pending} onClick={() => run(() => retryEmailMessageAction(l.id), locale === 'ar' ? 'تمت إعادة إدراج البريد في قائمة الانتظار' : 'Email re-queued')}><RefreshCw className="h-3.5 w-3.5" /></button>}
                  </div>
                  {l.lastError && <div className="mt-1 max-w-xs truncate text-xs text-red-600 dark:text-red-300" title={l.lastError}>{l.lastError}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LogStatus({ status }: { status: string }) {
  const c = status === 'SENT' ? 'text-[color:var(--accent-700)] bg-accent-050'
    : status === 'FAILED' ? 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300'
    : 'text-ink-3 bg-surface'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{status}</span>
}

// ── Test email ────────────────────────────────────────────────────────────────
function TestEmailTab({ graph, smtp, pending, run }: {
  graph: ProviderView | null; smtp: ProviderView | null; pending: boolean; run: ReturnType<typeof useRunType>
}) {
  const locale = useLocale()
  const [providerType, setProviderType] = useState<ProviderType>(graph ? 'GRAPH_API' : 'SMTP')
  const [recipient, setRecipient] = useState('')
  return (
    <div className={card + ' max-w-xl space-y-5'}>
      <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'إرسال بريد اختبار' : 'Send Test Email'}</SectionTitle>
      <p className="text-sm text-ink-3">{locale === 'ar' ? 'يتحقق من بيانات الاعتماد، وصندوق بريد المرسِل، والاتصال، وإذن الإرسال. تُعرض الأخطاء دون كشف الأسرار. يؤدي الاختبار الناجح إلى وسم المزوّد كمُختبَر (مطلوب قبل التفعيل).' : 'Validates credentials, sender mailbox, connectivity and send permission. Errors are shown without exposing secrets. A successful test marks the provider as Tested (required before activation).'}</p>
      <Field label={locale === 'ar' ? 'المزوّد' : 'Provider'}>
        <select className={inputCls} value={providerType} onChange={e => setProviderType(e.target.value as ProviderType)}>
          <option value="GRAPH_API" disabled={!graph}>Microsoft Graph API</option>
          <option value="SMTP" disabled={!smtp}>SMTP</option>
        </select>
      </Field>
      <Field label={locale === 'ar' ? 'بريد المستلِم' : 'Recipient Email'}><input className={inputCls} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="you@company.com" /></Field>
      <button className={btnPrimary} disabled={pending || !recipient}
        onClick={() => run(() => sendTestEmailAction({ providerType, recipient }), locale === 'ar' ? 'تم إرسال بريد الاختبار — تم وسم المزوّد كمُختبَر' : 'Test email sent — provider marked Tested')}>
        <Send className="h-4 w-4" />{locale === 'ar' ? 'إرسال بريد اختبار' : 'Send Test Email'}
      </button>
    </div>
  )
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function AuditTab() {
  const locale = useLocale()
  return (
    <div className={card + ' space-y-3'}>
      <SectionTitle className="text-base font-semibold text-ink-1">{locale === 'ar' ? 'الأمان والتدقيق' : 'Security & Audit'}</SectionTitle>
      <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
        <li>{locale === 'ar' ? 'تُسجَّل جميع تغييرات تهيئة المزوّد والتفعيلات ومحاولات الاختبار وتعديلات القوالب وإعادات المحاولة في سجل التدقيق غير القابل للتغيير.' : 'All provider configuration changes, activations, test attempts, template edits and retries are recorded in the immutable audit log.'}</li>
        <li>{locale === 'ar' ? 'تُدقَّق قرارات اعتماد البريد عبر القناة' : 'Email approval decisions are audited with channel'} <code className="font-mono text-xs">EMAIL_GRAPH</code> {locale === 'ar' ? 'أو' : 'or'} <code className="font-mono text-xs">EMAIL_SMTP</code> {locale === 'ar' ? 'بحسب المزوّد النشط.' : 'depending on the active provider.'}</li>
        <li>{locale === 'ar' ? 'الأسرار (سر عميل Graph، كلمة مرور SMTP) مشفّرة بمعيار AES-256-GCM أثناء التخزين ولا تُعاد أبداً إلى المتصفح.' : 'Secrets (Graph client secret, SMTP password) are AES-256-GCM encrypted at rest and never returned to the browser.'}</li>
        <li>{locale === 'ar' ? 'روابط الاعتماد موقَّعة، وتُستخدم لمرة واحدة، ومحدودة بوقت؛ وتطبّق القرارات عبر محرك سير العمل الحالي (مع فرض التحكم في الوصول وفحوصات الحالة).' : 'Approval links are signed, single-use, and time-bound; they apply decisions through the existing workflow engine (RBAC + state checks enforced).'}</li>
      </ul>
    </div>
  )
}

// ── Small UI atoms ────────────────────────────────────────────────────────────
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-border text-accent focus:ring-accent" />
      {label}
    </label>
  )
}

function SecretBanner() {
  const locale = useLocale()
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{locale === 'ar' ? 'الأسرار مشفّرة أثناء التخزين ولا تُعرض أبداً بعد الحفظ. اترك حقل السر يظهر' : 'Secrets are encrypted at rest and never displayed after saving. Leave the secret field showing'} <span className="font-mono">{MASK}</span> {locale === 'ar' ? 'للإبقاء على القيمة الحالية، أو اكتب قيمة جديدة لتدويرها.' : 'to keep the current value, or type a new value to rotate it.'}</div>
    </div>
  )
}
