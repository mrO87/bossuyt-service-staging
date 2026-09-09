import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, devices, sites, tasks, technicians, workOrders } from '@/lib/db/schema'
import { toDbTask } from '@/lib/tasks/queue'
import type { DbTask } from '@/types'

export type WarehouseGroup = {
  workOrderId:  string
  customerName: string
  siteName:     string
  deviceBrand:  string
  deviceModel:  string
  isUrgent:     boolean
  plannedDate:  string | null
  tasks:        DbTask[]
}

export type PickingGroup = {
  workOrderId:    string
  customerName:   string
  siteName:       string
  technicianName: string
  task:           DbTask
}

export type WarehouseQueueResponse = {
  groups:        WarehouseGroup[]
  doneToday:     WarehouseGroup[]
  total:         number
  pickingGroups: PickingGroup[]
  /** Stock refills for parts already fitted. Kept apart from `groups` so the
   *  warehouse does not read them as things to buy. */
  refillGroups:  WarehouseGroup[]
}

// ── GET /api/warehouse/queue ──────────────────────────────────────────────────
// Returns:
//   groups        — active order_part tasks (ready | in_progress), grouped by work order
//   doneToday     — order_part tasks completed today
//   pickingGroups — active pick_parts tasks (follow-up workorder picking per technician)
export async function GET() {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // ── order_part and replenish_stock tasks ──────────────────────────────────
    // Both are warehouse work and share a card layout, but they are different
    // jobs: one is bought from a supplier, the other is topped up from stock.
    const allPartRows = await db
      .select()
      .from(tasks)
      .where(and(
        inArray(tasks.type, ['order_part', 'replenish_stock']),
        eq(tasks.role, 'warehouse'),
      ))
      .orderBy(tasks.createdAt)

    const orderRows  = allPartRows.filter(t => t.type === 'order_part')
    const refillRows = allPartRows.filter(t => t.type === 'replenish_stock')

    const activeOrderRows    = orderRows.filter(t => t.status === 'ready' || t.status === 'in_progress')
    const doneTodayOrderRows = orderRows.filter(t =>
      t.status === 'done' &&
      t.completedAt != null &&
      new Date(t.completedAt) >= todayStart,
    )

    // ── pick_parts tasks (follow-up workorder picking) ────────────────────────
    const pickRows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.type, 'pick_parts'), eq(tasks.role, 'warehouse')))
      .orderBy(tasks.createdAt)

    const activePickRows = pickRows.filter(t => t.status === 'ready' || t.status === 'in_progress')

    // ── Collect all relevant work order IDs ───────────────────────────────────
    const allWorkOrderIds = [...new Set([
      ...allPartRows.map(t => t.workOrderId),
      ...activePickRows.map(t => t.workOrderId),
    ])]

    if (allWorkOrderIds.length === 0) {
      return NextResponse.json({
        groups: [], doneToday: [], total: 0, pickingGroups: [], refillGroups: [],
      } satisfies WarehouseQueueResponse)
    }

    // ── Fetch work order metadata ─────────────────────────────────────────────
    const woRows = await db
      .select({
        id:           workOrders.id,
        isUrgent:     workOrders.isUrgent,
        plannedDate:  workOrders.plannedDate,
        customerName: customers.name,
        siteName:     sites.name,
        deviceBrand:  devices.brand,
        deviceModel:  devices.model,
      })
      .from(workOrders)
      .innerJoin(customers, eq(workOrders.customerId, customers.id))
      .innerJoin(sites,     eq(workOrders.siteId,     sites.id))
      .leftJoin(devices,    eq(workOrders.deviceId,   devices.id))
      .where(inArray(workOrders.id, allWorkOrderIds))

    const woMap = new Map(woRows.map(r => [r.id, r]))

    // ── Resolve technician names for pick_parts via linked load_parts task ────
    const techNameMap = new Map<string, string>() // workOrderId → technician name

    if (activePickRows.length > 0) {
      const pickWoIds = [...new Set(activePickRows.map(t => t.workOrderId))]
      const loadRows = await db
        .select({ workOrderId: tasks.workOrderId, techName: technicians.name })
        .from(tasks)
        .leftJoin(technicians, eq(tasks.assigneeId, technicians.id))
        .where(and(inArray(tasks.workOrderId, pickWoIds), eq(tasks.type, 'load_parts')))

      for (const row of loadRows) {
        if (row.workOrderId && row.techName) {
          techNameMap.set(row.workOrderId, row.techName)
        }
      }
    }

    // ── Build order_part groups ───────────────────────────────────────────────
    function buildGroups(rows: typeof orderRows): WarehouseGroup[] {
      const map = new Map<string, WarehouseGroup>()
      for (const row of rows) {
        const wo = woMap.get(row.workOrderId)
        if (!wo) continue
        const task = toDbTask(row)
        const existing = map.get(row.workOrderId)
        if (existing) {
          existing.tasks.push(task)
        } else {
          map.set(row.workOrderId, {
            workOrderId:  row.workOrderId,
            customerName: wo.customerName,
            siteName:     wo.siteName,
            deviceBrand:  wo.deviceBrand ?? '',
            deviceModel:  wo.deviceModel ?? '',
            isUrgent:     wo.isUrgent,
            plannedDate:  wo.plannedDate instanceof Date
              ? wo.plannedDate.toISOString()
              : (wo.plannedDate ?? null),
            tasks: [task],
          })
        }
      }
      return Array.from(map.values()).sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent))
    }

    // ── Build picking groups (one per follow-up work order) ───────────────────
    const pickingGroups: PickingGroup[] = activePickRows.map(row => {
      const wo = woMap.get(row.workOrderId)
      return {
        workOrderId:    row.workOrderId,
        customerName:   wo?.customerName ?? '—',
        siteName:       wo?.siteName ?? '—',
        technicianName: techNameMap.get(row.workOrderId) ?? 'technieker',
        task:           toDbTask(row),
      }
    })

    const activeRefillRows = refillRows.filter(t => t.status === 'ready' || t.status === 'in_progress')

    return NextResponse.json({
      groups:        buildGroups(activeOrderRows),
      doneToday:     buildGroups(doneTodayOrderRows),
      total:         activeOrderRows.length,
      pickingGroups,
      refillGroups:  buildGroups(activeRefillRows),
    } satisfies WarehouseQueueResponse)
  } catch (error) {
    console.error('[api/warehouse/queue GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
