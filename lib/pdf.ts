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

export interface PdfTaskItem {
  id: string
  title: string
  assigneeName: string
  priority: 'laag' | 'normaal' | 'hoog' | 'dringend'
  dueDate: string
  statusLabel: string
}

// ── Service Bon data ─────────────────────────────────────────────────────────
// Built from the stored werkbon + work order so the PDF can be regenerated later.

export interface ServiceBonPdfData {
  ticketNumber: string
  bonNumber: string
  ticketDate: string             // ISO
  customerNumber: string         // KLANT N° L
  invoiceCustomerNumber: string  // KLANT N° F ('' when same as L)
  customerName: string
  siteAddress: string
  siteCity: string               // "2520 Broechem"
  contactName: string
  phones: string[]
  closingDay: string
  deviceUnitNumber: string
  deviceDescription: string      // "Berner Friteuse 2x8L"
  deviceDeliveryDate: string     // ISO date or ''
  deviceWarrantyUntil: string    // ISO date or ''
  customerDescription: string    // OMSCHRIJVING KLANT
  technicianReport: string       // TECHNICUS RAPPORT
  parts: PdfPart[]
  technicianName: string
  visitDate: string              // ISO
  arrivalTime: string            // ISO or ''
  departureTime: string          // ISO or ''
  interventionKind: 'week' | 'weekend'
  tripCount: number
  personCount: number
  remarks: string
  signature: string | null       // data URL
}

/** Backwards-compatible alias. */
export type PdfData = ServiceBonPdfData

// ── Constants copied verbatim from the paper bon ─────────────────────────────

const COMPANY_LINE = 'Bossuyt Grootkeuken NV | Noordlaan 19 | 8520 KUURNE | T  056/357012 |  F 056/370016 |  | BE 0476.185.470'
const REGISTRATION_LINE = 'RPR Kortrijk | ERKENNING: KLASSE 5 . CATEGORIE T3-T4 | REFERTENUMMER VAN REGISTRATIE ALS AANNEMER: 052011 | INSCHRIJVING LIJST ERKENDE AANNEMERS: 19.020'
const BANK_LINES = [
  'KBC IBAN BE35 4643 2838 2237 BIC KRED BE BB',
  'BNP PARIBAS FORTIS IBAN BE20 0014 9856 8356 BIC GEBA BE BB',
  'ING IBAN BE29 3850 1870 1764 BIC BBRU BE BB',
]
const ORANGE: [number, number, number] = [226, 105, 30]
const BLACK: [number, number, number] = [0, 0, 0]
const GREY: [number, number, number] = [120, 120, 120]

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Fetch the logo as a data URL (browser only). Returns null in node or when missing. */
async function loadLogo(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null
  try {
    const res = await fetch('/bossuyt-logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Layout (A4 portrait, mm) ─────────────────────────────────────────────────

const PAGE_W = 210
const PAGE_H = 297
const ML = 12                    // left margin
const MR = 12
const CW = PAGE_W - ML - MR      // 186
const SPLIT = 118                // x where the header box splits into two columns
const RIGHT_X = 124              // x where the right-hand blocks start

export async function generateWerkbonPDF(
  data: ServiceBonPdfData,
  options: { download?: boolean } = {},
): Promise<Blob> {
  const download = options.download ?? true
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogo()

  // ── primitives ─────────────────────────────────────────────────────────────
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    doc.setDrawColor(...BLACK); doc.setLineWidth(0.2); doc.line(x1, y1, x2, y2)
  }
  const label = (text: string, x: number, y: number, size = 7.5) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...BLACK); doc.text(text, x, y)
  }
  const value = (text: string, x: number, y: number, size = 9, align: 'left' | 'right' = 'left') => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...BLACK)
    doc.text(text || '', x, y, { align })
  }
  const dotted = (x1: number, x2: number, y: number) => {
    doc.setDrawColor(...GREY); doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 1.2], 0)
    doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0)
  }
  const ruled = (x1: number, x2: number, y: number) => {
    doc.setDrawColor(...GREY); doc.setLineWidth(0.15); doc.line(x1, y, x2, y)
  }

  function drawTextLogo() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...ORANGE)
    doc.text('××', ML, 16)
    doc.setTextColor(...BLACK); doc.text('BOSSUYT', ML + 12, 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('GROOTKEUKENS', ML + 12, 19)
  }

  /** Logo at the top and the bank/company footer — drawn on every page. */
  function pageChrome() {
    if (logo) {
      try { doc.addImage(logo, 'PNG', ML, 7, 62, 12.3) } catch { drawTextLogo() }
    } else {
      drawTextLogo()
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...BLACK)
    doc.text(BANK_LINES[0], ML, PAGE_H - 16)
    doc.text(BANK_LINES[1], PAGE_W / 2, PAGE_H - 16, { align: 'center' })
    doc.text(BANK_LINES[2], PAGE_W - MR, PAGE_H - 16, { align: 'right' })
    line(ML, PAGE_H - 13.5, PAGE_W - MR, PAGE_H - 13.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(COMPANY_LINE, PAGE_W / 2, PAGE_H - 9.5, { align: 'center' })
    doc.setFontSize(5.5)
    doc.text(REGISTRATION_LINE, PAGE_W / 2, PAGE_H - 6, { align: 'center' })
  }

  pageChrome()

  // ── header box: y 26 → 96 ──────────────────────────────────────────────────
  const HB_TOP = 26, HB_BOTTOM = 96
  line(ML, HB_TOP, ML, HB_BOTTOM); line(PAGE_W - MR, HB_TOP, PAGE_W - MR, HB_BOTTOM)
  line(SPLIT, HB_TOP, SPLIT, HB_BOTTOM); line(ML, HB_BOTTOM, PAGE_W - MR, HB_BOTTOM)

  // left column
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLACK)
  doc.text('SERVICE BON | BON DE SERVICE', ML + 6, HB_TOP + 9)
  label('TICKET N°', ML + 3, 66);                     value(data.ticketNumber, ML + 3, 70.5)
  label('SERVICE BON N° BON DE SERVICE', ML + 3, 76); value(data.bonNumber, ML + 3, 80.5)
  label('DATUM TICKET', ML + 3, 86);                  value(fmtDate(data.ticketDate), ML + 3, 90.5)

  // right column
  const RX = SPLIT + 3
  label('KLANT N° CLIENT', RX, HB_TOP + 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('L', RX, HB_TOP + 11)
  value(data.customerNumber, RX + 4, HB_TOP + 11)
  const fNumber = data.invoiceCustomerNumber || data.customerNumber
  line(RX + 38, HB_TOP + 7.5, RX + 38, HB_TOP + 12)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('F', RX + 41, HB_TOP + 11)
  value(fNumber, RX + 45, HB_TOP + 11)

  label('NAAM | NOM', RX, HB_TOP + 17);           value(data.customerName, RX, HB_TOP + 21.5)
  label('ADRES | ADRESSE', RX, HB_TOP + 30)
  value(data.siteAddress, RX, HB_TOP + 34.5)
  value(data.siteCity, RX, HB_TOP + 39)
  label('CONTACT', RX, HB_TOP + 44);              value(data.contactName, RX + 22, HB_TOP + 44)
  label('Tel & GSM', RX, HB_TOP + 53);            value(data.phones.join(' / '), RX + 22, HB_TOP + 53)
  label('SLUITINGSDAG | FERMÉ', RX, HB_TOP + 63); value(data.closingDay, RX + 42, HB_TOP + 63)

  // ── device row: y 96 → 118 ─────────────────────────────────────────────────
  const DR_TOP = HB_BOTTOM, DR_BOTTOM = 118
  const cols = [ML, ML + 28, ML + 118, ML + 152, PAGE_W - MR]
  for (const x of cols.slice(1, -1)) line(x, DR_TOP + 3, x, DR_BOTTOM)
  label('UNIT N°', cols[0] + 2, DR_TOP + 6);                     value(data.deviceUnitNumber, cols[0] + 2, DR_TOP + 13)
  label('OMSCHRIJVING | DÉSIGNATION', cols[1] + 2, DR_TOP + 6);  value(data.deviceDescription, cols[1] + 2, DR_TOP + 13)
  label('LEVERDATUM', cols[2] + 2, DR_TOP + 6);                  value(fmtDate(data.deviceDeliveryDate), cols[2] + 2, DR_TOP + 13)
  label('GARANTIE', cols[3] + 2, DR_TOP + 6);                    value(fmtDate(data.deviceWarrantyUntil), cols[3] + 2, DR_TOP + 13)

  // ── omschrijving klant: y 120 → 140 ────────────────────────────────────────
  label('OMSCHRIJVING KLANT | OBSERVATIONS CLIENT', ML + 2, 124)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const custLines = (doc.splitTextToSize(data.customerDescription || '', CW - 6) as string[]).slice(0, 3)
  doc.text(custLines, ML + 2, 129)

  // ── technicus rapport: y 142 → 184 (5 ruled lines) ─────────────────────────
  label('TECHNICUS RAPPORT TECHNICIEN', ML + 2, 146)
  ruled(ML + 52, PAGE_W - MR, 146)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const reportLines = doc.splitTextToSize(data.technicianReport || '', CW - 6) as string[]
  const REPORT_ROWS = 5
  for (let i = 0; i < REPORT_ROWS; i++) {
    const y = 153 + i * 6.5
    if (reportLines[i]) doc.text(reportLines[i], ML + 2, y - 1.2)
    ruled(ML, PAGE_W - MR, y)
  }
  const reportOverflow = reportLines.slice(REPORT_ROWS)

  // ── materialen (left) + bezoek (right): y 186 → 240 ────────────────────────
  const MB_TOP = 186, MB_BOTTOM = 240
  line(ML, MB_TOP, PAGE_W - MR, MB_TOP)
  line(RIGHT_X - 2, MB_TOP, RIGHT_X - 2, MB_BOTTOM)

  label('MATERIALEN | MATÉRIAUX', ML + 2, MB_TOP + 5)
  label('ART. N°', ML + 2, MB_TOP + 10, 7)
  label('Omschrijving', ML + 24, MB_TOP + 10, 7)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('AANTAL | NOMBRE', RIGHT_X - 5, MB_TOP + 10, { align: 'right' })

  const PART_ROWS = 6
  const partsToDraw = data.parts.slice(0, PART_ROWS)
  for (let i = 0; i < PART_ROWS; i++) {
    const y = MB_TOP + 17 + i * 6
    const p = partsToDraw[i]
    if (p) {
      value(p.code, ML + 2, y - 1, 8.5)
      const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
      value((doc.splitTextToSize(desc, 70) as string[])[0] ?? '', ML + 24, y - 1, 8.5)
      value(String(p.quantity), RIGHT_X - 5, y - 1, 8.5, 'right')
    }
    dotted(ML + 2, RIGHT_X - 5, y)
  }
  const partsOverflow = data.parts.slice(PART_ROWS)

  const visitRows: Array<[string, string]> = [
    ['TECHNICUS | TECHNICIEN', data.technicianName],
    ['BEZOEKDATUM | DATE DE LA VISITE', fmtDate(data.visitDate)],
    ["AANKOMSTUUR | HEURE D'ARRIVÉE", fmtTime(data.arrivalTime)],
    ['VERTREKUUR | HEURE DE DÉPART', fmtTime(data.departureTime)],
    ['INTERVENTIE | INTERVENTION', ''],
    ['AANTAL RITTEN | NOMBRE DE TRAJETS', String(data.tripCount)],
    ['AANTAL PERSONEN | NOMBRE DES PERS.', String(data.personCount)],
  ]
  visitRows.forEach(([lbl, val], i) => {
    const y = MB_TOP + 8 + i * 7.3
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    doc.text(lbl, RIGHT_X, y)
    if (lbl.startsWith('INTERVENTIE')) {
      // WEEK | WEEKEND with the chosen one boxed
      const wx = PAGE_W - MR - 30
      doc.setFontSize(7.5)
      doc.text('WEEK | WEEKEND', wx, y)
      const chosen = data.interventionKind === 'week' ? { x: wx - 1, w: 9 } : { x: wx + 12, w: 17 }
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.rect(chosen.x, y - 3.2, chosen.w, 4.2)
    } else {
      value(val, PAGE_W - MR - 1, y, 8.5, 'right')
    }
    ruled(RIGHT_X, PAGE_W - MR, y + 2)
  })

  // ── opmerkingen (left) + akkoord (right): y 242 → 276 ──────────────────────
  const OP_TOP = 242, OP_BOTTOM = 276
  line(RIGHT_X - 2, OP_TOP, RIGHT_X - 2, OP_BOTTOM)
  label('OPMERKINGEN | REMARQUES', ML + 2, OP_TOP + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const remarkLines = (doc.splitTextToSize(data.remarks || '', RIGHT_X - ML - 10) as string[]).slice(0, 4)
  for (let i = 0; i < 4; i++) {
    const y = OP_TOP + 12 + i * 6
    if (remarkLines[i]) doc.text(remarkLines[i], ML + 2, y - 1.2)
    ruled(ML + 2, RIGHT_X - 6, y)
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK)
  doc.text('AKKOORD VAN KLANT | ACCORD DU CLIENT', PAGE_W - MR - 1, OP_TOP + 5, { align: 'right' })
  if (data.signature) {
    try {
      doc.addImage(data.signature, 'PNG', RIGHT_X + 2, OP_TOP + 8, 60, 24)
    } catch {
      /* unreadable signature: leave the box empty rather than failing the whole bon */
    }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ORANGE)
  doc.text('×', RIGHT_X + 1, OP_TOP + 14)

  // ── overflow page for long reports / many parts ─────────────────────────────
  if (reportOverflow.length > 0 || partsOverflow.length > 0) {
    doc.addPage()
    pageChrome()
    let y = 30
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLACK)
    doc.text(`SERVICE BON ${data.bonNumber} — vervolg | suite`, ML, y); y += 8

    if (reportOverflow.length > 0) {
      label('TECHNICUS RAPPORT TECHNICIEN (vervolg)', ML + 2, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      for (const l of reportOverflow) {
        if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
        doc.text(l, ML + 2, y - 1.2); ruled(ML, PAGE_W - MR, y); y += 6.5
      }
      y += 4
    }

    if (partsOverflow.length > 0) {
      label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 6
      for (const p of partsOverflow) {
        if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
        value(p.code, ML + 2, y - 1, 8.5)
        const desc = p.toOrder ? `${p.description} (te bestellen)` : p.description
        value((doc.splitTextToSize(desc, 120) as string[])[0] ?? '', ML + 24, y - 1, 8.5)
        value(String(p.quantity), PAGE_W - MR - 2, y - 1, 8.5, 'right')
        dotted(ML + 2, PAGE_W - MR - 2, y); y += 6
      }
    }
  }

  const arrayBuffer = doc.output('arraybuffer')
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  if (download) doc.save(`ServiceBon_${data.bonNumber.replace(/[/\s]/g, '-')}.pdf`)
  return blob
}
