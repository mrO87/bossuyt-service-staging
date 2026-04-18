import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getTaskQueue } from '@/app/api/tasks/queue/route'
import { PATCH as patchTask } from '@/app/api/tasks/[id]/route'
import { POST as postTaskTransition } from '@/app/api/tasks/[id]/transition/route'
import { GET as getTasks, POST as postTasks } from '@/app/api/tasks/route'
import { POST as postWorkOrderLink } from '@/app/api/work-orders/[id]/link/route'
import { GET as getWorkOrderLinks } from '@/app/api/work-orders/[id]/links/route'
import { GET as getWorkOrderTimeline } from '@/app/api/work-orders/[id]/timeline/route'
import { taskDependencies, tasks, workOrderEvents, workOrderLinks } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import {
  cleanup,
  createTestTechnician,
  createTestWorkOrder,
  fetchTask,
  hasDependency,
  insertDependency,
  insertTask,
  taskExists,
  testDb,
} from './setup'

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

async function createTaskViaApi(body: Record<string, unknown>) {
  const response = await postTasks(req('http://localhost/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }))

  return {
    response,
    body: await json<{ task?: { id: string; status: string } } & Record<string, unknown>>(response),
  }
}

describe('task API routes', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [], technician_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('creates a minimal task and emits a creation event', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const { response, body } = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'order_part',
      role: 'warehouse',
      title: 'Order pump part',
      changed_by: 'test-user',
    })

    expect(response.status).toBe(201)
    expect(body.task).toMatchObject({
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      title: 'Order pump part',
      status: 'ready',
    })

    const createdTaskId = body.task?.id as string
    ids.task_ids?.push(createdTaskId)

    const events = await testDb
      .select({
        eventType: workOrderEvents.eventType,
        taskId: workOrderEvents.taskId,
      })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.workOrderId, workOrderId))

    expect(events).toEqual(expect.arrayContaining([
      { eventType: 'task_created', taskId: createdTaskId },
    ]))
  })

  it('returns 400 when work_order_id is missing', async () => {
    const response = await postTasks(req('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        type: 'order_part',
        role: 'warehouse',
        title: 'Missing work order',
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
  })

  it('returns 400 when work_order_id references a non existent work order', async () => {
    const { response } = await createTaskViaApi({
      work_order_id: `wo-missing-${randomUUID()}`,
      type: 'order_part',
      role: 'warehouse',
      title: 'Ghost work order task',
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when type is not a valid task type', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const { response } = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'not_a_task_type',
      role: 'warehouse',
      title: 'Invalid type task',
    })

    expect(response.status).toBe(400)
  })

  it('creates task dependencies when predecessor_task_ids are provided', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const predecessorId = `task-${randomUUID()}`
    await insertTask({
      id: predecessorId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'done',
      title: 'Existing predecessor',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(predecessorId)

    const { body } = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'plan_revisit',
      role: 'office',
      title: 'Dependent task',
      predecessor_task_ids: [predecessorId],
    })

    const createdTaskId = body.task?.id as string
    ids.task_ids?.push(createdTaskId)

    await expect(hasDependency(predecessorId, createdTaskId)).resolves.toBe(true)
  })

  it('deduplicates task creation on client_id and returns the original task', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const clientId = `client-${randomUUID()}`

    const first = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'order_part',
      role: 'warehouse',
      title: 'Idempotent task',
      client_id: clientId,
    })
    const second = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'order_part',
      role: 'warehouse',
      title: 'Idempotent task duplicate',
      client_id: clientId,
    })

    const createdTaskId = first.body.task?.id as string
    ids.task_ids?.push(createdTaskId)

    expect(second.body.task?.id).toBe(createdTaskId)

    const allTasks = await testDb.select().from(tasks).where(eq(tasks.workOrderId, workOrderId))
    expect(allTasks).toHaveLength(1)
  })

  it('new task with no predecessors becomes ready immediately', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const { body } = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'order_part',
      role: 'warehouse',
      title: 'Ready now',
    })

    const createdTaskId = body.task?.id as string
    ids.task_ids?.push(createdTaskId)

    expect(body.task?.status).toBe('ready')
  })

  it('new task with an incomplete predecessor stays pending', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const predecessorId = `task-${randomUUID()}`
    await insertTask({
      id: predecessorId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'in_progress',
      title: 'Incomplete predecessor',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(predecessorId)

    const { body } = await createTaskViaApi({
      work_order_id: workOrderId,
      type: 'plan_revisit',
      role: 'office',
      title: 'Blocked by predecessor',
      predecessor_task_ids: [predecessorId],
    })

    const createdTaskId = body.task?.id as string
    ids.task_ids?.push(createdTaskId)

    expect(body.task?.status).toBe('pending')
  })

  it('updates allowed task fields and emits an update event', async () => {
    const workOrderId = await createTestWorkOrder()
    const technicianId = await createTestTechnician()
    ids.work_order_ids?.push(workOrderId)
    ids.technician_ids?.push(technicianId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'ready',
      title: 'Before patch',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await patchTask(req(`http://localhost/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'After patch',
        description: 'Updated description',
        assignee_id: technicianId,
        seq: 7,
        changed_by: 'planner',
      }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const body = await json<{ task: { title: string; description: string | null; assigneeId: string | null; seq: number } }>(response)

    expect(response.status).toBe(200)
    expect(body.task).toMatchObject({
      title: 'After patch',
      description: 'Updated description',
      assigneeId: technicianId,
      seq: 7,
    })

    const events = await testDb
      .select({ eventType: workOrderEvents.eventType })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.taskId, taskId))

    expect(events).toEqual(expect.arrayContaining([{ eventType: 'task_updated' }]))
  })

  it('returns 404 when patching a non existent task', async () => {
    const missingId = `task-${randomUUID()}`

    const response = await patchTask(req(`http://localhost/api/tasks/${missingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Should fail' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(missingId))

    expect(response.status).toBe(404)
  })

  it('starts a ready task', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'Ready to start',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'start', changed_by: 'warehouse-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const body = await json<{ task: { status: string } }>(response)

    expect(response.status).toBe(200)
    expect(body.task.status).toBe('in_progress')
  })

  it('completing an in progress task activates its successors', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const predecessorId = `task-${randomUUID()}`
    const successorId = `task-${randomUUID()}`
    await insertTask({
      id: predecessorId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'in_progress',
      title: 'Order part',
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
      predecessorId,
      successorId,
      depType: 'finish_to_start',
      lagMinutes: 0,
    })
    ids.task_ids?.push(predecessorId, successorId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${predecessorId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'complete', completed_by: 'warehouse-user' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(predecessorId))

    const body = await json<{ task: { status: string }; activated_task_ids: string[] }>(response)

    expect(response.status).toBe(200)
    expect(body.task.status).toBe('done')
    expect(body.activated_task_ids).toEqual([successorId])
    expect((await fetchTask(successorId))?.status).toBe('ready')
  })

  it('skip without skip_reason returns 400', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'in_progress',
      title: 'Skippable task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'skip' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    expect(response.status).toBe(400)
  })

  it('skip with skip_reason marks the task skipped', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'in_progress',
      title: 'Skippable task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'skip', skip_reason: 'Customer not available' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const body = await json<{ task: { status: string } }>(response)

    expect(response.status).toBe(200)
    expect(body.task.status).toBe('skipped')
  })

  it('cancel marks the task cancelled', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'ready',
      title: 'Cancellable task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const body = await json<{ task: { status: string } }>(response)

    expect(body.task.status).toBe('cancelled')
  })

  it('invalid action for the current status returns 422 with an error message', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'pending',
      title: 'Pending task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    const response = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'complete' }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const body = await json<{ error: string }>(response)

    expect(response.status).toBe(422)
    expect(body.error).toContain('Ongeldige transitie')
  })

  it('deduplicates transitions on client_id', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'Idempotent transition task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)
    const clientId = `transition-${randomUUID()}`

    const first = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'start', client_id: clientId }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))
    const second = await postTaskTransition(req(`http://localhost/api/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'start', client_id: clientId }),
      headers: { 'content-type': 'application/json' },
    }), idContext(taskId))

    const firstBody = await json<{ task: { status: string } }>(first)
    const secondBody = await json<{ task: { status: string }; activated_task_ids: string[] }>(second)

    expect(firstBody.task.status).toBe('in_progress')
    expect(secondBody.task.status).toBe('in_progress')
    expect(secondBody.activated_task_ids).toEqual([])
  })

  it('task listing filters by work order, role, and status and includes dependency ids', async () => {
    const firstWorkOrderId = await createTestWorkOrder()
    const secondWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(firstWorkOrderId, secondWorkOrderId)

    const predecessorId = `task-${randomUUID()}`
    const matchingTaskId = `task-${randomUUID()}`
    const otherRoleId = `task-${randomUUID()}`
    const otherStatusId = `task-${randomUUID()}`
    const otherWorkOrderId = `task-${randomUUID()}`

    await insertTask({
      id: predecessorId,
      workOrderId: firstWorkOrderId,
      type: 'other',
      role: 'office',
      status: 'done',
      title: 'Predecessor',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: matchingTaskId,
      workOrderId: firstWorkOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'Matching task',
      seq: 1,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: otherRoleId,
      workOrderId: firstWorkOrderId,
      type: 'order_part',
      role: 'office',
      status: 'ready',
      title: 'Other role',
      seq: 2,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: otherStatusId,
      workOrderId: firstWorkOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'pending',
      title: 'Other status',
      seq: 3,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: otherWorkOrderId,
      workOrderId: secondWorkOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'Other work order',
      seq: 4,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertDependency({
      id: `dep-${randomUUID()}`,
      predecessorId,
      successorId: matchingTaskId,
      depType: 'finish_to_start',
      lagMinutes: 0,
    })
    ids.task_ids?.push(predecessorId, matchingTaskId, otherRoleId, otherStatusId, otherWorkOrderId)

    const response = await getTasks(req(`http://localhost/api/tasks?work_order_id=${firstWorkOrderId}&role=warehouse&status=ready`))
    const body = await json<{ tasks: Array<{ id: string; predecessorIds: string[]; successorIds: string[] }> }>(response)

    expect(body.tasks.map(task => task.id)).toEqual([matchingTaskId])
    expect(body.tasks[0]?.predecessorIds).toEqual([predecessorId])
    expect(body.tasks[0]?.successorIds).toEqual([])
  })

  it('queue endpoint returns role queues and technician queues', async () => {
    const workOrderId = await createTestWorkOrder()
    const technicianId = await createTestTechnician()
    ids.work_order_ids?.push(workOrderId)
    ids.technician_ids?.push(technicianId)

    const warehouseTaskId = `task-${randomUUID()}`
    const technicianTaskId = `task-${randomUUID()}`
    const poolTaskId = `task-${randomUUID()}`
    await insertTask({
      id: warehouseTaskId,
      workOrderId,
      type: 'order_part',
      role: 'warehouse',
      status: 'ready',
      title: 'Warehouse queue task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: technicianTaskId,
      workOrderId,
      type: 'other',
      role: 'technician',
      status: 'in_progress',
      title: 'Assigned technician task',
      assigneeId: technicianId,
      seq: 1,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    await insertTask({
      id: poolTaskId,
      workOrderId,
      type: 'other',
      role: 'technician',
      status: 'ready',
      title: 'Open pool task',
      assigneeId: null,
      seq: 2,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(warehouseTaskId, technicianTaskId, poolTaskId)

    const warehouseResponse = await getTaskQueue(req('http://localhost/api/tasks/queue?role=warehouse'))
    const warehouseBody = await json<{ tasks: Array<{ id: string }> }>(warehouseResponse)
    expect(warehouseBody.tasks.map(task => task.id)).toEqual([warehouseTaskId])

    const technicianResponse = await getTaskQueue(req(`http://localhost/api/tasks/queue?technician_id=${technicianId}`))
    const technicianBody = await json<{ tasks: Array<{ id: string }> }>(technicianResponse)
    expect(technicianBody.tasks.map(task => task.id).sort()).toEqual([technicianTaskId, poolTaskId].sort())
  })

  it('timeline returns events in descending occurred_at order and includes task titles', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const taskId = `task-${randomUUID()}`
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'office',
      status: 'done',
      title: 'Timeline task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(taskId)

    await testDb.insert(workOrderEvents).values([
      {
        workOrderId,
        taskId,
        actorId: 'user-1',
        eventType: 'task_created',
        payload: {},
        occurredAt: new Date('2026-04-17T09:00:00.000Z'),
        recordedAt: new Date('2026-04-17T09:00:00.000Z'),
      },
      {
        workOrderId,
        taskId,
        actorId: 'user-1',
        eventType: 'task_status_changed',
        payload: {},
        occurredAt: new Date('2026-04-17T10:00:00.000Z'),
        recordedAt: new Date('2026-04-17T10:00:00.000Z'),
      },
    ])

    const response = await getWorkOrderTimeline(req(`http://localhost/api/work-orders/${workOrderId}/timeline`), idContext(workOrderId))
    const body = await json<{ events: Array<{ eventType: string; taskTitle: string | null }> }>(response)

    expect(body.events.map(event => event.eventType)).toEqual(['task_status_changed', 'task_created'])
    expect(body.events[0]?.taskTitle).toBe('Timeline task')
  })

  it('timeline returns an empty array when no events exist', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const response = await getWorkOrderTimeline(req(`http://localhost/api/work-orders/${workOrderId}/timeline`), idContext(workOrderId))
    const body = await json<{ events: unknown[] }>(response)

    expect(response.status).toBe(200)
    expect(body.events).toEqual([])
  })

  it('work order link creation inserts a link and emits events on both work orders', async () => {
    const originalWorkOrderId = await createTestWorkOrder()
    const revisitWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(originalWorkOrderId, revisitWorkOrderId)

    const response = await postWorkOrderLink(req(`http://localhost/api/work-orders/${originalWorkOrderId}/link`, {
      method: 'POST',
      body: JSON.stringify({
        to_work_order_id: revisitWorkOrderId,
        link_type: 'revisit',
        reason_code: 'part_needed',
      }),
      headers: { 'content-type': 'application/json' },
    }), idContext(originalWorkOrderId))

    expect(response.status).toBe(201)

    const links = await testDb.select().from(workOrderLinks).where(eq(workOrderLinks.fromWorkOrderId, originalWorkOrderId))
    expect(links).toHaveLength(1)

    const originalEvents = await testDb
      .select({ eventType: workOrderEvents.eventType })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.workOrderId, originalWorkOrderId))
    const revisitEvents = await testDb
      .select({ eventType: workOrderEvents.eventType })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.workOrderId, revisitWorkOrderId))

    expect(originalEvents).toEqual(expect.arrayContaining([{ eventType: 'follow_up_linked' }]))
    expect(revisitEvents).toEqual(expect.arrayContaining([{ eventType: 'follow_up_linked' }]))
  })

  it('work order link creation returns 409 when the same link already exists', async () => {
    const originalWorkOrderId = await createTestWorkOrder()
    const revisitWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(originalWorkOrderId, revisitWorkOrderId)

    const body = JSON.stringify({
      to_work_order_id: revisitWorkOrderId,
      link_type: 'revisit',
      reason_code: 'part_needed',
    })

    const first = await postWorkOrderLink(req(`http://localhost/api/work-orders/${originalWorkOrderId}/link`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    }), idContext(originalWorkOrderId))
    const second = await postWorkOrderLink(req(`http://localhost/api/work-orders/${originalWorkOrderId}/link`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    }), idContext(originalWorkOrderId))

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
  })

  it('work order links listing includes both directions and linked work order info', async () => {
    const originalWorkOrderId = await createTestWorkOrder()
    const revisitWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(originalWorkOrderId, revisitWorkOrderId)

    await postWorkOrderLink(req(`http://localhost/api/work-orders/${originalWorkOrderId}/link`, {
      method: 'POST',
      body: JSON.stringify({
        to_work_order_id: revisitWorkOrderId,
        link_type: 'revisit',
        reason_code: 'part_needed',
      }),
      headers: { 'content-type': 'application/json' },
    }), idContext(originalWorkOrderId))

    const response = await getWorkOrderLinks(req(`http://localhost/api/work-orders/${originalWorkOrderId}/links`), idContext(originalWorkOrderId))
    const body = await json<{ links: Array<Record<string, unknown>> }>(response)

    expect(body.links).toHaveLength(1)
    expect(body.links[0]).toMatchObject({
      fromWorkOrderId: originalWorkOrderId,
      toWorkOrderId: revisitWorkOrderId,
      linkType: 'revisit',
    })
    expect(body.links[0]).toHaveProperty('linked_work_order')
  })
})
