import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderAssignments, workOrderEvents, workOrders } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import { getUserById } from '@/lib/mock-data'
import type { DbTaskType, TaskRole } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/work-orders/[id]/assign ────────────────────────────────────────
// Assigns a technician to a work order and optionally schedules it.
// - Without plannedDate: work order stays 'aangemaakt' and remains visible in
//   the open pool so any technician (incl. the assigned one) can pick it up.
// - With plannedDate: work order moves to 'gepland' and leaves the open pool.
// The load_parts task assignee is always kept in sync with the lead technician.
//
// Body: { technicianId: string, isLead?: boolean, plannedDate?: string, changed_by?: string }
// Returns: { ok: true }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const body         = await req.json()
    const technicianId = body.technicianId as string | undefined
    const isLead       = body.isLead !== false // default true
    const plannedDate  = body.plannedDate as string | undefined
    const changedBy    = (body.changed_by as string) || null

    if (!technicianId) {
      return NextResponse.json({ error: 'technicianId is verplicht' }, { status: 400 })
    }

    const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, id))
    if (!workOrder) {
      return NextResponse.json({ error: 'Werkbon niet gevonden' }, { status: 404 })
    }

    await withAudit(changedBy, async (tx) => {
      // Clear existing lead flag before setting a new one
      if (isLead) {
        await tx
          .update(workOrderAssignments)
          .set({ isLead: false })
          .where(and(
            eq(workOrderAssignments.workOrderId, id),
            eq(workOrderAssignments.isLead, true),
          ))
      }

      // Upsert assignment — insert or update isLead if the row already exists
      await tx
        .insert(workOrderAssignments)
        .values({ workOrderId: id, technicianId, isLead, accepted: false, plannedOrder: 0 })
        .onConflictDoUpdate({
          target: [workOrderAssignments.workOrderId, workOrderAssignments.technicianId],
          set: { isLead },
        })

      // Only transition to gepland when a date is given.
      // Without a date the work order stays 'aangemaakt' so it remains in the
      // open pool and any technician can still pick it up opportunistically.
      if (plannedDate) {
        await tx
          .update(workOrders)
          .set({ status: 'gepland', plannedDate: new Date(plannedDate) })
          .where(eq(workOrders.id, id))
      }

      // Keep load_parts task in sync with the lead technician
      if (isLead) {
        const [loadTask] = await tx
          .select()
          .from(tasks)
          .where(and(
            eq(tasks.workOrderId, id),
            eq(tasks.type, 'load_parts' as DbTaskType),
          ))

        const [pickTask] = await tx
          .select()
          .from(tasks)
          .where(and(
            eq(tasks.workOrderId, id),
            eq(tasks.type, 'pick_parts' as DbTaskType),
          ))

        const oldTechnicianId = loadTask?.assigneeId ?? null

        await tx
          .update(tasks)
          .set({ assigneeId: technicianId })
          .where(and(
            eq(tasks.workOrderId, id),
            eq(tasks.type, 'load_parts' as DbTaskType),
          ))

        // pick done but load not yet confirmed + technician changed → warehouse must move the parts
        // covers both pending (warehouse just finished) and ready (tech hasn't confirmed yet)
        if (
          oldTechnicianId &&
          oldTechnicianId !== technicianId &&
          pickTask?.status === 'done' &&
          (loadTask?.status === 'pending' || loadTask?.status === 'ready')
        ) {
          const oldName = getUserById(oldTechnicianId)?.name ?? oldTechnicianId
          const newName = getUserById(technicianId)?.name ?? technicianId
          await tx.insert(tasks).values({
            id:          crypto.randomUUID(),
            workOrderId: id,
            type:        'other' as DbTaskType,
            role:        'warehouse' as TaskRole,
            status:      'ready',
            title:       `Verplaats onderdelen: van ${oldName} naar ${newName}`,
            description: `De planning heeft de technieker gewijzigd van ${oldName} naar ${newName}. Verplaats de klaargezette onderdelen naar de juiste bus/locatie.`,
            seq:         99,
            createdBy:   changedBy ?? 'system',
            updatedAt:   new Date(),
          })
        }
      }

      await tx.insert(workOrderEvents).values({
        workOrderId: id,
        actorId:     changedBy ?? 'system',
        eventType:   'work_order_assigned',
        payload:     { technicianId, isLead, plannedDate: plannedDate ?? null },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/work-orders/[id]/assign POST]', error)
    return NextResponse.json({ error: 'Kon werkbon niet toewijzen' }, { status: 500 })
  }
}
