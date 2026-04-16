import jsPDF from 'jspdf'

// ── Types for PDF generation ──────────────────────────────────────────────────
// These are local to the form — not stored in DB yet

export interface PdfPart {
  id: string
  code: string
  description: string
  quantity: number
  toOrder: boolean
  urgent: boolean
}

export interface PdfFollowUp {
  id: string
  description: string
  priority: 'laag' | 'gemiddeld' | 'hoog'
  dueDate: string
}

export interface PdfData {
  customerName: string
  siteName: string
  siteAddress: string
  siteCity: string
  deviceBrand: string
  deviceModel: string
  deviceSerial?: string
  status: string
  workStart: string
  workEnd: string
  description: string
  parts: PdfPart[]
  followUp: PdfFollowUp[]
  signature: string | null
  hasPhotos: boolean
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  dark:    [47, 52, 58]   as const,  // #2F343A — header
  orange:  [242, 140, 40] as const,  // #F28C28 — accent
  blue:    [76, 106, 133] as const,  // #4C6A85 — secondary accent
  green:   [46, 158, 91]  as const,  // #2E9E5B
  red:     [214, 69, 69]  as const,  // #D64545
  textDark:[31, 41, 51]   as const,  // #1F2933
  textGray:[107, 114, 128]as const,  // #6B7280
  border:  [229, 231, 235]as const,  // #E5E7EB
  rowAlt:  [244, 246, 248]as const,  // #F4F6F8
  white:   [255, 255, 255]as const,
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtTime(iso: string): string {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABELS: Record<string, string> = {
  gepland:         'Gepland',
  onderweg:        'Onderweg',
  bezig:           'Bezig',
  wacht_onderdelen:'Wacht op onderdelen',
  afgewerkt:       'Afgewerkt',
  geannuleerd:     'Geannuleerd',
}

const PRIORITY_COLORS: Record<string, readonly [number, number, number]> = {
  laag:      C.green,
  gemiddeld: C.blue,
  hoog:      C.orange,
}

// jsPDF types don't accept spread of readonly tuples — use this helper instead
function fill(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2])
}
function stroke(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2])
}
function textColor(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2])
}

export function generateWerkbonPDF(data: PdfData): Blob {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 15, mR = 15
  const cW = pageW - mL - mR
  let y = 0

  // ── Helpers ────────────────────────────────────────────────────────────────

  function footer() {
    const n = doc.getNumberOfPages()
    doc.setFontSize(8)
    textColor(doc, C.textGray)
    doc.text('Bossuyt Service — Werkbon', mL, pageH - 8)
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

  function sectionTitle(title: string) {
    checkPage(12)
    fill(doc, C.dark)
    doc.rect(mL, y, cW, 7, 'F')
    // Orange left accent
    fill(doc, C.orange)
    doc.rect(mL, y, 2, 7, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    textColor(doc, C.white)
    doc.text(title, mL + 5, y + 5)
    y += 10
  }

  function infoRow(label: string, value: string) {
    checkPage(6)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    textColor(doc, C.textGray)
    doc.text(label, mL + 2, y)
    doc.setFont('helvetica', 'normal')
    textColor(doc, C.textDark)
    doc.text(value || '—', mL + 42, y)
    y += 5.5
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  fill(doc, C.dark)
  doc.rect(0, 0, pageW, 30, 'F')

  // Orange left bar
  fill(doc, C.orange)
  doc.rect(0, 0, 4, 30, 'F')

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.white)
  doc.text('BOSSUYT', mL, 12)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  textColor(doc, C.textGray)
  doc.text('SERVICE', mL, 19)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.white)
  doc.text('WERKBON', pageW - mR, 12, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  textColor(doc, C.textGray)
  doc.text(fmtDate(data.workStart || new Date().toISOString()), pageW - mR, 19, { align: 'right' })

  y = 38

  // ── Status bar ─────────────────────────────────────────────────────────────
  const isDone = data.status === 'afgewerkt'
  const statusColor = isDone ? C.green : C.orange
  fill(doc, statusColor)
  doc.roundedRect(mL, y, cW, 8, 2, 2, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  textColor(doc, C.white)
  doc.text(`Status: ${STATUS_LABELS[data.status] || data.status}`, mL + 4, y + 5.5)
  y += 14

  // ── Customer / Site ────────────────────────────────────────────────────────
  sectionTitle('KLANT & LOCATIE')
  infoRow('Klant:', data.customerName)
  infoRow('Locatie:', data.siteName)
  infoRow('Adres:', `${data.siteAddress}, ${data.siteCity}`)
  y += 3

  // ── Device ────────────────────────────────────────────────────────────────
  sectionTitle('TOESTEL')
  infoRow('Merk / Model:', `${data.deviceBrand} ${data.deviceModel}`)
  if (data.deviceSerial) infoRow('Serienummer:', data.deviceSerial)
  y += 3

  // ── Time registration ──────────────────────────────────────────────────────
  sectionTitle('TIJDREGISTRATIE')
  checkPage(16)

  const timeBoxW = cW / 2
  const times = [
    { label: 'Werk start', value: fmtTime(data.workStart) },
    { label: 'Werk einde', value: fmtTime(data.workEnd) },
  ]
  times.forEach((t, i) => {
    const bx = mL + i * timeBoxW
    fill(doc, C.rowAlt)
    stroke(doc, C.border)
    doc.roundedRect(bx + 1, y, timeBoxW - 2, 13, 1.5, 1.5, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    textColor(doc, C.textGray)
    doc.text(t.label, bx + timeBoxW / 2, y + 4, { align: 'center' })
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    textColor(doc, C.dark)
    doc.text(t.value, bx + timeBoxW / 2, y + 11, { align: 'center' })
  })
  y += 19

  // ── Work description ───────────────────────────────────────────────────────
  sectionTitle('OMSCHRIJVING WERKZAAMHEDEN')
  if (data.description) {
    const lines = doc.splitTextToSize(data.description, cW - 6)
    const blockH = lines.length * 4.5 + 6
    checkPage(blockH)
    fill(doc, C.rowAlt)
    stroke(doc, C.border)
    doc.roundedRect(mL, y, cW, blockH, 1.5, 1.5, 'FD')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    textColor(doc, C.textDark)
    doc.text(lines, mL + 3, y + 5)
    y += blockH + 4
  } else {
    doc.setFontSize(9)
    textColor(doc, C.textGray)
    doc.text('Geen omschrijving ingevuld.', mL + 2, y)
    y += 8
  }

  // ── Parts ──────────────────────────────────────────────────────────────────
  if (data.parts.length > 0) {
    sectionTitle('GEBRUIKTE ONDERDELEN')
    checkPage(8)

    // Table header
    fill(doc, C.blue)
    doc.rect(mL, y, cW, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    textColor(doc, C.white)
    doc.text('Code',        mL + 3,          y + 5)
    doc.text('Omschrijving',mL + 35,         y + 5)
    doc.text('Aantal',      mL + cW - 35,    y + 5, { align: 'right' })
    doc.text('Status',      mL + cW - 3,     y + 5, { align: 'right' })
    y += 8

    data.parts.forEach((p, i) => {
      checkPage(7)
      if (i % 2 === 0) {
        fill(doc, C.rowAlt)
        doc.rect(mL, y - 1, cW, 6.5, 'F')
      }
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      textColor(doc, C.textDark)
      doc.text(p.code || '—',                 mL + 3,       y + 3.5)
      const desc = doc.splitTextToSize(p.description, 70)
      doc.text(desc[0] || '',                  mL + 35,      y + 3.5)
      doc.text(String(p.quantity),             mL + cW - 35, y + 3.5, { align: 'right' })

      if (p.toOrder) {
        const orderColor = p.urgent ? C.red : C.orange
        textColor(doc, orderColor)
        doc.setFont('helvetica', 'bold')
        doc.text(p.urgent ? 'DRINGEND!' : 'Bestellen', mL + cW - 3, y + 3.5, { align: 'right' })
      } else {
        textColor(doc, C.green)
        doc.text('Gebruikt', mL + cW - 3, y + 3.5, { align: 'right' })
      }
      y += 6.5
    })
    y += 4
  }

  // ── Follow-up ──────────────────────────────────────────────────────────────
  if (data.followUp.length > 0) {
    sectionTitle('OPVOLGACTIES')
    data.followUp.forEach((f, i) => {
      checkPage(10)
      if (i % 2 === 0) {
        fill(doc, C.rowAlt)
        doc.rect(mL, y - 1, cW, 7.5, 'F')
      }
      // Priority dot
      const priorityColor = PRIORITY_COLORS[f.priority] || C.blue
      fill(doc, priorityColor)
      doc.circle(mL + 4, y + 3, 1.8, 'F')

      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      textColor(doc, C.textDark)
      doc.text(f.priority.toUpperCase(), mL + 8, y + 4)

      doc.setFont('helvetica', 'normal')
      const desc = doc.splitTextToSize(f.description, cW - 55)
      doc.text(desc[0] || '', mL + 28, y + 4)

      if (f.dueDate) {
        textColor(doc, C.textGray)
        doc.text(fmtDate(f.dueDate), mL + cW - 3, y + 4, { align: 'right' })
      }
      y += 7.5
    })
    y += 4
  }

  // ── Attachments ─────────────────────────────────────────────────────────────
  sectionTitle('BIJLAGEN')
  infoRow("Foto's toegevoegd:", data.hasPhotos ? 'Ja' : 'Nee')
  y += 3

  // ── Signature ──────────────────────────────────────────────────────────────
  sectionTitle('HANDTEKENING KLANT')
  checkPage(50)

  if (data.signature) {
    stroke(doc, C.border)
    doc.roundedRect(mL, y, 85, 36, 2, 2, 'S')
    try {
      doc.addImage(data.signature, 'PNG', mL + 2, y + 2, 81, 32)
    } catch {
      doc.setFontSize(9)
      textColor(doc, C.textGray)
      doc.text('Handtekening niet leesbaar', mL + 4, y + 18)
    }
    doc.setFontSize(7)
    textColor(doc, C.textGray)
    doc.text('Handtekening klant', mL + 42, y + 40, { align: 'center' })

    doc.setFontSize(8)
    textColor(doc, C.textDark)
    doc.text(
      `Ondertekend: ${fmtDate(new Date().toISOString())} om ${fmtTime(new Date().toISOString())}`,
      mL + 92, y + 10
    )
    y += 48
  } else {
    stroke(doc, C.border)
    doc.setLineDashPattern([2, 2], 0)
    doc.roundedRect(mL, y, 85, 36, 2, 2, 'S')
    doc.setLineDashPattern([], 0)
    doc.setFontSize(9)
    textColor(doc, C.textGray)
    doc.text('Niet ondertekend', mL + 42, y + 18, { align: 'center' })
    y += 44
  }

  footer()

  // Filename: Werkbon_KlantNaam_YYYYMMDD.pdf
  const name = data.customerName.replace(/[^a-zA-Z0-9]/g, '_')
  const date = new Date().toISOString().split('T')[0]?.replace(/-/g, '')
  const arrayBuffer = doc.output('arraybuffer')
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  doc.save(`Werkbon_${name}_${date}.pdf`)
  return blob
}
