import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getTaskQueue } from '@/app/api/tasks/queue/route'
import { POST as postTaskTransition } from '@/app/api/tasks/[id]/transition/route'
import { GET as getTasks, POST as postTasks } from '@/app/api/tasks/route'
import { POST as postWorkOrderLink } from '@/app/api/work-orders/[id]/link/route'
import { GET as getWorkOrderLinks } from '@/app/api/work-orders/[id]/links/route'
import { GET as getWorkOrderTimeline } from '@/app/api/work-orders/[id]/timeline/route'
import { workOrderEvents } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, fetchTask, testDb } from './setup'

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

describe('task system end to end scenario', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('warehouse task appears in queue after order_part created and office revisit task unlocks after completion', async () => {
    const originalWorkOrderId = await createTestWorkOrder()
    const revisitWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(originalWorkOrderId, revisitWorkOrderId)

    const orderPartResponse = await postTasks(req('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        work_order_id: originalWorkOrderId,
        type: 'order_part',
        role: 'warehouse',
        title: 'Order replacement pump',
        changed_by: 'tech-on-site',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const orderPartBody = await json<{ task: { id: string; status: string } }>(orderPartResponse)
    const orderPartId = orderPartBody.task.id
    ids.task_ids?.push(orderPartId)

    expect(orderPartResponse.status).toBe(201)
    expect(orderPartBody.task.status).toBe('ready')

    const planRevisitResponse = await postTasks(req('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        work_order_id: originalWorkOrderId,
        type: 'plan_revisit',
        role: 'office',
        title: 'Plan revisit after part delivery',
        predecessor_task_ids: [orderPartId],
        changed_by: 'tech-on-site',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const planRevisitBody = await json<{ task: { id: string; status: string } }>(planRevisitResponse)
    const planRevisitId = planRevisitBody.task.id
    ids.task_ids?.push(planRevisitId)

    expect(planRevisitResponse.status).toBe(201)
    expect(planRevisitBody.task.status).toBe('pending')

    const warehouseQueueBefore = await getTaskQueue(req('http://localhost/api/tasks/queue?role=warehouse'))
    const warehouseQueueBeforeBody = await json<{ tasks: Array<{ id: string }> }>(warehouseQueueBefore)
    expect(warehouseQueueBeforeBody.tasks.map(task => task.id)).toContain(orderPartId)

    const officeQueueBefore = await getTaskQueue(req('http://localhost/api/tasks/queue?role=office'))
    const officeQueueBeforeBody = await json<{ tasks: Array<{ id: string }> }>(officeQueueBefore)
    expect(officeQueueBeforeBody.tasks.map(task => task.id)).not.toContain(planRevisitId)

    const startOrderPart = await postTaskTransition(req(`http://localhost/api/tasks/${orderPartId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'start', changed_by: 'warehouse-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(orderPartId))
    expect(startOrderPart.status).toBe(200)

    const completeOrderPart = await postTaskTransition(req(`http://localhost/api/tasks/${orderPartId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'complete', changed_by: 'warehouse-user', completed_by: 'warehouse-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(orderPartId))
    const completeOrderPartBody = await json<{ activated_task_ids: string[]; task: { status: string } }>(completeOrderPart)

    expect(completeOrderPartBody.task.status).toBe('done')
    expect(completeOrderPartBody.activated_task_ids).toContain(planRevisitId)
    expect((await fetchTask(planRevisitId))?.status).toBe('ready')

    const officeQueueAfter = await getTaskQueue(req('http://localhost/api/tasks/queue?role=office'))
    const officeQueueAfterBody = await json<{ tasks: Array<{ id: string }> }>(officeQueueAfter)
    expect(officeQueueAfterBody.tasks.map(task => task.id)).toContain(planRevisitId)

    const startPlanRevisit = await postTaskTransition(req(`http://localhost/api/tasks/${planRevisitId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'start', changed_by: 'office-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(planRevisitId))
    const startPlanRevisitBody = await json<{ task: { status: string } }>(startPlanRevisit)
    expect(startPlanRevisitBody.task.status).toBe('in_progress')

    const completePlanRevisit = await postTaskTransition(req(`http://localhost/api/tasks/${planRevisitId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'complete', changed_by: 'office-user', completed_by: 'office-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(planRevisitId))
    const completePlanRevisitBody = await json<{ task: { status: string } }>(completePlanRevisit)
    expect(completePlanRevisitBody.task.status).toBe('done')

    const linkResponse = await postWorkOrderLink(req(`http://localhost/api/work-orders/${originalWorkOrderId}/link`, {
      method: 'POST',
      body: JSON.stringify({
        to_work_order_id: revisitWorkOrderId,
        link_type: 'revisit',
        reason_code: 'part_needed',
        changed_by: 'office-user',
      }),
      headers: { 'content-type': 'application/json' },
    }), idContext(originalWorkOrderId))
    expect(linkResponse.status).toBe(201)

    const linksResponse = await getWorkOrderLinks(req(`http://localhost/api/work-orders/${originalWorkOrderId}/links`), idContext(originalWorkOrderId))
    const linksBody = await json<{ links: Array<{ toWorkOrderId: string; linkType: string }> }>(linksResponse)
    expect(linksBody.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ toWorkOrderId: revisitWorkOrderId, linkType: 'revisit' }),
    ]))

    const timelineResponse = await getWorkOrderTimeline(req(`http://localhost/api/work-orders/${originalWorkOrderId}/timeline`), idContext(originalWorkOrderId))
    const timelineBody = await json<{ events: Array<{ eventType: string; taskId: string | null }> }>(timelineResponse)

    // Events are returned newest-first (DESC occurred_at).
    // Activation of planRevisit by the dependency engine adds a 5th task_status_changed.
    expect(timelineBody.events.map(event => event.eventType)).toEqual([
      'follow_up_linked',
      'task_status_changed',
      'task_status_changed',
      'task_status_changed',
      'task_status_changed',
      'task_status_changed',
      'task_created',
      'task_created',
    ])

    const workOrderTimelineEvents = await testDb
      .select({ eventType: workOrderEvents.eventType })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.workOrderId, originalWorkOrderId))
    expect(workOrderTimelineEvents.length).toBeGreaterThanOrEqual(7)

    const getTasksResponse = await getTasks(req(`http://localhost/api/tasks?work_order_id=${originalWorkOrderId}`))
    const getTasksBody = await json<{ tasks: Array<{ id: string }> }>(getTasksResponse)
    expect(getTasksBody.tasks.map(task => task.id)).toEqual(expect.arrayContaining([orderPartId, planRevisitId]))
  })
})
