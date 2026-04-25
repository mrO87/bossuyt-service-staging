import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/work-orders/[id]/timeline ────────────────────────────────────────
// Returns all events for a work order, most recent first, with task title joined.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    // Fetch events + join task title (left join so events without a task still appear)
    const rows = await db
      .select({
        id:          workOrderEvents.id,
        occurredAt:  workOrderEvents.occurredAt,
        recordedAt:  workOrderEvents.recordedAt,
        workOrderId: workOrderEvents.workOrderId,
        taskId:      workOrderEvents.taskId,
        actorId:     workOrderEvents.actorId,
        eventType:   workOrderEvents.eventType,
        payload:     workOrderEvents.payload,
        clientId:    workOrderEvents.clientId,
        taskTitle:   tasks.title,
      })
      .from(workOrderEvents)
      .leftJoin(tasks, eq(workOrderEvents.taskId, tasks.id))
      .where(eq(workOrderEvents.workOrderId, id))
      .orderBy(desc(workOrderEvents.occurredAt))

    const events = rows.map(row => ({
      ...row,
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt,
      recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
    }))

    return NextResponse.json({ events })
  } catch (error) {
    console.error('[api/work-orders/[id]/timeline GET]', error)
    return NextResponse.json({ error: 'Kon tijdlijn niet laden' }, { status: 500 })
  }
}
