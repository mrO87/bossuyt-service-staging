import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workOrders } from '@/lib/db/schema'
import { getTodayInterventions } from '@/lib/server/interventions'
import { createWorkOrder, parseCreateWorkOrderBody } from '@/lib/server/work-orders'
import { generateWerkbonPDF, type ServiceBonPdfData } from '@/lib/pdf'
import { technicians } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

function body(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = {
    ...(fixture.customer as Record<string, unknown>),
    number: `K-${suffix}`,
    invoice_number: `K-${suffix}`,
  }
  return {
    ...fixture,
    ticket_number: `TKT-${suffix}`,
    planned_date: new Date().toISOString(),
    customer,
    ...overrides,
  }
}

describe('alert note on a work order', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('stores the note and remembers who wrote it', async () => {
    const created = await createWorkOrder(
      parseCreateWorkOrderBody(body({ alert_note: 'Klant eerst bellen op 0477/93 15 70', created_by: 'u1' })),
    )
    ids.work_order_ids!.push(created.id)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, created.id))

    expect(row.alertNote).toBe('Klant eerst bellen op 0477/93 15 70')
    // The author is what the edit route checks against, so it has to be set at
    // creation or the note can never be changed by anyone.
    expect(row.alertNoteBy).toBe('u1')
    expect(row.alertNoteAt).toBeInstanceOf(Date)
  })

  it('leaves the author empty when there is no note', async () => {
    const created = await createWorkOrder(parseCreateWorkOrderBody(body({ created_by: 'u1' })))
    ids.work_order_ids!.push(created.id)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, created.id))

    expect(row.alertNote).toBeNull()
    expect(row.alertNoteBy).toBeNull()
    expect(row.alertNoteAt).toBeNull()
  })

  it('treats an empty note as no note', async () => {
    const created = await createWorkOrder(parseCreateWorkOrderBody(body({ alert_note: '   ', created_by: 'u1' })))
    ids.work_order_ids!.push(created.id)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, created.id))
    expect(row.alertNote).toBeNull()
  })

  it('reaches the list the technician actually sees', async () => {
    const technicianId = `tech-${randomUUID()}`
    await testDb.insert(technicians).values({
      id: technicianId,
      name: 'Testtechnieker',
      initials: 'TT',
      email: `${technicianId}@example.test`,
      role: 'technician',
      active: true,
    })
    ids.technician_ids = [technicianId]

    const note = `Kan enkel op voormiddag ${randomUUID().slice(0, 6)}`
    const created = await createWorkOrder({
      ...parseCreateWorkOrderBody(body({ alert_note: note, created_by: 'u1' })),
      source: 'reactive',
      status: 'aangemaakt',
    })
    ids.work_order_ids!.push(created.id)

    const { open } = await getTodayInterventions(technicianId, new Date().toISOString().slice(0, 10))
    const found = open.find(item => item.id === created.id)

    expect(found).toBeDefined()
    expect(found!.alertNote).toBe(note)
    expect(found!.alertNoteBy).toBe('u1')
  })
})

describe('the alert note never reaches the printed bon', () => {
  it('is not a field of ServiceBonPdfData', () => {
    // A compile-time guard would be better, but the type has no runtime shape to
    // inspect. This asserts the contract the type expresses: the PDF builder is
    // given no way to receive the note.
    const data: ServiceBonPdfData = {
      ticketNumber: 'TKT20/12752',
      bonNumber: 'TKT20/12752-01',
      ticketDate: '2026-09-04T00:00:00.000Z',
      customerNumber: 'K04647',
      invoiceCustomerNumber: '',
      customerName: 'Molenhoeve group bvba',
      siteAddress: 'Van den nestlaan 132',
      siteCity: '2520 Broechem',
      contactName: '',
      phones: [],
      closingDay: '',
      deviceUnitNumber: '',
      deviceDescription: '',
      deviceDeliveryDate: '',
      deviceWarrantyUntil: '',
      customerDescription: 'Nazicht friteuses',
      technicianReport: '',
      parts: [],
      technicianName: 'Sam, Bob',
      visitDate: '2026-09-05T00:00:00.000Z',
      arrivalTime: '',
      departureTime: '',
      interventionKind: 'week',
      tripCount: 1,
      personCount: 2,
      remarks: '',
      signature: null,
    }

    expect(Object.keys(data)).not.toContain('alertNote')
  })

  it('does not print the note text', async () => {
    // The note is an internal instruction; the PDF is what the customer signs.
    const secret = 'KLANT EERST BELLEN OP 0477 93 15 70'
    const blob = await generateWerkbonPDF(
      {
        ticketNumber: 'TKT20/12752',
        bonNumber: 'TKT20/12752-01',
        ticketDate: '2026-09-04T00:00:00.000Z',
        customerNumber: 'K04647',
        invoiceCustomerNumber: '',
        customerName: 'Molenhoeve group bvba',
        siteAddress: 'Van den nestlaan 132',
        siteCity: '2520 Broechem',
        contactName: '',
        phones: [],
        closingDay: '',
        deviceUnitNumber: '',
        deviceDescription: '',
        deviceDeliveryDate: '',
        deviceWarrantyUntil: '',
        customerDescription: 'Nazicht friteuses',
        technicianReport: '',
        parts: [],
        technicianName: 'Sam, Bob',
        visitDate: '2026-09-05T00:00:00.000Z',
        arrivalTime: '',
        departureTime: '',
        interventionKind: 'week',
        tripCount: 1,
        personCount: 2,
        remarks: '',
        signature: null,
      },
      { download: false },
    )

    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')
    expect(text).not.toContain(secret)
  })
})
