/**
 * Building the payload for a planning write.
 *
 * Small, but it holds the fix for a real bug: the client used to send the
 * planning version of the *first* job on the day, while the server compares
 * against the highest version across the day. Those agreed only as long as the
 * day's work orders were always written together. A work order arriving from
 * the pool still carries version 1 while the day may be on 7 — drop it at the
 * front and the write was rejected as a conflict that had not happened.
 */
import type { Intervention } from '@/types'
import type { User } from '@/types'
import { toLocalDateStr } from './weekDays'

export interface PlanningWritePayload extends Record<string, unknown> {
  technicianId: string
  actorId: string
  actorRole: User['role']
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
  /**
   * The hour each work order on the day stands on — an entry per work order,
   * including the ones with no hour at all.
   *
   * The empty entries are the point. This payload states a day's whole result,
   * so the server clears what the list does not mention; an hour that was taken
   * away is only ever communicated by its absence.
   */
  startTimes: PlanningStartTime[]
}

export interface PlanningStartTime {
  workOrderId: string
  startMinutes: number | null
  appointment: boolean
}

/**
 * Every name a pending planning write can carry. Lives here rather than
 * beside the IndexedDB schema because deciding what counts as "a planning
 * write" is a planning concept, not a storage one — `lib/idb.ts` imports this
 * rather than defining its own copy, so there is exactly one list to keep in
 * sync with `PendingWrite['type']`.
 */
export const PLANNING_WRITE_TYPES = ['update_planning', 'update_sequence'] as const

/**
 * The version the server will compare against: the highest already on the
 * day, never the first job's — and never an arriving work order's either.
 *
 * `arrivingIds` names work orders that are joining this day from elsewhere
 * (the pool, or another day) rather than having already been on it. Such a
 * work order's `planningVersion` describes where it came FROM, not this day,
 * so counting it — whether it is higher or lower than the day's own version —
 * sends the server a number that does not describe this day's actual state
 * and gets refused as a conflict that never happened. An empty day (or one
 * where everyone present is arriving) is version 1, matching
 * getPlanningVersion's `coalesce(max(...), 1)`.
 */
export function planningVersionFor(
  day: Intervention[],
  arrivingIds: readonly string[] = [],
): number {
  return day.reduce((highest, intervention) => {
    if (arrivingIds.includes(intervention.id)) return highest
    return Math.max(highest, intervention.planningVersion ?? 1)
  }, 1)
}

export function buildPlanningWrite(input: {
  day: Intervention[]
  actor: Pick<User, 'id' | 'role'>
  technicianId: string
  date: Date
  /** Work orders joining this day from elsewhere; see `planningVersionFor`. */
  arrivingIds?: readonly string[]
  /**
   * De dag zoals de server hem nú kent, als die verschilt van de dag die we
   * willen wegschrijven.
   *
   * Dat zijn twee verschillende lijsten, en dat was niet zichtbaar zolang ze
   * toevallig hetzelfde versienummer droegen. Bij het vrijgeven van een bon is
   * `day` de dag zónder hem, terwijl de server hem nog wél meetelt in zijn max.
   * Had die vertrekkende bon het hoogste nummer, dan stuurde de client een
   * lager getal en kreeg hij een 409 voor een conflict dat niet bestond — de
   * bon bleef dan op het scherm in de pool staan en in de database op zijn dag.
   *
   * Het bleef verborgen omdat savePlanningSnapshot alle bonnen van een dag
   * tegelijk ophoogt. `update_placement` hoogt er één op, en daarmee werd het
   * meteen raak.
   */
  serverDay?: Intervention[]
}): PlanningWritePayload {
  return {
    technicianId: input.technicianId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    date: toLocalDateStr(input.date),
    planningVersion: planningVersionFor(input.serverDay ?? input.day, input.arrivingIds),
    orderedWorkOrderIds: input.day.map(intervention => intervention.id),
    startTimes: input.day.map(intervention => ({
      workOrderId: intervention.id,
      startMinutes: intervention.plannedStartMinutes ?? null,
      // Never a pin without an hour: that would claim an appointment at no
      // particular time. The server holds the same rule; this keeps the two
      // from ever having to disagree about it.
      appointment: intervention.plannedStartMinutes == null
        ? false
        : Boolean(intervention.startIsAppointment),
    })),
  }
}

/**
 * Which queued planning writes a new one should replace.
 *
 * A planning write states a day's whole result, so an older write for the
 * SAME technician and day carries no information the newer one lacks —
 * replacing it is correct, and keeping both would be worse than useless: the
 * first would bump the planning version the second still claims, turning a
 * later drag into a phantom conflict.
 *
 * A write for a DIFFERENT day states a different day's result and must
 * survive. That is exactly what a day-to-day move queues: the origin day's
 * write, then the destination day's — collapsing on "type" alone would delete
 * the first because the second merely looks similar in shape, leaving the
 * server told about the destination and never about the origin, which is the
 * work order ending up on two days at once.
 */
export function supersededPlanningWrites<T extends { type: string; payload: Record<string, unknown> }>(
  pending: readonly T[],
  incoming: Pick<PlanningWritePayload, 'technicianId' | 'date'>,
): T[] {
  return pending.filter(item =>
    (PLANNING_WRITE_TYPES as readonly string[]).includes(item.type) &&
    item.payload.technicianId === incoming.technicianId &&
    item.payload.date === incoming.date,
  )
}
