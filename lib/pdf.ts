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

/**
 * Hoeveel toestelregels er in de gedrukte band passen.
 *
 * Nagemeten op het formulier: de band loopt van 95,5 tot 120 mm, de opschriften
 * staan op 100,5 en de eerste waarderegel op 107,5. Daaronder blijft 11 mm over.
 */
export const MAX_PDF_DEVICE_ROWS = 4

/** Eén regel in de toestelband van de bon. */
export interface PdfDevice {
  unitNumber: string
  description: string            // "Berner Friteuse 2x8L"
  deliveryDate: string           // ISO date or ''
  warrantyUntil: string          // ISO date or ''
}

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
  /**
   * De toestellen waar dit bezoek over gaat — allemaal, niet alleen het eerste.
   *
   * Hier stond één toestel, in vier losse velden. De bon van Trianon noemt er
   * drie; de app las ze alle drie uit en toonde ze ook, maar op de afgewerkte
   * bon verscheen er één. Wie die bon later terugleest, mist dan twee
   * toestellen die de technieker wel degelijk gezien heeft.
   *
   * Het eerste toestel is het hoofdtoestel: dat is waar het verslag en de
   * onderdelen aan hangen.
   */
  devices: PdfDevice[]
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

// All figures measured off tests/fixtures/sauna-molenhoeve.pdf rendered at
// 105 DPI (4.14 px/mm), so this block mirrors the printed form rather than
// approximating it.
const PAGE_W = 210
const PAGE_H = 297
const ML = 12                    // left margin
const MR = 6                     // paper's rules run out to 204mm
const CW = PAGE_W - ML - MR      // 192
const SPLIT = 127                // header box divider
const RIGHT_X = 121              // divider for the materialen/bezoek and opmerkingen/akkoord blocks

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
    // On the paper the rule sits ABOVE the bank lines, not below them.
    line(ML, 272, PAGE_W - MR, 272)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...BLACK)
    doc.text(BANK_LINES[0], ML, 276)
    doc.text(BANK_LINES[1], PAGE_W / 2, 276, { align: 'center' })
    doc.text(BANK_LINES[2], PAGE_W - MR, 276, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(COMPANY_LINE, PAGE_W / 2, 282.5, { align: 'center' })
    doc.setFontSize(5.5)
    doc.text(REGISTRATION_LINE, PAGE_W / 2, 286.5, { align: 'center' })
  }

  pageChrome()

  // ── outer frame: one continuous rule down each edge, header through remarks,
  // exactly as the printed form is ruled.
  const HB_TOP = 31, HB_BOTTOM = 95.5
  const FRAME_BOTTOM = 266
  line(ML, HB_TOP, ML, FRAME_BOTTOM)
  line(PAGE_W - MR, HB_TOP, PAGE_W - MR, FRAME_BOTTOM)

  // ── header box: y 31 → 95.5 ────────────────────────────────────────────────
  line(SPLIT, HB_TOP, SPLIT, HB_BOTTOM); line(ML, HB_BOTTOM, PAGE_W - MR, HB_BOTTOM)

  // left column
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLACK)
  doc.text('SERVICE BON | BON DE SERVICE', ML + 8, HB_TOP + 6.5)
  label('TICKET N°', ML + 3, 70);                     value(data.ticketNumber, ML + 3, 74.5)
  label('SERVICE BON N° BON DE SERVICE', ML + 3, 79); value(data.bonNumber, ML + 3, 83.5)
  label('DATUM TICKET', ML + 3, 88);                  value(fmtDate(data.ticketDate), ML + 3, 92.5)

  // right column — every field is label on its own line, value directly beneath,
  // which is how the printed form reads.
  const RX = SPLIT + 3
  label('KLANT N° CLIENT', RX, 35.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('L', RX, 40)
  value(data.customerNumber, RX + 4, 40)
  const fNumber = data.invoiceCustomerNumber || data.customerNumber
  line(RX + 39, 36.5, RX + 39, 41)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('F', RX + 42, 40)
  value(fNumber, RX + 46, 40)

  // The right column is only (204 - 130) = 74mm wide, so long values must wrap
  // inside it rather than run off the edge of the form.
  const COL_W = PAGE_W - MR - RX - 2

  label('NAAM | NOM', RX, 44.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...BLACK)
  doc.text((doc.splitTextToSize(data.customerName || '', COL_W) as string[]).slice(0, 2), RX, 49)

  label('ADRES | ADRESSE', RX, 57)
  // label() leaves the font bold; these are values, not labels.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...BLACK)
  doc.text((doc.splitTextToSize(data.siteAddress || '', COL_W) as string[]).slice(0, 1), RX, 61.5)
  doc.text((doc.splitTextToSize(data.siteCity || '', COL_W) as string[]).slice(0, 1), RX, 65.5)

  label('CONTACT', RX, 70)
  value(data.contactName, RX, 74.5)

  label('Tel & GSM', RX, 79)
  value(data.phones.join(' / '), RX, 83.5)

  label('SLUITINGSDAG | FERMÉ', RX, 89)
  value(data.closingDay, RX, 93.5)

  // ── device row: y 95.5 → 120 ───────────────────────────────────────────────
  const DR_TOP = HB_BOTTOM, DR_BOTTOM = 120
  const cols = [ML, ML + 24, SPLIT, ML + 148, PAGE_W - MR]
  for (const x of cols.slice(1, -1)) line(x, DR_TOP + 3, x, DR_BOTTOM)
  label('UNIT N°', cols[0] + 2, DR_TOP + 5)
  label('OMSCHRIJVING | DÉSIGNATION', cols[1] + 2, DR_TOP + 5)
  label('LEVERDATUM', cols[2] + 2, DR_TOP + 5)
  label('GARANTIE', cols[3] + 2, DR_TOP + 5)

  // Eén waarderegel per toestel, onder dezelfde opschriften.
  //
  // De band is gedrukt papier en ligt vast: van de eerste waarderegel tot de
  // onderrand is er 11 mm. Drie toestellen passen daar comfortabel in op 5,5 mm
  // uit elkaar; bij vier wordt de regelafstand en de letter kleiner. Meer dan
  // vier past er met geen mogelijkheid in, en dan is een eerlijk "+2" beter dan
  // tekst die over de kaderlijn heen loopt.
  const ROW_TOP = DR_TOP + 12
  const ROW_ROOM = DR_BOTTOM - 1.5 - ROW_TOP
  const rows = data.devices.slice(0, MAX_PDF_DEVICE_ROWS)
  const hidden = data.devices.length - rows.length
  const step = rows.length > 1 ? Math.min(5.5, ROW_ROOM / (rows.length - 1)) : 0
  const size = step === 0 || step >= 5 ? 9 : step >= 4 ? 8 : 7

  rows.forEach((device, index) => {
    const y = ROW_TOP + index * step
    const laatste = index === rows.length - 1
    const omschrijving = laatste && hidden > 0
      ? `${device.description} +${hidden} meer`
      : device.description

    value(device.unitNumber, cols[0] + 2, y, size)
    value(
      (doc.splitTextToSize(omschrijving || '', cols[2] - cols[1] - 4) as string[])[0] ?? '',
      cols[1] + 2, y, size,
    )
    value(fmtDate(device.deliveryDate), cols[2] + 2, y, size)
    value(fmtDate(device.warrantyUntil), cols[3] + 2, y, size)
  })

  // ── omschrijving klant: y 123.5 → 138 ──────────────────────────────────────
  label('OMSCHRIJVING KLANT | OBSERVATIONS CLIENT', ML + 2, 123.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const custLines = (doc.splitTextToSize(data.customerDescription || '', CW - 6) as string[]).slice(0, 3)
  doc.text(custLines, ML + 2, 128)

  // ── technicus rapport: label rule at 143, then 3 full-width rules ──────────
  label('TECHNICUS RAPPORT TECHNICIEN', ML + 2, 143)
  ruled(ML + 54, PAGE_W - MR, 143)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const reportLines = doc.splitTextToSize(data.technicianReport || '', CW - 6) as string[]
  const REPORT_ROWS = 3
  for (let i = 0; i < REPORT_ROWS; i++) {
    const y = 150 + i * 6.7
    if (reportLines[i]) doc.text(reportLines[i], ML + 2, y - 1.2)
    ruled(ML, PAGE_W - MR, y)
  }
  const reportOverflow = reportLines.slice(REPORT_ROWS)

  // ── materialen (left) + bezoek (right): y 166 → 227 ────────────────────────
  const MB_TOP = 166, MB_BOTTOM = 227
  line(ML, MB_TOP, PAGE_W - MR, MB_TOP)
  line(RIGHT_X, MB_TOP, RIGHT_X, MB_BOTTOM)

  label('MATERIALEN | MATÉRIAUX', ML + 2, MB_TOP + 4)
  label('ART. N°', ML + 2, MB_TOP + 9, 7.5)
  label('Omschrijving', ML + 22, MB_TOP + 9, 7.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('AANTAL | NOMBRE', RIGHT_X - 4, MB_TOP + 9, { align: 'right' })

  const PART_ROWS = 7
  const partsToDraw = data.parts.slice(0, PART_ROWS)
  for (let i = 0; i < PART_ROWS; i++) {
    const y = MB_TOP + 14 + i * 6.7
    const p = partsToDraw[i]
    if (p) {
      value(p.code, ML + 2, y - 1.2, 8.5)
      // A description longer than the column must not be silently dropped: this
      // is the list the customer signs for. Fall back to two smaller lines
      // inside the same row, and only then shorten with an ellipsis.
      const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
      const descLines = doc.splitTextToSize(desc, 62) as string[]
      if (descLines.length <= 1) {
        value(descLines[0] ?? '', ML + 22, y - 1.2, 8.5)
      } else {
        const small = doc.splitTextToSize(desc, 70) as string[]
        value(small[0] ?? '', ML + 22, y - 3, 6.5)
        const rest = small.slice(1).join(' ')
        const tail = (doc.splitTextToSize(rest, 70) as string[])
        value(tail.length > 1 ? `${tail[0]}…` : (tail[0] ?? ''), ML + 22, y - 0.4, 6.5)
      }
      value(String(p.quantity), RIGHT_X - 4, y - 1.2, 8.5, 'right')
    }
    dotted(ML + 2, RIGHT_X - 4, y)
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
    const y = MB_TOP + 7 + i * 8.4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...BLACK)
    doc.text(lbl, RIGHT_X + 3, y)
    if (lbl.startsWith('INTERVENTIE')) {
      // WEEK | WEEKEND with the chosen one boxed
      const wx = PAGE_W - MR - 33
      doc.setFontSize(8)
      doc.text('WEEK | WEEKEND', wx, y)
      const chosen = data.interventionKind === 'week' ? { x: wx - 1, w: 10 } : { x: wx + 13, w: 19 }
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.rect(chosen.x, y - 3.2, chosen.w, 4.4)
    } else {
      value(val, PAGE_W - MR - 2, y, 8.5, 'right')
    }
    ruled(RIGHT_X + 3, PAGE_W - MR, y + 2.5)
  })

  // ── opmerkingen (left) + akkoord (right): y 228 → 266 ──────────────────────
  const OP_TOP = 228, OP_BOTTOM = 266
  line(RIGHT_X, OP_TOP, RIGHT_X, OP_BOTTOM)
  label('OPMERKINGEN | REMARQUES', ML + 2, OP_TOP + 3.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const remarkLines = (doc.splitTextToSize(data.remarks || '', RIGHT_X - ML - 12) as string[]).slice(0, 4)
  for (let i = 0; i < 4; i++) {
    const y = OP_TOP + 10 + i * 6.8
    if (remarkLines[i]) doc.text(remarkLines[i], ML + 2, y - 1.2)
    ruled(ML + 2, RIGHT_X - 8, y)
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK)
  doc.text('AKKOORD VAN KLANT | ACCORD DU CLIENT', PAGE_W - MR - 2, OP_TOP + 3.5, { align: 'right' })
  if (data.signature) {
    try {
      doc.addImage(data.signature, 'PNG', RIGHT_X + 6, OP_TOP + 7, 60, 24)
    } catch {
      /* unreadable signature: leave the box empty rather than failing the whole bon */
    }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...ORANGE)
  doc.text('×', RIGHT_X + 7, OP_TOP + 16)

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
      label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 5
      // The continuation page needs its own column headers, or the numbers in
      // the right-hand column have no meaning.
      label('ART. N°', ML + 2, y, 7.5)
      label('Omschrijving', ML + 24, y, 7.5)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
      doc.text('AANTAL | NOMBRE', PAGE_W - MR - 2, y, { align: 'right' })
      y += 5

      for (const p of partsOverflow) {
        if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
        value(p.code, ML + 2, y - 1, 8.5)
        // Same urgency wording as page 1 — dropping ", dringend" here would
        // understate the part on exactly the copy the office files.
        const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
        const lines = doc.splitTextToSize(desc, 120) as string[]
        value(lines[0] ?? '', ML + 24, y - 1, 8.5)
        value(String(p.quantity), PAGE_W - MR - 2, y - 1, 8.5, 'right')
        dotted(ML + 2, PAGE_W - MR - 2, y); y += 6
        for (const extra of lines.slice(1)) {
          if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
          value(extra, ML + 24, y - 1, 8.5)
          dotted(ML + 2, PAGE_W - MR - 2, y); y += 6
        }
      }
    }
  }

  const arrayBuffer = doc.output('arraybuffer')
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  if (download) doc.save(`ServiceBon_${data.bonNumber.replace(/[/\s]/g, '-')}.pdf`)
  return blob
}
