import { NextRequest, NextResponse } from 'next/server'
import { SQL, and, asc, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskDependencies, tasks, workOrderEvents } from '@/lib/db/schema'
import { isTaskReady } from '@/lib/tasks/dependencies'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'
import type { DbTaskStatus, DbTaskType, ReasonCode, TaskRole } from '@/types'

// ── GET /api/tasks ─────────────────────────────────────────────────────────────
// Query params (all optional, combinable): work_order_id, role, status, assignee_id
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const workOrderId = url.searchParams.get('work_order_id')
  const role        = url.searchParams.get('role')
  const status      = url.searchParams.get('status')
  const assigneeId  = url.searchParams.get('assignee_id')

  try {
    const conditions: SQL[] = []
    if (workOrderId) conditions.push(eq(tasks.workOrderId, workOrderId))
    if (role)        conditions.push(eq(tasks.role, role as TaskRole))
    if (status)      conditions.push(eq(tasks.status, status as DbTaskStatus))
    if (assigneeId)  conditions.push(eq(tasks.assigneeId, assigneeId))

    const rows = await db
      .select()
      .from(tasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(tasks.seq), asc(tasks.createdAt))

    // Attach predecessor/successor IDs for each returned task
    const taskIds = rows.map(r => r.id)
    const deps = taskIds.length
      ? await db
          .select()
          .from(taskDependencies)
          .where(
            or(
              inArray(taskDependencies.predecessorId, taskIds),
              inArray(taskDependencies.successorId, taskIds),
            ),
          )
      : []

    const result = rows.map(row => ({
      ...toDbTask(row),
      predecessorIds: deps.filter(d => d.successorId   === row.id).map(d => d.predecessorId),
      successorIds:   deps.filter(d => d.predecessorId === row.id).map(d => d.successorId),
    }))

    return NextResponse.json({ tasks: result })
  } catch (error) {
    console.error('[api/tasks GET]', error)
    return NextResponse.json({ error: 'Kon taken niet laden' }, { status: 500 })
  }
}

// ── POST /api/tasks ────────────────────────────────────────────────────────────
// Body shape:
// {
//   work_order_id: string            (required)
//   werkbon_id?: string
//   type: DbTaskType                 (required)
//   role: TaskRole                   (required)
//   title: string                    (required)
//   description?: string
//   assignee_id?: string
//   due_date?: string                (ISO 8601)
//   payload?: object
//   predecessor_task_ids?: string[]
//   client_id?: string               (idempotency key)
//   changed_by?: string
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const workOrderId        = body.work_order_id as string
    const werkbonId          = (body.werkbon_id as string)          || null
    const type               = body.type          as DbTaskType
    const role               = body.role          as TaskRole
    const title              = (body.title as string)?.trim()
    const description        = (body.description  as string)?.trim() || null
    const assigneeId         = (body.assignee_id  as string)        || null
    const dueDate            = body.due_date ? new Date(body.due_date as string) : null
    const payload            = (body.payload as Record<string, unknown>) || null
    const predecessorTaskIds = (body.predecessor_task_ids as string[]) || []
    const clientId           = (body.client_id as string)           || null
    const changedBy          = (body.changed_by as string)          || null

    if (!workOrderId || !type || !role || !title) {
      return NextResponse.json(
        { error: 'work_order_id, type, role en title zijn verplicht' },
        { status: 400 },
      )
    }

    const VALID_TASK_TYPES: DbTaskType[] = [
      'order_part', 'plan_revisit', 'pick_parts', 'load_parts',
      'contact_customer', 'internal_note', 'quality_check', 'approval', 'other',
    ]
    if (!VALID_TASK_TYPES.includes(type)) {
      return NextResponse.json({ error: `Ongeldig taaktype: ${type}` }, { status: 400 })
    }

    // Idempotency: if we already processed this client_id, return the existing task
    if (clientId) {
      const [existing] = await db
        .select({ taskId: workOrderEvents.taskId })
        .from(workOrderEvents)
        .where(
          and(
            eq(workOrderEvents.clientId, clientId),
            eq(workOrderEvents.eventType, 'task_created'),
          ),
        )
        .limit(1)

      if (existing?.taskId) {
        const [existingTask] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, existing.taskId))

        if (existingTask) {
          return NextResponse.json({ task: toDbTask(existingTask) })
        }
      }
    }

    const taskId = crypto.randomUUID()

    await withAudit(changedBy, async (tx) => {
      await tx.insert(tasks).values({
        id:          taskId,
        workOrderId,
        werkbonId,
        type,
        role,
        status:      'pending',
        title,
        description,
        assigneeId,
        dueDate,
        payload,
        seq:         0,
        createdBy:   changedBy,
        updatedAt:   new Date(),
      })

      // Create dependency rows for each predecessor
      for (const predId of predecessorTaskIds) {
        await tx.insert(taskDependencies).values({
          id:            crypto.randomUUID(),
          predecessorId: predId,
          successorId:   taskId,
          depType:       'finish_to_start',
          lagMinutes:    0,
        })
      }

      // Emit creation event (carries client_id for dedup)
      await tx.insert(workOrderEvents).values({
        workOrderId,
        taskId,
        actorId:   changedBy ?? 'unknown',
        eventType: 'task_created',
        payload:   { type, role, title },
        clientId,
      })
    })

    // Check if this task is immediately ready (no unfinished predecessors)
    const ready = await isTaskReady(taskId)
    if (ready) {
      await db
        .update(tasks)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    }

    const [created] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    return NextResponse.json({ task: toDbTask(created) }, { status: 201 })
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause
    if (cause?.code === '23503') {
      return NextResponse.json({ error: 'Werkorder of referentie niet gevonden' }, { status: 400 })
    }
    console.error('[api/tasks POST]', error)
    return NextResponse.json({ error: 'Kon taak niet aanmaken' }, { status: 500 })
  }
}
