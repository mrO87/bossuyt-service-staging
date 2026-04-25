import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { Intervention, InterventionTechnician } from '@/types'
import { db } from '@/lib/db'
import {
  customers,
  devices,
  sites,
  technicians,
  workOrderAssignments,
  workOrders,
} from '@/lib/db/schema'

export const MAX_PLANNED_ITEMS = 10
export const MAX_OPEN_ITEMS = 4

type InterventionCoreRow = {
  id: string
  customerId: string
  customerName: string
  siteId: string
  siteName: string
  siteAddress: string
  siteCity: string
  siteLat: number | null
  siteLon: number | null
  deviceId: string
  deviceBrand: string
  deviceModel: string
  plannedDate: Date
  status: Intervention['status']
  type: Intervention['type']
  description: string | null
  estimatedMinutes: number | null
  isUrgent: boolean
  planningVersion: number
  source: Intervention['source']
  statusOnderwegAt: Date | null
  statusArrivedAt: Date | null
  statusOnderwegBy: string | null
  createdBy: string | null
  visibleInPool: boolean
}

type AssignmentRow = {
  workOrderId: string
  technicianId: string
  technicianName: string
  technicianInitials: string
  isLead: boolean
  accepted: boolean
  plannedOrder: number
}

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function getDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(`${date}T23:59:59.999Z`)
  return { start, end }
}

function toIntervention(
  row: InterventionCoreRow,
  techniciansForWorkOrder: InterventionTechnician[],
): Intervention {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    siteId: row.siteId,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    siteCity: row.siteCity,
    siteLat: row.siteLat ?? undefined,
    siteLon: row.siteLon ?? undefined,
    deviceId: row.deviceId,
    deviceBrand: row.deviceBrand,
    deviceModel: row.deviceModel,
    plannedDate: row.plannedDate.toISOString(),
    status: row.status,
    type: row.type,
    description: row.description ?? undefined,
    estimatedMinutes: row.estimatedMinutes ?? undefined,
    isUrgent: row.isUrgent,
    planningVersion: row.planningVersion,
    source: row.source,
    technicians: techniciansForWorkOrder,
    statusOnderwegAt: row.statusOnderwegAt?.toISOString(),
    statusArrivedAt: row.statusArrivedAt?.toISOString(),
    statusOnderwegBy: row.statusOnderwegBy ?? undefined,
    createdBy: row.createdBy ?? undefined,
    visibleInPool: row.visibleInPool,
  }
}

function sortPlanned(interventions: Intervention[]): Intervention[] {
  return [...interventions].sort((a, b) => {
    const aLead = a.technicians.find(technician => technician.isLead)?.plannedOrder ?? Number.MAX_SAFE_INTEGER
    const bLead = b.technicians.find(technician => technician.isLead)?.plannedOrder ?? Number.MAX_SAFE_INTEGER
    return aLead - bLead
  })
}

async function fetchAssignmentsForWorkOrders(workOrderIds: string[]): Promise<Map<string, InterventionTechnician[]>> {
  if (workOrderIds.length === 0) {
    return new Map()
  }

  const assignmentRows = await db
    .select({
      workOrderId: workOrderAssignments.workOrderId,
      technicianId: technicians.id,
      technicianName: technicians.name,
      technicianInitials: technicians.initials,
      isLead: workOrderAssignments.isLead,
      accepted: workOrderAssignments.accepted,
      plannedOrder: workOrderAssignments.plannedOrder,
    })
    .from(workOrderAssignments)
    .innerJoin(technicians, eq(workOrderAssignments.technicianId, technicians.id))
    .where(inArray(workOrderAssignments.workOrderId, workOrderIds))
    .orderBy(asc(workOrderAssignments.plannedOrder), asc(technicians.name))

  const assignmentsByWorkOrder = new Map<string, InterventionTechnician[]>()

  assignmentRows.forEach((row: AssignmentRow) => {
    const current = assignmentsByWorkOrder.get(row.workOrderId) ?? []
    current.push({
      technicianId: row.technicianId,
      name: row.technicianName,
      initials: deriveInitials(row.technicianName),
      isLead: row.isLead,
      accepted: row.accepted,
      plannedOrder: row.plannedOrder,
    })
    assignmentsByWorkOrder.set(row.workOrderId, current)
  })

  return assignmentsByWorkOrder
}

async function fetchInterventionRows(workOrderIds: string[]): Promise<Intervention[]> {
  if (workOrderIds.length === 0) {
    return []
  }

  const rows = await db
    .select({
      id: workOrders.id,
      customerId: customers.id,
      customerName: customers.name,
      siteId: sites.id,
      siteName: sites.name,
      siteAddress: sites.address,
      siteCity: sites.city,
      siteLat: sites.lat,
      siteLon: sites.lon,
      deviceId: devices.id,
      deviceBrand: devices.brand,
      deviceModel: devices.model,
      plannedDate: workOrders.plannedDate,
      status: workOrders.status,
      type: workOrders.type,
      description: workOrders.description,
      estimatedMinutes: workOrders.estimatedMinutes,
      isUrgent: workOrders.isUrgent,
      planningVersion: workOrders.planningVersion,
      source: workOrders.source,
      statusOnderwegAt: workOrders.statusOnderwegAt,
      statusArrivedAt: workOrders.statusArrivedAt,
      statusOnderwegBy: workOrders.statusOnderwegBy,
      createdBy: workOrders.createdBy,
      visibleInPool: workOrders.visibleInPool,
    })
    .from(workOrders)
    .innerJoin(customers, eq(workOrders.customerId, customers.id))
    .innerJoin(sites, eq(workOrders.siteId, sites.id))
    .innerJoin(devices, eq(workOrders.deviceId, devices.id))
    .where(inArray(workOrders.id, workOrderIds))

  const assignmentsByWorkOrder = await fetchAssignmentsForWorkOrders(workOrderIds)

  return rows.map((row: InterventionCoreRow) =>
    toIntervention(row, assignmentsByWorkOrder.get(row.id) ?? []),
  )
}

export async function getTodayInterventions(
  technicianId: string,
  date: string,
): Promise<{ planned: Intervention[]; open: Intervention[] }> {
  const { start, end } = getDayBounds(date)

  // Assigned work orders for this technician today
  const workOrderIds = await db
    .select({ workOrderId: workOrderAssignments.workOrderId })
    .from(workOrderAssignments)
    .innerJoin(workOrders, eq(workOrderAssignments.workOrderId, workOrders.id))
    .where(
      and(
        eq(workOrderAssignments.technicianId, technicianId),
        gte(workOrders.plannedDate, start),
        lt(workOrders.plannedDate, end),
      ),
    )
    .orderBy(
      asc(workOrderAssignments.plannedOrder),
      desc(workOrders.isUrgent),
      asc(workOrders.plannedDate),
    )

  // Reactive work orders not yet scheduled (aangemaakt) — visible in open pool
  // regardless of whether a technician has been pre-assigned. They stay here
  // until planning gives them a date, at which point status becomes 'gepland'.
  const unassignedRows = await db
    .select({ workOrderId: workOrders.id })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.source, 'reactive'),
        eq(workOrders.status, 'aangemaakt'),
      ),
    )

  const assignedIds   = [...new Set(workOrderIds.map(row => row.workOrderId))]
  const unassignedIds = unassignedRows.map(row => row.workOrderId)
  const allIds        = [...new Set([...assignedIds, ...unassignedIds])]

  const interventions = await fetchInterventionRows(allIds)

  const planned = sortPlanned(
    interventions.filter(i => assignedIds.includes(i.id) && i.source === 'planned'),
  ).slice(0, MAX_PLANNED_ITEMS)

  const open = interventions
    .filter(i => i.source === 'reactive' && i.visibleInPool)
    .sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent))
    .slice(0, MAX_OPEN_ITEMS)

  return { planned, open }
}

export async function getMonthInterventionDays(
  technicianId: string,
  year: number,
  month: number,
): Promise<string[]> {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const rows = await db
    .select({ plannedDate: workOrders.plannedDate })
    .from(workOrderAssignments)
    .innerJoin(workOrders, eq(workOrderAssignments.workOrderId, workOrders.id))
    .where(
      and(
        eq(workOrderAssignments.technicianId, technicianId),
        gte(workOrders.plannedDate, start),
        lt(workOrders.plannedDate, end),
      ),
    )

  const days = new Set(rows.map(row => {
    const d = row.plannedDate
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }))
  return [...days].sort()
}

export async function getInterventionById(id: string): Promise<Intervention | null> {
  const [intervention] = await fetchInterventionRows([id])
  return intervention ?? null
}

export async function getPlanningVersion(
  technicianId: string,
  date: string,
): Promise<number> {
  const { start, end } = getDayBounds(date)

  const [row] = await db
    .select({
      planningVersion: sql<number>`coalesce(max(${workOrders.planningVersion}), 1)`,
    })
    .from(workOrderAssignments)
    .innerJoin(workOrders, eq(workOrderAssignments.workOrderId, workOrders.id))
    .where(
      and(
        eq(workOrderAssignments.technicianId, technicianId),
        gte(workOrders.plannedDate, start),
        lt(workOrders.plannedDate, end),
      ),
    )

  return row?.planningVersion ?? 1
}

export async function saveTechnicianPlanningOrder(input: {
  technicianId: string
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
}): Promise<
  | { ok: true; planningVersion: number; planned: Intervention[]; open: Intervention[] }
  | { ok: false; planningVersion: number; planned: Intervention[]; open: Intervention[] }
> {
  const currentPlanningVersion = await getPlanningVersion(input.technicianId, input.date)
  const latest = await getTodayInterventions(input.technicianId, input.date)

  if (input.planningVersion !== currentPlanningVersion) {
    return {
      ok: false,
      planningVersion: currentPlanningVersion,
      planned: latest.planned,
      open: latest.open,
    }
  }

  const plannedIds = latest.planned.map(intervention => intervention.id).sort()
  const requestedIds = [...input.orderedWorkOrderIds].sort()

  if (
    plannedIds.length !== requestedIds.length ||
    plannedIds.some((id, index) => id !== requestedIds[index])
  ) {
    return {
      ok: false,
      planningVersion: currentPlanningVersion,
      planned: latest.planned,
      open: latest.open,
    }
  }

  const nextPlanningVersion = currentPlanningVersion + 1

  await db.transaction(async (tx) => {
    await Promise.all(
      input.orderedWorkOrderIds.map((workOrderId, index) =>
        tx
          .update(workOrderAssignments)
          .set({ plannedOrder: index + 1 })
          .where(
            and(
              eq(workOrderAssignments.workOrderId, workOrderId),
              eq(workOrderAssignments.technicianId, input.technicianId),
            ),
          ),
      ),
    )

    if (input.orderedWorkOrderIds.length > 0) {
      await tx
        .update(workOrders)
        .set({ planningVersion: nextPlanningVersion })
        .where(inArray(workOrders.id, input.orderedWorkOrderIds))
    }
  })

  const updated = await getTodayInterventions(input.technicianId, input.date)

  return {
    ok: true,
    planningVersion: nextPlanningVersion,
    planned: updated.planned,
    open: updated.open,
  }
}
