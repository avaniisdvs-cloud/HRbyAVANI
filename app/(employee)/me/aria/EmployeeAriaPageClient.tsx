'use client'
/**
 * EmployeeAriaPageClient — manages the welcome/chat view transition.
 *
 * Shows EmployeeAriaWelcome as an overlay until the first message is sent.
 * AriaChatClient is always mounted so the input bar is ready immediately.
 */
import { useState } from 'react'
import AriaChatClient from '@/components/aria/AriaChatClient'
import EmployeeAriaWelcome from '@/components/aria/EmployeeAriaWelcome'
import type { AriaSessionContext, EmployeeAriaContext } from '@/modules/aria'

interface Props {
  sessionCtx:  AriaSessionContext
  ariaContext: EmployeeAriaContext
  userName:    string
  locale:      'en' | 'ar'
}

export default function EmployeeAriaPageClient({
  sessionCtx,
  ariaContext,
  userName,
  locale,
}: Props) {
  const [hasMessages, setHasMessages]       = useState(false)
  const [prefilledPrompt, setPrefilledPrompt] = useState('')

  const handlePromptClick = (prompt: string) => {
    setPrefilledPrompt(prompt)
    setHasMessages(true)
  }

  return (
    <div style={{
      position: 'relative',
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Welcome screen overlay — hidden once the first message is sent */}
      {!hasMessages && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          overflowY: 'auto',
          background: 'var(--card)',
        }}>
          <EmployeeAriaWelcome
            context={ariaContext}
            onPromptClick={handlePromptClick}
            locale={locale}
            userName={userName}
          />
        </div>
      )}

      {/* AriaChatClient — always mounted so the input bar is ready */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <AriaChatClient
          sessionCtx={sessionCtx}
          prefilledPrompt={prefilledPrompt}
        />
      </div>
    </div>
  )
}
