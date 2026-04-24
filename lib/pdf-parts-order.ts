import jsPDF from 'jspdf'

export interface PartsOrderRow {
  code: string
  description: string
  brand?: string
  quantity: number
  urgency: 'urgent' | 'normal'
  supplier?: string
  supplierRef?: string
}

export interface PartsOrderData {
  workOrderId: string
  customerName: string
  siteName: string
  deviceBrand: string
  deviceModel: string
  parts: PartsOrderRow[]
  includeSupplier: boolean
  date?: string
}

const C = {
  dark:    [47, 52, 58]    as const,
  orange:  [242, 140, 40]  as const,
  red:     [214, 69, 69]   as const,
  textDark:[31, 41, 51]    as const,
  textGray:[107, 114, 128] as const,
  border:  [229, 231, 235] as const,
  rowAlt:  [244, 246, 248] as const,
  white:   [255, 255, 255] as const,
}

function fill(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2])
}
function stroke(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2])
}
function textColor(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2])
}

function fmtDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function generatePartsOrderPDF(data: PartsOrderData): Blob {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 15, mR = 15
  const cW = pageW - mL - mR
  let y = 0

  function footer() {
    const n = doc.getNumberOfPages()
    doc.setFontSize(8)
    textColor(doc, C.textGray)
    doc.text('Bossuyt Service — Bestelbon onderdelen', mL, pageH - 8)
    doc.text(`Pagina ${n}`, pageW - mR, pageH - 8, { align: 'right' })
    stroke(doc, C.border)
    doc.line(mL, pageH - 12, pageW - mR, pageH - 12)
  }

  function checkPage(needed: number) {
    if (y + needed > pageH - 18) {
      footer()
      doc.addPage()
      y = 15
    }
  }

  // ── Header block ────────────────────────────────────────────────────────────
  fill(doc, C.dark)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.white)
  doc.text('BOSSUYT SERVICE', mL, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  textColor(doc, C.orange)
  doc.text('BESTELBON ONDERDELEN', mL, 20)
  doc.setFontSize(8)
  textColor(doc, C.white)
  doc.text(`Ref: ${data.workOrderId}`, pageW - mR, 12, { align: 'right' })
  doc.text(`Datum: ${fmtDate(data.date)}`, pageW - mR, 20, { align: 'right' })
  y = 36

  // ── Info block ──────────────────────────────────────────────────────────────
  stroke(doc, C.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(mL, y, cW, 22, 2, 2, 'S')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.textGray)
  doc.text('KLANT', mL + 4, y + 6)
  doc.text('LOCATIE', mL + cW / 2 + 2, y + 6)

  doc.setFont('helvetica', 'normal')
  textColor(doc, C.textDark)
  doc.setFontSize(9)
  doc.text(data.customerName, mL + 4, y + 12)
  doc.text(data.siteName, mL + cW / 2 + 2, y + 12)

  doc.setFontSize(8)
  textColor(doc, C.textGray)
  const device = [data.deviceBrand, data.deviceModel].filter(Boolean).join(' ')
  if (device) doc.text(`Toestel: ${device}`, mL + 4, y + 19)

  y += 30

  // ── Table header ────────────────────────────────────────────────────────────
  const urgentCount = data.parts.filter(p => p.urgency === 'urgent').length
  if (urgentCount > 0) {
    fill(doc, C.red)
    doc.roundedRect(mL, y, cW, 8, 1, 1, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    textColor(doc, C.white)
    doc.text(`${urgentCount} dringend onderdeel${urgentCount > 1 ? 'en' : ''} — prioriteit behandeling gevraagd`, mL + 4, y + 5.5)
    y += 12
  }

  // Column widths — two fixed layouts depending on whether supplier info is shown
  // All values in mm; columns must sum to cW (180mm on A4 with 15mm margins each side)
  const colCode  = 30
  const colBrand = 22
  const colQty   = 14
  const colSuppl = data.includeSupplier ? 32 : 0
  const colRef   = data.includeSupplier ? 24 : 0
  const colDesc  = cW - colCode - colBrand - colQty - colSuppl - colRef

  const rowH = 7
  checkPage(rowH + 4)

  // ── Column header row ───────────────────────────────────────────────────────
  fill(doc, C.dark)
  doc.rect(mL, y, cW, rowH + 1, 'F')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.white)

  let x = mL + 3
  doc.text('ARTIKELCODE',  x, y + 5); x += colCode
  doc.text('OMSCHRIJVING', x, y + 5); x += colDesc
  doc.text('MERK',         x, y + 5); x += colBrand
  if (data.includeSupplier) {
    doc.text('LEVERANCIER', x, y + 5); x += colSuppl
    doc.text('REF',         x, y + 5); x += colRef
  }
  doc.text('AANTAL', x, y + 5)

  y += rowH + 1

  // ── Table rows ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')

  data.parts.forEach((part, idx) => {
    checkPage(rowH + 2)

    if (idx % 2 === 1) {
      fill(doc, C.rowAlt)
      doc.rect(mL, y, cW, rowH, 'F')
    }

    if (part.urgency === 'urgent') {
      fill(doc, C.red)
      doc.rect(mL, y, 2, rowH, 'F')
    }

    doc.setFontSize(8)
    textColor(doc, C.textDark)

    x = mL + 3
    doc.text(part.code || '—',         x, y + 5, { maxWidth: colCode - 2 });  x += colCode
    doc.text(part.description || '—',  x, y + 5, { maxWidth: colDesc - 2 });  x += colDesc
    doc.text(part.brand || '—',        x, y + 5, { maxWidth: colBrand - 2 }); x += colBrand
    if (data.includeSupplier) {
      doc.text(part.supplier || '—',     x, y + 5, { maxWidth: colSuppl - 2 }); x += colSuppl
      doc.text(part.supplierRef || '—',  x, y + 5, { maxWidth: colRef - 2 });   x += colRef
    }
    doc.text(String(part.quantity),    x, y + 5)

    y += rowH
  })

  // Bottom border
  stroke(doc, C.border)
  doc.setLineWidth(0.3)
  doc.line(mL, y, mL + cW, y)
  y += 8

  // ── Summary ─────────────────────────────────────────────────────────────────
  checkPage(12)
  doc.setFontSize(8)
  textColor(doc, C.textGray)
  doc.text(
    `Totaal: ${data.parts.length} artikel${data.parts.length !== 1 ? 'en' : ''} — ${data.parts.reduce((s, p) => s + p.quantity, 0)} stuks`,
    mL,
    y,
  )

  footer()
  return doc.output('blob')
}
