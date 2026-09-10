import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  extractWerkbon,
  parseAddressBlock,
  parsePrintedDate,
  toFragments,
  ZONES,
  type DoclingDocument,
} from '@/lib/werkbon-zones'

/**
 * The real Molenhoeve bon, converted once by the docling container and frozen
 * here. Freezing it keeps this suite deterministic and offline: the zones are
 * what we are testing, not whether a container happens to be running.
 *
 * Regenerate with tests/fixtures/README when the layout of the form changes.
 */
const doclingDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve-docling.json'), 'utf-8'),
) as DoclingDocument

/** What a human reads off that same sheet of paper. */
const expected = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as {
  ticket_number: string
  ticket_date: string
  description: string
  customer: { number: string; invoice_number: string; name: string; address: string; postal_code: string; city: string }
}

describe('toFragments', () => {
  it('places the customer number box where lib/pdf.ts prints it', () => {
    // lib/pdf.ts draws the L customer number at x = RX + 4 = 134mm, y = 40mm.
    const fragments = toFragments(doclingDoc)
    const box = fragments.find(f => f.text.startsWith('K04647') && f.x1 < 150)

    expect(box).toBeDefined()
    expect(box!.x1).toBeCloseTo(129, 0)
    expect(box!.y1).toBeGreaterThan(36)
    expect(box!.y2).toBeLessThan(42)
  })

  it('measures the page from the top, not the bottom', () => {
    // The header box starts at HB_TOP = 31mm. Nothing on this form is printed
    // above it, so a missing vertical flip would show up as fragments near 0.
    const fragments = toFragments(doclingDoc).filter(f => f.page === 1)
    const highest = Math.min(...fragments.map(f => f.y1))

    expect(highest).toBeGreaterThan(5)
    expect(Math.max(...fragments.map(f => f.y2))).toBeLessThan(297)
  })
})

describe('parsePrintedDate', () => {
  it('reads dd/mm/yy as this century', () => {
    expect(parsePrintedDate('04/09/26')).toBe('2026-09-04')
  })

  it('reads a four digit year unchanged', () => {
    expect(parsePrintedDate('31/12/2027')).toBe('2027-12-31')
  })

  it('refuses an impossible month', () => {
    expect(parsePrintedDate('04/19/26')).toBeUndefined()
  })

  it('returns nothing when there is no date', () => {
    expect(parsePrintedDate('SLUITINGSDAG')).toBeUndefined()
  })
})

describe('parseAddressBlock', () => {
  it('splits a merged, reversed address on the postal code', () => {
    const parsed = parseAddressBlock('2520 - BROECHEM Van den nestlaan 132')

    expect(parsed.postalCode).toBe('2520')
    expect(parsed.city).toBe('Broechem')
    expect(parsed.address).toBe('Van den nestlaan 132')
    expect(parsed.merged).toBe(true)
  })

  it('leaves the street empty rather than guessing when nothing is capitalised', () => {
    const parsed = parseAddressBlock('9000 gent')

    expect(parsed.postalCode).toBe('9000')
    expect(parsed.city).toBe('gent')
    expect(parsed.address).toBe('')
  })
})

describe('extractWerkbon on the Molenhoeve bon', () => {
  const result = extractWerkbon(doclingDoc)

  it('reads the ticket number and not the bon number', () => {
    // Both sit in one merged box as "TKT20/12752-01 04/09/26 TKT20/12752".
    expect(result.fields.ticketNumber).toBe(expected.ticket_number)
    expect(result.fields.ticketNumber).not.toContain('-')
  })

  it('reads the ticket date', () => {
    expect(result.fields.ticketDate).toBe(expected.ticket_date)
  })

  it('reads both customer numbers without confusing the L and F columns', () => {
    expect(result.fields.customerNumber).toBe(expected.customer.number)
    expect(result.fields.invoiceNumber).toBe(expected.customer.invoice_number)
  })

  it('reads the customer name', () => {
    expect(result.fields.customerName).toBe(expected.customer.name)
  })

  it('reads the address, postal code and city', () => {
    expect(result.fields.address).toBe(expected.customer.address)
    expect(result.fields.postalCode).toBe(expected.customer.postal_code)
    expect(result.fields.city).toBe(expected.customer.city)
  })

  it('reads the customer description', () => {
    expect(result.fields.description.replace(/\s+/g, ' ')).toBe(
      expected.description.replace(/\s+/g, ' '),
    )
  })

  it('leaves the fields this bon does not fill blank', () => {
    expect(result.fields.contact).toBe('')
    expect(result.fields.phone).toBe('')
    expect(result.fields.closingDay).toBe('')
    expect(result.fields.unitNumber).toBe('')
    expect(result.fields.deliveryDate).toBe('')
    expect(result.fields.warrantyUntil).toBe('')

    expect(result.sources.contact).toBe('empty')
    expect(result.sources.unitNumber).toBe('empty')
  })

  it('marks the fields it read straight out of their own rectangle', () => {
    expect(result.sources.ticketNumber).toBe('zone')
    expect(result.sources.customerNumber).toBe('zone')
    expect(result.sources.customerName).toBe('zone')
    expect(result.sources.description).toBe('zone')
  })

  it('flags the address as needing a check, because it came from a merged box', () => {
    expect(result.sources.address).toBe('label')
  })

  it('never lets a printed label leak into a value', () => {
    for (const value of Object.values(result.fields)) {
      expect(value).not.toMatch(/TICKET N°|KLANT N°|NAAM \| NOM|ADRES \| ADRESSE|UNIT N°/)
    }
  })
})

describe('ZONES', () => {
  it('keeps every zone inside the printed frame', () => {
    // lib/pdf.ts rules the frame from ML = 12mm to PAGE_W - MR = 204mm,
    // and from HB_TOP = 31mm to FRAME_BOTTOM = 266mm.
    for (const [field, zone] of Object.entries(ZONES)) {
      expect(zone.x1, field).toBeGreaterThanOrEqual(12)
      expect(zone.x2, field).toBeLessThanOrEqual(204)
      expect(zone.y1, field).toBeGreaterThanOrEqual(31)
      expect(zone.y2, field).toBeLessThanOrEqual(266)
      expect(zone.x2, field).toBeGreaterThan(zone.x1)
      expect(zone.y2, field).toBeGreaterThan(zone.y1)
    }
  })

  it('reads the F customer number to the right of the L one', () => {
    // The two bands overlap on purpose: OCR reports boxes wider than the glyphs
    // in them, so a hard split at the printed divider loses the F number
    // altogether. Overlapping is safe because both are read by shape.
    expect(ZONES.invoiceNumber.x1).toBeGreaterThan(ZONES.customerNumber.x1)
    expect(ZONES.invoiceNumber.x2).toBeGreaterThan(ZONES.customerNumber.x2)
  })
})

/**
 * The same form, photographed on a clipboard at an angle and straightened by
 * lib/deskew.ts before docling saw it. Docling reports an image in pixels
 * rather than points, glues whole columns into one box and mangles the printed
 * labels — so this fixture guards everything the clean PDF cannot.
 */
const photoDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/victor-23-docling.json'), 'utf-8'),
) as DoclingDocument

describe('extractWerkbon on a photographed bon', () => {
  const result = extractWerkbon(photoDoc)

  it('measures a page reported in pixels, not points', () => {
    // A photo comes back as 1654 x 2339 pixels where a PDF is 595 x 842 points.
    // Converting both with a fixed 25.4/72 puts every fragment on the photo
    // roughly 2.8x too far down and to the right, missing every zone.
    const fragments = toFragments(photoDoc).filter(f => f.page === 1)

    expect(Math.max(...fragments.map(f => f.x2))).toBeLessThanOrEqual(210)
    expect(Math.max(...fragments.map(f => f.y2))).toBeLessThanOrEqual(297)
  })

  it('reads the ticket number and date', () => {
    expect(result.fields.ticketNumber).toBe('TKT20/12719')
    expect(result.fields.ticketDate).toBe('2026-09-01')
  })

  it('separates the customer number from the L column marker glued to it', () => {
    // OCR returns "LK02997": the L marking the billing column runs into the
    // number, so a pattern anchored on a word boundary finds nothing.
    expect(result.fields.customerNumber).toBe('K02997')
    expect(result.fields.invoiceNumber).toBe('K02997')
  })

  it('takes the name apart from the block it was merged into', () => {
    // The whole right-hand column arrives as one box:
    // "KLANT NCLIENT LK02997 NAAMINOM VICTOR23".
    expect(result.fields.customerName).toBe('VICTOR23')
  })

  it('reads the address, putting back the space OCR dropped', () => {
    expect(result.fields.address).toBe('RAVENSTEINSTRAAT 23')
    expect(result.fields.postalCode).toBe('1000')
    expect(result.fields.city).toBe('Brussel')
  })

  it('reads the phone number', () => {
    expect(result.fields.phone).toBe('0477/931570')
  })

  it('reads the customer description', () => {
    expect(result.fields.description).toContain('warmhoudkast')
    expect(result.fields.description).toContain('warmt niet meer op')
  })

  it('leaves the empty boxes empty instead of borrowing a neighbour’s value', () => {
    // This is what the strict rule buys: the UNIT N° box is blank on this bon,
    // and without it the widened zone would hand it the ticket number.
    expect(result.fields.unitNumber).toBe('')
    expect(result.fields.deviceDescription).toBe('')
    expect(result.fields.contact).toBe('')
    expect(result.fields.closingDay).toBe('')
    expect(result.fields.deliveryDate).toBe('')
    expect(result.fields.warrantyUntil).toBe('')
  })

  it('never lets a printed label leak into a value', () => {
    for (const value of Object.values(result.fields)) {
      expect(value).not.toMatch(/KLANT|ADRES|SLUITINGSDAG|TECHNICUS|OBSERVATIONS/i)
    }
  })
})

/**
 * The Upton bon, where the ERP prints the value above its own label and docling
 * emits it that way: "B-2000 - ANTWERPEN" arrives before "ADRES | ADRESSE", and
 * the street sits after the CONTACT label that follows it.
 */
const uptonDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/upton-antwerpen-docling.json'), 'utf-8'),
) as DoclingDocument

describe('extractWerkbon when the value is printed above its label', () => {
  const result = extractWerkbon(uptonDoc)

  it('still reads the address', () => {
    // The zone holds "B-2000 - ANTWERPEN ADRES ADRESSE CONTACT NAPELSTRAAT 42".
    // Nothing follows this field's own label, so the value has to come from the
    // words no other label claims.
    expect(result.fields.address).toBe('NAPELSTRAAT 42')
    expect(result.fields.postalCode).toBe('2000')
    expect(result.fields.city).toBe('Antwerpen')
  })

  it('leaves the customer name for the person to fill in', () => {
    // Its zone holds "K02343 UPTON GIANFRANCO NAAM NOM ... B-2000 - ANTWERPEN",
    // and a name has no shape to recognise it by. Taking the leftovers here
    // would put the customer number and the town into the name; the address
    // gets away with it only because parseAddressBlock can reject what it reads.
    expect(result.fields.customerName).toBe('')
    expect(result.sources.customerName).toBe('empty')
  })

  it('reads the fields that were never in doubt', () => {
    expect(result.fields.ticketNumber).toBe('TKT20/12774')
    expect(result.fields.closingDay).toBe('ZONDAG & MAANDAG')
    expect(result.fields.phone).toBe('0472/ 28 59 58')
  })
})

/**
 * Two bons photographed rather than exported, and both of them French-speaking
 * or bilingual: a Waterloo customer with no appliance filled in, and the Belgian
 * parliament, whose customer numbers are printed without a letter.
 */
const ponchoDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/poncho-waterloo-docling.json'), 'utf-8'),
) as DoclingDocument
const kamerDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/kamer-brussel-docling.json'), 'utf-8'),
) as DoclingDocument

describe('extractWerkbon on the Poncho bon (photographed)', () => {
  const result = extractWerkbon(ponchoDoc)

  it('reads the ticket, its date and the customer', () => {
    expect(result.fields.ticketNumber).toBe('TKT20/12625')
    expect(result.fields.ticketDate).toBe('2026-08-17')
    expect(result.fields.customerNumber).toBe('K05883')
    expect(result.fields.customerName).toBe('PONCHO')
  })

  it('reads the town, and the description in full', () => {
    expect(result.fields.postalCode).toBe('1410')
    expect(result.fields.city).toBe('Waterloo')
    expect(result.fields.description).toBe('Vervangen van ventilator van plancha Scholl')
  })

  it('leaves the appliance row empty, because the bon does', () => {
    expect(result.fields.unitNumber).toBe('')
    expect(result.fields.deviceDescription).toBe('')
  })
})

describe('extractWerkbon on the parliament bon (photographed)', () => {
  const result = extractWerkbon(kamerDoc)

  it('does not mistake the column marker for part of the number', () => {
    // Printed "L 6950 | F 5890". OCR loses the space and hands back "L6950",
    // which is a customer who does not exist.
    expect(result.fields.customerNumber).toBe('6950')
    expect(result.fields.customerNumber).not.toMatch(/^[LF]/)
  })

  it('reads the ticket, the address and the unit', () => {
    expect(result.fields.ticketNumber).toBe('TKT20/12773')
    expect(result.fields.ticketDate).toBe('2026-09-09')
    expect(result.fields.address).toBe('WETSTRAAT 10')
    expect(result.fields.postalCode).toBe('1000')
    expect(result.fields.unitNumber).toBe('U172537')
  })

  it('keeps the delivery date out of the appliance description', () => {
    // The two columns have no label between them, so a wide zone sweeps the
    // date up. An appliance is never named after one.
    expect(result.fields.deviceDescription).not.toMatch(/\d{2}\/\d{2}\/\d{2}/)
    expect(result.fields.deviceDescription).toContain('AFWASMACHINE')
    expect(result.fields.deliveryDate).toBe('2014-09-05')
  })
})
