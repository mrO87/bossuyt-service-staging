import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DuplicateTicketError,
  ValidationError,
  createWorkOrder,
  parseCreateWorkOrderBody,
} from '@/lib/server/work-orders'
import { contacts, customers, devices, sites, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

/** Fresh copy of the fixture with a unique ticket + customer number so tests never collide. */
function molenhoeve(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = { ...(fixture.customer as Record<string, unknown>), number: `K-${suffix}`, invoice_number: `K-${suffix}` }
  return { ...fixture, ticket_number: `TKT-${suffix}`, customer, ...overrides }
}

describe('parseCreateWorkOrderBody', () => {
  it('maps the snake_case fixture to camelCase input and treats empty strings as absent', () => {
    const input = parseCreateWorkOrderBody(fixture)

    expect(input.ticketNumber).toBe('TKT20/12752')
    expect(input.ticketDate).toBe('2026-09-04')
    expect(input.plannedDate).toBe('2026-09-05')
    expect(input.description).toBe('Nazicht/ herstel 2 friteuses Berner - controleren op lekken')
    expect(input.customer.number).toBe('K04647')
    expect(input.customer.postalCode).toBe('2520')
    expect(input.customer.city).toBe('Broechem')
    expect(input.customer.phone).toBeUndefined()
    expect(input.customer.contact).toBeUndefined()
    expect(input.customer.closingDay).toBeUndefined()
    expect(input.device).toBeNull()
  })

  it('throws a ValidationError naming the missing field', () => {
    expect(() => parseCreateWorkOrderBody({ ...fixture, ticket_number: '' })).toThrowError(ValidationError)
    try {
      parseCreateWorkOrderBody({ ...fixture, ticket_number: '' })
    } catch (err) {
      expect((err as ValidationError).field).toBe('ticket_number')
    }
    expect(() => parseCreateWorkOrderBody({ ...fixture, customer: undefined })).toThrowError(ValidationError)
    expect(() => parseCreateWorkOrderBody({ ...fixture, planned_date: 'not-a-date' })).toThrowError(ValidationError)
    expect(() => parseCreateWorkOrderBody('nope')).toThrowError(ValidationError)
  })
})

describe('createWorkOrder', () => {
  let ids: CleanupIds

  beforeEach(() => { ids = { work_order_ids: [], customer_ids: [], site_ids: [], device_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('creates customer, site and work order for the Molenhoeve bon without a device', async () => {
    const body = molenhoeve()
    const result = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids?.push(result.id)

    expect(result.ticketNumber).toBe(body.ticket_number)

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, result.id))
    expect(wo?.ticketNumber).toBe(body.ticket_number)
    expect(wo?.deviceId).toBeNull()
    expect(wo?.status).toBe('gepland')
    expect(wo?.source).toBe('planned')
    expect(wo?.description).toBe(fixture.description)
    expect(wo?.ticketDate?.toISOString().slice(0, 10)).toBe('2026-09-04')
    expect(wo?.plannedDate.toISOString().slice(0, 10)).toBe('2026-09-05')

    const [customer] = await testDb.select().from(customers).where(eq(customers.id, wo!.customerId))
    expect(customer?.customerNumber).toBe((body.customer as { number: string }).number)
    expect(customer?.name).toBe('Molenhoeve group bvba')
    expect(customer?.city).toBe('2520 Broechem')

    const [site] = await testDb.select().from(sites).where(eq(sites.id, wo!.siteId))
    expect(site?.address).toBe('Van den nestlaan 132')
    expect(site?.city).toBe('2520 Broechem')
    expect(site?.name).toBe('Molenhoeve group bvba')
  })

  it('reuses an existing customer by customer number and an existing site by address', async () => {
    const first = molenhoeve()
    const a = await createWorkOrder(parseCreateWorkOrderBody(first))
    const b = await createWorkOrder(parseCreateWorkOrderBody({ ...first, ticket_number: `${first.ticket_number}-B` }))
    ids.work_order_ids?.push(a.id, b.id)

    const rows = await testDb.select().from(workOrders).where(eq(workOrders.id, a.id))
    const rowsB = await testDb.select().from(workOrders).where(eq(workOrders.id, b.id))
    expect(rowsB[0]?.customerId).toBe(rows[0]?.customerId)
    expect(rowsB[0]?.siteId).toBe(rows[0]?.siteId)
  })

  it('creates a contact when one is given and a device when a unit number is given, then reuses the device', async () => {
    const body = molenhoeve({
      customer: { ...(molenhoeve().customer as object), contact: 'Jan Peeters', contact_phone: '0470 11 22 33', closing_day: 'maandag' },
      device: { unit_number: 'U-7', brand: 'Berner', model: 'Friteuse 2x8L', serial_number: 'SN-1', delivery_date: '2024-01-15', warranty_until: '2026-01-15' },
    })
    const a = await createWorkOrder(parseCreateWorkOrderBody(body))
    const b = await createWorkOrder(parseCreateWorkOrderBody({ ...body, ticket_number: `${body.ticket_number}-B` }))
    ids.work_order_ids?.push(a.id, b.id)

    const [woA] = await testDb.select().from(workOrders).where(eq(workOrders.id, a.id))
    const [woB] = await testDb.select().from(workOrders).where(eq(workOrders.id, b.id))
    expect(woA?.deviceId).toBeTruthy()
    expect(woB?.deviceId).toBe(woA?.deviceId)

    const [device] = await testDb.select().from(devices).where(eq(devices.id, woA!.deviceId!))
    expect(device).toMatchObject({ unitNumber: 'U-7', brand: 'Berner', model: 'Friteuse 2x8L', deliveryDate: '2024-01-15', warrantyUntil: '2026-01-15' })

    const siteContacts = await testDb.select().from(contacts).where(eq(contacts.siteId, woA!.siteId))
    expect(siteContacts).toHaveLength(1)
    expect(siteContacts[0]).toMatchObject({ name: 'Jan Peeters', phone: '0470 11 22 33' })

    const [site] = await testDb.select().from(sites).where(eq(sites.id, woA!.siteId))
    expect(site?.closingDay).toBe('maandag')
  })

  it('rejects a duplicate ticket number with DuplicateTicketError carrying the existing id', async () => {
    const body = molenhoeve()
    const first = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids?.push(first.id)

    await expect(createWorkOrder(parseCreateWorkOrderBody(body))).rejects.toThrowError(DuplicateTicketError)
    try {
      await createWorkOrder(parseCreateWorkOrderBody(body))
    } catch (err) {
      expect((err as DuplicateTicketError).existingId).toBe(first.id)
    }
  })

  it('creates assignments when technicianIds are given', async () => {
    const { createTestTechnician } = await import('./setup')
    const techId = await createTestTechnician()
    ids.technician_ids = [techId]

    const result = await createWorkOrder({ ...parseCreateWorkOrderBody(molenhoeve()), technicianIds: [techId] })
    ids.work_order_ids?.push(result.id)

    const { workOrderAssignments } = await import('@/lib/db/schema')
    const rows = await testDb.select().from(workOrderAssignments).where(eq(workOrderAssignments.workOrderId, result.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ technicianId: techId, isLead: true, accepted: true, plannedOrder: 1 })
  })
})
