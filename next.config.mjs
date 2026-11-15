/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

const nextConfig = {
  // Keep @react-pdf/renderer out of the server bundle — it is a large,
  // Node-only package (fontkit, pdfkit). Requiring it at runtime keeps the
  // serverless function smaller and cold starts faster. (The React #31 letter
  // crash was ultimately fixed by aligning react/react-dom to v19, which is
  // what Next 15.3.9 already runs at runtime — see commit message.)
  serverExternalPackages: ['@react-pdf/renderer', 'isomorphic-dompurify', 'jsdom'],

  experimental: {
    webpackMemoryOptimizations: true,
  },

  webpack: (config, { dev }) => {
    if (dev) {
      // Preserve Next.js's filesystem cache instead of retaining every compiled
      // HR route in memory throughout long development and verification sessions.
      // Exclude uploaded documents from the file-change watcher so that
      // writing test/UAT files to public/uploads/ does not trigger a hot reload
      // (which causes ERR_CONNECTION_REFUSED in concurrent Playwright tests).
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : []),
          '**/public/uploads/**',
        ],
      }
    }
    return config
  },

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  async redirects() {
    return [
      { source: '/timesheet', destination: '/me/timesheet', permanent: true },
    ]
  },

  // ── HTTP Security Headers (SEC-02/03 — NFR hardening) ─────────────────────
  // Closes: Content-Security-Policy, X-Frame-Options, clickjacking, MIME-sniff,
  // HSTS (enforced once the app runs on HTTPS in staging/production).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // ── Clickjacking prevention (SEC-03) ──────────────────────────────
          {
            key:   'X-Frame-Options',
            value: 'DENY',
          },
          // ── MIME-type sniffing ─────────────────────────────────────────────
          {
            key:   'X-Content-Type-Options',
            value: 'nosniff',
          },
          // ── HTTPS enforcement (activate once TLS is live) ──────────────────
          {
            key:   'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // ── Referrer policy ───────────────────────────────────────────────
          {
            key:   'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // ── Permissions policy — restrict dangerous APIs ───────────────────
          {
            key:   'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=()',
          },
          // ── Content Security Policy (SEC-02) ──────────────────────────────
          // Allowlist:
          //   self          — app origin
          //   login.microsoftonline.com — Entra ID SSO flow
          //   *.blob.core.windows.net  — Azure Blob Storage (document vault)
          //   'unsafe-inline' scripts  — required for the theme FOUC-prevention
          //                              script injected via dangerouslySetInnerHTML
          //                              in app/layout.tsx. Remove once migrated
          //                              to a nonce or script hash.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' required in dev for Next.js eval-source-map devtool.
              // Omitted in production where source maps use a non-eval devtool.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline'",            // Tailwind inlines styles
              "img-src 'self' data: blob: *.blob.core.windows.net",
              "font-src 'self'",
              "connect-src 'self' login.microsoftonline.com *.blob.core.windows.net",
              "frame-ancestors 'none'",                      // belt-and-suspenders with X-Frame-Options
              "form-action 'self' login.microsoftonline.com",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
