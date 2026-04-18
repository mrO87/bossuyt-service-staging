/**
 * lib/tasks/queue.ts
 *
 * Queue queries: returns tasks that are actionable right now.
 *
 * Sort order: urgent work orders first, then by due date (nulls last), then
 * by the display-order seq column within the work order.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrders } from '@/lib/db/schema'
import type { DbTask, TaskRole } from '@/types'

// All task columns we need — defined once so both queries stay in sync.
const TASK_COLS = {
  id:          tasks.id,
  workOrderId: tasks.workOrderId,
  werkbonId:   tasks.werkbonId,
  templateId:  tasks.templateId,
  type:        tasks.type,
  role:        tasks.role,
  status:      tasks.status,
  title:       tasks.title,
  description: tasks.description,
  assigneeId:  tasks.assigneeId,
  seq:         tasks.seq,
  dueDate:     tasks.dueDate,
  completedAt: tasks.completedAt,
  completedBy: tasks.completedBy,
  skipReason:  tasks.skipReason,
  reasonCode:  tasks.reasonCode,
  payload:     tasks.payload,
  createdAt:   tasks.createdAt,
  createdBy:   tasks.createdBy,
  updatedAt:   tasks.updatedAt,
} as const

/** Returns all 'ready' or 'in_progress' tasks for the given role. */
export async function getQueueForRole(role: TaskRole): Promise<DbTask[]> {
  const rows = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.role, role),
        inArray(tasks.status, ['ready', 'in_progress']),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  return rows.map(toDbTask)
}

/**
 * Returns tasks for a specific technician:
 *   - Tasks assigned to them (ready or in_progress)
 *   - Unassigned tasks in the 'technician' role that are ready
 *
 * Duplicate rows (a technician might appear in both sets) are deduplicated.
 */
export async function getQueueForTechnician(technicianId: string): Promise<DbTask[]> {
  // Assigned tasks in progress or ready
  const assigned = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.assigneeId, technicianId),
        inArray(tasks.status, ['ready', 'in_progress']),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  // Unassigned technician-role tasks that are ready (open pool)
  const unassigned = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.role, 'technician'),
        isNull(tasks.assigneeId),
        eq(tasks.status, 'ready'),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  // Merge and deduplicate by id (assigned tasks take precedence)
  const seen = new Set<string>()
  const result: DbTask[] = []
  for (const row of [...assigned, ...unassigned]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      result.push(toDbTask(row))
    }
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDbTask(row: any): DbTask {
  return {
    id:          row.id,
    workOrderId: row.workOrderId,
    werkbonId:   row.werkbonId ?? null,
    templateId:  row.templateId ?? null,
    type:        row.type,
    role:        row.role,
    status:      row.status,
    title:       row.title,
    description: row.description ?? null,
    assigneeId:  row.assigneeId ?? null,
    seq:         row.seq ?? 0,
    dueDate:     toIso(row.dueDate),
    completedAt: toIso(row.completedAt),
    completedBy: row.completedBy ?? null,
    skipReason:  row.skipReason ?? null,
    reasonCode:  row.reasonCode ?? null,
    payload:     row.payload ?? null,
    createdAt:   toIso(row.createdAt) ?? new Date().toISOString(),
    createdBy:   row.createdBy ?? null,
    updatedAt:   toIso(row.updatedAt) ?? new Date().toISOString(),
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}
