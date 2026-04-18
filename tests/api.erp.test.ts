import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getPartsPending } from '@/app/api/erp/parts-pending/route'
import { POST as postPartFulfil } from '@/app/api/erp/parts-pending/[task_id]/fulfil/route'
import { POST as postExternalRef } from '@/app/api/erp/work-orders/[id]/external-ref/route'
import { GET as getErpWorkOrders } from '@/app/api/erp/work-orders/route'
import { tasks, workOrderEvents, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, fetchTask, insertDependency, insertTask, testDb } from './setup'

function req(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
  headers?: Record<string, string>,
) {
  return new NextRequest(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...headers,
    },
  })
}

function workOrderContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function taskContext(task_id: string) {
  return { params: Promise.resolve({ task_id }) }
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

describe('ERP API surface', () => {
  let ids: CleanupIds
  const erpKey = process.env.ERP_API_KEY as string

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('all ERP routes reject missing and wrong X-ERP-Key headers and allow the correct key', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'in_progress',
      title: 'ERP part task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const routes = [
      () => getErpWorkOrders(req('http://localhost/api/erp/work-orders')),
      () => getPartsPending(req('http://localhost/api/erp/parts-pending')),
      () => postExternalRef(req(`http://localhost/api/erp/work-orders/${workOrderId}/external-ref`, {
        method: 'POST',
        body: JSON.stringify({ external_ref: 'ERP-1' }),
        headers: { 'content-type': 'application/json' },
      }), workOrderContext(workOrderId)),
      () => postPartFulfil(req(`http://localhost/api/erp/parts-pending/${taskId}/fulfil`, {
        method: 'POST',
        body: JSON.stringify({ erp_order_ref: 'ERP-PO-1', status: 'ordered' }),
        headers: { 'content-type': 'application/json' },
      }), taskContext(taskId)),
    ]

    for (const call of routes) {
      expect((await call()).status).toBe(401)
    }

    for (const call of [
      () => getErpWorkOrders(req('http://localhost/api/erp/work-orders', undefined, { 'x-erp-key': 'wrong-key' })),
      () => getPartsPending(req('http://localhost/api/erp/parts-pending', undefined, { 'x-erp-key': 'wrong-key' })),
    ]) {
      expect((await call()).status).toBe(401)
    }

    expect((await getErpWorkOrders(req('http://localhost/api/erp/work-orders', undefined, { 'x-erp-key': erpKey }))).status).toBe(200)
  })

  it('erp work orders endpoint returns work orders with tasks, werkbon, status filtering, and nullable external_ref', async () => {
    const matchingWorkOrderId = await createTestWorkOrder()
    const filteredOutWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(matchingWorkOrderId, filteredOutWorkOrderId)

    await testDb.update(workOrders)
      .set({
        status: 'bezig',
        plannedDate: new Date('2026-04-17T12:00:00.000Z'),
        completedAt: null,
      })
      .where(eq(workOrders.id, matchingWorkOrderId))
    await testDb.update(workOrders)
      .set({
        status: 'afgewerkt',
        plannedDate: new Date('2026-04-10T12:00:00.000Z'),
        completedAt: new Date('2026-04-17T13:00:00.000Z'),
      })
      .where(eq(workOrders.id, filteredOutWorkOrderId))

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId: matchingWorkOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'ERP visible task',
      payload: { sku: 'PART-1' },
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date('2026-04-17T12:10:00.000Z'),
    })
    ids.task_ids?.push(taskId)

    const response = await getErpWorkOrders(req(
      'http://localhost/api/erp/work-orders?since=2026-04-17T00:00:00.000Z&status=bezig',
      undefined,
      { 'x-erp-key': erpKey },
    ))
    const body = await json<{ work_orders: Array<Record<string, unknown>> }>(response)

    expect(response.status).toBe(200)
    expect(body.work_orders).toHaveLength(1)
    expect(body.work_orders[0]).toMatchObject({
      id: matchingWorkOrderId,
      external_ref: null,
      status: 'bezig',
    })
    expect(body.work_orders[0]?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: taskId, type: 'order_part' }),
    ]))
    expect(body.work_orders[0]).toHaveProperty('werkbon')
  })

  it('external-ref endpoint sets and overwrites external_ref and returns 404 for a missing work order', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const first = await postExternalRef(req(`http://localhost/api/erp/work-orders/${workOrderId}/external-ref`, {
      method: 'POST',
      body: JSON.stringify({ external_ref: 'ERP-REF-1' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), workOrderContext(workOrderId))
    const second = await postExternalRef(req(`http://localhost/api/erp/work-orders/${workOrderId}/external-ref`, {
      method: 'POST',
      body: JSON.stringify({ external_ref: 'ERP-REF-2' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), workOrderContext(workOrderId))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const [updated] = await testDb
      .select({ externalRef: workOrders.externalRef })
      .from(workOrders)
      .where(eq(workOrders.id, workOrderId))
    expect(updated?.externalRef).toBe('ERP-REF-2')

    const missing = await postExternalRef(req(`http://localhost/api/erp/work-orders/missing-${randomUUID()}/external-ref`, {
      method: 'POST',
      body: JSON.stringify({ external_ref: 'ERP-REF-X' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), workOrderContext(`missing-${randomUUID()}`))
    expect(missing.status).toBe(404)
  })

  it('parts pending endpoint returns only incomplete order_part tasks and includes payload', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const openTaskId = `task-${randomUUID()}`
    const doneTaskId = `task-${randomUUID()}`
    const otherTypeId = `task-${randomUUID()}`
    await insertTask({
      id: openTaskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'in_progress',
      title: 'Pending part',
      payload: { sku: 'PART-OPEN' },
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: doneTaskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'done',
      title: 'Completed part',
      payload: { sku: 'PART-DONE' },
      seq: 1,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: otherTypeId,
      workOrderId,
      type: 'other',
      role: 'warehouse',
      status: 'ready',
      title: 'Other task',
      payload: { sku: 'OTHER' },
      seq: 2,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(openTaskId, doneTaskId, otherTypeId)

    const response = await getPartsPending(req('http://localhost/api/erp/parts-pending', undefined, { 'x-erp-key': erpKey }))
    const body = await json<{ parts_pending: Array<{ id: string; payload: Record<string, unknown> | null }> }>(response)

    expect(body.parts_pending.map(task => task.id)).toEqual([openTaskId])
    expect(body.parts_pending[0]?.payload).toEqual({ sku: 'PART-OPEN' })
  })

  it('fulfil endpoint keeps ordered tasks in progress, completes received tasks, activates successors, and emits events', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const orderPartTaskId = `task-${randomUUID()}`
    const successorId = `task-${randomUUID()}`
    await insertTask({
      id: orderPartTaskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'in_progress',
      title: 'Order part',
      payload: { sku: 'PART-1' },
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: successorId,
      workOrderId,
      type: 'plan_revisit',
      role: 'office',
      status: 'pending',
      title: 'Plan revisit',
      seq: 1,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertDependency({
      id: `dep-${randomUUID()}`,
      predecessorId: orderPartTaskId,
      successorId,
      depType: 'finish_to_start',
      lagMinutes: 0,
    })
    ids.task_ids?.push(orderPartTaskId, successorId)

    const ordered = await postPartFulfil(req(`http://localhost/api/erp/parts-pending/${orderPartTaskId}/fulfil`, {
      method: 'POST',
      body: JSON.stringify({ erp_order_ref: 'ERP-PO-123', eta: '2026-04-20', status: 'ordered' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), taskContext(orderPartTaskId))
    expect(ordered.status).toBe(200)
    expect((await fetchTask(orderPartTaskId))?.status).toBe('in_progress')
    expect((await fetchTask(orderPartTaskId))?.payload).toMatchObject({ erp_order_ref: 'ERP-PO-123' })

    const received = await postPartFulfil(req(`http://localhost/api/erp/parts-pending/${orderPartTaskId}/fulfil`, {
      method: 'POST',
      body: JSON.stringify({ erp_order_ref: 'ERP-PO-123', status: 'received' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), taskContext(orderPartTaskId))
    const receivedBody = await json<{ activated_task_ids: string[] }>(received)

    expect(received.status).toBe(200)
    expect((await fetchTask(orderPartTaskId))?.status).toBe('done')
    expect((await fetchTask(successorId))?.status).toBe('ready')
    expect(receivedBody.activated_task_ids).toEqual([successorId])

    const events = await testDb
      .select({ eventType: workOrderEvents.eventType })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.taskId, orderPartTaskId))
    expect(events).toEqual(expect.arrayContaining([{ eventType: 'part_fulfilled' }]))
  })

  it('fulfil endpoint returns 404 for a missing task and 400 when the task is not an order_part task', async () => {
    const missing = await postPartFulfil(req(`http://localhost/api/erp/parts-pending/missing-${randomUUID()}/fulfil`, {
      method: 'POST',
      body: JSON.stringify({ erp_order_ref: 'ERP-PO-404', status: 'ordered' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), taskContext(`missing-${randomUUID()}`))
    expect(missing.status).toBe(404)

    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const otherTaskId = `task-${randomUUID()}`
    await insertTask({
      id: otherTaskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'in_progress',
      title: 'Not a part task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(otherTaskId)

    const wrongType = await postPartFulfil(req(`http://localhost/api/erp/parts-pending/${otherTaskId}/fulfil`, {
      method: 'POST',
      body: JSON.stringify({ erp_order_ref: 'ERP-PO-WRONG', status: 'ordered' }),
      headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
    }), taskContext(otherTaskId))

    expect(wrongType.status).toBe(400)
  })
})
