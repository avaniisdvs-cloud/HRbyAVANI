'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'

export async function loginAction(
  email: string,
  password: string,
): Promise<{ error: string } | undefined> {
  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Invalid email or password' }
    }
    // Re-throw NEXT_REDIRECT — Next.js handles the navigation client-side
    throw err
  }
}
