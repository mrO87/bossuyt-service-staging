import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { technicians, workOrderIntakes, workOrders } from '@/lib/db/schema'
import { confirmIntake, readIntake } from '@/lib/server/work-order-intakes'
import { getTodayInterventions } from '@/lib/server/interventions'
import { createWorkOrder, parseCreateWorkOrderBody } from '@/lib/server/work-orders'
import type { CleanupIds } from './setup'
import { cleanup, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

/** The wire body the confirmation screen posts, with unique numbers per test. */
function confirmedBody(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = {
    ...(fixture.customer as Record<string, unknown>),
    number: `K-${suffix}`,
    invoice_number: `K-${suffix}`,
  }
  // An uploaded paper bon carries no planning date — the confirm path fills one
  // in. Dropped before the overrides are applied, so a test that wants to pass
  // an explicit date still can.
  const base = { ...fixture, ticket_number: `TKT-${suffix}`, customer }
  delete (base as Record<string, unknown>).planned_date
  return { ...base, ...overrides }
}

/** Park a stored upload in the database, as the upload route would have done. */
async function insertIntake(overrides: Partial<typeof workOrderIntakes.$inferInsert> = {}) {
  const id = `intake-${randomUUID()}`
  const [row] = await testDb
    .insert(workOrderIntakes)
    .values({
      id,
      clientId: `client-${randomUUID()}`,
      // A PDF, so confirmIntake does not try to copy an image that isn't there.
      originalPath: `/api/uploads/work-order-intake/${id}/original.pdf`,
      mimeType: 'application/pdf',
      size: 1234,
      status: 'gelezen',
      ...overrides,
    })
    .returning()
  return row
}

describe('confirmIntake', () => {
  let ids: CleanupIds
  let intakeIds: string[]

  beforeEach(() => {
    ids = { work_order_ids: [] }
    intakeIds = []
  })

  afterEach(async () => {
    // Intakes reference work orders with ON DELETE SET NULL, so they survive
    // the shared cleanup and have to go first.
    if (intakeIds.length) {
      await testDb.delete(workOrderIntakes).where(inArray(workOrderIntakes.id, intakeIds))
    }
    await cleanup(ids)
  })

  it('puts the confirmed bon in the open pool', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody())
    expect(result.status).toBe(201)

    const workOrderId = (result.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    const [created] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))

    // These three together are what getDayInterventions looks for when it
    // fills the pool — see lib/server/interventions.ts.
    expect(created.source).toBe('reactive')
    expect(created.status).toBe('aangemaakt')
    expect(created.visibleInPool).toBe(true)
  })

  it('fills in a planning date so the NOT NULL column is satisfied', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody())
    const workOrderId = (result.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    const [created] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(created.plannedDate).toBeInstanceOf(Date)
  })

  it('marks the intake confirmed and links it to the work order it became', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody())
    const workOrderId = (result.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    const stored = await readIntake({ id: intake.id })
    expect(stored!.status).toBe('bevestigd')
    expect(stored!.workOrderId).toBe(workOrderId)
  })

  it('never creates a second work order for the same sheet of paper', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const body = confirmedBody()
    const first = await confirmIntake(intake.id, body)
    const workOrderId = (first.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    const second = await confirmIntake(intake.id, body)

    expect(second.status).toBe(200)
    expect((second.body as { id: string }).id).toBe(workOrderId)
    expect((second.body as { already?: boolean }).already).toBe(true)
  })

  it('answers 404 for an upload that does not exist', async () => {
    const result = await confirmIntake(`intake-${randomUUID()}`, confirmedBody())
    expect(result.status).toBe(404)
  })

  it('passes a validation error straight through and leaves the intake open', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody({ ticket_number: '' }))

    expect(result.status).toBe(400)
    const stored = await readIntake({ id: intake.id })
    expect(stored!.status).toBe('gelezen')
    expect(stored!.workOrderId).toBeNull()
  })

  it('reports a ticket number that already exists instead of duplicating it', async () => {
    const body = confirmedBody({ planned_date: new Date().toISOString() })
    const existing = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids!.push(existing.id)

    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody({ ticket_number: body.ticket_number }))

    expect(result.status).toBe(409)
    expect((result.body as { id: string }).id).toBe(existing.id)
  })
})

describe('createWorkOrder source and status', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('still defaults to a planned work order when no caller overrides it', async () => {
    // Guards the two lines confirmIntake needed: the ERP route and the wizard
    // pass no source or status and must keep behaving exactly as before.
    const body = confirmedBody({ planned_date: new Date().toISOString() })
    const created = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids!.push(created.id)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, created.id))
    expect(row.source).toBe('planned')
    expect(row.status).toBe('gepland')
  })
})

describe('a confirmed intake seen through the pool query itself', () => {
  let ids: CleanupIds
  let intakeIds: string[]
  let technicianId: string

  beforeEach(async () => {
    ids = { work_order_ids: [], technician_ids: [] }
    intakeIds = []

    technicianId = `tech-${randomUUID()}`
    await testDb.insert(technicians).values({
      id: technicianId,
      name: 'Testtechnieker',
      initials: 'TT',
      email: `${technicianId}@example.test`,
      role: 'technician',
      active: true,
    })
    ids.technician_ids!.push(technicianId)
  })

  afterEach(async () => {
    if (intakeIds.length) {
      await testDb.delete(workOrderIntakes).where(inArray(workOrderIntakes.id, intakeIds))
    }
    await cleanup(ids)
  })

  it('is returned by getTodayInterventions in the open list', async () => {
    // Checking source, status and visibleInPool proves the row is right; it
    // does not prove the query a technician's screen actually runs returns it.
    // This asks that query.
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const marker = `Geüploade bon ${randomUUID().slice(0, 8)}`
    const result = await confirmIntake(intake.id, confirmedBody({ description: marker }))
    const workOrderId = (result.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    const { open } = await getTodayInterventions(technicianId, new Date().toISOString().slice(0, 10))

    expect(open.map(item => item.id)).toContain(workOrderId)
    expect(open.find(item => item.id === workOrderId)!.description).toBe(marker)
  })

  it('is dropped from the pool once someone hides it', async () => {
    const intake = await insertIntake()
    intakeIds.push(intake.id)

    const result = await confirmIntake(intake.id, confirmedBody())
    const workOrderId = (result.body as { id: string }).id
    ids.work_order_ids!.push(workOrderId)

    await testDb.update(workOrders).set({ visibleInPool: false }).where(eq(workOrders.id, workOrderId))

    const { open } = await getTodayInterventions(technicianId, new Date().toISOString().slice(0, 10))
    expect(open.map(item => item.id)).not.toContain(workOrderId)
  })
})
