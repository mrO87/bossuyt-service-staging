/**
 * lib/tasks/dependencies.ts
 *
 * Business logic for task dependency management.
 *
 * Each function accepts a `dbOrTx` parameter (defaults to the global `db`)
 * so it can be called both standalone AND inside a withAudit transaction.
 * Pass the `tx` from withAudit to keep reads + writes in a single transaction.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  taskDependencies,
  taskTemplates,
  tasks,
  workOrderEvents,
} from '@/lib/db/schema'
import type { DependencyType } from '@/types'

// Drizzle's transaction object shares the same CRUD API as `db`.
// We use `typeof db` as a practical type alias for both.
type DbOrTx = typeof db

/**
 * Returns true when ALL predecessors of `taskId` satisfy their dependency type.
 * Returns true immediately when the task has no predecessors at all.
 *
 * Dependency types:
 *   finish_to_start  — predecessor must be 'done'
 *   start_to_start   — predecessor must be 'in_progress' or 'done'
 *   finish_to_finish — predecessor must be 'done'
 */
export async function isTaskReady(
  taskId: string,
  dbOrTx: DbOrTx = db,
): Promise<boolean> {
  const deps = await dbOrTx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.successorId, taskId))

  if (deps.length === 0) return true

  const predecessorIds = deps.map(d => d.predecessorId)

  const predecessors = await dbOrTx
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(inArray(tasks.id, predecessorIds))

  const statusMap = new Map(predecessors.map(p => [p.id, p.status]))

  return deps.every(dep => {
    const predStatus = statusMap.get(dep.predecessorId)
    if (!predStatus) return false

    switch (dep.depType as DependencyType) {
      case 'finish_to_start':
        return predStatus === 'done'
      case 'start_to_start':
        return predStatus === 'in_progress' || predStatus === 'done'
      case 'finish_to_finish':
        return predStatus === 'done'
      default:
        return false
    }
  })
}

/**
 * After a task is completed, scans its successors and promotes any that are
 * now ready from 'pending' → 'ready'.
 *
 * Emits a 'task_ready' event for each newly activated successor.
 * Returns the list of newly activated task IDs.
 */
export async function activateReadySuccessors(
  completedTaskId: string,
  dbOrTx: DbOrTx = db,
): Promise<string[]> {
  const successorDeps = await dbOrTx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.predecessorId, completedTaskId))

  if (successorDeps.length === 0) return []

  const activated: string[] = []
  const now = new Date()

  for (const dep of successorDeps) {
    const ready = await isTaskReady(dep.successorId, dbOrTx)
    if (!ready) continue

    const [successor] = await dbOrTx
      .select()
      .from(tasks)
      .where(eq(tasks.id, dep.successorId))

    // Only promote tasks that are still in 'pending' state
    if (!successor || successor.status !== 'pending') continue

    await dbOrTx
      .update(tasks)
      .set({ status: 'ready', updatedAt: now })
      .where(eq(tasks.id, dep.successorId))

    await dbOrTx.insert(workOrderEvents).values({
      workOrderId: successor.workOrderId,
      taskId:      dep.successorId,
      actorId:     'system',
      eventType:   'task_ready',
      payload:     { triggeredBy: completedTaskId },
    })

    activated.push(dep.successorId)
  }

  return activated
}

/**
 * When a template edge has autoCreate = true, this function materialises a new
 * task from the successor template and links it to the completed task via a
 * task_dependency row.
 *
 * Call this after completing a task, once per template edge where
 * edge.fromTemplateId === completedTask.templateId AND edge.autoCreate === true.
 *
 * Returns the newly created task's id, or null if the template is missing/inactive.
 */
export async function createSuccessorFromTemplate(
  completedTask: {
    id: string
    workOrderId: string
    werkbonId: string | null
    templateId: string | null
  },
  edge: { toTemplateId: string; depType: string },
  dbOrTx: DbOrTx = db,
): Promise<{ id: string } | null> {
  const [template] = await dbOrTx
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, edge.toTemplateId))

  if (!template || !template.active) return null

  const newTaskId = crypto.randomUUID()
  const now = new Date()

  await dbOrTx.insert(tasks).values({
    id:          newTaskId,
    workOrderId: completedTask.workOrderId,
    werkbonId:   completedTask.werkbonId,
    templateId:  template.id,
    type:        template.defaultType,
    role:        template.defaultRole,
    status:      'pending',
    title:       template.name,
    description: template.description,
    seq:         0,
    createdBy:   'system',
    updatedAt:   now,
  })

  await dbOrTx.insert(taskDependencies).values({
    id:            crypto.randomUUID(),
    predecessorId: completedTask.id,
    successorId:   newTaskId,
    depType:       edge.depType as DependencyType,
    lagMinutes:    0,
  })

  await dbOrTx.insert(workOrderEvents).values({
    workOrderId: completedTask.workOrderId,
    taskId:      newTaskId,
    actorId:     'system',
    eventType:   'task_created',
    payload:     {
      source:     'auto_chain',
      fromTaskId: completedTask.id,
      templateId: template.id,
    },
  })

  // If the newly created task has no other predecessors, it's immediately ready
  const ready = await isTaskReady(newTaskId, dbOrTx)
  if (ready) {
    await dbOrTx
      .update(tasks)
      .set({ status: 'ready', updatedAt: now })
      .where(eq(tasks.id, newTaskId))
  }

  return { id: newTaskId }
}
