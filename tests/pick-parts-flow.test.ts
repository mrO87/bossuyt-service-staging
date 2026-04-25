/**
 * Integration test: full pick_parts → load_parts follow-up flow
 *
 * Covers the backend logic end-to-end:
 *   1. Technician orders parts on a work order
 *   2. Warehouse receives the parts and marks order_part tasks done
 *   3. Technician creates a follow-up work order
 *   4. pick_parts task is created (warehouse, ready) + load_parts task (technician, pending)
 *   5. Warehouse queue includes the pick_parts task
 *   6. Warehouse completes picking (ready → in_progress → done)
 *   7. activateReadySuccessors fires → load_parts promoted to ready
 *   8. Technician confirms parts loaded (load_parts → done)
 *
 * Run with: npm test (requires DATABASE_URL_TEST in env)
 */

import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postFollowUp } from '@/app/api/work-orders/[id]/follow-up/route'
import { GET as getWarehouseQueue } from '@/app/api/warehouse/queue/route'
import { POST as postTaskTransition } from '@/app/api/tasks/[id]/transition/route'
import { POST as postTasks } from '@/app/api/tasks/route'
import { tasks } from '@/lib/db/schema'
import type { PickingGroup } from '@/app/api/warehouse/queue/route'
import { cleanup, createTestWorkOrder, fetchTask, testDb, type CleanupIds } from './setup'

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

async function transition(taskId: string, action: string, actor = 'test') {
  return postTaskTransition(
    req(`http://localhost/api/tasks/${taskId}/transition`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ action, changed_by: actor, completed_by: actor }),
    }),
    ctx(taskId),
  )
}

describe('pick_parts → load_parts follow-up flow', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('warehouse picks parts, dependency fires, technician can confirm loading', async () => {
    // ── Setup: create original work order with a completed order_part task ───
    const originalId = await createTestWorkOrder()
    ids.work_order_ids?.push(originalId)

    const createRes = await postTasks(req('http://localhost/api/tasks', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        work_order_id: originalId,
        type:          'order_part',
        role:          'warehouse',
        title:         'Bestellen: filter type A',
        payload: {
          part_number:  'F-001',
          description:  'Filter type A',
          quantity:     2,
          urgency:      'normal',
          order_type:   'supplier_order',
        },
        client_id: `test-order-${Date.now()}`,
      }),
    }))
    expect(createRes.status).toBe(201)
    const { task: orderPart } = await json<{ task: { id: string } }>(createRes)
    ids.task_ids?.push(orderPart.id)

    // Warehouse: ordered + received
    await transition(orderPart.id, 'start', 'warehouse')
    await transition(orderPart.id, 'complete', 'warehouse')

    // ── Step 1: Create follow-up work order ──────────────────────────────────
    const followUpRes = await postFollowUp(
      req(`http://localhost/api/work-orders/${originalId}/follow-up`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ changed_by: 'tech-u1', note: 'onderdelen nodig' }),
      }),
      ctx(originalId),
    )
    expect(followUpRes.status).toBe(201)
    const { newWorkOrderId } = await json<{ newWorkOrderId: string }>(followUpRes)
    ids.work_order_ids?.push(newWorkOrderId)

    // ── Step 2: pick_parts ready, load_parts pending ─────────────────────────
    const [pickTask] = await testDb
      .select()
      .from(tasks)
      .where(and(eq(tasks.workOrderId, newWorkOrderId), eq(tasks.type, 'pick_parts')))

    const [loadTask] = await testDb
      .select()
      .from(tasks)
      .where(and(eq(tasks.workOrderId, newWorkOrderId), eq(tasks.type, 'load_parts')))

    expect(pickTask, 'pick_parts task should exist').toBeDefined()
    expect(pickTask.status).toBe('ready')
    expect(pickTask.role).toBe('warehouse')

    expect(loadTask, 'load_parts task should exist').toBeDefined()
    expect(loadTask.status).toBe('pending')   // blocked until warehouse is done
    expect(loadTask.role).toBe('technician')

    // Parts from completed order_part should be copied into both tasks
    const pickParts = (pickTask.payload as { parts?: unknown[] } | null)?.parts ?? []
    expect(pickParts.length).toBeGreaterThan(0)

    // ── Step 3: Warehouse queue includes the pick_parts task ─────────────────
    const queueRes = await getWarehouseQueue()
    expect(queueRes.status).toBe(200)
    const { pickingGroups } = await json<{ pickingGroups: PickingGroup[] }>(queueRes)

    const pickEntry = pickingGroups.find(g => g.task.id === pickTask.id)
    expect(pickEntry, 'pick_parts task should appear in warehouse pickingGroups').toBeDefined()

    // ── Step 4: Warehouse picks the parts (ready → in_progress → done) ───────
    const startPickRes = await transition(pickTask.id, 'start', 'warehouse')
    expect(startPickRes.status).toBe(200)
    const { task: startedPick } = await json<{ task: { status: string } }>(startPickRes)
    expect(startedPick.status).toBe('in_progress')

    const completePickRes = await transition(pickTask.id, 'complete', 'warehouse')
    expect(completePickRes.status).toBe(200)
    const { task: donePick, activated_task_ids } =
      await json<{ task: { status: string }; activated_task_ids: string[] }>(completePickRes)
    expect(donePick.status).toBe('done')

    // ── Step 5: Dependency chain fired — load_parts is now ready ─────────────
    expect(activated_task_ids, 'load_parts should be in activated_task_ids').toContain(loadTask.id)

    const updatedLoad = await fetchTask(loadTask.id)
    expect(updatedLoad?.status).toBe('ready')

    // pick_parts no longer in the warehouse queue
    const queueRes2 = await getWarehouseQueue()
    const { pickingGroups: remainingGroups } = await json<{ pickingGroups: PickingGroup[] }>(queueRes2)
    expect(remainingGroups.find(g => g.task.id === pickTask.id)).toBeUndefined()

    // ── Step 6: Technician confirms parts loaded ──────────────────────────────
    const startLoadRes = await transition(loadTask.id, 'start', 'tech-u1')
    expect(startLoadRes.status).toBe(200)

    const completeLoadRes = await transition(loadTask.id, 'complete', 'tech-u1')
    expect(completeLoadRes.status).toBe(200)
    const { task: doneLoad } = await json<{ task: { status: string } }>(completeLoadRes)
    expect(doneLoad.status).toBe('done')
  })
})
