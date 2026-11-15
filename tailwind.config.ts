import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  darkMode: ['selector', '[data-dark="true"]'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--primary-foreground)', // white-on-teal for any shadcn class
          '050': 'var(--accent-050)',
          '100': 'var(--accent-100)',
          '200': 'var(--accent-200)',
          '500': 'var(--accent-500)',
          '700': 'var(--accent-700)',
          '900': 'var(--accent-900)',
        },
        ink: {
          '1': 'var(--ink-1)',
          '2': 'var(--ink-2)',
          '3': 'var(--ink-3)',
          '4': 'var(--ink-4)',
        },
        card: {
          DEFAULT:    'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        surface: 'var(--surface)',
        bg:      'var(--bg)',
        border:  'var(--border)',

        // ── shadcn/ui bridge — resolve to brand tokens via globals.css ──
        primary: {
          DEFAULT:    'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT:    'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT:    'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        popover: {
          DEFAULT:    'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        destructive: {
          DEFAULT:    'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        input:      'var(--input)',
        ring:       'var(--ring)',
        nav: {
          bg:           'var(--nav-bg)',
          fg:           'var(--nav-fg)',
          'fg-dim':     'var(--nav-fg-dim)',
          'fg-strong':  'var(--nav-fg-strong)',
          border:       'var(--nav-border)',
          'active-bg':  'var(--nav-active-bg)',
          'active-fg':  'var(--nav-active-fg)',
        },
        // ── Status surfaces (warning / info / success) ──
        // Hard Rule 7: warning panels use these tokens, never amber-* literals.
        'status-warning': {
          DEFAULT: 'var(--status-warning)',
          bg:      'var(--status-warning-bg)',
          fg:      'var(--status-warning-fg)',
          border:  'var(--status-warning-border)',
        },
        'status-info':    'var(--status-info)',
        'status-success': 'var(--status-success)',
        // ── Full status pill palette ──
        'status-pending':  { DEFAULT: 'var(--status-pending-dot)',  bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)',  dot: 'var(--status-pending-dot)' },
        'status-approved': { DEFAULT: 'var(--status-approved-dot)', bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)', dot: 'var(--status-approved-dot)' },
        'status-rejected': { DEFAULT: 'var(--status-rejected-dot)', bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)', dot: 'var(--status-rejected-dot)' },
        'status-draft':    { DEFAULT: 'var(--status-draft-dot)',    bg: 'var(--status-draft-bg)',    fg: 'var(--status-draft-fg)',    dot: 'var(--status-draft-dot)' },
      },
      fontFamily: {
        sans:  ['var(--font-sans)',  'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia',   'serif'],
        mono:  ['var(--font-mono)',  'ui-monospace', 'monospace'],
      },
      keyframes: {
        kenBurns0:    { from: { transform: 'scale(1) translate(0,0)' },        to: { transform: 'scale(1.09) translate(-1.5%,-1%)' } },
        kenBurns1:    { from: { transform: 'scale(1.06) translate(1.5%,0.5%)' }, to: { transform: 'scale(1) translate(0,1%)' } },
        kenBurns2:    { from: { transform: 'scale(1) translate(-1%,1.5%)' },   to: { transform: 'scale(1.07) translate(1%,-0.5%)' } },
        fadeIn:       { from: { opacity: '0' },                                 to: { opacity: '1' } },
        modalIn:      { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        kenBurns0:    'kenBurns0 9s ease-out forwards',
        kenBurns1:    'kenBurns1 9s ease-out forwards',
        kenBurns2:    'kenBurns2 9s ease-out forwards',
        fadeIn:       'fadeIn .22s ease',
        modalIn:      'modalIn .22s ease',
        slideInRight: 'slideInRight .22s ease',
      },
    },
  },
  // Safelist accent utility classes used via dynamic data-accent theming and
  // runtime string concatenation — Tailwind cannot detect these at scan time.
  safelist: [
    'bg-accent',
    'bg-accent-050',
    'bg-accent-100',
    'text-accent',
    'text-accent-700',
    'border-accent',
    'border-s-accent',
    'border-s-2',
  ],
  plugins: [],
}

export default config
