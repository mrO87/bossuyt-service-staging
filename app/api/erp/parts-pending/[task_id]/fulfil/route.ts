import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'
import { activateReadySuccessors } from '@/lib/tasks/dependencies'
import { withAudit } from '@/lib/db/with-audit'

type RouteContext = { params: Promise<{ task_id: string }> }

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── POST /api/erp/parts-pending/[task_id]/fulfil ──────────────────────────────
// ERP marks a part as ordered or received.
// Body: { erp_order_ref: string, eta?: string, status: 'ordered' | 'received' }
//
// When status = 'received': the task is completed and successors are activated
// (e.g. the plan_revisit task becomes 'ready' in the office queue).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const authError = requireErpKey(req)
  if (authError) return authError

  const { task_id: taskId } = await params

  try {
    const body         = await req.json()
    const erpOrderRef  = body.erp_order_ref as string
    const eta          = (body.eta as string) || null
    const fulfilStatus = body.status as 'ordered' | 'received'

    if (!erpOrderRef || !['ordered', 'received'].includes(fulfilStatus)) {
      return NextResponse.json(
        { error: 'erp_order_ref en status ("ordered"|"received") zijn verplicht' },
        { status: 400 },
      )
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })

    const now = new Date()
    // Merge ERP data into the existing payload object
    const updatedPayload = { ...(task.payload ?? {}), erp_order_ref: erpOrderRef, eta }

    let activatedTaskIds: string[] = []

    await withAudit('erp', async (tx) => {
      const updates: Record<string, unknown> = { payload: updatedPayload, updatedAt: now }

      if (fulfilStatus === 'received') {
        updates.status      = 'done'
        updates.completedAt = now
      }

      await tx.update(tasks).set(updates).where(eq(tasks.id, taskId))

      await tx.insert(workOrderEvents).values({
        workOrderId: task.workOrderId,
        taskId,
        actorId:     'erp',
        eventType:   'part_fulfilled',
        payload:     { erpOrderRef, eta, fulfilStatus },
      })
    })

    if (fulfilStatus === 'received') {
      activatedTaskIds = await activateReadySuccessors(taskId)
    }

    return NextResponse.json({ ok: true, activated_task_ids: activatedTaskIds })
  } catch (error) {
    console.error('[api/erp/parts-pending/[task_id]/fulfil POST]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
