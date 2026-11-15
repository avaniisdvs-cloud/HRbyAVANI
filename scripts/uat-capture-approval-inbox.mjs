#!/usr/bin/env node
/**
 * VERIFICATION HARNESS ONLY — drives a real Chromium against the LOCAL dev
 * server using a pre-minted UAT session (scripts/mint-uat-session.mjs) and
 * captures browser evidence for the manager-approval-inbox fix. Read-only:
 * navigates and screenshots; performs NO approve/reject actions.
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.UAT_BASE_URL || 'http://localhost:3000'
const EVID = 'evidence/p0-approval-verification'
mkdirSync(EVID, { recursive: true })

const who = process.argv[2] || 'k1207'                       // label
const stateFile = process.argv[3] || 'tests/e2e/auth/k1207-uat.json'
const storageState = JSON.parse(readFileSync(stateFile, 'utf8'))

const results = {}
const browser = await chromium.launch()
const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const grab = async (sel) => { try { return (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() } catch { return null } }
const shot = async (name) => { await page.screenshot({ path: `${EVID}/${who}-${name}.png`, fullPage: true }) }

try {
  // ── A. Overview / landing ───────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(800)
  await shot('A-overview')
  const bodyA = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  // Pending Approvals card: the big number follows the "Pending Approvals" label.
  const pa = bodyA.match(/Pending Approvals\s+(\d+)/i)
  results.overviewPendingCard = pa ? pa[1] : '(label "Pending Approvals" not found — see screenshot)'
  results.overviewNeedsReview_noPending = /No pending requests/i.test(bodyA)
  results.overviewMentionsLR1 = /LR-0000001/.test(bodyA)

  // ── B. Approvals page ───────────────────────────────────────────────────
  await page.goto(`${BASE}/approvals`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(600)
  await shot('B-approvals-pending')
  const bodyB = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  results.approvalsAllCaughtUp = /All caught up|No approval steps are currently assigned/i.test(bodyB)
  // Count rows in the pending table (Review links), if any.
  results.approvalsReviewButtons = await page.locator('a:has-text("Review")').count()
  results.approvalsMentionsLR1 = /LR-0000001/.test(bodyB)

  // ── C. /workflows ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/workflows`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(600)
  await shot('C-workflows')
  const bodyC = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const wf = bodyC.match(/(\d+)\s+pending/i)
  results.workflowsPending = wf ? wf[1] : '(no "N pending" text — see screenshot)'

  // ── D. Notification drawer (bell) ─────────────────────────────────────────
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(500)
  const bell = page.locator('button[aria-label*="Notification" i]').first()
  if (await bell.count()) {
    await bell.click()
    await page.waitForTimeout(900)
    const dialog = page.locator('[role="dialog"][aria-label*="Notification" i], [role="dialog"]').first()
    await shot('D-notification-drawer')
    const drawer = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ')
    results.drawerText = drawer.slice(0, 400)
    // Active (not actioned) awaiting-approval items would render Approve buttons.
    results.drawerApproveButtons = await dialog.locator('button:has-text("Approve")').count()
    results.drawerHasActionedSection = /Actioned|Done/i.test(drawer)

    // ── E. Open each "awaiting approval" item; record the CANCELLED one ──────
    const items = dialog.locator('button:has-text("Awaiting Your Approval")')
    const n = await items.count()
    results.awaitingItems = n
    const opened = []
    for (let i = 0; i < n; i++) {
      await items.nth(i).click()
      // Wait for the detail panel to finish loading (no longer "Loading…").
      await page.waitForFunction(() => {
        const d = document.querySelector('[role="dialog"]')
        return d && !/Loading…/.test(d.textContent || '')
      }, { timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(400)
      const detail = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ')
      const status = (detail.match(/Status:?\s*([A-Z]+)/) || [])[1] || null
      const ref    = (detail.match(/Ref ?#:?\s*([A-Za-z0-9-]+)/) || [])[1] || null
      const rec = {
        idx: i, refNumber: ref, status,
        approveButtons: await dialog.locator('button:has-text("Approve")').count(),
        rejectButtons:  await dialog.locator('button:has-text("Reject")').count(),
        notActionableNote: /no longer actionable/i.test(detail),
      }
      opened.push(rec)
      if (status === 'CANCELLED' || ref === 'LR-0000001') await shot(`E-detail-${ref || i}-${status}`)
    }
    results.openedDetails = opened
    results.lr1 = opened.find(o => o.refNumber === 'LR-0000001' || o.status === 'CANCELLED') || null
  } else {
    results.drawerNote = 'Notification bell not found on the page.'
  }

  console.log(JSON.stringify({ who, base: BASE, at: new Date().toISOString(), results }, null, 2))
} finally {
  await ctx.close(); await browser.close()
}
