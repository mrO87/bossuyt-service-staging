import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskTemplateEdges, tasks, workOrderEvents } from '@/lib/db/schema'
import { getNextStatus, type TaskAction } from '@/lib/tasks/transitions'
import {
  activateReadySuccessors,
  createSuccessorFromTemplate,
} from '@/lib/tasks/dependencies'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'
import type { ReasonCode } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/tasks/[id]/transition ───────────────────────────────────────────
// Body:
// {
//   action: 'start' | 'complete' | 'skip' | 'cancel' | 'reopen'
//   skip_reason?: string      (required when action = 'skip')
//   reason_code?: ReasonCode
//   completed_by?: string
//   client_id?: string        (idempotency)
//   changed_by?: string
// }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const body        = await req.json()
    const action      = body.action      as TaskAction
    const skipReason  = (body.skip_reason  as string) || null
    const reasonCode  = (body.reason_code  as ReasonCode) || null
    const completedBy = (body.completed_by as string) || null
    const clientId    = (body.client_id   as string) || null
    const changedBy   = (body.changed_by  as string) || null

    if (!action) {
      return NextResponse.json({ error: 'action is verplicht' }, { status: 400 })
    }

    if (action === 'skip' && !skipReason) {
      return NextResponse.json(
        { error: 'skip_reason is verplicht bij actie "skip"' },
        { status: 400 },
      )
    }

    // Idempotency: if client_id already processed, return existing task state
    if (clientId) {
      const [existing] = await db
        .select({ taskId: workOrderEvents.taskId })
        .from(workOrderEvents)
        .where(
          and(
            eq(workOrderEvents.clientId, clientId),
            eq(workOrderEvents.eventType, `task_${action}`),
          ),
        )
        .limit(1)

      if (existing?.taskId) {
        const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId))
        if (existingTask) {
          return NextResponse.json({ task: toDbTask(existingTask), activated_task_ids: [] })
        }
      }
    }

    // Load current task
    const [current] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!current) {
      return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })
    }

    // Validate the transition
    const nextStatus = getNextStatus(current.status, action)
    if (!nextStatus) {
      return NextResponse.json(
        {
          error: `Ongeldige transitie: ${current.status} → actie "${action}" is niet toegestaan`,
        },
        { status: 422 },
      )
    }

    const now = new Date()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      status:    nextStatus,
      updatedAt: now,
    }

    if (nextStatus === 'done') {
      updates.completedAt = now
      updates.completedBy = completedBy ?? null
    }

    if (action === 'skip') {
      updates.skipReason = skipReason
      updates.reasonCode = reasonCode
    }

    if (action === 'reopen') {
      updates.completedAt = null
      updates.completedBy = null
      updates.skipReason  = null
    }

    let activatedTaskIds: string[] = []

    await withAudit(changedBy, async (tx) => {
      await tx.update(tasks).set(updates).where(eq(tasks.id, id))

      await tx.insert(workOrderEvents).values({
        workOrderId: current.workOrderId,
        taskId:      id,
        actorId:     changedBy ?? completedBy ?? 'unknown',
        eventType:   `task_${action}`,
        payload:     { from: current.status, to: nextStatus, reasonCode, skipReason },
        clientId,
      })
    })

    // After completing: activate successors and spawn auto-chain tasks
    if (nextStatus === 'done') {
      activatedTaskIds = await activateReadySuccessors(id)

      // Check if this task was created from a template with outgoing auto_create edges
      if (current.templateId) {
        const edges = await db
          .select()
          .from(taskTemplateEdges)
          .where(
            and(
              eq(taskTemplateEdges.fromTemplateId, current.templateId),
              eq(taskTemplateEdges.autoCreate, true),
            ),
          )

        for (const edge of edges) {
          const newTask = await createSuccessorFromTemplate(
            {
              id:          current.id,
              workOrderId: current.workOrderId,
              werkbonId:   current.werkbonId,
              templateId:  current.templateId,
            },
            { toTemplateId: edge.toTemplateId, depType: edge.depType },
          )
          if (newTask) activatedTaskIds.push(newTask.id)
        }
      }
    }

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id))
    return NextResponse.json({ task: toDbTask(updated), activated_task_ids: activatedTaskIds })
  } catch (error) {
    console.error('[api/tasks/[id]/transition POST]', error)
    return NextResponse.json({ error: 'Kon taakstatus niet wijzigen' }, { status: 500 })
  }
}
