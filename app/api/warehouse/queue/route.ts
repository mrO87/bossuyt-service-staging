import { NextResponse } from 'next/server'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, devices, sites, tasks, workOrders } from '@/lib/db/schema'
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

export type WarehouseQueueResponse = {
  groups:     WarehouseGroup[]
  doneToday:  WarehouseGroup[]
  total:      number
}

// ── GET /api/warehouse/queue ──────────────────────────────────────────────────
// Returns:
//   groups     — active order_part tasks (ready | in_progress), grouped by work order
//   doneToday  — tasks completed today, so they don't disappear from the screen
export async function GET() {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Fetch active + today's done tasks in one query
    const taskRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.type, 'order_part'),
          eq(tasks.role, 'warehouse'),
        ),
      )
      .orderBy(tasks.createdAt)

    const activeRows  = taskRows.filter(t => t.status === 'ready' || t.status === 'in_progress')
    const doneTodayRows = taskRows.filter(t =>
      t.status === 'done' &&
      t.completedAt != null &&
      new Date(t.completedAt) >= todayStart,
    )

    if (taskRows.length === 0) {
      return NextResponse.json({ groups: [], doneToday: [], total: 0 } satisfies WarehouseQueueResponse)
    }

    const allWorkOrderIds = [...new Set(taskRows.map(t => t.workOrderId))]

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
      .innerJoin(devices,   eq(workOrders.deviceId,   devices.id))
      .where(inArray(workOrders.id, allWorkOrderIds))

    const woMap = new Map(woRows.map(r => [r.id, r]))

    function buildGroups(rows: typeof taskRows): WarehouseGroup[] {
      const map = new Map<string, WarehouseGroup>()
      for (const row of rows) {
        const wo = woMap.get(row.workOrderId)
        if (!wo) continue
        const existing = map.get(row.workOrderId)
        const task = toDbTask(row)
        if (existing) {
          existing.tasks.push(task)
        } else {
          map.set(row.workOrderId, {
            workOrderId:  row.workOrderId,
            customerName: wo.customerName,
            siteName:     wo.siteName,
            deviceBrand:  wo.deviceBrand,
            deviceModel:  wo.deviceModel,
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

    return NextResponse.json({
      groups:    buildGroups(activeRows),
      doneToday: buildGroups(doneTodayRows),
      total:     activeRows.length,
    } satisfies WarehouseQueueResponse)
  } catch (error) {
    console.error('[api/warehouse/queue GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
