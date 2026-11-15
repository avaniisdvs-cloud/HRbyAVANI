import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const CreateBankDetailsSchema = z.object({
  personId:      z.string().uuid(),
  bankName:      z.string().min(1).max(200),
  bankCode:      z.string().min(1).max(20),
  iban:          z.string().regex(/^AE\d{21}$/, 'BR-WPS-004: UAE IBAN required'),
  accountName:   z.string().min(1).max(200),
  accountType:   z.enum(['CURRENT', 'SAVINGS', 'SALARY']).default('CURRENT'),
  currency:      z.string().length(3).default('AED'),
  isWpsAccount:  z.boolean().default(true),
  effectiveFrom: hrDateString(),
})
export type CreateBankDetailsInput = z.infer<typeof CreateBankDetailsSchema>
