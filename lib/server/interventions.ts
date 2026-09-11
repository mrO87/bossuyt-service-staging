import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import type { Intervention, InterventionTechnician, User } from '@/types'
import { db } from '@/lib/db'
import { canLeaveTheDay } from '@/lib/planning/dropIntent'
import { workOrderIntakes } from '@/lib/db/schema'
import {
  contacts,
  customers,
  devices,
  sites,
  technicians,
  workOrderAssignments,
  workOrderEvents,
  workOrders,
} from '@/lib/db/schema'

export const MAX_PLANNED_ITEMS = 10

/**
 * How many open pool items the technician's day view shows.
 *
 * Temporarily raised from 4 to 10 for testing. With paper bons now arriving
 * through /werkbon/upload the pool fills faster than it used to, and at four a
 * newly uploaded bon could stay invisible behind older ones — the list is sorted
 * urgent-first and then simply cut off.
 *
 * This is a stopgap, not the answer. The real fix is for the office to see the
 * whole pool and decide which work orders a technician gets to see; once that
 * exists this cap goes away rather than growing again.
 */
export const MAX_OPEN_ITEMS = 10

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
  deviceId: string | null
  deviceBrand: string | null
  deviceModel: string | null
  customerNumber: string | null
  invoiceCustomerNumber: string | null
  sitePhonePrimary: string | null
  sitePhoneSecondary: string | null
  closingDay: string | null
  deviceUnitNumber: string | null
  deviceSerial: string | null
  deviceDeliveryDate: string | null
  deviceWarrantyUntil: string | null
  ticketNumber: string | null
  ticketDate: Date | null
  createdAt: Date | null
  plannedDate: Date | null
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
  alertNote: string | null
  alertNoteBy: string | null
  alertNoteAt: Date | null
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

type PrimaryContact = { name: string; phone: string }

function toIntervention(
  row: InterventionCoreRow,
  techniciansForWorkOrder: InterventionTechnician[],
  contact: PrimaryContact | undefined,
  scanPath: string | undefined,
): Intervention {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerNumber: row.customerNumber ?? undefined,
    invoiceCustomerNumber: row.invoiceCustomerNumber ?? undefined,
    siteId: row.siteId,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    siteCity: row.siteCity,
    siteLat: row.siteLat ?? undefined,
    siteLon: row.siteLon ?? undefined,
    sitePhones: [row.sitePhonePrimary, row.sitePhoneSecondary].filter((p): p is string => Boolean(p)),
    closingDay: row.closingDay ?? undefined,
    contactName: contact?.name,
    contactPhone: contact?.phone,
    deviceId: row.deviceId,
    deviceBrand: row.deviceBrand ?? undefined,
    deviceModel: row.deviceModel ?? undefined,
    deviceUnitNumber: row.deviceUnitNumber ?? undefined,
    deviceSerial: row.deviceSerial ?? undefined,
    deviceDeliveryDate: row.deviceDeliveryDate ?? undefined,
    deviceWarrantyUntil: row.deviceWarrantyUntil ?? undefined,
    ticketNumber: row.ticketNumber ?? undefined,
    ticketDate: row.ticketDate?.toISOString(),
    createdAt: row.createdAt?.toISOString(),
    plannedDate: row.plannedDate?.toISOString(),
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
    scanPath: scanPath ?? undefined,
    alertNote: row.alertNote ?? undefined,
    alertNoteBy: row.alertNoteBy ?? undefined,
    alertNoteAt: row.alertNoteAt?.toISOString(),
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

/** First contact (alphabetical) per site — printed as CONTACT on the bon. */
async function fetchPrimaryContacts(siteIds: string[]): Promise<Map<string, PrimaryContact>> {
  if (siteIds.length === 0) return new Map()
  const rows = await db
    .select({ siteId: contacts.siteId, name: contacts.name, phone: contacts.phone })
    .from(contacts)
    .where(inArray(contacts.siteId, siteIds))
    .orderBy(asc(contacts.name))
  const bySite = new Map<string, PrimaryContact>()
  for (const row of rows) {
    if (!bySite.has(row.siteId)) bySite.set(row.siteId, { name: row.name, phone: row.phone })
  }
  return bySite
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
      customerNumber: customers.customerNumber,
      invoiceCustomerNumber: customers.invoiceCustomerNumber,
      sitePhonePrimary: sites.phonePrimary,
      sitePhoneSecondary: sites.phoneSecondary,
      closingDay: sites.closingDay,
      deviceUnitNumber: devices.unitNumber,
      deviceSerial: devices.serialNumber,
      deviceDeliveryDate: devices.deliveryDate,
      deviceWarrantyUntil: devices.warrantyUntil,
      ticketNumber: workOrders.ticketNumber,
      ticketDate: workOrders.ticketDate,
      createdAt: workOrders.createdAt,
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
      alertNote: workOrders.alertNote,
      alertNoteBy: workOrders.alertNoteBy,
      alertNoteAt: workOrders.alertNoteAt,
    })
    .from(workOrders)
    .innerJoin(customers, eq(workOrders.customerId, customers.id))
    .innerJoin(sites, eq(workOrders.siteId, sites.id))
    .leftJoin(devices, eq(workOrders.deviceId, devices.id))
    .where(inArray(workOrders.id, workOrderIds))

  const assignmentsByWorkOrder = await fetchAssignmentsForWorkOrders(workOrderIds)
  const contactsBySite = await fetchPrimaryContacts([...new Set(rows.map(row => row.siteId))])

  // The uploaded bon, where there was one. A work order typed in by hand has
  // none, and that is not a gap — it just never came from paper.
  const scanRows = await db
    .select({ workOrderId: workOrderIntakes.workOrderId, path: workOrderIntakes.originalPath })
    .from(workOrderIntakes)
    .where(inArray(workOrderIntakes.workOrderId, workOrderIds))
  const scanByWorkOrder = new Map(
    scanRows.filter(r => r.workOrderId).map(r => [r.workOrderId as string, r.path]),
  )

  return rows.map((row: InterventionCoreRow) =>
    toIntervention(
      row,
      assignmentsByWorkOrder.get(row.id) ?? [],
      contactsBySite.get(row.siteId),
      scanByWorkOrder.get(row.id),
    ),
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

  // The open pool: work orders without a day yet. A technician may already be
  // attached — the pool is not "unassigned work", it is "assigned work nobody
  // has put on a day". Closed work orders never belong here; there is nothing
  // left to pick up.
  //
  // `plannedDate` is the single field that decides which of the two lists a
  // work order lands in. `source` stays provenance (planned maintenance versus
  // an incoming call) and `visibleInPool` stays the manual hide switch.
  const poolRows = await db
    .select({ workOrderId: workOrders.id })
    .from(workOrders)
    .where(
      and(
        isNull(workOrders.plannedDate),
        eq(workOrders.visibleInPool, true),
        notInArray(workOrders.status, ['afgewerkt', 'geannuleerd']),
      ),
    )

  const assignedIds = [...new Set(workOrderIds.map(row => row.workOrderId))]
  const poolIds     = poolRows.map(row => row.workOrderId)
  const allIds      = [...new Set([...assignedIds, ...poolIds])]

  const interventions = await fetchInterventionRows(allIds)

  const planned = sortPlanned(
    interventions.filter(i => assignedIds.includes(i.id)),
  ).slice(0, MAX_PLANNED_ITEMS)

  const open = interventions
    .filter(i => poolIds.includes(i.id))
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

  // Pool work orders have no day, so they mark no day on the calendar.
  const days = new Set(rows.flatMap(row => {
    const d = row.plannedDate
    if (!d) return []
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`]
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


/**
 * Who is changing the planning. Present from the start so the authorisation
 * check that arrives with Keycloak has one place to live: a technician may
 * shuffle their own day freely, while a planner or admin moving someone's work
 * around is a different act that the technician has to be told about.
 */
export interface PlanningActor {
  id: string
  role: User['role']
}

export type PlanningSnapshotResult =
  | { ok: true;  planningVersion: number; planned: Intervention[]; open: Intervention[] }
  | {
      ok: false
      reason: 'conflict' | 'locked'
      lockedWorkOrderIds?: string[]
      planningVersion: number
      planned: Intervention[]
      open: Intervention[]
    }

/**
 * Write one complete picture of a technician's day.
 *
 * `orderedWorkOrderIds` is the whole day, in order — not a change to it. A work
 * order in the list that has no day yet gets one; a work order missing from the
 * list goes back to the open pool. That makes the call idempotent: applying it
 * twice lands in the same place as applying it once, which is what lets the
 * offline queue collapse a morning of dragging into a single pending write.
 *
 * Its predecessor refused any write where the set of work orders differed from
 * what the server held, which is precisely what dragging does. That guard is
 * replaced by two narrower ones: the planningVersion check below, and the rule
 * that a work order already being worked on never leaves the day.
 */
export async function savePlanningSnapshot(input: {
  actor: PlanningActor
  technicianId: string
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
}): Promise<PlanningSnapshotResult> {
  const currentPlanningVersion = await getPlanningVersion(input.technicianId, input.date)
  const latest = await getTodayInterventions(input.technicianId, input.date)

  const refuse = (reason: 'conflict' | 'locked', lockedWorkOrderIds?: string[]) => ({
    ok: false as const,
    reason,
    lockedWorkOrderIds,
    planningVersion: currentPlanningVersion,
    planned: latest.planned,
    open: latest.open,
  })

  if (input.planningVersion !== currentPlanningVersion) {
    return refuse('conflict')
  }

  const onTheDay = latest.planned.map(intervention => intervention.id)
  const requested = input.orderedWorkOrderIds

  const toRelease  = onTheDay.filter(id => !requested.includes(id))
  const toSchedule = requested.filter(id => !onTheDay.includes(id))

  // The drag handle is hidden for these, but hiding a control is comfort, not a
  // guard. An old tab or a replayed offline write must be refused here too.
  const locked = toRelease.filter(id => {
    const intervention = latest.planned.find(candidate => candidate.id === id)
    return !canLeaveTheDay(intervention?.status)
  })
  if (locked.length > 0) return refuse('locked', locked)

  // Only work orders actually sitting in the pool may join a day.
  const poolIds = latest.open.map(intervention => intervention.id)
  const notInPool = toSchedule.filter(id => !poolIds.includes(id))
  if (notInPool.length > 0) return refuse('conflict')

  const nextPlanningVersion = currentPlanningVersion + 1
  const { start: dayStart } = getDayBounds(input.date)
  const touched = [...requested, ...toRelease]

  await db.transaction(async (tx) => {
    // ── back to the pool ──────────────────────────────────────────────────
    // The assignment row stays: the technician keeps the work order, it simply
    // has no day any more. Status follows so the badge does not claim someone
    // is on their way to a job nobody has planned.
    for (const workOrderId of toRelease) {
      const current = latest.planned.find(candidate => candidate.id === workOrderId)
      await tx
        .update(workOrders)
        .set({
          plannedDate: null,
          plannedByRole: input.actor.role,
          ...(current?.status === 'gepland' || current?.status === 'onderweg'
            ? { status: 'aangemaakt' as const }
            : {}),
        })
        .where(eq(workOrders.id, workOrderId))
    }

    // ── onto the day ──────────────────────────────────────────────────────
    for (const workOrderId of toSchedule) {
      const current = latest.open.find(candidate => candidate.id === workOrderId)

      await tx
        .insert(workOrderAssignments)
        .values({
          workOrderId,
          technicianId: input.technicianId,
          isLead: true,
          accepted: false,
          plannedOrder: 0,
        })
        .onConflictDoUpdate({
          target: [workOrderAssignments.workOrderId, workOrderAssignments.technicianId],
          set: { isLead: true },
        })

      await tx
        .update(workOrders)
        .set({
          plannedDate: dayStart,
          plannedByRole: input.actor.role,
          ...(current?.status === 'aangemaakt' ? { status: 'gepland' as const } : {}),
        })
        .where(eq(workOrders.id, workOrderId))
    }

    // ── the order itself ──────────────────────────────────────────────────
    await Promise.all(
      requested.map((workOrderId, index) =>
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

    if (touched.length > 0) {
      await tx
        .update(workOrders)
        .set({ planningVersion: nextPlanningVersion })
        .where(inArray(workOrders.id, touched))
    }

    // One event per moved work order. Nobody reads these yet; they are the
    // record the change notice and the planning board will be built on.
    for (const workOrderId of [...toSchedule, ...toRelease]) {
      await tx.insert(workOrderEvents).values({
        workOrderId,
        actorId:   input.actor.id,
        eventType: 'planning_changed',
        payload: {
          actorRole:    input.actor.role,
          technicianId: input.technicianId,
          date:         input.date,
          to:           toSchedule.includes(workOrderId) ? 'day' : 'pool',
        },
      })
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
