'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState, useEffect } from 'react'
import { FileText, Search, Upload, ExternalLink,
         ChevronRight, BookOpen, CheckCircle,
         Clock, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getKnowledgeSources } from '@/modules/aria'
import type { KnowledgeSource } from '@/modules/aria'

interface Props {
  onAskAria: (prompt: string) => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function typeLabel(t: string): string {
  switch (t) {
    case 'pdf':  return 'PDF'
    case 'docx': return 'Word'
    case 'url':  return 'URL'
    case 'text': return 'Text'
    default:     return t.toUpperCase()
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string; icon: React.ReactNode }> = {
    indexed: {
      label: 'Indexed',
      bg: 'var(--status-approved-bg)',
      fg: 'var(--status-approved-fg)',
      icon: <CheckCircle size={10} />,
    },
    processing: {
      label: 'Processing',
      bg: 'var(--status-pending-bg)',
      fg: 'var(--status-pending-fg)',
      icon: <Clock size={10} />,
    },
    pending: {
      label: 'Pending',
      bg: 'var(--status-draft-bg)',
      fg: 'var(--status-draft-fg)',
      icon: <Clock size={10} />,
    },
    failed: {
      label: 'Failed',
      bg: 'var(--status-rejected-bg)',
      fg: 'var(--status-rejected-fg)',
      icon: <AlertCircle size={10} />,
    },
  }
  const s = map[status] ?? map.pending
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 999,
      fontSize: 'var(--text-caption)',
      fontWeight: 600,
      background: s.bg,
      color: s.fg,
    }}>
      {s.icon}{s.label}
    </span>
  )
}

export default function AriaCompanyPoliciesView({ onAskAria }: Props) {
  const router                       = useRouter()
  const [docs, setDocs]   = useState<KnowledgeSource[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const data = await getKnowledgeSources()
        setDocs(data)
      } catch (e) {
        console.error('[Policies]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])


  const hasDocuments = docs.length > 0

  const filtered = query.trim()
    ? docs.filter(d =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      )
    : docs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
        <SectionTitle style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--ink-1)',
          margin: '0 0 2px',
        }}>
          Company Policies
        </SectionTitle>
        <p style={{ fontSize: '12px', color: 'var(--ink-3)', margin: '0 0 14px' }}>
          {hasDocuments
            ? `${docs.length} document${docs.length !== 1 ? 's' : ''} available · ARIA can answer questions from these`
            : 'Upload policy documents to enable ARIA policy answers'
          }
        </p>

        {hasDocuments && (
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-4)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim()) {
                  onAskAria(`Based on company policies: ${query.trim()}`)
                }
              }}
              placeholder="Search policies or press Enter to ask ARIA..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--ink-1)',
                background: 'var(--surface)',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10, color: 'var(--ink-4)' }}>
            <BookOpen size={28} />
            <span style={{ fontSize: 'var(--text-body)' }}>Loading documents...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !hasDocuments && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 14, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-4)',
            }}>
              <Upload size={24} />
            </div>

            <div>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: '0 0 6px', fontFamily: 'var(--font-serif)' }}>
                No policy documents yet
              </p>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
                Upload your HR policy handbook, leave policy, and other company
                documents so ARIA can answer policy questions accurately.
              </p>
            </div>

            <button
              onClick={() => router.push('/settings/ai-agent')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', background: 'var(--accent)',
                color: "var(--on-accent)", border: 'none', borderRadius: 8,
                fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Upload size={14} />
              Upload Documents
              <ExternalLink size={12} />
            </button>

            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: 0 }}>
              Supports PDF, DOCX, TXT · Max 25MB each
            </p>
          </div>
        )}

        {/* No search results */}
        {!loading && hasDocuments && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--ink-4)', fontSize: 'var(--text-body)' }}>
            No documents match your search.<br />
            Press Enter to ask ARIA directly.
          </div>
        )}

        {/* Document list */}
        {!loading && filtered.map(doc => (
          <div
            key={doc.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, marginBottom: 8,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: 'var(--brand-active)',
            }}>
              <FileText size={16} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{
                  fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {doc.name}
                </span>
                <StatusBadge status={doc.vectorStatus} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {typeLabel(doc.sourceType)}
                </span>
                {doc.fileSizeBytes && (
                  <span>{formatSize(doc.fileSizeBytes)}</span>
                )}
                {doc.indexedAt && (
                  <span>
                    Indexed {new Date(doc.indexedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              {doc.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {doc.tags.slice(0, 4).map(tag => (
                    <span key={tag} style={{
                      padding: '1px 7px',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 999, fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => onAskAria(
                `Based on the document "${doc.name}": what are the key policies and rules I should know about?`
              )}
              disabled={doc.vectorStatus !== 'indexed'}
              title={doc.vectorStatus !== 'indexed' ? 'Document not yet indexed' : 'Ask ARIA about this document'}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 12px',
                background: doc.vectorStatus === 'indexed' ? 'var(--surface)' : 'transparent',
                border: '1px solid var(--border)', borderRadius: 7,
                fontSize: 'var(--text-caption)', fontWeight: 500,
                color: doc.vectorStatus === 'indexed' ? 'var(--brand-active)' : 'var(--ink-4)',
                cursor: doc.vectorStatus === 'indexed' ? 'pointer' : 'not-allowed',
                flexShrink: 0, fontFamily: 'var(--font-sans)',
              }}
            >
              Ask ARIA
              <ChevronRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
