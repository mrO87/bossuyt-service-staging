import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tasks, workOrders } from '@/lib/db/schema'
import { getQueueForRole, getQueueForTechnician } from '@/lib/tasks/queue'
import type { DbTaskStatus, DbTaskType, TaskRole } from '@/types'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, insertTask, testDb } from './setup'

function buildTaskId(label: string) {
  return `${label}-${randomUUID()}`
}

describe('task queues', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], task_ids: [], technician_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  async function createTaskForWorkOrder(
    workOrderId: string,
    values: Partial<{
      type: DbTaskType
      role: TaskRole
      status: DbTaskStatus
      title: string
      assigneeId: string | null
      seq: number
      dueDate: Date | null
    }> = {},
  ) {
    const taskId = buildTaskId('queue-task')
    await insertTask({
      id: taskId,
      workOrderId,
      type: 'other',
      role: 'warehouse',
      status: 'ready',
      title: 'Queue task',
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
      ...values,
    })
    ids.task_ids?.push(taskId)
    return taskId
  }

  it('role queue returns only matching roles in ready or in_progress status', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const warehouseReadyId = await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'ready' })
    const warehouseProgressId = await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'in_progress' })
    await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'pending' })
    await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'done' })
    await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'cancelled' })
    await createTaskForWorkOrder(workOrderId, { role: 'warehouse', status: 'skipped' })
    await createTaskForWorkOrder(workOrderId, { role: 'office', status: 'ready' })

    const queue = await getQueueForRole('warehouse')

    expect(queue.map(task => task.id)).toEqual([warehouseReadyId, warehouseProgressId])
  })

  it('urgent work orders appear before non urgent work orders', async () => {
    const urgentWorkOrderId = await createTestWorkOrder()
    const nonUrgentWorkOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(urgentWorkOrderId, nonUrgentWorkOrderId)

    await testDb.update(workOrders).set({ isUrgent: true }).where(eq(workOrders.id, urgentWorkOrderId))

    const urgentTaskId = await createTaskForWorkOrder(urgentWorkOrderId, { title: 'Urgent warehouse task' })
    const normalTaskId = await createTaskForWorkOrder(nonUrgentWorkOrderId, { title: 'Normal warehouse task' })

    const queue = await getQueueForRole('warehouse')

    expect(queue.map(task => task.id)).toEqual([urgentTaskId, normalTaskId])
  })

  it('tasks with due dates appear before tasks without due dates and earlier due dates come first', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const earlierId = await createTaskForWorkOrder(workOrderId, { dueDate: new Date('2026-04-18T08:00:00.000Z') })
    const laterId = await createTaskForWorkOrder(workOrderId, { dueDate: new Date('2026-04-18T12:00:00.000Z') })
    const noDueDateId = await createTaskForWorkOrder(workOrderId, { dueDate: null })

    const queue = await getQueueForRole('warehouse')

    expect(queue.map(task => task.id)).toEqual([earlierId, laterId, noDueDateId])
  })

  it('technician queue returns assigned tasks plus ready unassigned technician tasks only', async () => {
    const technicianId = await createTestTechnician()
    const otherTechnicianId = await createTestTechnician()
    ids.technician_ids?.push(technicianId, otherTechnicianId)

    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const assignedReadyId = await createTaskForWorkOrder(workOrderId, {
      role: 'technician',
      status: 'ready',
      assigneeId: technicianId,
      title: 'Assigned ready technician task',
    })
    const assignedInProgressId = await createTaskForWorkOrder(workOrderId, {
      role: 'technician',
      status: 'in_progress',
      assigneeId: technicianId,
      title: 'Assigned in progress technician task',
    })
    const unassignedPoolId = await createTaskForWorkOrder(workOrderId, {
      role: 'technician',
      status: 'ready',
      assigneeId: null,
      title: 'Unassigned pool task',
    })
    await createTaskForWorkOrder(workOrderId, {
      role: 'warehouse',
      status: 'ready',
      assigneeId: null,
      title: 'Unassigned warehouse task',
    })
    await createTaskForWorkOrder(workOrderId, {
      role: 'admin',
      status: 'ready',
      assigneeId: null,
      title: 'Unassigned admin task',
    })
    await createTaskForWorkOrder(workOrderId, {
      role: 'technician',
      status: 'ready',
      assigneeId: otherTechnicianId,
      title: 'Assigned to someone else',
    })

    const queue = await getQueueForTechnician(technicianId)

    expect(queue.map(task => task.id).sort()).toEqual([
      assignedReadyId,
      assignedInProgressId,
      unassignedPoolId,
    ].sort())
  })
})
