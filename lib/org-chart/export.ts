'use client'
/**
 * Org Chart Export Utilities — Task F
 * PNG via html-to-image, PDF via jsPDF (A3 landscape).
 */

/** Returns background colour from CSS vars, fallback white. */
function getBgColor(): string {
  if (typeof window === 'undefined') return '#ffffff'
  return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff'
}

/** Shared node filter — strips React Flow controls/minimap from export. */
function exportFilter(domNode: HTMLElement): boolean {
  const cl = domNode.classList
  if (!cl) return true
  if (cl.contains('react-flow__controls'))                             return false
  if (cl.contains('react-flow__minimap'))                              return false
  if (cl.contains('react-flow__panel') && cl.contains('bottom-left')) return false
  return true
}

/**
 * Downloads the org chart canvas as a PNG file.
 * @param canvasSelector — CSS selector for the target element (e.g. '#org-chart-canvas .react-flow__viewport')
 */
export async function exportOrgChartPng(canvasSelector: string, companyName = 'AVANIIS'): Promise<void> {
  const { toPng } = await import('html-to-image')

  const node = document.querySelector(canvasSelector) as HTMLElement | null
  if (!node) throw new Error(`Canvas element not found: ${canvasSelector}`)

  const dataUrl = await toPng(node, {
    quality:         0.95,
    backgroundColor: getBgColor(),
    pixelRatio:      2,
    filter:          exportFilter,
  })

  const today = new Date().toISOString().split('T')[0]
  const link  = document.createElement('a')
  link.download = `${companyName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-org-chart-${today}.png`
  link.href     = dataUrl
  link.click()
}

/**
 * Downloads the org chart canvas as an A3 landscape PDF.
 * @param canvasSelector — CSS selector for the target element
 */
export async function exportOrgChartPdf(canvasSelector: string, companyName = 'AVANIIS'): Promise<void> {
  const { toPng }  = await import('html-to-image')
  const { default: jsPDF } = await import('jspdf')

  const node = document.querySelector(canvasSelector) as HTMLElement | null
  if (!node) throw new Error(`Canvas element not found: ${canvasSelector}`)

  // 1 — Generate PNG
  const dataUrl = await toPng(node, {
    quality:         0.95,
    backgroundColor: getBgColor(),
    pixelRatio:      2,
    filter:          exportFilter,
  })

  // 2 — A3 landscape PDF
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const W   = pdf.internal.pageSize.getWidth()
  const H   = pdf.internal.pageSize.getHeight()

  // 3 — Header bar
  const today = new Date().toLocaleDateString('en-AE', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  pdf.setFillColor(248, 248, 248)
  pdf.rect(0, 0, W, 14, 'F')
  pdf.setFontSize(10)
  pdf.setTextColor(60, 60, 60)
  pdf.text(`${companyName} HR — Organisation Chart`, 12, 9)
  pdf.text(`Generated: ${today}`, W - 12, 9, { align: 'right' })

  // 4 — Org chart image below header
  const imgH = H - 14
  pdf.addImage(dataUrl, 'PNG', 0, 14, W, imgH, '', 'FAST')

  // 5 — Download
  const filename = `${companyName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-org-chart-${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}
