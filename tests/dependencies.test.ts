import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activateReadySuccessors, isTaskReady } from '@/lib/tasks/dependencies'
import { taskDependencies, tasks, workOrderEvents } from '@/lib/db/schema'
import type { DbTaskStatus, DependencyType } from '@/types'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, fetchTask, insertDependency, insertTask, testDb } from './setup'

function buildTaskId(label: string) {
  return `${label}-${randomUUID()}`
}

describe('task dependency logic', () => {
  let ids: CleanupIds
  let workOrderId: string

  beforeEach(async () => {
    ids = { work_order_ids: [], task_ids: [] }
    workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  async function createTask(status: DbTaskStatus, title = 'Test task') {
    const id = buildTaskId('task')
    await insertTask({
      id,
      workOrderId,
      type: 'other',
      role: 'office',
      status,
      title,
      seq: 0,
      createdBy: 'test',
      updatedAt: new Date(),
    })
    ids.task_ids?.push(id)
    return id
  }

  async function link(predecessorId: string, successorId: string, depType: DependencyType) {
    await insertDependency({
      id: buildTaskId('dep'),
      predecessorId,
      successorId,
      depType,
      lagMinutes: 0,
    })
  }

  it('task with no predecessors is ready immediately', async () => {
    const taskId = await createTask('pending')
    await expect(isTaskReady(taskId)).resolves.toBe(true)
  })

  it('finish to start predecessor in done status makes the successor ready', async () => {
    const predecessorId = await createTask('done', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'finish_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(true)
  })

  it('finish to start predecessor in in_progress status does not make the successor ready', async () => {
    const predecessorId = await createTask('in_progress', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'finish_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(false)
  })

  it('finish to start predecessor in pending status does not make the successor ready', async () => {
    const predecessorId = await createTask('pending', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'finish_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(false)
  })

  it('two done predecessors make the successor ready', async () => {
    const firstPredecessorId = await createTask('done', 'First predecessor')
    const secondPredecessorId = await createTask('done', 'Second predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(firstPredecessorId, successorId, 'finish_to_start')
    await link(secondPredecessorId, successorId, 'finish_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(true)
  })

  it('one done and one pending predecessor keeps the successor pending', async () => {
    const firstPredecessorId = await createTask('done', 'First predecessor')
    const secondPredecessorId = await createTask('pending', 'Second predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(firstPredecessorId, successorId, 'finish_to_start')
    await link(secondPredecessorId, successorId, 'finish_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(false)
  })

  it('start to start predecessor in in_progress status makes the successor ready', async () => {
    const predecessorId = await createTask('in_progress', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'start_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(true)
  })

  it('start to start predecessor in pending status does not make the successor ready', async () => {
    const predecessorId = await createTask('pending', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'start_to_start')

    await expect(isTaskReady(successorId)).resolves.toBe(false)
  })

  it('completing a task with one finish to start successor marks the successor ready and returns its id', async () => {
    const predecessorId = await createTask('done', 'Predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(predecessorId, successorId, 'finish_to_start')

    const activated = await activateReadySuccessors(predecessorId)

    expect(activated).toEqual([successorId])
    expect((await fetchTask(successorId))?.status).toBe('ready')
  })

  it('completing a task with two ready successors marks both successors ready', async () => {
    const predecessorId = await createTask('done', 'Predecessor')
    const firstSuccessorId = await createTask('pending', 'First successor')
    const secondSuccessorId = await createTask('pending', 'Second successor')
    await link(predecessorId, firstSuccessorId, 'finish_to_start')
    await link(predecessorId, secondSuccessorId, 'finish_to_start')

    const activated = await activateReadySuccessors(predecessorId)

    expect(activated.sort()).toEqual([firstSuccessorId, secondSuccessorId].sort())
    expect((await fetchTask(firstSuccessorId))?.status).toBe('ready')
    expect((await fetchTask(secondSuccessorId))?.status).toBe('ready')
  })

  it('completing one of two predecessors does not activate the successor yet', async () => {
    const donePredecessorId = await createTask('done', 'Done predecessor')
    const pendingPredecessorId = await createTask('pending', 'Pending predecessor')
    const successorId = await createTask('pending', 'Successor')
    await link(donePredecessorId, successorId, 'finish_to_start')
    await link(pendingPredecessorId, successorId, 'finish_to_start')

    const activated = await activateReadySuccessors(donePredecessorId)

    expect(activated).toEqual([])
    expect((await fetchTask(successorId))?.status).toBe('pending')
  })

  it('activating successors emits a task_status_changed event for each activated task', async () => {
    const predecessorId = await createTask('done', 'Predecessor')
    const firstSuccessorId = await createTask('pending', 'First successor')
    const secondSuccessorId = await createTask('pending', 'Second successor')
    await link(predecessorId, firstSuccessorId, 'finish_to_start')
    await link(predecessorId, secondSuccessorId, 'finish_to_start')

    await activateReadySuccessors(predecessorId)

    const events = await testDb
      .select({
        taskId: workOrderEvents.taskId,
        eventType: workOrderEvents.eventType,
      })
      .from(workOrderEvents)
      .where(eq(workOrderEvents.workOrderId, workOrderId))

    expect(events).toEqual(expect.arrayContaining([
      { taskId: firstSuccessorId, eventType: 'task_status_changed' },
      { taskId: secondSuccessorId, eventType: 'task_status_changed' },
    ]))
  })
})
