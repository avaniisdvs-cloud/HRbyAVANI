'use client'

import { useState, useEffect, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { DateInput } from '@/components/forms/DateInput'
import { PersonSelect, type PersonOption } from '@/components/forms/PersonSelect'
import {
  createApprovalGroup,
  updateApprovalGroup,
  addGroupMember,
  removeGroupMember,
  listGroupMembers,
} from '@/modules/workflow/actions'
import type { ApprovalGroupRow, GroupMemberRow } from '@/modules/workflow/actions'
import { type Locale } from '@/lib/i18n'

// ── Style constants ────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  margin: '24px 0 12px',
  paddingBottom: 6,
  borderBottom: '1px solid var(--border)',
}

const fieldWrap: React.CSSProperties = { marginBottom: 16 }

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-body)',
  fontWeight: 500,
  color: 'var(--ink-2)',
  marginBottom: 6,
}

const inputBase: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const readonlyInput: React.CSSProperties = {
  ...inputBase,
  background: 'var(--surface)',
  color: 'var(--ink-3)',
  cursor: 'not-allowed',
}

const errorText: React.CSSProperties = { fontSize: 'var(--text-caption)', color: '#C62828',
marginTop: 4 }

const errorBanner: React.CSSProperties = {
  background: '#FBE9E9',
  border: '1px solid #FFCDD2',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 16,
  fontSize: 'var(--text-body)',
  color: '#C62828',
}

const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  height: 36, padding: '0 20px',
  border: 'none', borderRadius: 10,
  background: disabled ? 'var(--border)' : 'var(--accent)',
  color: disabled ? 'var(--ink-4)' : '#fff',
  fontSize: 'var(--text-body)', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
})

const btnSecondary: React.CSSProperties = {
  height: 36, padding: '0 16px',
  border: '1.5px solid var(--border)',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--ink-2)',
  fontSize: 'var(--text-body)', fontWeight: 500,
  cursor: 'pointer',
}

// ── GroupDrawer ────────────────────────────────────────────────────────────

interface GroupDrawerProps {
  open:          boolean
  initialTab:    'details' | 'members'
  onClose:       () => void
  onSuccess:     (updated?: ApprovalGroupRow) => void
  editRow?:      ApprovalGroupRow | null
  personOptions: PersonOption[]
  locale?:       Locale
}

export function GroupDrawer({
  open,
  initialTab,
  onClose,
  onSuccess,
  editRow,
  personOptions,
  locale = 'en',
}: GroupDrawerProps) {
  // After a create, the drawer keeps managing the just-created group itself
  // (self-contained continuation) so it never depends on the parent re-driving
  // props into an already-open drawer. `effectiveRow` is the group the drawer is
  // currently operating on — either the one passed in (edit/manage-members) or
  // the one just created.
  const [createdRow, setCreatedRow] = useState<ApprovalGroupRow | null>(null)
  const effectiveRow = editRow ?? createdRow
  const isEdit = !!effectiveRow

  // ── Tab state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'details' | 'members'>(initialTab)

  // ── Details form state ────────────────────────────────────────────────
  const [groupCode,    setGroupCode]    = useState('')
  const [groupNameEn,  setGroupNameEn]  = useState('')
  const [groupNameAr,  setGroupNameAr]  = useState('')
  const [memberType,   setMemberType]   = useState('STATIC')
  const [votingMethod, setVotingMethod] = useState('ANY_ONE')
  const [minApprovals, setMinApprovals] = useState('1')
  const [serverError,  setServerError]  = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  // ── Members tab state ─────────────────────────────────────────────────
  const [members,         setMembers]         = useState<GroupMemberRow[]>([])
  const [membersLoaded,   setMembersLoaded]   = useState<string | null>(null) // groupId last loaded
  const [membersLoading,  setMembersLoading]  = useState(false)
  const [memberError,     setMemberError]     = useState<string | null>(null)

  // Add member form
  const [newPersonId,      setNewPersonId]      = useState('')
  const [newEffectiveFrom, setNewEffectiveFrom] = useState('')
  const [newEffectiveTo,   setNewEffectiveTo]   = useState('')
  const [newIsPrimary,     setNewIsPrimary]     = useState(false)
  const [newVoteWeight,    setNewVoteWeight]    = useState('1')
  const [addingMember,     setAddingMember]     = useState(false)

  // ── Reset form on open/edit change ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab)
    setServerError(null)
    setMemberError(null)
    setMembersLoaded(null)
    // Clear any previously-created group so a fresh "New Group" open starts clean.
    // (This effect does NOT re-run during the create-continuation because none of
    // its deps change then, so the just-created row is preserved.)
    setCreatedRow(null)

    if (editRow) {
      setGroupCode(editRow.groupCode)
      setGroupNameEn(editRow.groupNameEn)
      setGroupNameAr(editRow.groupNameAr ?? '')
      setMemberType(editRow.memberType)
      setVotingMethod(editRow.votingMethod)
      setMinApprovals(String(editRow.minApprovals))
    } else {
      setGroupCode('')
      setGroupNameEn('')
      setGroupNameAr('')
      setMemberType('STATIC')
      setVotingMethod('ANY_ONE')
      setMinApprovals('1')
    }
  }, [open, editRow, initialTab])

  // ── Load members when members tab is active (only once per group open) ──
  useEffect(() => {
    if (!open || activeTab !== 'members' || !effectiveRow) return
    if (membersLoaded === effectiveRow.id) return
    const groupId = effectiveRow.id
    setMembersLoading(true)
    listGroupMembers(groupId)
      .then(rows => { setMembers(rows); setMembersLoaded(groupId); setMembersLoading(false) })
      .catch(() => { setMembersLoading(false) })
  }, [open, activeTab, effectiveRow, membersLoaded])

  // ── Details submit ────────────────────────────────────────────────────
  function handleSaveDetails() {
    setServerError(null)
    startTransition(async () => {
      if (effectiveRow) {
        // Update an existing group (edit, manage-members, or the just-created group).
        const result = await updateApprovalGroup(effectiveRow.id, {
          groupNameEn,
          groupNameAr: groupNameAr || undefined,
          memberType,
          votingMethod,
          minApprovals: parseInt(minApprovals, 10),
        })
        if (result.success) {
          onSuccess({
            ...effectiveRow,
            groupNameEn,
            groupNameAr: groupNameAr || null,
            memberType,
            votingMethod,
            minApprovals: parseInt(minApprovals, 10),
          })
          onClose()
        } else {
          setServerError(result.error ?? 'Failed to save.')
        }
      } else {
        const result = await createApprovalGroup({
          groupCode,
          groupNameEn,
          groupNameAr: groupNameAr || undefined,
          memberType,
          votingMethod,
          minApprovals: parseInt(minApprovals, 10),
        })
        if (result.success && result.id) {
          const newRow: ApprovalGroupRow = {
            id:           result.id,
            groupCode:    groupCode.toUpperCase(),
            groupNameEn,
            groupNameAr:  groupNameAr || null,
            memberType,
            votingMethod,
            minApprovals: parseInt(minApprovals, 10),
            isActive:     true,
            memberCount:  0,
          }
          // Self-contained continuation: the drawer adopts the new group and
          // switches itself to the Members tab — no reliance on parent prop
          // timing or router.refresh(). onSuccess() updates the list behind it.
          setCreatedRow(newRow)
          setMembers([])
          setMembersLoaded(result.id)
          setActiveTab('members')
          onSuccess(newRow)
        } else {
          setServerError(result.error ?? 'Failed to create.')
        }
      }
    })
  }

  // ── Add member ────────────────────────────────────────────────────────
  function handleAddMember() {
    if (!effectiveRow || !newPersonId.trim() || !newEffectiveFrom) return
    const groupId = effectiveRow.id
    setMemberError(null)
    setAddingMember(true)
    addGroupMember(groupId, {
      personId:      newPersonId.trim(),
      effectiveFrom: newEffectiveFrom,
      effectiveTo:   newEffectiveTo || undefined,
      isPrimary:     newIsPrimary,
      voteWeight:    parseFloat(newVoteWeight) || 1,
    }).then(result => {
      setAddingMember(false)
      if (result.success) {
        listGroupMembers(groupId).then(rows => setMembers(rows))
        setNewPersonId('')
        setNewEffectiveFrom('')
        setNewEffectiveTo('')
        setNewIsPrimary(false)
        setNewVoteWeight('1')
      } else {
        setMemberError(result.error ?? 'Failed to add member.')
      }
    })
  }

  // ── Remove member ─────────────────────────────────────────────────────
  function handleRemoveMember(memberId: string) {
    if (!effectiveRow) return
    setMemberError(null)
    removeGroupMember(memberId).then(result => {
      if (result.success) {
        setMembers(prev => prev.filter(m => m.id !== memberId))
      } else {
        setMemberError(result.error ?? 'Failed to remove member.')
      }
    })
  }

  // ── Footer ────────────────────────────────────────────────────────────
  const footer = activeTab === 'details' ? (
    <>
      <button type="button" onClick={onClose} disabled={isPending} style={btnSecondary}>
        {locale === 'ar' ? 'إلغاء' : 'Cancel'}
      </button>
      <button type="button" onClick={handleSaveDetails} disabled={isPending} style={btnPrimary(isPending)}>
        {isPending
          ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء المجموعة' : 'Create Group')}
      </button>
    </>
  ) : (
    <button type="button" onClick={onClose} style={btnSecondary}>
      {locale === 'ar' ? 'تم' : 'Done'}
    </button>
  )

  // Single-language drawer title: pass the active-language string as `titleEn`
  // (MdmDrawer's primary heading + aria-label) and leave `titleAr` empty so the
  // secondary bilingual subtitle collapses — English mode shows English only,
  // Arabic mode shows Arabic only.
  const drawerTitle = isEdit
    ? (locale === 'ar' ? `تعديل المجموعة — ${effectiveRow?.groupCode}` : `Edit Group — ${effectiveRow?.groupCode}`)
    : (locale === 'ar' ? 'مجموعة اعتماد جديدة' : 'New Approval Group')

  return (
    <MdmDrawer
      open={open}
      onClose={onClose}
      titleEn={drawerTitle}
      titleAr=""
      footer={footer}
      width={620}
    >
      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex',
      marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['details', 'members'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={tab === 'members' && !isEdit}
            style={{
              padding: '8px 18px',
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderLeftWidth: "0px",
              borderLeftStyle: "none",
              borderLeftColor: "currentColor",
              background: 'none',
              fontSize: 'var(--text-body)',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--brand-active)' : 'var(--ink-3)',
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: (activeTab === tab) ? "var(--accent)" : "transparent",
              cursor: tab === 'members' && !isEdit ? 'not-allowed' : 'pointer',
              marginBottom: -1,
              textTransform: 'capitalize',
            }}
          >
            {tab === 'details'
              ? (locale === 'ar' ? 'التفاصيل' : 'Details')
              : (locale === 'ar' ? 'الأعضاء' : 'Members')}
          </button>
        ))}
      </div>

      {/* ── Details tab ──────────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <>
          {serverError && (
            <div style={errorBanner}>
              {serverError}
            </div>
          )}

          <div style={sectionLabel}>{locale === 'ar' ? 'هوية المجموعة' : 'Group Identity'}</div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'رمز المجموعة' : 'Group Code'} <span style={{ color: '#C62828' }}>*</span></label>
            <input
              type="text"
              value={groupCode}
              onChange={e => setGroupCode(e.target.value.toUpperCase())}
              placeholder="e.g. FINANCE_APPROVERS"
              maxLength={50}
              disabled={isEdit}
              style={isEdit ? readonlyInput : inputBase}
            />
            {isEdit && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 4 }}>{locale === 'ar' ? 'رمز المجموعة غير قابل للتعديل بعد الإنشاء.' : 'Group code is immutable after creation.'}</div>}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={{ color: '#C62828' }}>*</span></label>
            <input
              type="text"
              value={groupNameEn}
              onChange={e => setGroupNameEn(e.target.value)}
              placeholder="e.g. Finance Approvers"
              maxLength={200}
              style={inputBase}
            />
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
            <input
              type="text"
              value={groupNameAr}
              onChange={e => setGroupNameAr(e.target.value)}
              dir="rtl"
              lang="ar"
              placeholder="مثال: معتمدو المالية"
              maxLength={200}
              style={{ ...inputBase, textAlign: 'right' }}
            />
          </div>

          <div style={sectionLabel}>{locale === 'ar' ? 'إعدادات الاعتماد' : 'Approval Settings'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={fieldLabel}>{locale === 'ar' ? 'نوع العضوية' : 'Member Type'} <span style={{ color: '#C62828' }}>*</span></label>
              <select value={memberType} onChange={e => setMemberType(e.target.value)} style={inputBase}>
                <option value="STATIC">STATIC — {locale === 'ar' ? 'قائمة ثابتة' : 'Fixed list'}</option>
                <option value="DYNAMIC">DYNAMIC — {locale === 'ar' ? 'قائم على القواعد' : 'Rule-based'}</option>
                <option value="HYBRID">HYBRID — {locale === 'ar' ? 'كلاهما' : 'Both'}</option>
              </select>
            </div>

            <div style={fieldWrap}>
              <label style={fieldLabel}>{locale === 'ar' ? 'طريقة التصويت' : 'Voting Method'} <span style={{ color: '#C62828' }}>*</span></label>
              <select value={votingMethod} onChange={e => setVotingMethod(e.target.value)} style={inputBase}>
                <option value="ANY_ONE">ANY_ONE — {locale === 'ar' ? 'أول معتمد يحسم' : 'First approver wins'}</option>
                <option value="MAJORITY">MAJORITY — {locale === 'ar' ? 'يجب موافقة أكثر من 50%' : '>50% must approve'}</option>
                <option value="ALL">ALL — {locale === 'ar' ? 'بالإجماع' : 'Unanimous'}</option>
                <option value="WEIGHTED">WEIGHTED — {locale === 'ar' ? 'أصوات مرجّحة' : 'Weighted votes'}</option>
              </select>
            </div>
          </div>

          <div style={{ ...fieldWrap, maxWidth: 200 }}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الحد الأدنى للموافقات' : 'Minimum Approvals'} <span style={{ color: '#C62828' }}>*</span></label>
            <input
              type="number"
              value={minApprovals}
              onChange={e => setMinApprovals(e.target.value)}
              min={1}
              max={99}
              style={inputBase}
            />
          </div>
        </>
      )}

      {/* ── Members tab ──────────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <>
          {memberError && (
            <div style={errorBanner}>
              {memberError}
            </div>
          )}

          {/* Current members table */}
          <div style={sectionLabel}>{locale === 'ar' ? 'الأعضاء الحاليون' : 'Current Members'}</div>

          {membersLoading ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', padding: '12px 0' }}>{locale === 'ar' ? 'جارٍ تحميل الأعضاء…' : 'Loading members…'}</p>
          ) : members.length === 0 ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', padding: '12px 0' }}>{locale === 'ar' ? 'لا يوجد أعضاء بعد. أضف أول عضو أدناه.' : 'No members yet. Add the first one below.'}</p>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
            marginBottom: 24 }}>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 60px 60px 32px', padding: '0 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {(locale === 'ar'
                  ? ['الاسم', 'من', 'إلى', 'أساسي', 'الوزن', '']
                  : ['Name', 'From', 'To', 'Primary', 'Weight', '']).map((h, i) => (
                  <div key={i} style={{ padding: '8px 6px', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>{h}</div>
                ))}
              </div>
              {members.map(m => (
                <div data-responsive-grid="true" key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 60px 60px 32px', padding: '0 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div style={{ padding: '10px 6px', fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{m.personName}</div>
                  <div style={{ padding: '10px 6px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{m.effectiveFrom}</div>
                  <div style={{ padding: '10px 6px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{m.effectiveTo ?? '—'}</div>
                  <div style={{ padding: '10px 6px', fontSize: 'var(--text-caption)' }}>
                    {m.isPrimary ? <span style={{ color: 'var(--brand-active)', fontWeight: 600 }}>{locale === 'ar' ? 'نعم' : 'Yes'}</span> : <span style={{ color: 'var(--ink-4)' }}>{locale === 'ar' ? 'لا' : 'No'}</span>}
                  </div>
                  <div style={{ padding: '10px 6px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{m.voteWeight}</div>
                  <div style={{ padding: '10px 6px' }}>
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', color: '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}
                      aria-label={locale === 'ar' ? 'إزالة العضو' : 'Remove member'}
                      title={locale === 'ar' ? 'إزالة العضو' : 'Remove member'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add member form */}
          <div style={sectionLabel}>{locale === 'ar' ? 'إضافة عضو' : 'Add Member'}</div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الموظف' : 'Employee'} <span style={{ color: '#C62828' }}>*</span></label>
            <PersonSelect
              value={newPersonId || null}
              options={personOptions}
              onChange={id => setNewPersonId(id)}
              placeholder={locale === 'ar' ? 'ابحث بالاسم أو رقم الموظف…' : 'Search by name or employee number…'}
              required
            />
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 4 }}>{locale === 'ar' ? 'اكتب جزءًا من الاسم أو رقم الموظف، ثم اختر من القائمة.' : 'Type a partial name or employee number, then pick from the list.'}</div>
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={fieldLabel}>{locale === 'ar' ? 'ساري من' : 'Effective From'} <span style={{ color: '#C62828' }}>*</span></label>
              <DateInput value={newEffectiveFrom} onChange={e => setNewEffectiveFrom(e.target.value)} style={inputBase} />
            </div>
            <div style={fieldWrap}>
              <label style={fieldLabel}>{locale === 'ar' ? 'ساري إلى' : 'Effective To'}</label>
              <DateInput value={newEffectiveTo} onChange={e => setNewEffectiveTo(e.target.value)} style={inputBase} />
            </div>
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={fieldLabel}>{locale === 'ar' ? 'وزن الصوت' : 'Vote Weight'}</label>
              <input
                type="number"
                value={newVoteWeight}
                onChange={e => setNewVoteWeight(e.target.value)}
                min={0.01}
                step={0.01}
                style={inputBase}
              />
            </div>
            <div style={{ ...fieldWrap, display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer',
              paddingBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={newIsPrimary}
                  onChange={e => setNewIsPrimary(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                {locale === 'ar' ? 'معتمد أساسي' : 'Primary approver'}
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddMember}
            disabled={addingMember || !newPersonId.trim() || !newEffectiveFrom}
            style={btnPrimary(addingMember || !newPersonId.trim() || !newEffectiveFrom)}
          >
            {addingMember ? (locale === 'ar' ? 'جارٍ الإضافة…' : 'Adding…') : (locale === 'ar' ? '+ إضافة عضو' : '+ Add Member')}
          </button>
        </>
      )}
    </MdmDrawer>
  )
}
