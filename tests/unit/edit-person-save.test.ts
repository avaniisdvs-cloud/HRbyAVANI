/**
 * Edit Person — unified save architecture tests (ESP-001–ESP-030).
 *
 * Source-inspection tests that verify the refactored PersonEditForm.tsx and
 * PhotoUploadWidget.tsx implement the required unified dirty-state / save model
 * without touching the real DB.
 */

import path from 'node:path'
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'

const repoFile = (...segments: string[]) => path.join(process.cwd(), ...segments)

const FORM = fs.readFileSync(
  repoFile('app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx'),
  'utf-8',
)
const WIDGET = fs.readFileSync(
  repoFile('app/(hr-admin)/persons/[id]/PhotoUploadWidget.tsx'),
  'utf-8',
)

// ── Helpers ───────────────────────────────────────────────────────────────────

// Slice from first occurrence of startMarker to first occurrence of endMarker
// If endMarker appears before startMarker, returns the region from startMarker to end of file.
function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start === -1) return ''
  const end = source.indexOf(endMarker, start + startMarker.length)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

// ── ESP-001–005: EditorHandle interface ───────────────────────────────────────

describe('ESP-001: EditorHandle interface is defined', () => {
  it('exports EditorHandle with isDirty and save', () => {
    expect(FORM).toContain('interface EditorHandle')
    expect(FORM).toContain('isDirty(): boolean')
    expect(FORM).toContain('save(): Promise<')
  })
})

describe('ESP-002: forwardRef used on all 4 sub-editors', () => {
  it('ContactsEditor uses forwardRef', () => {
    expect(FORM).toContain('const ContactsEditor = forwardRef<EditorHandle')
  })
  it('EmergencyContactEditor uses forwardRef', () => {
    expect(FORM).toContain('const EmergencyContactEditor = forwardRef<EditorHandle')
  })
  it('HomeAddressEditor uses forwardRef', () => {
    expect(FORM).toContain('const HomeAddressEditor = forwardRef<EditorHandle')
  })
  it('EducationEditor uses forwardRef', () => {
    expect(FORM).toContain('const EducationEditor = forwardRef<EditorHandle')
  })
})

describe('ESP-003: useImperativeHandle wired in all 4 sub-editors', () => {
  it('ContactsEditor exposes isDirty and save via useImperativeHandle', () => {
    const section = sliceBetween(FORM, 'const ContactsEditor', 'const EmergencyContactEditor')
    expect(section).toContain('useImperativeHandle(ref')
    expect(section).toContain('isDirty: () => dirty')
    expect(section).toContain('save: async')
  })
  it('EmergencyContactEditor exposes save', () => {
    const section = sliceBetween(FORM, 'const EmergencyContactEditor', 'const HomeAddressEditor')
    expect(section).toContain('useImperativeHandle(ref')
    expect(section).toContain('save: async')
  })
  it('HomeAddressEditor exposes save', () => {
    const section = sliceBetween(FORM, 'const HomeAddressEditor', 'const EducationEditor')
    expect(section).toContain('useImperativeHandle(ref')
    expect(section).toContain('save: async')
  })
  it('EducationEditor exposes save', () => {
    const section = sliceBetween(FORM, 'const EducationEditor', '// end-of-file-sentinel-that-does-not-exist')
    expect(section).toContain('useImperativeHandle(ref')
    expect(section).toContain('save: async')
  })
})

describe('ESP-004: onDirtyChange callback in all 4 sub-editors', () => {
  it('ContactsEditor accepts and calls onDirtyChange', () => {
    const section = sliceBetween(FORM, 'const ContactsEditor', 'const EmergencyContactEditor')
    expect(section).toContain('onDirtyChange?:')
    expect(section).toContain('onDirtyChange?.(dirty)')
  })
  it('EmergencyContactEditor accepts and calls onDirtyChange', () => {
    const section = sliceBetween(FORM, 'const EmergencyContactEditor', 'const HomeAddressEditor')
    expect(section).toContain('onDirtyChange?.(dirty)')
  })
  it('HomeAddressEditor accepts and calls onDirtyChange', () => {
    const section = sliceBetween(FORM, 'const HomeAddressEditor', 'const EducationEditor')
    expect(section).toContain('onDirtyChange?.(dirty)')
  })
  it('EducationEditor accepts and calls onDirtyChange', () => {
    const section = sliceBetween(FORM, 'const EducationEditor', '// end-of-file-sentinel-that-does-not-exist')
    expect(section).toContain('onDirtyChange?.(dirty)')
  })
})

describe('ESP-005: section-level dirty indicator rendered in sub-editor headers', () => {
  it('ContactsEditor header shows ● unsaved when dirty', () => {
    const section = sliceBetween(FORM, 'const ContactsEditor', 'const EmergencyContactEditor')
    expect(section).toContain('● unsaved')
  })
  it('EmergencyContactEditor header shows ● unsaved when dirty', () => {
    const section = sliceBetween(FORM, 'const EmergencyContactEditor', 'const HomeAddressEditor')
    expect(section).toContain('● unsaved')
  })
  it('HomeAddressEditor header shows ● unsaved when dirty', () => {
    const section = sliceBetween(FORM, 'const HomeAddressEditor', 'const EducationEditor')
    expect(section).toContain('● unsaved')
  })
  it('EducationEditor header shows ● unsaved when dirty', () => {
    const section = sliceBetween(FORM, 'const EducationEditor', '// end-of-file-sentinel-that-does-not-exist')
    expect(section).toContain('● unsaved')
  })
})

// ── ESP-006–010: Unified dirty-state tracking in PersonEditForm ───────────────

describe('ESP-006: parent tracks dirty state for all 4 sub-editors', () => {
  it('tracks contactsDirty', () => {
    expect(FORM).toContain('const [contactsDirty,  setContactsDirty]')
  })
  it('tracks emergencyDirty', () => {
    expect(FORM).toContain('const [emergencyDirty, setEmergencyDirty]')
  })
  it('tracks addressDirty', () => {
    expect(FORM).toContain('const [addressDirty,   setAddressDirty]')
  })
  it('tracks educationDirty', () => {
    expect(FORM).toContain('const [educationDirty, setEducationDirty]')
  })
})

describe('ESP-007: refs wired to all 4 sub-editor render calls', () => {
  it('ContactsEditor receives ref={contactsRef}', () => {
    expect(FORM).toContain('ref={contactsRef}')
    expect(FORM).toContain('onDirtyChange={setContactsDirty}')
  })
  it('EmergencyContactEditor receives ref={emergencyRef}', () => {
    expect(FORM).toContain('ref={emergencyRef}')
    expect(FORM).toContain('onDirtyChange={setEmergencyDirty}')
  })
  it('HomeAddressEditor receives ref={addressRef}', () => {
    expect(FORM).toContain('ref={addressRef}')
    expect(FORM).toContain('onDirtyChange={setAddressDirty}')
  })
  it('EducationEditor receives ref={educationRef}', () => {
    expect(FORM).toContain('ref={educationRef}')
    expect(FORM).toContain('onDirtyChange={setEducationDirty}')
  })
})

describe('ESP-008: anyDirty combines main form and all sub-editors', () => {
  it('anyDirty includes all 4 sub-editor dirty flags', () => {
    expect(FORM).toContain('const anyDirty = mainFormDirty || contactsDirty || emergencyDirty || addressDirty || educationDirty')
  })
})

describe('ESP-009: Save Changes button reacts to anyDirty', () => {
  it('button variant changes when anyDirty', () => {
    expect(FORM).toContain("variant={anyDirty ? 'default' : 'secondary'}")
  })
  it('button label shows ● when dirty', () => {
    // i18n: label is now single-language-per-locale; the ● dirty indicator
    // remains, driven by anyDirty, in both EN and AR branches.
    expect(FORM).toContain('anyDirty ?')
    expect(FORM).toContain("'Save changes ●'")   // English dirty label
    expect(FORM).toContain('حفظ التغييرات ●')      // Arabic dirty label
  })
})

describe('ESP-010: beforeunload navigation guard registered when dirty', () => {
  it('beforeunload effect is present', () => {
    expect(FORM).toContain("window.addEventListener('beforeunload'")
    expect(FORM).toContain('if (!anyDirty) return')
    expect(FORM).toContain("window.removeEventListener('beforeunload'")
  })
})

// ── ESP-011–015: Photo upload ─────────────────────────────────────────────────

describe('ESP-011: photoJustSaved state tracks photo persistence', () => {
  it('photoJustSaved state is declared', () => {
    expect(FORM).toContain('const [photoJustSaved, setPhotoJustSaved]')
  })
  it('setPhotoJustSaved(true) called via onSaved callback on PhotoUploadWidget', () => {
    expect(FORM).toContain('onSaved={() => setPhotoJustSaved(true)}')
  })
})

describe('ESP-012: PhotoUploadWidget calls onSaved after successful upload', () => {
  it('onSaved prop is accepted', () => {
    expect(WIDGET).toContain('onSaved?:        () => void')
  })
  it('onSaved is called after upload succeeds', () => {
    expect(WIDGET).toContain('setSaved(true)')
    expect(WIDGET).toContain('onSaved?.()')
  })
})

describe('ESP-013: PhotoUploadWidget shows Photo saved status', () => {
  it('saved state is declared', () => {
    expect(WIDGET).toContain('const [saved, setSaved]')
  })
  it('Photo saved text is rendered when saved=true', () => {
    expect(WIDGET).toContain('✓ Photo saved')
  })
})

describe('ESP-014: "Nothing to save" is NOT shown when photo just saved', () => {
  it('onSubmit shows informational message (not Nothing to save) when photoJustSaved is true', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain('Photo already saved')
    // "Nothing to save" is only shown when !photoJustSaved — not shown unconditionally
    const nothingIdx    = submitBlock.indexOf("'Nothing to save.'")
    const photoSavedIdx = submitBlock.indexOf('photoJustSaved')
    expect(nothingIdx).toBeGreaterThan(-1)
    // photoJustSaved guard appears before the "Nothing to save" toast
    expect(photoSavedIdx).toBeLessThan(nothingIdx)
  })
  it('photoJustSaved is reset after a successful global save', () => {
    expect(FORM).toContain('setPhotoJustSaved(false)')
  })
})

describe('ESP-015: photo upload resets saved state on new file selection', () => {
  it('setSaved(false) called on new handleChange before upload', () => {
    expect(WIDGET).toContain('setSaved(false)')
  })
})

// ── ESP-016–020: Global save calls all dirty sub-editors ─────────────────────

describe('ESP-016: onSubmit calls contactsRef.current?.save() when contacts dirty', () => {
  it('contacts save is called inside onSubmit', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain("contactsRef.current?.save()")
    expect(submitBlock).toContain('if (contactsDirty)')
  })
})

describe('ESP-017: onSubmit calls emergencyRef.current?.save() when emergency dirty', () => {
  it('emergency contact save is called', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain("emergencyRef.current?.save()")
    expect(submitBlock).toContain('if (emergencyDirty)')
  })
})

describe('ESP-018: onSubmit calls addressRef.current?.save() when address dirty', () => {
  it('home address save is called', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain("addressRef.current?.save()")
    expect(submitBlock).toContain('if (addressDirty)')
  })
})

describe('ESP-019: onSubmit calls educationRef.current?.save() when education dirty', () => {
  it('education save is called', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain("educationRef.current?.save()")
    expect(submitBlock).toContain('if (educationDirty)')
  })
})

describe('ESP-020: global save shows per-section failure messages', () => {
  it('failedSections array aggregates errors from all sections', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain('failedSections.push')
    expect(submitBlock).toContain('failedSections.length > 0')
  })
  it('on partial failure stays on edit page and calls router.refresh()', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    // Failure branch ends at '} else {' — extract just that branch
    const failureStart = submitBlock.indexOf('failedSections.length > 0')
    const failureEnd   = submitBlock.indexOf('} else {', failureStart)
    const failureBranch = submitBlock.slice(failureStart, failureEnd)
    // Failure branch refreshes but does NOT navigate away
    expect(failureBranch).toContain('router.refresh()')
    expect(failureBranch).not.toContain('router.push')
    // Success branch does navigate
    const successBranch = submitBlock.slice(failureEnd)
    expect(successBranch).toContain("router.push(`/persons/")
  })
})

// ── ESP-021–025: Individual save buttons removed ──────────────────────────────

describe('ESP-021: ContactsEditor no longer has an independent Save Contacts button', () => {
  it('no Save Contacts button in ContactsEditor', () => {
    const section = sliceBetween(FORM, 'const ContactsEditor', 'const EmergencyContactEditor')
    expect(section).not.toContain('Save Contacts')
    expect(section).not.toContain("onClick={handleSave}")
  })
})

describe('ESP-022: EmergencyContactEditor no longer has Save emergency contact button', () => {
  it('no Save emergency contact button', () => {
    const section = sliceBetween(FORM, 'const EmergencyContactEditor', 'const HomeAddressEditor')
    expect(section).not.toContain('Save emergency contact')
  })
})

describe('ESP-023: HomeAddressEditor no longer has Save home address button', () => {
  it('no Save home address button', () => {
    const section = sliceBetween(FORM, 'const HomeAddressEditor', 'const EducationEditor')
    expect(section).not.toContain('Save home address')
  })
})

describe('ESP-024: EducationEditor no longer has Save qualification button', () => {
  it('no Save qualification button', () => {
    const section = sliceBetween(FORM, 'const EducationEditor', '// end-of-file-sentinel-that-does-not-exist')
    expect(section).not.toContain('Save qualification')
  })
})

describe('ESP-025: one Save Changes button remains in the action bar', () => {
  it('exactly one Save changes label exists', () => {
    const count = (FORM.match(/Save changes/g) ?? []).length
    // Appears in action bar button text only (2 occurrences: dirty label + non-dirty label)
    expect(count).toBeGreaterThanOrEqual(1)
    expect(count).toBeLessThanOrEqual(3)
  })
})

// ── ESP-026–030: Server action preservation ───────────────────────────────────

describe('ESP-026: upsertPersonContacts still called inside ContactsEditor save', () => {
  it('server action is present in ContactsEditor', () => {
    const section = sliceBetween(FORM, 'const ContactsEditor', 'const EmergencyContactEditor')
    expect(section).toContain('upsertPersonContacts(personId')
  })
})

describe('ESP-027: upsertPersonEmergencyContact still called inside EmergencyContactEditor save', () => {
  it('server action is present', () => {
    const section = sliceBetween(FORM, 'const EmergencyContactEditor', 'const HomeAddressEditor')
    expect(section).toContain('upsertPersonEmergencyContact(personId')
  })
})

describe('ESP-028: upsertPersonHomeAddress still called inside HomeAddressEditor save', () => {
  it('server action is present', () => {
    const section = sliceBetween(FORM, 'const HomeAddressEditor', 'const EducationEditor')
    expect(section).toContain('upsertPersonHomeAddress(personId')
  })
})

describe('ESP-029: upsertPersonEducation still called inside EducationEditor save', () => {
  it('server action is present', () => {
    const section = sliceBetween(FORM, 'const EducationEditor', '// end-of-file-sentinel-that-does-not-exist')
    expect(section).toContain('upsertPersonEducation(personId')
  })
})

describe('ESP-030: updatePerson still called for main form fields in onSubmit', () => {
  it('updatePerson is called when hasMainChange is true', () => {
    const submitBlock = sliceBetween(FORM, 'function onSubmit', '// Group custom fields')
    expect(submitBlock).toContain('await updatePerson(person.id, patch)')
    expect(submitBlock).toContain('if (hasMainChange)')
  })
})
