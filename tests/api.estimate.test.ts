/**
 * PATCH /api/work-orders/[id]/estimate
 *
 * The estimate used to be write-once: set at creation from
 * DEFAULT_ESTIMATED_MINUTES and never touchable again. Since the day's overrun
 * warning is built on it, a technician looking at a wrong number had no way to
 * correct it. Empty stays valid — no field in this app is mandatory.
 */
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PATCH } from '@/app/api/work-orders/[id]/estimate/route'
import { workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, testDb } from './setup'

function request(body: unknown) {
  return new Request('http://localhost/api/work-orders/x/estimate', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

async function patch(id: string, body: unknown) {
  const res = await PATCH(request(body), { params: Promise.resolve({ id }) })
  return { status: res.status, body: await res.json() }
}

async function storedEstimate(id: string) {
  const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, id))
  return row?.estimatedMinutes
}

describe('PATCH work order estimate', () => {
  let ids: CleanupIds
  let workOrderId: string

  beforeEach(async () => {
    workOrderId = await createTestWorkOrder()
    ids = { work_order_ids: [workOrderId] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('stores a new estimate', async () => {
    const result = await patch(workOrderId, { estimatedMinutes: 135 })

    expect(result.status).toBe(200)
    expect(result.body.estimatedMinutes).toBe(135)
    expect(await storedEstimate(workOrderId)).toBe(135)
  })

  it('accepts an empty estimate, because no field is mandatory', async () => {
    await patch(workOrderId, { estimatedMinutes: 135 })

    const result = await patch(workOrderId, { estimatedMinutes: null })

    expect(result.status).toBe(200)
    expect(await storedEstimate(workOrderId)).toBeNull()
  })

  it.each([
    ['zero', 0],
    ['negative', -30],
    ['longer than a day', 24 * 60 + 1],
    ['fractional', 42.5],
    ['text', 'anderhalf uur'],
  ])('refuses %s and changes nothing', async (_label, value) => {
    await patch(workOrderId, { estimatedMinutes: 90 })

    const result = await patch(workOrderId, { estimatedMinutes: value })

    expect(result.status).toBe(400)
    expect(await storedEstimate(workOrderId)).toBe(90)
  })

  it('allows exactly a full day', async () => {
    const result = await patch(workOrderId, { estimatedMinutes: 24 * 60 })
    expect(result.status).toBe(200)
  })

  it('reports an unknown work order rather than pretending', async () => {
    const result = await patch(`wo-${randomUUID()}`, { estimatedMinutes: 60 })
    expect(result.status).toBe(404)
  })
})
