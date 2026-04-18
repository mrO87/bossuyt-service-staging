import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'

type RouteContext = { params: Promise<{ id: string }> }

// ── PATCH /api/tasks/[id] ──────────────────────────────────────────────────────
// Allowed fields: title, description, assignee_id, due_date, payload, seq
// Body: Partial<above> + changed_by
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const body      = await req.json()
    const changedBy = (body.changed_by as string) || null

    // Collect only the fields the caller explicitly sent
    const changedFields: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() }

    if (body.title !== undefined) {
      updates.title = (body.title as string).trim()
      changedFields.push('title')
    }
    if (body.description !== undefined) {
      updates.description = (body.description as string)?.trim() || null
      changedFields.push('description')
    }
    if (body.assignee_id !== undefined) {
      updates.assigneeId = (body.assignee_id as string) || null
      changedFields.push('assigneeId')
    }
    if (body.due_date !== undefined) {
      updates.dueDate = body.due_date ? new Date(body.due_date as string) : null
      changedFields.push('dueDate')
    }
    if (body.payload !== undefined) {
      updates.payload = body.payload as Record<string, unknown>
      changedFields.push('payload')
    }
    if (body.seq !== undefined) {
      updates.seq = body.seq as number
      changedFields.push('seq')
    }

    if (changedFields.length === 0) {
      return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
    }

    // Verify task exists
    const [current] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!current) {
      return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })
    }

    await withAudit(changedBy, async (tx) => {
      await tx.update(tasks).set(updates).where(eq(tasks.id, id))

      await tx.insert(workOrderEvents).values({
        workOrderId: current.workOrderId,
        taskId:      id,
        actorId:     changedBy ?? 'unknown',
        eventType:   'task_updated',
        payload:     { changedFields },
      })
    })

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id))
    return NextResponse.json({ task: toDbTask(updated) })
  } catch (error) {
    console.error('[api/tasks/[id] PATCH]', error)
    return NextResponse.json({ error: 'Kon taak niet bijwerken' }, { status: 500 })
  }
}
