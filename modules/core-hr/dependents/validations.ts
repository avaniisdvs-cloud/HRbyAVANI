import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import { EMIRATES_ID_REGEX } from '../validations'

export const AddDependentSchema = z.object({
  personId:        z.string().uuid(),
  relationship:    z.enum(['SPOUSE', 'CHILD', 'PARENT', 'PARENT_IN_LAW', 'SIBLING', 'OTHER']),
  firstNameEn:     z.string().min(1).max(100),
  middleNameEn:    z.string().max(100).optional(),
  lastNameEn:      z.string().min(1).max(100),
  fullNameAr:      z.string().min(1).max(300),
  dateOfBirth:     hrDateString(),
  gender:          z.enum(['MALE', 'FEMALE', 'NOT_SPECIFIED']),
  nationalityCode: z.string().regex(/^[A-Z]{3}$/),
  emiratesId:      z.string().regex(EMIRATES_ID_REGEX).optional(),
  emiratesIdExpiry: hrDateString().optional(),
  passportNumber:  z.string().min(6).max(20).optional(),
  passportCountry: z.string().regex(/^[A-Z]{3}$/).optional(),
  passportExpiry:  hrDateString().optional(),
  effectiveFrom:   hrDateString(),
})
export type AddDependentInput = z.infer<typeof AddDependentSchema>
