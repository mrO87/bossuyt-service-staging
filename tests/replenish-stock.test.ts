/**
 * Integration test: replenish_stock is its own task type.
 *
 * A technician can fit a part in two ways:
 *   - the part must be bought from a supplier  → order_part
 *   - the part came off the van or shelf stock → replenish_stock
 *
 * Both are warehouse work, but only the first is a purchase. Before this type
 * existed, both were stored as order_part, so a refill showed up in the
 * warehouse's "Openstaande bestellingen" list and — worse — was exported to the
 * ERP as a pending supplier order for a part that was already installed.
 *
 * Run with: npm test (requires DATABASE_URL_TEST in env)
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getWarehouseQueue } from '@/app/api/warehouse/queue/route'
import { POST as postTasks } from '@/app/api/tasks/route'
import type { WarehouseQueueResponse } from '@/app/api/warehouse/queue/route'
import { cleanup, createTestWorkOrder, type CleanupIds } from './setup'

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

async function createTask(workOrderId: string, type: string, title: string) {
  const res = await postTasks(req('http://localhost/api/tasks', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({
      work_order_id: workOrderId,
      type,
      role:  'warehouse',
      title,
      payload: { part_number: 'X-1', description: title, quantity: 1 },
    }),
  }))
  return { status: res.status, body: await json<{ task?: { id: string; type: string }; error?: string }>(res) }
}

describe('replenish_stock task type', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('accepts replenish_stock as a valid task type', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const { status, body } = await createTask(workOrderId, 'replenish_stock', 'Stock aanvullen: dichting')
    expect(status).toBe(201)
    expect(body.task?.type).toBe('replenish_stock')
    if (body.task) ids.task_ids?.push(body.task.id)
  })

  it('keeps refills out of the warehouse order list and puts them in refillGroups', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const order  = await createTask(workOrderId, 'order_part',      'Bestellen: pomp')
    const refill = await createTask(workOrderId, 'replenish_stock', 'Stock aanvullen: dichting')
    if (order.body.task)  ids.task_ids?.push(order.body.task.id)
    if (refill.body.task) ids.task_ids?.push(refill.body.task.id)

    const queue = await json<WarehouseQueueResponse>(await getWarehouseQueue())

    const orderIds  = queue.groups.flatMap(g => g.tasks.map(t => t.id))
    const refillIds = queue.refillGroups.flatMap(g => g.tasks.map(t => t.id))

    expect(orderIds).toContain(order.body.task?.id)
    expect(orderIds).not.toContain(refill.body.task?.id)
    expect(refillIds).toContain(refill.body.task?.id)
    expect(refillIds).not.toContain(order.body.task?.id)
  })

  // Regression guard: an earlier draft collected work order ids from the order
  // rows only, so a work order whose only warehouse task was a refill never made
  // it into the metadata map and its group was silently dropped.
  it('returns a refill group for a work order that has no order_part task at all', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const refill = await createTask(workOrderId, 'replenish_stock', 'Stock aanvullen: filter')
    if (refill.body.task) ids.task_ids?.push(refill.body.task.id)

    const queue = await json<WarehouseQueueResponse>(await getWarehouseQueue())
    const group = queue.refillGroups.find(g => g.workOrderId === workOrderId)

    expect(group).toBeDefined()
    expect(group?.tasks.map(t => t.id)).toContain(refill.body.task?.id)
  })
})
