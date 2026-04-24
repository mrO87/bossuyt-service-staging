import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents, workOrderLinks, workOrders } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import type { PdfPart } from '@/lib/pdf'
import type { DbTaskType, TaskRole } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/work-orders/[id]/follow-up ─────────────────────────────────────
// Creates a new work order as a follow-up to the given one.
// Same customer / site / device. Pre-fills parts from the done order_part tasks.
// Body: { changed_by?: string, note?: string }
//
// Returns: { newWorkOrderId: string }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: fromId } = await params

  try {
    const body      = await req.json()
    const changedBy = (body.changed_by as string) || null
    const note      = (body.note      as string) || null

    // Load original work order
    const [original] = await db.select().from(workOrders).where(eq(workOrders.id, fromId))
    if (!original) {
      return NextResponse.json({ error: 'Werkbon niet gevonden' }, { status: 404 })
    }

    // Build pre-fill parts from done order_part tasks on this work order
    const doneParts = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.workOrderId, fromId),
        eq(tasks.type,        'order_part'),
        eq(tasks.status,      'done'),
      ))

    const prefillParts: PdfPart[] = doneParts.map(t => {
      const p = (t.payload ?? {}) as Record<string, unknown>
      return {
        id:          crypto.randomUUID(),
        code:        String(p.part_number ?? ''),
        description: String(p.description ?? t.title ?? ''),
        quantity:    Number(p.quantity ?? 1),
        toOrder:     false,
        urgent:      p.urgency === 'urgent',
      }
    })

    const newId  = crypto.randomUUID()
    const linkId = crypto.randomUUID()

    await withAudit(changedBy, async (tx) => {
      // Create the follow-up work order — not yet scheduled by planning
      await tx.insert(workOrders).values({
        id:          newId,
        customerId:  original.customerId,
        siteId:      original.siteId,
        deviceId:    original.deviceId,
        plannedDate: new Date(), // placeholder — office reschedules via planning
        status:      'aangemaakt',
        type:        original.type,
        source:      'reactive',
        description: `Opvolgbon — ${original.description ?? ''}`.trim(),
        prefillParts: prefillParts.length > 0 ? JSON.stringify(prefillParts) : null,
        isUrgent:    false,
        planningVersion: 1,
        createdBy:   changedBy,
      })

      // Register the follow_up link between both work orders
      await tx.insert(workOrderLinks).values({
        id:              linkId,
        fromWorkOrderId: fromId,
        toWorkOrderId:   newId,
        linkType:        'follow_up',
        note,
        createdBy:       changedBy,
      })

      // Timeline event on the ORIGINAL — appears in activiteiten tab
      await tx.insert(workOrderEvents).values({
        workOrderId: fromId,
        actorId:     changedBy ?? 'system',
        eventType:   'follow_up_created',
        payload:     {
          newWorkOrderId: newId,
          partCount:      prefillParts.length,
          fromDescription: original.description,
        },
      })

      // Timeline event on the NEW — explains where it came from
      await tx.insert(workOrderEvents).values({
        workOrderId: newId,
        actorId:     changedBy ?? 'system',
        eventType:   'created_as_follow_up',
        payload:     {
          fromWorkOrderId: fromId,
          fromDescription: original.description,
          partCount:       prefillParts.length,
        },
      })

      const now = new Date()

      // Task for technician: load the parts into the van (non-blocking)
      const loadTaskId = crypto.randomUUID()
      await tx.insert(tasks).values({
        id:          loadTaskId,
        workOrderId: newId,
        type:        'load_parts' as DbTaskType,
        role:        'technician' as TaskRole,
        status:      'ready',
        title:       'Onderdelen laden in bus',
        description: 'Bevestig dat de onderdelen in de bestelwagen zijn geladen.',
        seq:         1,
        createdBy:   changedBy ?? 'system',
        updatedAt:   now,
      })

      // Task for office: schedule the follow-up work order
      const planTaskId = crypto.randomUUID()
      await tx.insert(tasks).values({
        id:          planTaskId,
        workOrderId: newId,
        type:        'plan_revisit' as DbTaskType,
        role:        'office' as TaskRole,
        status:      'ready',
        title:       'Opvolgbon inplannen',
        description: 'Plan deze opvolgbon in bij de juiste technieker.',
        seq:         2,
        createdBy:   changedBy ?? 'system',
        updatedAt:   now,
      })
    })

    return NextResponse.json({ ok: true, newWorkOrderId: newId }, { status: 201 })
  } catch (error) {
    console.error('[api/work-orders/[id]/follow-up POST]', error)
    return NextResponse.json({ error: 'Kon opvolgbon niet aanmaken' }, { status: 500 })
  }
}
