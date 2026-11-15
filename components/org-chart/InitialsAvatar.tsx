interface InitialsAvatarProps {
  name: string
  size?: number
}

export function InitialsAvatar({ name, size = 48 }: InitialsAvatarProps) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : (words[0]?.[0] ?? '?').toUpperCase()

  return (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   '50%',
        background:     'var(--accent-100)',
        color:          'var(--brand-active)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'var(--font-serif)',
        fontSize:       Math.round(size * 0.38),
        fontWeight:     600,
        flexShrink:     0,
        userSelect:     'none',
      }}
      aria-hidden
    >
      {initials}
    </div>
  )
}
