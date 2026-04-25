import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { workOrderEvents, workOrderLinks } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import type { ReasonCode, WorkOrderLinkType } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/work-orders/[id]/link ───────────────────────────────────────────
// Body:
// {
//   to_work_order_id: string       (required)
//   link_type: WorkOrderLinkType   (required)
//   reason_code?: ReasonCode
//   note?: string
//   changed_by?: string
// }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: fromWorkOrderId } = await params

  try {
    const body          = await req.json()
    const toWorkOrderId = body.to_work_order_id as string
    const linkType      = body.link_type         as WorkOrderLinkType
    const reasonCode    = (body.reason_code as ReasonCode) || null
    const note          = (body.note as string) || null
    const changedBy     = (body.changed_by as string) || null

    if (!toWorkOrderId || !linkType) {
      return NextResponse.json(
        { error: 'to_work_order_id en link_type zijn verplicht' },
        { status: 400 },
      )
    }

    const linkId = crypto.randomUUID()

    await withAudit(changedBy, async (tx) => {
      await tx.insert(workOrderLinks).values({
        id: linkId,
        fromWorkOrderId,
        toWorkOrderId,
        linkType,
        reasonCode,
        note,
        createdBy: changedBy,
      })

      // Emit an event on BOTH work orders so both timelines reflect the link
      await tx.insert(workOrderEvents).values({
        workOrderId: fromWorkOrderId,
        taskId:      null,
        actorId:     changedBy ?? 'unknown',
        eventType:   'follow_up_linked',
        payload:     { linkId, toWorkOrderId, linkType, reasonCode },
      })

      await tx.insert(workOrderEvents).values({
        workOrderId: toWorkOrderId,
        taskId:      null,
        actorId:     changedBy ?? 'unknown',
        eventType:   'follow_up_linked',
        payload:     { linkId, fromWorkOrderId, linkType, reasonCode },
      })
    })

    return NextResponse.json({ ok: true, linkId }, { status: 201 })
  } catch (error: unknown) {
    // Unique constraint = link already exists
    if (error instanceof Error && error.message.includes('work_order_link_unique')) {
      return NextResponse.json({ error: 'Link bestaat al' }, { status: 409 })
    }
    console.error('[api/work-orders/[id]/link POST]', error)
    return NextResponse.json({ error: 'Kon link niet aanmaken' }, { status: 500 })
  }
}
