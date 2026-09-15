/**
 * Zone-based field extraction from a scanned or printed Service Bon.
 *
 * Docling returns every recognised text fragment together with the box it sits
 * in, expressed in PDF points on the page. Because the Service Bon layout is
 * already measured in millimetres in lib/pdf.ts, we convert those boxes to
 * millimetres once and then read each field out of a fixed rectangle.
 *
 * Reading a rectangle beats reading the whole page and hunting for labels
 * afterwards: a wrong reading in one box cannot leak into another, and we never
 * have to guess which recognised word belongs to which field.
 *
 * Every rectangle below is derived from the constants at the top of lib/pdf.ts
 * (ML=12, SPLIT=127, RX=130, HB_TOP=31, HB_BOTTOM=DR_TOP=95.5), verified
 * against tests/fixtures/sauna-molenhoeve.pdf.
 */

// ── Docling's response shape (only the parts we consume) ─────────────────────

export type DoclingBBox = {
  l: number
  t: number
  r: number
  b: number
  coord_origin?: string
}

export type DoclingTextItem = {
  text: string
  prov: Array<{ page_no: number; bbox: DoclingBBox }>
}

export type DoclingDocument = {
  texts: DoclingTextItem[]
  pages: Record<string, { size: { width: number; height: number }; page_no: number }>
}

/** One recognised fragment, in millimetres measured from the top-left corner. */
export type Fragment = {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
  text: string
}

/** A rectangle on the page, in millimetres from the top-left corner. */
export type Zone = { x1: number; y1: number; x2: number; y2: number }

/** The Service Bon is printed on A4, and every zone below is measured on one. */
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

// ── Step 1: docling boxes → millimetres from the top-left ────────────────────

/**
 * Convert docling's text items into fragments measured in millimetres.
 *
 * Two conversions happen here.
 *
 * The first is the scale, and it must come from the page rather than from a
 * constant. Docling reports a PDF in points — an A4 measures 595.32 × 841.92 —
 * but a photograph in pixels, so the same sheet comes back as 1654 × 2339. A
 * fixed points-to-millimetres factor is right for the PDF and roughly 2.8×
 * wrong for the photo, which pushes every fragment down and to the right, out
 * of the zone it belongs to. Dividing A4 by whatever the page says it measures
 * is correct for both: for a PDF it works out to exactly 25.4/72.
 *
 * The second is the vertical flip. Docling reports `coord_origin: 'BOTTOMLEFT'`,
 * meaning y is counted upwards from the bottom of the page, so its `t` (top of
 * the box) is the *larger* number. Subtracting from the page height turns that
 * into a distance from the top, which is how lib/pdf.ts measures. Without this
 * flip every zone would read the mirror image of the field we wanted.
 */
export function toFragments(doc: DoclingDocument): Fragment[] {
  const fragments: Fragment[] = []

  for (const item of doc.texts) {
    const text = item.text.trim()
    if (!text) continue

    for (const prov of item.prov) {
      const page = doc.pages[String(prov.page_no)]
      if (!page || !page.size.width || !page.size.height) continue

      const scaleX = A4_WIDTH_MM / page.size.width
      const scaleY = A4_HEIGHT_MM / page.size.height

      const { l, t, r, b } = prov.bbox
      const fromBottom = (prov.bbox.coord_origin ?? 'BOTTOMLEFT') === 'BOTTOMLEFT'

      fragments.push({
        page: prov.page_no,
        x1: l * scaleX,
        x2: r * scaleX,
        y1: (fromBottom ? page.size.height - t : t) * scaleY,
        y2: (fromBottom ? page.size.height - b : b) * scaleY,
        text,
      })
    }
  }

  // Derde conversie, en de enige die niet uit de pagina zelf te berekenen valt:
  // de bon rechttrekken tegen zijn eigen opschriften. Zie `lijnUitOpOpschriften`.
  return lijnUitOpOpschriften(fragments)
}

/**
 * Waar een opschrift hoort te staan op de bon waar de zones op afgeregeld zijn.
 *
 * Gemeten aan twee bonnen die allebei precies kloppen — de Molenhoeve-bon (een
 * PDF uit het ERP) en de Decan-bon (een foto). Ze geven op alle vier dezelfde
 * getallen, tot op de tiende millimeter.
 *
 * Niet overgenomen uit `lib/pdf.ts`, hoewel dat dezelfde bon afdrukt. Daar
 * staan de opschriften op 100,5 / 123,5 / 143 / 170, maar dat zijn
 * **basislijnen** van de tekst, terwijl docling de **bovenkant** van een vak
 * meldt. Het verschil daartussen is niet constant — het hangt af van de
 * lettergrootte van het opschrift — dus zou dat vier ankers opleveren die elk
 * een eigen, onbekende fout dragen.
 *
 * Vier stuks, ver uit elkaar over de pagina. Twee dicht bij elkaar zouden een
 * schaal opleveren die op de rest van het blad wild afwijkt.
 */
const OPSCHRIFT_ANKERS: ReadonlyArray<{ patroon: RegExp; y: number }> = [
  { patroon: /UNIT\s*N/i,                                   y: 99.5 },
  { patroon: /OMSCHRIJVING\s*KLANT|OBSERVATIONS\s*CLIENT/i, y: 122.5 },
  { patroon: /TECHNICUS\s*RAPPORT/i,                        y: 141.6 },
  { patroon: /MATERIALEN/i,                                 y: 167.0 },
]

/** Minder ankers dan dit is te weinig houvast om een rechte door te trekken. */
const MINIMUM_ANKERS = 3

/** Buiten deze grenzen is de uitkomst geen bon meer maar een rekenfout. */
const MIN_SCHAAL = 0.85
const MAX_SCHAAL = 1.15

/** Hoever een anker na het rechttrekken nog van zijn plaats mag liggen, in mm. */
const MAX_AFWIJKING_MM = 2

/**
 * De bon rechttrekken tegen zijn eigen opschriften.
 *
 * De zones in dit bestand zijn absolute millimeters op een A4. Dat werkt zolang
 * elke bon op dezelfde plaats op het blad staat, en dat is precies wat een foto
 * niet garandeert: een bon die een fractie anders uitgesneden of geschaald is,
 * schuift alles mee. Gemeten op de Van den Berge-bon stond de hele inhoud vier
 * tot acht millimeter te hoog, en het verschil groeide mee met de hoogte — dus
 * geen verschuiving maar een schaal. De toestellenband greep daardoor in het
 * omschrijvingsvak: er kwam een verzonnen toestel uit met het opschrift erin,
 * en de omschrijving zelf bleef leeg.
 *
 * De opschriften zijn het antwoord, want die staan op de bon zelf gedrukt. Waar
 * `OMSCHRIJVING KLANT` staat, daar begint het omschrijvingsvak — of het blad nu
 * recht of scheef gefotografeerd is.
 *
 * Alleen verticaal. Horizontaal is nog nooit een veld misgelopen, en een
 * correctie die niets repareert kan alleen maar iets breken.
 *
 * Vier vangnetten, want dit draait op elke upload en mag nooit een bon slechter
 * maken dan hij zonder deze functie was: te weinig ankers, een schaal die geen
 * schaal meer is, ankers die na het rechttrekken nog steeds niet passen, of
 * ankers die niet in dezelfde volgorde staan als op het papier. In al die
 * gevallen blijven de fragmenten zoals ze waren en gedraagt de extractie zich
 * exact zoals vroeger.
 */
export function lijnUitOpOpschriften(fragments: Fragment[]): Fragment[] {
  const punten: Array<{ gemeten: number; hoort: number }> = []

  for (const anker of OPSCHRIFT_ANKERS) {
    const treffer = fragments.find(
      f => f.page === 1 && anker.patroon.test(f.text.replace(/\s+/g, ' ')),
    )
    if (treffer) punten.push({ gemeten: treffer.y1, hoort: anker.y })
  }

  if (punten.length < MINIMUM_ANKERS) return fragments

  // Twee opschriften in één samengeplakt fragment leveren dezelfde gemeten
  // hoogte op. Dat is geen twee ankers maar één, en een rechte door punten die
  // op elkaar liggen is willekeurig.
  const hoogtes = new Set(punten.map(punt => punt.gemeten.toFixed(1)))
  if (hoogtes.size < MINIMUM_ANKERS) return fragments

  // Kleinste kwadraten: hoort = schaal * gemeten + verschuiving.
  const n = punten.length
  const somG = punten.reduce((t, punt) => t + punt.gemeten, 0)
  const somH = punten.reduce((t, punt) => t + punt.hoort, 0)
  const somGG = punten.reduce((t, punt) => t + punt.gemeten * punt.gemeten, 0)
  const somGH = punten.reduce((t, punt) => t + punt.gemeten * punt.hoort, 0)

  const noemer = n * somGG - somG * somG
  if (noemer === 0) return fragments

  const schaal = (n * somGH - somG * somH) / noemer
  const verschuiving = (somH - schaal * somG) / n

  if (!Number.isFinite(schaal) || !Number.isFinite(verschuiving)) return fragments
  if (schaal < MIN_SCHAAL || schaal > MAX_SCHAAL) return fragments

  const ergsteAfwijking = Math.max(
    ...punten.map(punt => Math.abs(schaal * punt.gemeten + verschuiving - punt.hoort)),
  )
  if (ergsteAfwijking > MAX_AFWIJKING_MM) return fragments

  return fragments.map(f => ({
    ...f,
    y1: schaal * f.y1 + verschuiving,
    y2: schaal * f.y2 + verschuiving,
  }))
}

/**
 * The printed form is full of dotted and solid rules. OCR happily reports those
 * as strings of dots and underscores, and they overlap the same rectangles as
 * the real values. Dropping them here keeps every field reader below simpler.
 */
export function isRuleNoise(text: string): boolean {
  const bare = text.replace(/[\s.·_—–-]/g, '')
  return bare.length === 0
}

// ── Step 2: which fragments fall inside a zone ───────────────────────────────

/**
 * True when the two rectangles share any area at all.
 *
 * Deliberately *overlap* rather than "is the centre inside". On the Molenhoeve
 * bon docling merges TICKET N°, SERVICE BON N° and DATUM TICKET into a single
 * box spanning all three of their rows. Under a centre test that block would
 * land in one zone and the other two would come back empty; under an overlap
 * test all three zones receive it and the field readers below pick their own
 * value out of it by shape.
 */
function overlaps(fragment: Fragment, zone: Zone): boolean {
  return (
    fragment.x1 < zone.x2 &&
    fragment.x2 > zone.x1 &&
    fragment.y1 < zone.y2 &&
    fragment.y2 > zone.y1
  )
}

/** Fragments inside a zone, in reading order: top to bottom, then left to right. */
export function collect(fragments: Fragment[], zone: Zone): Fragment[] {
  return fragments
    .filter(f => f.page === 1 && !isRuleNoise(f.text) && overlaps(f, zone))
    .sort((a, b) => (Math.abs(a.y1 - b.y1) > 1.5 ? a.y1 - b.y1 : a.x1 - b.x1))
}

// ── Step 3: strip the printed labels ─────────────────────────────────────────

/**
 * The labels printed on the form, copied from lib/pdf.ts, each tagged with the
 * field it introduces. A label with no field is a terminator only: it marks
 * where somebody else's value begins, so ours must stop.
 *
 * These are the form's own structure, and using them as structure rather than
 * as noise is what makes a photograph readable. On a clean PDF each value sits
 * in its own box and the labels are merely in the way; on a photo, OCR glues a
 * whole column into one box — "KLANT NCLIENT LK02997 NAAMINOM VICTOR23" — and
 * then the labels are the only thing separating one value from the next.
 */
const LABELS: Array<{ text: string; field: WerkbonField | null }> = [
  { text: 'OMSCHRIJVING KLANT | OBSERVATIONS CLIENT', field: 'description' },
  { text: 'SERVICE BON N° BON DE SERVICE', field: null },
  { text: 'OMSCHRIJVING | DÉSIGNATION', field: 'deviceDescription' },
  { text: 'SERVICE BON | BON DE SERVICE', field: null },
  { text: 'TECHNICUS RAPPORT TECHNICIEN', field: null },
  { text: 'MATERIALEN | MATÉRIAUX', field: null },
  { text: 'SLUITINGSDAG | FERMÉ', field: 'closingDay' },
  { text: 'KLANT N° CLIENT', field: 'customerNumber' },
  { text: 'ADRES | ADRESSE', field: 'address' },
  { text: 'GROOTKEUKENS', field: null },
  { text: 'LEVERDATUM', field: 'deliveryDate' },
  { text: 'DATUM TICKET', field: 'ticketDate' },
  { text: 'NAAM | NOM', field: 'customerName' },
  { text: 'TICKET N°', field: 'ticketNumber' },
  { text: 'Tel & GSM', field: 'phone' },
  { text: 'GARANTIE', field: 'warrantyUntil' },
  { text: 'BOSSUYT', field: null },
  { text: 'CONTACT', field: 'contact' },
  { text: 'UNIT N°', field: 'unitNumber' },
]

/**
 * Reduce text to bare capital letters and digits.
 *
 * OCR is unreliable about exactly the characters that carry no meaning here: it
 * reads the divider in "ADRES | ADRESSE" as an I, drops the accent from FERMÉ,
 * and joins "Tel & GSM" into one word. Comparing what is left after all of that
 * is thrown away matches the label regardless.
 */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Levenshtein distance — the number of single-character edits between two
 * strings. Used to accept a label OCR got slightly wrong ("NAAMINOM" for
 * "NAAMNOM") while still refusing one it got wrong enough to be a different
 * label.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }

  return previous[b.length]
}

/** Close enough to be the same label: one edit per seven characters. */
function looksLike(candidate: string, label: string): boolean {
  if (candidate === label) return true
  const allowed = Math.max(1, Math.floor(label.length / 7))
  return Math.abs(candidate.length - label.length) <= allowed && editDistance(candidate, label) <= allowed
}

/** A run of words identified as a printed label. */
type LabelHit = { start: number; end: number; field: WerkbonField | null }

/**
 * Locate the printed labels inside a run of words.
 *
 * Words are matched in groups rather than one at a time, because OCR splits and
 * joins them unpredictably: "Tel & GSM" can come back as one word or three.
 * Comparing the normalised concatenation of a group sidesteps that entirely.
 * The longest label wins at each position, so "KLANT N° CLIENT" is never cut
 * short by the "CONTACT" hiding at the end of a different label.
 */
function findLabels(words: string[]): LabelHit[] {
  const normalised = words.map(normalise)
  const hits: LabelHit[] = []

  for (let start = 0; start < words.length; ) {
    let best: LabelHit | null = null

    for (let length = Math.min(6, words.length - start); length >= 1; length--) {
      const candidate = normalised.slice(start, start + length).join('')
      if (!candidate) continue

      for (const label of LABELS) {
        if (looksLike(candidate, normalise(label.text))) {
          best = { start, end: start + length, field: label.field }
          break
        }
      }
      if (best) break
    }

    if (best) {
      hits.push(best)
      start = best.end
    } else {
      start++
    }
  }

  return hits
}

/**
 * The text belonging to one field inside a zone.
 *
 * When the field's own label is present, the value is what follows it up to the
 * next label — that is how a merged block gets taken apart. When no label is
 * present at all, the zone holds a bare value and all of it is returned, which
 * is the ordinary case for a PDF straight out of the ERP.
 */
function zoneText(
  fragments: Fragment[],
  zone: Zone,
  field?: WerkbonField,
  /**
   * Refuse the label-free fallback when the zone plainly holds somebody else's
   * labelled text. Only free-text fields ask for this. A field read by shape can
   * safely rummage through the leftovers, because a customer number will not
   * match a date; a field with no shape to check against would just take
   * whatever it found, which is how "UNIT N°" ends up holding a ticket number.
   */
  strict = false,
): string {
  const words = collect(fragments, zone)
    .map(f => f.text)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return ''

  const hits = findLabels(words)
  if (hits.length === 0) return words.join(' ').trim()

  if (field) {
    const own = hits.find(hit => hit.field === field)
    if (own) {
      const next = hits.find(hit => hit.start >= own.end)
      const after = words.slice(own.end, next ? next.start : words.length).join(' ').trim()
      // Nothing after the label does not mean the field is empty. Docling reads
      // the left column of a PDF bon back to front, putting all three values
      // first and all three labels last, so the value sits *before* its label.
      // Fall through to the label-free text rather than reporting nothing.
      if (after) return after
    }

    if (strict && hits.some(hit => hit.field !== field)) return ''
  }

  // No label for this field in view: keep whatever is not part of some other
  // label. On a clean form that is exactly the value; on a merged block it is
  // the neighbouring values too, which the shape readers then sort out.
  const covered = new Set<number>()
  for (const hit of hits) {
    for (let i = hit.start; i < hit.end; i++) covered.add(i)
  }

  return words.filter((_, i) => !covered.has(i)).join(' ').trim()
}

// ── The zones ────────────────────────────────────────────────────────────────

export type WerkbonField =
  | 'ticketNumber'
  | 'ticketDate'
  | 'customerNumber'
  | 'invoiceNumber'
  | 'customerName'
  | 'address'
  | 'contact'
  | 'phone'
  | 'closingDay'
  | 'unitNumber'
  | 'deviceDescription'
  | 'deliveryDate'
  | 'warrantyUntil'
  | 'description'

/**
 * Every rectangle is derived from lib/pdf.ts and then widened, because a
 * photograph is not a PDF. OCR reports boxes noticeably taller than the glyphs
 * inside them, and four corners placed by hand are a few millimetres out however
 * carefully they are dragged. Measured against a real photo of a real bon, the
 * drift runs to about seven millimetres, so the bands allow for that rather
 * than pretending the page arrives perfectly registered.
 *
 * Widening is cheap here precisely because the labels do the separating: a zone
 * that catches its neighbour's text still returns the right value, because the
 * value is taken from after this field's own label.
 */
export const ZONES: Record<WerkbonField, Zone> = {
  // Left column of the header box — label on one row, value on the next. Both
  // bands are wide because docling merges the three rows into a single box.
  ticketNumber: { x1: 12, y1: 68, x2: 127, y2: 78 },
  ticketDate:   { x1: 12, y1: 86, x2: 127, y2: 95 },

  // Right column. The L and F customer numbers sit either side of the short
  // divider drawn at RX+39 = 169mm. The split here sits at 162 rather than 169
  // because OCR reports a box wider than the glyphs it contains: the F number
  // measures from 165mm even though the F itself is printed at 172mm.
  customerNumber: { x1: 128, y1: 33,   x2: 162, y2: 44 },
  invoiceNumber:  { x1: 155, y1: 33,   x2: 204, y2: 50 },
  // Stops short of the F column at 157mm, so a merged header block does not
  // hand the invoice number to the customer's name.
  customerName:   { x1: 128, y1: 41,   x2: 156, y2: 55 },
  address:        { x1: 128, y1: 54,   x2: 204, y2: 70 },
  contact:        { x1: 128, y1: 66,   x2: 204, y2: 77 },
  phone:          { x1: 128, y1: 74,   x2: 204, y2: 86 },
  closingDay:     { x1: 128, y1: 85,   x2: 204, y2: 95 },

  // De toestellentabel: vier kolommen, en zoveel rijen als de bon er draagt.
  //
  // De onderkant stond op 112 en dat was te ondiep. Nagemeten op de Trianon-bon
  // (drie toestellen, gefotografeerd met een gsm): de rijen liggen op y 103.7,
  // 107.8 en 112.1, en de laatste loopt door tot 117.7. Met 112 viel de derde
  // rij er helemaal buiten en de tweede voor de helft. De klantomschrijving
  // eronder begint pas op 122.8, dus 121 is ruim en botst niet.
  unitNumber:        { x1: 12,  y1: 92, x2: 36,  y2: 121 },
  deviceDescription: { x1: 36,  y1: 92, x2: 127, y2: 121 },
  deliveryDate:      { x1: 127, y1: 92, x2: 158, y2: 121 },
  warrantyUntil:     { x1: 158, y1: 92, x2: 204, y2: 121 },

  // Customer description: label at 123.5, up to three lines beneath it. The
  // band reaches past those lines on purpose — a truncated description is
  // invisible to the person checking the form, whereas a stray word is not.
  // The technician's report below is a label of its own, so it terminates this
  // field's text rather than being swept into it.
  // Begon op 113 en overlapte daarmee de tweede en derde toestelrij — die
  // liepen op de Trianon-bon door tot 117.7. Het eigen blok begint op 122.8.
  description: { x1: 12, y1: 121, x2: 204, y2: 140 },
}

// ── Step 4: reading a value out of the collected text ────────────────────────

/**
 * A ticket number as the ERP issues them: two to four letters, two digits, a
 * slash, then the serial — "TKT20/12752".
 *
 * The negative lookahead is the whole trick. On this bon the ticket number and
 * the bon number ("TKT20/12752-01") sit in the same merged block, and the bon
 * number comes first. Refusing a match that is followed by a hyphen skips the
 * bon number and lands on the bare ticket number.
 */
const TICKET_RE = /\b([A-Z]{2,4}\d{2}\/\d{3,})\b(?!-)/

/** A date as printed on the form: dd/mm/yy or dd/mm/yyyy. */
const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{2}|\d{4})\b/

/**
 * A customer number: one letter followed by at least four digits — "K04647".
 *
 * Deliberately not anchored on a word boundary at the front. The form prints an
 * L or an F beside the number to mark the billing column, and OCR routinely
 * glues it on: "LK02997". Requiring a boundary before the K finds nothing at
 * all on exactly the bons that need reading.
 */
const CUSTOMER_NUMBER_RE = /([A-Z]\d{4,})\b/

/**
 * The two number columns are headed "L" and "F". When OCR keeps the space those
 * letters are words of their own and no bother; when it loses the space they
 * arrive welded to the number, and "L6950" is not customer 6950 — it is a
 * customer who does not exist, joined to whichever record that string matches.
 *
 * Stripping is safe because the marker is the only thing that can be there: a
 * real number either carries its own letter, as "K05883" does, or none at all.
 * A number printed bare and read with its space intact is left to the caller —
 * hunting four loose digits across a page of postal codes and dates would cost
 * more than it found.
 */
export function readCustomerNumber(text: string): string | undefined {
  const found = CUSTOMER_NUMBER_RE.exec(text)?.[1]
  if (!found) return undefined
  return /^[LF]\d{4,}$/.test(found) ? found.slice(1) : found
}

/** A Belgian postal code. */
const POSTAL_CODE_RE = /\b(\d{4})\b/

/**
 * Turn a printed dd/mm/yy into the ISO date the API expects.
 *
 * Two-digit years are read as 20xx. That is safe here because a Service Bon
 * carries the date of a ticket that is being worked on now, never a date from
 * the previous century.
 */
export function parsePrintedDate(text: string): string | undefined {
  const match = DATE_RE.exec(text)
  if (!match) return undefined

  const [, dd, mm, yy] = match
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined

  return `${year}-${mm}-${dd}`
}

/**
 * Split the address block into street, postal code and city.
 *
 * lib/pdf.ts draws the street at y 61.5 and the city at y 65.5, but docling
 * merges those two lines into one box when they sit close together, and it does
 * not preserve their order: this bon reads "2520 - BROECHEM Van den nestlaan
 * 132", city first.
 *
 * So we anchor on the postal code, which is unambiguous, and then use the one
 * reliable difference between the two remaining parts: the city is printed in
 * capitals and the street is not. When that fails we keep everything after the
 * postal code as the city and leave the street empty — better an obviously
 * incomplete field the human corrects than a street silently filled with the
 * wrong words.
 */
export function parseAddressBlock(text: string): {
  address: string
  postalCode: string
  city: string
  merged: boolean
} {
  const postalMatch = POSTAL_CODE_RE.exec(text)
  if (!postalMatch) {
    return { address: text.trim(), postalCode: '', city: '', merged: false }
  }

  const postalCode = postalMatch[1]

  // Strip the country prefix Belgian bons print in front of the postal code
  // ("B-1000"), so it does not end up glued to the street.
  const before = text
    .slice(0, postalMatch.index)
    .replace(/\b[A-Z]\s*-\s*$/, '')
    .replace(/[\s-]+$/, '')
    .trim()

  const after = text
    .slice(postalMatch.index + postalCode.length)
    .replace(/^[\s-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // The printed order is street, then postal code, then town. When there is
  // text on both sides of the postal code the split is simply that.
  if (before) {
    return { address: splitHouseNumber(before), postalCode, city: titleCase(after), merged: true }
  }

  // Nothing before it means docling read the two lines out of order, as it does
  // on a PDF: "2520 - BROECHEM Van den nestlaan 132". Then the only reliable
  // difference left is that the town is printed in capitals and the street is
  // not — and when even that does not hold, the street stays empty rather than
  // being filled with a guess.
  const words = after.split(' ').filter(Boolean)
  const cityWords = words.filter(w => w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Ÿ]/.test(w))

  if (cityWords.length === 0 || cityWords.length === words.length) {
    return { address: '', postalCode, city: after, merged: true }
  }

  const street = words.filter(w => !cityWords.includes(w)).join(' ')

  // Capitals separate a town from a street only while the bon prints them
  // differently. This one shouts both — "ANTWERPEN NAPELSTRAAT 42" — and the
  // rule then hands every word to the town and leaves the street as a bare
  // house number. A street with no letters in it is the tell, and the house
  // number is the better signal: the word in front of it is the street.
  if (street && !/[A-Za-zÀ-ÿ]/.test(street) && cityWords.length > 1) {
    return {
      address: splitHouseNumber(`${cityWords[cityWords.length - 1]} ${street}`),
      postalCode,
      city: titleCase(cityWords.slice(0, -1).join(' ')),
      merged: true,
    }
  }

  return {
    address: splitHouseNumber(street),
    postalCode,
    city: titleCase(cityWords.join(' ')),
    merged: true,
  }
}

/**
 * Put back the space OCR drops between a street and its number.
 *
 * "RAVENSTEINSTRAAT23" is not a judgement call: a street name is letters and a
 * house number is digits, so the boundary between them is unambiguous. Only the
 * street gets this treatment — in a customer name or a phone number the same
 * split would be a guess.
 */
function splitHouseNumber(street: string): string {
  return street.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2')
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s\-(\/])([a-zà-ÿ])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase())
}

// ── Step 5: reading the whole bon ────────────────────────────────────────────

/**
 * Where a value came from. The confirmation screen colours each input by this,
 * so the human knows which fields deserve a second look before the work order
 * goes into the pool.
 *
 * - 'zone'  — read out of its own rectangle, the normal case
 * - 'label' — the rectangle was empty, found elsewhere on the page
 * - 'empty' — not found at all
 */
export type FieldSource = 'zone' | 'label' | 'empty'

export type ExtractedFields = {
  ticketNumber: string
  ticketDate: string
  customerNumber: string
  invoiceNumber: string
  customerName: string
  address: string
  postalCode: string
  city: string
  contact: string
  phone: string
  closingDay: string
  unitNumber: string
  deviceDescription: string
  deliveryDate: string
  warrantyUntil: string
  description: string
}

export type ExtractedWerkbon = {
  fields: ExtractedFields
  sources: Record<WerkbonField, FieldSource>
}

/** Every fragment on the first page, joined — the haystack for the fallback. */
function pageText(fragments: Fragment[]): string {
  const words = fragments
    .filter(f => f.page === 1 && !isRuleNoise(f.text))
    .sort((a, b) => (Math.abs(a.y1 - b.y1) > 1.5 ? a.y1 - b.y1 : a.x1 - b.x1))
    .map(f => f.text)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)

  // Drop the printed labels so a shape reader cannot mistake one for a value.
  const covered = new Set<number>()
  for (const hit of findLabels(words)) {
    for (let i = hit.start; i < hit.end; i++) covered.add(i)
  }

  return words.filter((_, i) => !covered.has(i)).join(' ').trim()
}

/**
 * Read one field: try its own zone first, then the rest of the page.
 *
 * `read` turns a blob of text into a value, or returns undefined when the blob
 * does not contain one. Falling back to the whole page is what lets a bon with
 * a slightly different layout still produce something instead of nothing — at
 * the cost of a 'label' marking, which shows up amber on the confirmation
 * screen.
 */
function readField(
  fragments: Fragment[],
  field: WerkbonField,
  read: (text: string) => string | undefined,
  haystack: string,
): { value: string; source: FieldSource } {
  const fromZone = read(zoneText(fragments, ZONES[field], field))
  if (fromZone) return { value: fromZone, source: 'zone' }

  const fromPage = read(haystack)
  if (fromPage) return { value: fromPage, source: 'label' }

  return { value: '', source: 'empty' }
}

/** Readers. `plain` keeps whatever the zone held; the others match a shape. */
const plain = (text: string) => (text.trim() ? text.trim() : undefined)
const byPattern = (re: RegExp) => (text: string) => re.exec(text)?.[1]

/**
 * Free-text fields have no shape to match, so scanning the whole page for them
 * would return the entire bon. They get their zone and nothing else.
 */
function readZoneOnly(fragments: Fragment[], field: WerkbonField): { value: string; source: FieldSource } {
  const value = plain(zoneText(fragments, ZONES[field], field, true))
  return value ? { value, source: 'zone' } : { value: '', source: 'empty' }
}

/**
 * Eén toestel zoals het op de bon staat.
 *
 * Ruwe tekst, geen oordeel: `description` is de regel zoals docling hem gaf, en
 * die kan aaneengeplakt zijn. Merk en model worden er elders uit gehaald
 * (`splitDeviceLabel`), zodat dit stuk alleen over de pagina hoeft na te denken
 * en niet over wat de woorden betekenen.
 */
export interface ExtractedDevice {
  unitNumber: string
  description: string
  deliveryDate: string
  warrantyUntil: string
}

/**
 * Twee fragmenten horen bij dezelfde rij wanneer hun verticale midden hooguit
 * zoveel millimeter uit elkaar ligt.
 *
 * Gemeten op de Trianon-bon: binnen een rij liggen de middens hooguit 1,1 mm
 * uit elkaar, tussen twee rijen minstens 3,1 mm. Twee millimeter valt daar
 * netjes tussen en heeft aan beide kanten lucht.
 */
const DEVICE_ROW_TOLERANCE_MM = 2

/**
 * Meer rijen dan dit betekent dat het groeperen mislukt is.
 *
 * Het formulier heeft er vier of vijf. Komt er een veelvoud uit, dan is elk
 * fragment zijn eigen rij geworden — dan is niets teruggeven eerlijker dan
 * twintig halve toestellen aanmaken die iemand met de hand moet opruimen.
 */
const MAX_DEVICE_ROWS = 8

/** De opschriften die in de toestellenband staan en geen waarde zijn. */
const DEVICE_LABELS = [
  'UNIT N°',
  'OMSCHRIJVING | DÉSIGNATION',
  'LEVERDATUM',
  'GARANTIE',
].map(normalise)

function isDeviceLabel(text: string): boolean {
  const flat = normalise(text)
  if (!flat) return true
  return DEVICE_LABELS.some(label => flat === label || flat.startsWith(label))
}

/** Het verticale midden van een fragment. */
function middle(fragment: Fragment): number {
  return (fragment.y1 + fragment.y2) / 2
}

/** Hoeveel een fragment horizontaal in een kolom valt, in millimeters. */
function horizontalOverlap(fragment: Fragment, zone: Zone): number {
  return Math.min(fragment.x2, zone.x2) - Math.max(fragment.x1, zone.x1)
}

/**
 * De toestellen die op de bon staan, één per rij.
 *
 * Dit kon niet met de gewone zonelezer: die plakt alles binnen een rechthoek
 * aan elkaar, en dan worden drie toestellen één brei. De fragmenten dragen hun
 * plaats op de pagina, dus de rijen zijn terug te vinden door op hoogte te
 * groeperen — en dat is ook precies hoe een mens het formulier leest.
 *
 * Een rij zonder unitnummer én zonder omschrijving is een lege lijn op het
 * formulier en telt niet mee.
 */
export function extractDevices(fragments: Fragment[]): ExtractedDevice[] {
  const band: Zone = {
    x1: ZONES.unitNumber.x1,
    y1: ZONES.unitNumber.y1,
    x2: ZONES.warrantyUntil.x2,
    y2: ZONES.unitNumber.y2,
  }

  const inBand = collect(fragments, band)
    // Het midden moet in de band liggen, niet zomaar een rand.
    //
    // `collect` neemt alles wat de rechthoek raakt, en dat is hier te gulzig:
    // het ticketblok linksboven loopt van y 69,5 tot 94 en schoof met zijn
    // onderrand net over de bovenkant van de band. Het werd daarmee een vierde
    // toestel, met een ticketnummer als omschrijving.
    //
    // Dezelfde regel als bij het groeperen hieronder: een fragment hoort bij de
    // rij waar zijn midden ligt.
    .filter(f => middle(f) >= band.y1 && middle(f) <= band.y2)
    .filter(f => !isDeviceLabel(f.text))

  // Op hoogte groeperen. `collect` levert al van boven naar onder, dus een rij
  // is af zodra een fragment te ver onder het lopende midden valt.
  const rows: Fragment[][] = []
  for (const fragment of inBand) {
    const current = rows[rows.length - 1]
    const sameRow =
      current && Math.abs(middle(fragment) - middle(current[0])) <= DEVICE_ROW_TOLERANCE_MM

    if (sameRow) current.push(fragment)
    else rows.push([fragment])
  }

  if (rows.length > MAX_DEVICE_ROWS) return []

  const columns = [
    ['unitNumber', ZONES.unitNumber],
    ['description', ZONES.deviceDescription],
    ['deliveryDate', ZONES.deliveryDate],
    ['warrantyUntil', ZONES.warrantyUntil],
  ] as const

  const devices: ExtractedDevice[] = []

  for (const row of rows) {
    const cells: Record<string, string[]> = {
      unitNumber: [], description: [], deliveryDate: [], warrantyUntil: [],
    }

    for (const fragment of row) {
      // De kolom waarin dit fragment het meest ligt. Meest en niet "helemaal":
      // een omschrijving die over de kolomrand schuift hoort nog altijd bij de
      // omschrijving.
      let best: string | null = null
      let bestOverlap = 0
      for (const [name, zone] of columns) {
        const overlap = horizontalOverlap(fragment, zone)
        if (overlap > bestOverlap) { best = name; bestOverlap = overlap }
      }
      if (best) cells[best].push(fragment.text)
    }

    const unitNumber = cells.unitNumber.join(' ').trim()
    const description = cells.description.join(' ').trim()
    if (!unitNumber && !description) continue

    devices.push({
      unitNumber,
      description,
      deliveryDate: parsePrintedDate(cells.deliveryDate.join(' ')) ?? '',
      warrantyUntil: parsePrintedDate(cells.warrantyUntil.join(' ')) ?? '',
    })
  }

  return devices
}

/**
 * Read every field of a Service Bon out of a converted document.
 *
 * Nothing here talks to the network or the database: give it docling's JSON and
 * it returns the proposed values plus where each one came from. That is what
 * makes the whole extraction testable against a fixture instead of against a
 * running container.
 */
export function extractWerkbon(doc: DoclingDocument): ExtractedWerkbon {
  const fragments = toFragments(doc)
  const haystack = pageText(fragments)

  const ticketNumber = readField(fragments, 'ticketNumber', byPattern(TICKET_RE), haystack)
  const ticketDate = readField(fragments, 'ticketDate', parsePrintedDate, haystack)
  const customerNumber = readField(fragments, 'customerNumber', readCustomerNumber, haystack)
  const invoiceNumber = readField(fragments, 'invoiceNumber', readCustomerNumber, haystack)

  const customerName = readZoneOnly(fragments, 'customerName')
  const contact = readZoneOnly(fragments, 'contact')
  const phone = readZoneOnly(fragments, 'phone')
  const closingDay = readZoneOnly(fragments, 'closingDay')
  const unitNumber = readZoneOnly(fragments, 'unitNumber')
  // The visit date sits under this column on some bons and the zone reaches it.
  // A unit number is never a date, so one that is a date is the other column's.
  if (/^\d{2}\/\d{2}\/(?:\d{2}|\d{4})$/.test(unitNumber.value.trim())) {
    unitNumber.value = ''
    unitNumber.source = 'empty'
  }
  const deviceDescription = readZoneOnly(fragments, 'deviceDescription')
  // The delivery date sits in the next column with no label between them, so a
  // wide zone sweeps it up. An appliance is never named after a date, which
  // makes a trailing one unambiguous — and it is already read properly as
  // deliveryDate from its own box.
  deviceDescription.value = deviceDescription.value
    .replace(/\s*\b\d{2}\/\d{2}\/(?:\d{2}|\d{4})\b\s*$/, '')
    .trim()
  const description = readZoneOnly(fragments, 'description')

  // Dates on the device row have no fallback: a stray date picked up from
  // anywhere else on the page would be worse than an empty warranty field.
  const deliveryDate = readZoneOnly(fragments, 'deliveryDate')
  const warrantyUntil = readZoneOnly(fragments, 'warrantyUntil')

  // Not strict, unlike every other field. On a bon that prints the value above
  // its label there is nothing after ADRES to read, and the street sits past the
  // CONTACT label that follows — so the words no label claims are the only place
  // the address can come from. Safe here and nowhere else, because this is the
  // one field with a shape reader behind it: parseAddressBlock has to recognise
  // a postal code and a house number, and rejects what it cannot.
  const addressBlock = zoneText(fragments, ZONES.address, 'address', false)
  let parsedAddress = parseAddressBlock(addressBlock)


  // A town and no street means the reading stopped at the next label with the
  // street still behind it. Try again on every word in the zone that no label
  // claims, and keep that only if a street actually comes out of it.
  if (!parsedAddress.address) {
    const wholeZone = parseAddressBlock(zoneText(fragments, ZONES.address, undefined, false))
    if (wholeZone.address) parsedAddress = wholeZone
  }

  // The street is printed past the CONTACT label, so the contact box reads it as
  // its own value. On these bons the box is blank, and a street standing in for
  // a contact is worse than nothing: it is a name somebody would try to ring.
  const same = (a: string, b: string) =>
    a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (contact.value && parsedAddress.address && same(contact.value, parsedAddress.address)) {
    contact.value = ''
    contact.source = 'empty'
  }

  return {
    fields: {
      ticketNumber: ticketNumber.value,
      ticketDate: ticketDate.value,
      customerNumber: customerNumber.value,
      invoiceNumber: invoiceNumber.value,
      customerName: customerName.value,
      address: parsedAddress.address,
      postalCode: parsedAddress.postalCode,
      city: parsedAddress.city,
      contact: contact.value,
      phone: phone.value,
      closingDay: closingDay.value,
      unitNumber: unitNumber.value,
      deviceDescription: deviceDescription.value,
      deliveryDate: parsePrintedDate(deliveryDate.value) ?? '',
      warrantyUntil: parsePrintedDate(warrantyUntil.value) ?? '',
      description: description.value,
    },
    sources: {
      ticketNumber: ticketNumber.source,
      ticketDate: ticketDate.source,
      customerNumber: customerNumber.source,
      invoiceNumber: invoiceNumber.source,
      customerName: customerName.source,
      // The street and city were teased apart from one merged box rather than
      // read from two separate lines, so they are worth checking.
      address: addressBlock ? (parsedAddress.merged ? 'label' : 'zone') : 'empty',
      contact: contact.source,
      phone: phone.source,
      closingDay: closingDay.source,
      unitNumber: unitNumber.source,
      deviceDescription: deviceDescription.source,
      deliveryDate: deliveryDate.source,
      warrantyUntil: warrantyUntil.source,
      description: description.source,
    },
  }
}
