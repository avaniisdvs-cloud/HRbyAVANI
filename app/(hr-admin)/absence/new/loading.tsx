import { Loader2 } from 'lucide-react'

export default function NewLeaveRequestLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 'calc(100vh - 104px)', gap: 10,
      color: 'var(--ink-3)', fontSize: 14,
    }}>
      <Loader2 size={18} style={{ animation: 'spin 0.75s linear infinite' }} />
      Loading leave request form…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
