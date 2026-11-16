'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { Save, Loader2, Wand2, Eye, EyeOff, AlertCircle, CheckCircle2, Languages } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { saveLetterTemplate } from '@/modules/employee-letters/actions'
import { translateTemplateToArabic } from '@/modules/employee-letters/translate'
import { TokenPickerDropdown } from './TokenPickerDropdown'
import { LetterTemplate } from '@/modules/employee-letters/pdf-template'

// ── Dummy preview values ──────────────────────────────────────────────────────

const DUMMY: Record<string, string> = {
  employee_name:        'Ahmed Al Mansoori',
  employee_name_ar:     'أحمد المنصوري',
  employee_number:      'KPD-001',
  job_title:            'Senior Project Engineer',
  job_title_ar:         'مهندس مشاريع أول',
  department_name:      'Engineering & Development',
  department_name_ar:   'الهندسة والتطوير',
  company_name:         'Avaniis',
  joining_date:         '01 January 2024',
  probation_end_date:   '30 June 2024',
  termination_date:     '31 May 2026',
  effective_date:       '01 June 2026',
  manager_name:         'Dorababu Kethari',
  manager_title:        'Director, Human Resources',
  basic_salary:         '15,000',
  new_basic_salary:     '18,000',
  current_job_title:    'Project Engineer',
  current_job_title_ar: 'مهندس مشاريع',
  new_job_title:        'Senior Project Engineer',
  new_job_title_ar:     'مهندس مشاريع أول',
  bank_name:            'Emirates NBD',
  iban:                 'AE070331234567890123456',
  letter_number:        'PCL-2026-0001',
  letter_date:          new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
}

function resolvePreview(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = DUMMY[key]
    return val ? `<span style="background:#FEF3C7;color:#92400E;padding:0 2px;border-radius:2px;font-weight:600">${val}</span>` : `<span style="background:#FEE2E2;color:#991B1B;padding:0 2px;border-radius:2px">{{${key}}}</span>`
  })
}

// ── Auto-generate starter templates ──────────────────────────────────────────

const STARTERS: Record<string, { nameEn: string; nameAr: string; bodyEn: string; bodyAr: string }> = {
  PCL: {
    nameEn: 'Default Probation Confirmation Letter',
    nameAr: 'خطاب تأكيد اجتياز فترة التجربة الافتراضي',
    bodyEn: `<p>Dear <strong>{{employee_name}}</strong>,</p>

<p>We are pleased to inform you that you have successfully completed your probation period, effective <strong>{{probation_end_date}}</strong>.</p>

<p>Your employment with <strong>{{company_name}}</strong> is hereby confirmed. You will continue in your role as <strong>{{job_title}}</strong> within the <strong>{{department_name}}</strong> department, reporting to <strong>{{manager_name}}</strong>.</p>

<p>All other terms and conditions of your employment contract remain unchanged. We look forward to your continued contribution to the organisation.</p>

<p>Congratulations and best wishes for a successful career with us.</p>

<p>Yours sincerely,</p>`,
    bodyAr: `<p>عزيزي <strong>{{employee_name_ar}}</strong>،</p>

<p>يسعدنا إبلاغكم بأنكم اجتزتم بنجاح فترة التجربة، اعتباراً من تاريخ <strong>{{probation_end_date}}</strong>.</p>

<p>نؤكد استمرار عملكم لدى <strong>{{company_name}}</strong> بمنصب <strong>{{job_title_ar}}</strong> في قسم <strong>{{department_name_ar}}</strong>.</p>

<p>تظل جميع بنود عقد العمل سارية المفعول دون تغيير. نتطلع إلى مساهماتكم المتواصلة.</p>

<p>مع التهاني وأطيب الأمنيات،</p>`,
  },
  EML: {
    nameEn: 'Default Employment Letter',
    nameAr: 'خطاب توظيف افتراضي',
    bodyEn: `<p>To Whom It May Concern,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No. <strong>{{employee_number}}</strong>) is currently employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong> in the <strong>{{department_name}}</strong> department, effective from <strong>{{joining_date}}</strong>.</p>

<p>Their current basic salary is <strong>AED {{basic_salary}}</strong> per month.</p>

<p>This letter is issued at the employee's request for official purposes only and should not be construed as a guarantee of any kind.</p>

<p>Should you require any further information, please do not hesitate to contact us.</p>`,
    bodyAr: `<p>إلى من يهمه الأمر،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: <strong>{{employee_number}}</strong>) يعمل حالياً لدى <strong>{{company_name}}</strong> بمنصب <strong>{{job_title_ar}}</strong> في قسم <strong>{{department_name_ar}}</strong>، اعتباراً من تاريخ <strong>{{joining_date}}</strong>.</p>

<p>يبلغ راتبه الأساسي <strong>{{basic_salary}} درهم إماراتي</strong> شهرياً.</p>

<p>صدر هذا الخطاب بناءً على طلب الموظف للأغراض الرسمية فحسب.</p>`,
  },
  TER: {
    nameEn: 'Default Termination Letter',
    nameAr: 'خطاب إنهاء خدمة افتراضي',
    bodyEn: `<p>Dear <strong>{{employee_name}}</strong>,</p>

<p>This letter serves as formal confirmation that your employment with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong> will be terminated effective <strong>{{termination_date}}</strong>.</p>

<p>Please ensure that all company property, access cards, and equipment are returned on or before your last working day. Your final settlement — including accrued leave balance and end-of-service benefits — will be calculated and processed in accordance with applicable UAE Labour Law.</p>

<p>We thank you for your service and wish you well in your future endeavours.</p>`,
    bodyAr: `<p>عزيزي <strong>{{employee_name_ar}}</strong>،</p>

<p>نؤكد لكم بموجب هذا الخطاب انتهاء عقد عملكم مع <strong>{{company_name}}</strong> اعتباراً من تاريخ <strong>{{termination_date}}</strong>.</p>

<p>يرجى إعادة جميع ممتلكات الشركة قبل يوم عملكم الأخير. سيتم احتساب مستحقاتكم النهائية وفقاً لقانون العمل الإماراتي.</p>

<p>نشكركم على خدمتكم ونتمنى لكم التوفيق.</p>`,
  },
  SAL: {
    nameEn: 'Default Salary Amendment Letter',
    nameAr: 'خطاب تعديل الراتب الافتراضي',
    bodyEn: `<p>Dear <strong>{{employee_name}}</strong>,</p>

<p>We are pleased to inform you that effective <strong>{{effective_date}}</strong>, your monthly basic salary has been revised from <strong>AED {{basic_salary}}</strong> to <strong>AED {{new_basic_salary}}</strong>.</p>

<p>This revision reflects the organisation's recognition of your performance and contribution. All other terms and conditions of your employment contract remain unchanged.</p>

<p>Please sign and return a copy of this letter to confirm your acceptance.</p>`,
    bodyAr: `<p>عزيزي <strong>{{employee_name_ar}}</strong>،</p>

<p>يسعدنا إبلاغكم بأنه اعتباراً من تاريخ <strong>{{effective_date}}</strong>، تم تعديل راتبكم الأساسي الشهري ليصبح <strong>{{new_basic_salary}} درهم إماراتي</strong>.</p>

<p>تظل جميع الشروط والأحكام الأخرى لعقد العمل سارية دون تغيير.</p>`,
  },
  PML: {
    nameEn: 'Default Promotion Letter',
    nameAr: 'خطاب ترقية افتراضي',
    bodyEn: `<p>Dear <strong>{{employee_name}}</strong>,</p>

<p>It is with great pleasure that we inform you of your promotion from <strong>{{current_job_title}}</strong> to <strong>{{new_job_title}}</strong>, effective <strong>{{effective_date}}</strong>.</p>

<p>This promotion is a recognition of your exceptional performance, dedication, and the value you bring to the <strong>{{department_name}}</strong> team.</p>

<p>Your revised compensation and updated job description will be shared separately. Please continue to demonstrate the high standards that led to this achievement.</p>

<p>Congratulations on this well-deserved promotion.</p>`,
    bodyAr: `<p>عزيزي <strong>{{employee_name_ar}}</strong>،</p>

<p>يسعدنا إبلاغكم بترقيتكم من منصب <strong>{{current_job_title_ar}}</strong> إلى منصب <strong>{{new_job_title_ar}}</strong>، اعتباراً من تاريخ <strong>{{effective_date}}</strong>.</p>

<p>تعكس هذه الترقية تقدير الشركة لأدائكم المتميز وإسهاماتكم القيّمة.</p>

<p>مع خالص التهاني على هذه الترقية المستحقة.</p>`,
  },
  DCL: {
    nameEn: 'Default Designation Change Letter',
    nameAr: 'خطاب تغيير المسمى الوظيفي الافتراضي',
    bodyEn: `<p>Dear <strong>{{employee_name}}</strong>,</p>

<p>This letter is to formally notify you that effective <strong>{{effective_date}}</strong>, your designation has been updated from <strong>{{current_job_title}}</strong> to <strong>{{new_job_title}}</strong>.</p>

<p>This change reflects the evolution of your responsibilities within <strong>{{department_name}}</strong>. All other terms and conditions of your employment contract remain unchanged.</p>

<p>Please acknowledge receipt of this letter by signing below.</p>`,
    bodyAr: `<p>عزيزي <strong>{{employee_name_ar}}</strong>،</p>

<p>نفيدكم بأنه اعتباراً من تاريخ <strong>{{effective_date}}</strong>، تم تعديل مسماكم الوظيفي من <strong>{{current_job_title_ar}}</strong> إلى <strong>{{new_job_title_ar}}</strong>.</p>

<p>تظل جميع الشروط الأخرى لعقد العمل سارية دون تغيير.</p>`,
  },
  SC: {
    nameEn: 'Default Salary Certificate',
    nameAr: 'شهادة راتب افتراضية',
    bodyEn: `<p>To Whom It May Concern,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No. <strong>{{employee_number}}</strong>) holds the position of <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong> since <strong>{{joining_date}}</strong>.</p>

<p>Their current basic monthly salary is <strong>AED {{basic_salary}}</strong>.</p>

<p>This certificate is issued at the employee's request for official and banking purposes. <strong>{{company_name}}</strong> accepts no liability for any obligations arising from the use of this certificate.</p>`,
    bodyAr: `<p>إلى من يهمه الأمر،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: <strong>{{employee_number}}</strong>) يشغل منصب <strong>{{job_title_ar}}</strong> لدى <strong>{{company_name}}</strong> منذ تاريخ <strong>{{joining_date}}</strong>.</p>

<p>يبلغ راتبه الأساسي الشهري <strong>{{basic_salary}} درهم إماراتي</strong>.</p>

<p>صدرت هذه الشهادة بناءً على طلب الموظف للأغراض البنكية والرسمية.</p>`,
  },
  STL: {
    nameEn: 'Default Salary Transfer Letter',
    nameAr: 'خطاب تحويل راتب افتراضي',
    bodyEn: `<p>To: The Manager, <strong>{{bank_name}}</strong></p>

<p>Dear Sir/Madam,</p>

<p>We hereby request you to transfer the monthly salary of our employee <strong>{{employee_name}}</strong> (Employee No. <strong>{{employee_number}}</strong>) to the following bank account with immediate effect:</p>

<p style="margin-left:20px">
  <strong>Bank:</strong> {{bank_name}}<br/>
  <strong>IBAN:</strong> {{iban}}<br/>
  <strong>Account Name:</strong> {{employee_name}}
</p>

<p>Please process this request accordingly and contact us if you require any further information.</p>`,
    bodyAr: `<p>إلى: مدير بنك <strong>{{bank_name}}</strong></p>

<p>نطلب منكم تحويل الراتب الشهري للموظف <strong>{{employee_name_ar}}</strong> (رقم الموظف: <strong>{{employee_number}}</strong>) إلى الحساب التالي:</p>

<p style="margin-right:20px;direction:rtl">
  <strong>البنك:</strong> {{bank_name}}<br/>
  <strong>رقم الآيبان:</strong> {{iban}}
</p>

<p>يرجى اتخاذ الإجراءات اللازمة.</p>`,
  },
}

// ── Smart token suggestions per type ─────────────────────────────────────────

const SMART_TOKENS: Record<string, string[]> = {
  PCL: ['employee_name', 'probation_end_date', 'joining_date', 'job_title', 'department_name', 'manager_name', 'company_name'],
  EML: ['employee_name', 'employee_number', 'job_title', 'department_name', 'joining_date', 'basic_salary', 'company_name'],
  TER: ['employee_name', 'termination_date', 'job_title', 'company_name', 'employee_number'],
  SAL: ['employee_name', 'effective_date', 'basic_salary', 'new_basic_salary', 'job_title', 'company_name'],
  PML: ['employee_name', 'current_job_title', 'new_job_title', 'effective_date', 'department_name', 'company_name'],
  DCL: ['employee_name', 'current_job_title', 'new_job_title', 'effective_date', 'department_name'],
  SC:  ['employee_name', 'employee_number', 'job_title', 'joining_date', 'basic_salary', 'company_name'],
  STL: ['employee_name', 'employee_number', 'bank_name', 'iban', 'company_name'],
}

// ── Validate template body ────────────────────────────────────────────────────

function validateTokens(body: string): string[] {
  const broken = body.match(/\{[^}]*\}(?!\})|(?<!\{)\{[^{]*\}\}/g) ?? []
  return [...new Set(broken)]
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Token  { tokenKey: string; labelEn: string; category: string }
interface Props {
  typeCode:   string
  typeName:   string
  template?:  { id: string; nameEn: string; nameAr: string | null; bodyEn: string; bodyAr: string | null; isDefault: boolean }
  tokens:     Token[]
  onSaved?:   () => void
  onCancel?:  () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TemplateEditorForm({ typeCode, typeName, template, tokens, onSaved, onCancel }: Props) {
  const locale = useLocale()
  const [nameEn,    setNameEn]    = useState(template?.nameEn ?? '')
  const [nameAr,    setNameAr]    = useState(template?.nameAr ?? '' as string)
  const [bodyEn,    setBodyEn]    = useState(template?.bodyEn ?? '')
  const [bodyAr,    setBodyAr]    = useState(template?.bodyAr ?? '' as string)
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false)
  const [previewLang, setPLang]   = useState<'en' | 'ar'>('en')
  const [showPreview, setPreview] = useState(true)
  const [activeField, setActive]  = useState<'bodyEn' | 'bodyAr'>('bodyEn')
  const [toast,            setToast]            = useState<{ ok: boolean; msg: string } | null>(null)
  const [isPending,        start]               = useTransition()
  const [translatePending, startTranslate]      = useTransition()

  const bodyEnRef = useRef<HTMLTextAreaElement>(null)
  const bodyArRef = useRef<HTMLTextAreaElement>(null)

  const starter     = STARTERS[typeCode]
  const smartKeys   = SMART_TOKENS[typeCode] ?? []
  const smartTokens = tokens.filter(t => smartKeys.includes(t.tokenKey))
  const otherTokens = tokens.filter(t => !smartKeys.includes(t.tokenKey))
  const sortedTokens = [...smartTokens, ...otherTokens]

  const previewBody = previewLang === 'en' ? bodyEn : bodyAr
  const errors      = [...validateTokens(bodyEn), ...validateTokens(bodyAr)]

  function flash(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function insertToken(token: string) {
    const ref      = activeField === 'bodyEn' ? bodyEnRef : bodyArRef
    const setValue = activeField === 'bodyEn' ? setBodyEn : setBodyAr
    const current  = activeField === 'bodyEn' ? bodyEn   : bodyAr
    const el = ref.current
    if (!el) { setValue(current + token); return }
    const s   = el.selectionStart ?? current.length
    const e   = el.selectionEnd   ?? current.length
    setValue(current.slice(0, s) + token + current.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + token.length, s + token.length)
    })
  }

  function applyStarter() {
    if (!starter) return
    setNameEn(p => p || starter.nameEn)
    setNameAr(p => p || starter.nameAr)
    setBodyEn(starter.bodyEn)
    setBodyAr(starter.bodyAr)
  }

  function handleAiTranslate() {
    if (!bodyEn.trim()) {
      flash(false, locale === 'ar' ? 'اكتب النص الإنجليزي أولاً ثم ترجمه.' : 'Write the English body first, then translate.')
      return
    }
    startTranslate(async () => {
      const result = await translateTemplateToArabic(bodyEn)
      if (result.success) {
        setBodyAr(result.bodyAr)
        setPLang('ar')
        flash(true, locale === 'ar' ? 'تم تطبيق الترجمة العربية — راجِعها وعدِّلها حسب الحاجة.' : 'Arabic translation applied — review and adjust as needed.')
      } else {
        flash(false, locale === 'ar' ? `فشلت الترجمة: ${result.error}` : `Translation failed: ${result.error}`)
      }
    })
  }

  function handleSave() {
    if (!nameEn.trim() || !bodyEn.trim()) {
      flash(false, locale === 'ar' ? 'اسم القالب (بالإنجليزية) والنص (بالإنجليزية) مطلوبان' : 'Template Name (EN) and Body (English) are required')
      return
    }
    start(async () => {
      try {
        const fd = new FormData()
        if (template?.id) fd.set('id', template.id)
        fd.set('typeCode',  typeCode)
        fd.set('nameEn',    nameEn.trim())
        fd.set('nameAr',    nameAr.trim())
        fd.set('bodyEn',    bodyEn.trim())
        fd.set('bodyAr',    bodyAr.trim())
        fd.set('isDefault', String(isDefault))
        await saveLetterTemplate(fd)
        flash(true, locale === 'ar' ? 'تم حفظ القالب بنجاح' : 'Template saved successfully')
        setTimeout(() => onSaved?.(), 600)
      } catch (e) {
        flash(false, e instanceof Error ? e.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed'))
      }
    })
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 'var(--text-body)',
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)", borderRadius: 6,
    background: 'var(--bg)', color: 'var(--ink-1)',
    outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--ink-3)',
    marginBottom: 5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 7, fontSize: 'var(--text-caption)',
          background: toast.ok ? '#DCFCE7' : '#FEE2E2',
          color:      toast.ok ? '#166534' : '#991B1B',
        }}>
          {toast.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {toast.msg}
        </div>
      )}

      {/* Auto-generate banner */}
      {starter && !bodyEn && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--accent) 6%, var(--bg))',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)' }}>
              {locale === 'ar' ? 'ابدأ من قالب قياسي' : 'Start from standard template'}
            </div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginTop: 1 }}>
              {locale === 'ar'
                ? `تعبئة تلقائية ببنية ${typeName} القياسية متضمنةً جميع الرموز الموصى بها`
                : `Auto-fill with a standard ${typeName} structure including all recommended tokens`}
            </div>
          </div>
          <button
            type="button"
            onClick={applyStarter}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: "var(--on-accent)", fontSize: 'var(--text-caption)', fontWeight: 600,
              whiteSpace: 'nowrap', flexShrink: 0,
              marginLeft: 12,
            }}
          >
            <Wand2 size={13} /> {locale === 'ar' ? 'إنشاء تلقائي' : 'Auto-generate'}
          </button>
        </div>
      )}

      {/* Smart token chips — contextual suggestions */}
      {smartTokens.length > 0 && (
        <div>
          <div style={lbl}>{locale === 'ar' ? `الرموز المقترحة لـ ${typeName}` : `Suggested tokens for ${typeName}`}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {smartTokens.map(t => (
              <button
                key={t.tokenKey}
                type="button"
                title={t.labelEn}
                onClick={() => insertToken(`{{${t.tokenKey}}}`)}
                style={{
                  padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)',
                  background: 'var(--surface)', cursor: 'pointer', fontSize: 'var(--text-caption)',
                  fontFamily: 'var(--font-mono)', color: 'var(--brand-active)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
              >
                {'{{' + t.tokenKey + '}}'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Names row */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>{locale === 'ar' ? 'اسم القالب (بالإنجليزية)' : 'Template Name (English)'}</label>
          <input value={nameEn} onChange={e => setNameEn(e.target.value)}
            placeholder={locale === 'ar' ? `${typeName} الافتراضي` : `Default ${typeName}`} style={inp} />
        </div>
        <div>
          <label style={lbl}>{locale === 'ar' ? 'اسم القالب (بالعربية)' : 'Template Name (Arabic)'}</label>
          <input value={nameAr} onChange={e => setNameAr(e.target.value)}
            placeholder="الاسم بالعربية" style={{ ...inp, direction: 'rtl' }} />
        </div>
      </div>

      {/* Split editor + preview */}
      <div>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ ...lbl, marginTop: 0,
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0 }}>{locale === 'ar' ? 'نص القالب' : 'Template Body'}</label>
            {errors.length > 0 && (
              <span style={{ fontSize: 'var(--text-caption)', color: '#DC2626', display: 'flex', alignItems: 'center', gap: 3 }}>
                <AlertCircle size={11} /> {locale === 'ar' ? `${errors.length} خطأ في الصياغة` : `${errors.length} syntax error${errors.length > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TokenPickerDropdown tokens={sortedTokens} onInsert={insertToken} />
            <button
              type="button"
              onClick={() => setPreview(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: showPreview ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                color: showPreview ? 'var(--brand-active)' : 'var(--ink-3)',
                fontSize: 'var(--text-caption)', cursor: 'pointer',
              }}
            >
              {showPreview ? <Eye size={12} /> : <EyeOff size={12} />}
              {showPreview ? (locale === 'ar' ? 'إخفاء المعاينة' : 'Hide preview') : (locale === 'ar' ? 'عرض المعاينة' : 'Show preview')}
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr',
          gap: 12,
          alignItems: 'start',
        }}>
          {/* Editor column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* EN body */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {locale === 'ar' ? 'الإنجليزية' : 'English'}
                </span>
                <button type="button" onClick={() => setActive('bodyEn')}
                  style={{ fontSize: 'var(--text-caption)', color: activeField === 'bodyEn' ? 'var(--brand-active)' : 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {activeField === 'bodyEn' ? (locale === 'ar' ? '● نشط' : '● active') : (locale === 'ar' ? 'انقر للتفعيل' : 'Click to activate')}
                </button>
              </div>
              <textarea
                ref={bodyEnRef}
                value={bodyEn}
                onChange={e => setBodyEn(e.target.value)}
                onFocus={() => { setActive('bodyEn'); setPLang('en') }}
                rows={14}
                placeholder={'<p>Dear {{employee_name}},</p>\n\n<p>We are pleased to inform you...</p>'}
                style={{
                  ...inp, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)',
                  resize: 'vertical', lineHeight: 1.7,
                  borderTopColor: activeField === 'bodyEn' ? 'var(--accent)' : 'var(--border)',
                  borderRightColor: activeField === 'bodyEn' ? 'var(--accent)' : 'var(--border)',
                  borderBottomColor: activeField === 'bodyEn' ? 'var(--accent)' : 'var(--border)',
                  borderLeftColor: activeField === 'bodyEn' ? 'var(--accent)' : 'var(--border)',
                }}
              />
            </div>
            {/* AR body */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {locale === 'ar' ? 'العربية (من اليمين لليسار)' : 'Arabic (RTL)'}
                  {!bodyAr && <span style={{ marginLeft: 6, color: 'var(--ink-4)', fontWeight: 400, fontSize: 'var(--text-caption)' }}>{locale === 'ar' ? '— اختياري' : '— optional'}</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleAiTranslate}
                    disabled={translatePending || !bodyEn.trim()}
                    title={locale === 'ar' ? 'ترجمة النص الإنجليزي إلى العربية تلقائياً باستخدام Claude AI' : 'Auto-translate English body to Arabic using Claude AI'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 'var(--text-caption)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid var(--accent)',
                      background: 'color-mix(in srgb, var(--accent) 8%, var(--card))',
                      color: 'var(--brand-active)',
                      opacity: (!bodyEn.trim() || translatePending) ? 0.5 : 1,
                    }}
                  >
                    {translatePending
                      ? <><Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'ar' ? 'جارٍ الترجمة…' : 'Translating…'}</>
                      : <><Languages size={10} /> {locale === 'ar' ? 'ترجمة بالذكاء الاصطناعي' : 'AI Translate'}</>}
                  </button>
                  <button type="button" onClick={() => setActive('bodyAr')}
                    style={{ fontSize: 'var(--text-caption)', color: activeField === 'bodyAr' ? 'var(--brand-active)' : 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {activeField === 'bodyAr' ? (locale === 'ar' ? '● نشط' : '● active') : (locale === 'ar' ? 'انقر للتفعيل' : 'Click to activate')}
                  </button>
                </div>
              </div>
              <textarea
                ref={bodyArRef}
                value={bodyAr}
                onChange={e => setBodyAr(e.target.value)}
                onFocus={() => { setActive('bodyAr'); setPLang('ar') }}
                rows={10}
                placeholder={'<p>عزيزي {{employee_name_ar}}،</p>'}
                style={{
                  ...inp, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)',
                  resize: 'vertical', lineHeight: 1.7, direction: 'rtl',
                  borderTopColor: activeField === 'bodyAr' ? 'var(--accent)' : 'var(--border)',
                  borderRightColor: activeField === 'bodyAr' ? 'var(--accent)' : 'var(--border)',
                  borderBottomColor: activeField === 'bodyAr' ? 'var(--accent)' : 'var(--border)',
                  borderLeftColor: activeField === 'bodyAr' ? 'var(--accent)' : 'var(--border)',
                }}
              />
            </div>
          </div>

          {/* Preview column */}
          {showPreview && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
              background: 'var(--bg)', position: 'sticky', top: 20,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
              }}>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                  {locale === 'ar' ? 'معاينة مباشرة' : 'Live Preview'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['en', 'ar'] as const).map(l => (
                    <button key={l} type="button" onClick={() => setPLang(l)} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 'var(--text-caption)', cursor: 'pointer',
                      border: 'none',
                      background: previewLang === l ? 'var(--accent)' : 'var(--border)',
                      color: previewLang === l ? '#fff' : 'var(--ink-3)',
                      fontWeight: previewLang === l ? 600 : 400,
                    }}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {(bodyEn || bodyAr) ? (
                  <LetterTemplate
                    letterNumber="PCL-2026-0001"
                    letterDate={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                    resolvedBodyEn={resolvePreview(bodyEn)}
                    resolvedBodyAr={bodyAr ? resolvePreview(bodyAr) : undefined}
                    language={previewLang === 'ar' && bodyAr ? 'ar' : 'en'}
                    companyNameEn="Avaniis"
                  />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>
                    {locale === 'ar' ? 'ابدأ بالكتابة لعرض معاينة مباشرة' : 'Start typing to see a live preview'}
                  </div>
                )}
              </div>
              {/* Token legend */}
              <div style={{
                padding: '7px 10px', borderTop: '1px solid var(--border)',
                background: 'var(--surface)', fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                display: 'flex', gap: 12,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ background: '#FEF3C7', color: '#92400E', padding: '0 4px', borderRadius: 2 }}>value</span>
                  {locale === 'ar' ? 'رمز مُحلَّل' : 'resolved token'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '0 4px', borderRadius: 2 }}>{'{{'+'unknown'+'}}' }</span>
                  {locale === 'ar' ? 'رمز غير معروف' : 'unknown token'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Default toggle + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={e => setIsDefault(e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          {locale === 'ar' ? `تعيينه كقالب افتراضي لـ ${typeName}` : `Set as default template for ${typeName}`}
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button type="button" onClick={onCancel} style={{
              padding: '7px 16px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--ink-2)', fontSize: 'var(--text-body)',
            }}>
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !nameEn.trim() || !bodyEn.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: "var(--on-accent)",
              fontSize: 'var(--text-body)', fontWeight: 600,
              opacity: (isPending || !nameEn.trim() || !bodyEn.trim()) ? 0.6 : 1,
            }}
          >
            {isPending
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…'}</>
              : <><Save size={13} /> {locale === 'ar' ? 'حفظ القالب' : 'Save Template'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
