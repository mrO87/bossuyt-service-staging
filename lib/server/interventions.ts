import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import type { Intervention, InterventionTechnician, User } from '@/types'
import { db } from '@/lib/db'
import { canLeaveTheDay } from '@/lib/planning/dropIntent'
import { sanitizeStartMinutes } from '@/lib/planning/pinnedHour'
import { isPastDay, RETURNS_TO_POOL, todayInBelgium } from '@/lib/planning/pastDays'
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
  plannedStartMinutes: number | null
  startIsAppointment: boolean
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
    plannedStartMinutes: row.plannedStartMinutes ?? undefined,
    startIsAppointment: row.startIsAppointment,
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
      plannedStartMinutes: workOrders.plannedStartMinutes,
      startIsAppointment: workOrders.startIsAppointment,
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

/**
 * Vergeten werkbonnen terugzetten in de pool.
 *
 * Een bon op een dag die voorbij is en waaraan nooit gewerkt is, is niet
 * gedaan. Bleef hij daar staan, dan zag niemand hem ooit nog: de dagplanning
 * toont vandaag, de weekplanning toont de week waar je in kijkt, en de pool
 * toont enkel bonnen zonder dag. Zo raakt werk zoek.
 *
 * Dit draait in het leespad — telkens de app een dag ophaalt — en niet als
 * nachtelijke taak. Dat is met opzet: een taak kan stilvallen zonder dat
 * iemand het merkt, en dan is het stil kwijtraken van bonnen precies terug.
 * Deze opkuis herstelt zichzelf bij de eerstvolgende blik op de planning.
 *
 * Het versienummer gaat mee omhoog. Een telefoon die de oude dag nog in handen
 * heeft, schrijft anders de bon gewoon terug op zijn voorbije dag; met een
 * hoger nummer botst die schrijfactie en wint de opkuis.
 *
 * Geeft terug hoeveel bonnen er verhuisd zijn, zodat een oproep die niets doet
 * ook niets kost om vast te stellen.
 */
export async function releaseForgottenWorkOrders(
  today: string = todayInBelgium(),
): Promise<number> {
  const startOfToday = getDayBounds(today).start

  const released = await db
    .update(workOrders)
    .set({
      plannedDate: null,
      // Het uur hoort bij de dag; gaat de dag weg, dan gaat het uur mee.
      plannedStartMinutes: null,
      startIsAppointment: false,
      status: 'aangemaakt',
      planningVersion: sql`${workOrders.planningVersion} + 1`,
    })
    .where(
      and(
        lt(workOrders.plannedDate, startOfToday),
        inArray(workOrders.status, [...RETURNS_TO_POOL]),
      ),
    )
    .returning({ id: workOrders.id })

  if (released.length > 0) {
    await db.insert(workOrderEvents).values(
      released.map(row => ({
        workOrderId: row.id,
        actorId: 'system',
        eventType: 'planning_changed' as const,
        payload: {
          to: 'pool',
          via: 'forgotten',
          reason: 'de geplande dag was voorbij en er was niet aan gewerkt',
        },
      })),
    )
  }

  return released.length
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
      reason: 'conflict' | 'locked' | 'past'
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
  /**
   * The hours on this day, for the work orders that have one.
   *
   * Like the order itself, this states a result rather than a change: a work
   * order in `orderedWorkOrderIds` that this list does not name has no hour,
   * and gets its hour cleared. That is what keeps the write idempotent.
   *
   * Leaving the field out entirely is not the same as passing an empty list. It
   * means "this client knows nothing about hours" — which is what every write
   * queued by a v1.60 phone says — and then no hour is touched. An empty list
   * from a client that does know is a day where nothing is pinned, and clears.
   */
  startTimes?: Array<{ workOrderId: string; startMinutes: number | null; appointment: boolean }>
}): Promise<PlanningSnapshotResult> {
  const currentPlanningVersion = await getPlanningVersion(input.technicianId, input.date)
  const latest = await getTodayInterventions(input.technicianId, input.date)

  const refuse = (reason: 'conflict' | 'locked' | 'past', lockedWorkOrderIds?: string[]) => ({
    ok: false as const,
    reason,
    lockedWorkOrderIds,
    planningVersion: currentPlanningVersion,
    planned: latest.planned,
    open: latest.open,
  })

  // Dezelfde grens als bij updatePlacement, want dit is de andere deur naar
  // dezelfde kolom. Een dag beschrijven die voorbij is heeft geen betekenis
  // meer: de opkuis zou hem bij de eerstvolgende blik toch leeghalen.
  if (isPastDay(input.date)) {
    return refuse('past')
  }

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
          // An hour without a day means nothing, so it goes with the day. This
          // is also what makes a day-to-day move forget its hour: that move is
          // a release from one day and an arrival on the other, and both ends
          // clear. Nothing has to remember to do it.
          plannedStartMinutes: null,
          startIsAppointment: false,
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
          // Arriving on a day means arriving without an hour; the pass below
          // gives one back if this write asked for one. A work order coming
          // from the pool has none to begin with, but one moved from another
          // day does, and 09:00 on Tuesday is not 09:00 on Wednesday.
          plannedStartMinutes: null,
          startIsAppointment: false,
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

    // ── the hours ─────────────────────────────────────────────────────────
    // Only when the client said something about hours at all — see the comment
    // on `startTimes`. Every work order on the day is written, including the
    // ones being cleared, because the list states the day's whole result.
    if (input.startTimes) {
      const wanted = new Map(input.startTimes.map(entry => [entry.workOrderId, entry]))

      await Promise.all(
        requested.map(workOrderId => {
          const entry = wanted.get(workOrderId)
          const minutes = sanitizeStartMinutes(entry?.startMinutes)
          return tx
            .update(workOrders)
            .set({
              plannedStartMinutes: minutes,
              // A pin on a work order with no hour would claim an appointment
              // at no particular time. The two are stored apart, but only this
              // pairing means anything.
              startIsAppointment: minutes === null ? false : Boolean(entry?.appointment),
            })
            .where(eq(workOrders.id, workOrderId))
        }),
      )
    }

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

export type PlacementResult =
  | { ok: true; planningVersion: number }
  | { ok: false; reason: 'locked' | 'not_found' | 'past' }

/**
 * Waar één werkbon staat: welke dag, welk uur, en of dat uur afgesproken is.
 *
 * De tweede deur naast savePlanningSnapshot, en ze bestaat om één reden: die
 * eerste beschrijft een **hele dag** ("deze bonnen, in deze volgorde") en heeft
 * die dag dus nodig. De werkbonpagina kent de andere bonnen van 24 september
 * niet, en een sleep naar volgende week evenmin — die dag is niet geladen. Een
 * momentopname met één bon erin zou alle andere bonnen van die dag uit de
 * planning gooien.
 *
 * Dit is daarom een uitspraak over één bon. De server zoekt zelf uit wat er op
 * de doeldag al staat en hangt hem achteraan. Dezelfde vorm als
 * `update_estimate`: één bon, één uitspraak, door dezelfde offline-wachtrij.
 *
 * **De versiegrendel geldt hier niet.** savePlanningSnapshot weigert een
 * schrijfactie wanneer iemand die dag ondertussen wijzigde; dat kan deze niet,
 * want de bon weet niets van de dag waar hij heen gaat. Laatste die het zegt
 * wint — een bewuste keuze van de gebruiker, omdat er in de praktijk één
 * persoon plant. Wat er wél tegenover staat: de bon krijgt op zijn nieuwe dag
 * een versienummer hoger dan wat daar stond, zodat een momentopname die
 * onderweg was voor die dag geweigerd wordt in plaats van de nieuwkomer
 * stilletjes weer uit de planning te gooien.
 *
 * **De statusgrendel geldt onverkort.** Aan een bon waaraan gewerkt wordt,
 * verzet niemand de dag of het uur — niet via slepen, niet via een weekrand,
 * niet via het datumveld op de werkbon.
 */
export async function updatePlacement(input: {
  actor: PlanningActor
  workOrderId: string
  date: string | null
  startMinutes: number | null
  appointment: boolean
}): Promise<PlacementResult> {
  const [current] = await db
    .select({ id: workOrders.id, status: workOrders.status, plannedDate: workOrders.plannedDate })
    .from(workOrders)
    .where(eq(workOrders.id, input.workOrderId))

  if (!current) return { ok: false, reason: 'not_found' }
  if (!canLeaveTheDay(current.status)) return { ok: false, reason: 'locked' }

  // Een dag die voorbij is, is geen plan. Hier geweigerd en niet alleen op het
  // scherm: de wachtrij van een telefoon die gisteren offline stond, komt
  // vandaag binnen met de datum van toen.
  if (input.date !== null && isPastDay(input.date)) return { ok: false, reason: 'past' }

  // De technieker die deze bon draagt. Uit de toewijzing gehaald en niet van de
  // client aangenomen: wie de bon verzet, hoeft niet te weten van wie hij is.
  const [lead] = await db
    .select({ technicianId: workOrderAssignments.technicianId })
    .from(workOrderAssignments)
    .where(
      and(
        eq(workOrderAssignments.workOrderId, input.workOrderId),
        eq(workOrderAssignments.isLead, true),
      ),
    )

  const minutes = input.date === null ? null : sanitizeStartMinutes(input.startMinutes)
  const dayStart = input.date === null ? null : getDayBounds(input.date).start

  // Achteraan op de doeldag, en met een versienummer boven dat van die dag.
  let plannedOrder = 1
  let nextVersion = 1
  if (input.date !== null && lead) {
    const day = await getTodayInterventions(lead.technicianId, input.date)
    plannedOrder = day.planned.reduce((highest, intervention) => {
      const order = intervention.technicians.find(t => t.isLead)?.plannedOrder ?? 0
      return Math.max(highest, order)
    }, 0) + 1
    nextVersion = day.planned.reduce(
      (highest, intervention) => Math.max(highest, intervention.planningVersion ?? 1),
      1,
    ) + 1
  }

  await db.transaction(async (tx) => {
    await tx
      .update(workOrders)
      .set({
        plannedDate: dayStart,
        // Een uur hoort bij een dag: negen uur op dinsdag is niet negen uur op
        // woensdag. Gaat de bon naar de pool, dan gaat het uur mee weg.
        plannedStartMinutes: minutes,
        startIsAppointment: minutes === null ? false : input.appointment,
        plannedByRole: input.actor.role,
        planningVersion: nextVersion,
        ...(input.date === null
          ? (current.status === 'gepland' || current.status === 'onderweg'
              ? { status: 'aangemaakt' as const }
              : {})
          : (current.status === 'aangemaakt' ? { status: 'gepland' as const } : {})),
      })
      .where(eq(workOrders.id, input.workOrderId))

    if (lead) {
      await tx
        .update(workOrderAssignments)
        .set({ plannedOrder })
        .where(
          and(
            eq(workOrderAssignments.workOrderId, input.workOrderId),
            eq(workOrderAssignments.technicianId, lead.technicianId),
          ),
        )
    }

    await tx.insert(workOrderEvents).values({
      workOrderId: input.workOrderId,
      actorId: input.actor.id,
      eventType: 'planning_changed',
      payload: {
        actorRole: input.actor.role,
        technicianId: lead?.technicianId ?? null,
        date: input.date,
        to: input.date === null ? 'pool' : 'day',
        via: 'placement',
      },
    })
  })

  return { ok: true, planningVersion: nextVersion }
}
