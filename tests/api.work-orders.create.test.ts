import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postErpWorkOrder } from '@/app/api/erp/work-orders/route'
import { POST as postWorkOrder } from '@/app/api/work-orders/route'
import { workOrderAssignments, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

function molenhoeve(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = { ...(fixture.customer as Record<string, unknown>), number: `K-${suffix}`, invoice_number: `K-${suffix}` }
  return { ...fixture, ticket_number: `TKT-${suffix}`, customer, ...overrides }
}

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const erpKey = process.env.ERP_API_KEY as string
const ERP_URL = 'http://localhost/api/erp/work-orders'
const INTERNAL_URL = 'http://localhost/api/work-orders'

describe('POST /api/erp/work-orders', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('rejects a missing or wrong x-erp-key with 401', async () => {
    expect((await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve()))).status).toBe(401)
    expect((await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve(), { 'x-erp-key': 'wrong' }))).status).toBe(401)
  })

  it('creates the Molenhoeve work order and returns 201 with id and ticket_number', async () => {
    const body = molenhoeve()
    const res = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    const json = await res.json() as { id: string; ticket_number: string }
    ids.work_order_ids?.push(json.id)

    expect(res.status).toBe(201)
    expect(json.ticket_number).toBe(body.ticket_number)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, json.id))
    expect(wo?.deviceId).toBeNull()
  })

  it('returns 409 with the existing id for a duplicate ticket', async () => {
    const body = molenhoeve()
    const first = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    const { id } = await first.json() as { id: string }
    ids.work_order_ids?.push(id)

    const second = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'Ticket bestaat al', id })
  })

  it('returns 400 naming the field on invalid input', async () => {
    const res = await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve({ ticket_number: '' }), { 'x-erp-key': erpKey }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ field: 'ticket_number' })

    const bad = new NextRequest(ERP_URL, { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json', 'x-erp-key': erpKey } })
    expect((await postErpWorkOrder(bad)).status).toBe(400)
  })
})

describe('POST /api/work-orders (internal)', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('creates a work order without an ERP key and assigns technicians', async () => {
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)

    const res = await postWorkOrder(jsonReq(INTERNAL_URL, molenhoeve({ technician_ids: [techId], created_by: techId })))
    const json = await res.json() as { id: string }
    ids.work_order_ids?.push(json.id)

    expect(res.status).toBe(201)
    const rows = await testDb.select().from(workOrderAssignments).where(eq(workOrderAssignments.workOrderId, json.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isLead).toBe(true)
  })

  it('returns 400 and 409 like the ERP route', async () => {
    expect((await postWorkOrder(jsonReq(INTERNAL_URL, molenhoeve({ description: '' })))).status).toBe(400)
    const body = molenhoeve()
    const first = await postWorkOrder(jsonReq(INTERNAL_URL, body))
    ids.work_order_ids?.push((await first.json() as { id: string }).id)
    expect((await postWorkOrder(jsonReq(INTERNAL_URL, body))).status).toBe(409)
  })
})
