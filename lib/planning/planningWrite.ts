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

export interface PlanningWritePayload extends Record<string, unknown> {
  technicianId: string
  actorId: string
  actorRole: User['role']
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
}

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The version the server will compare against: the highest on the day, never
 * the first one. An empty day is version 1, matching getPlanningVersion's
 * `coalesce(max(...), 1)`.
 */
export function planningVersionFor(day: Intervention[]): number {
  return day.reduce((highest, intervention) => {
    return Math.max(highest, intervention.planningVersion ?? 1)
  }, 1)
}

export function buildPlanningWrite(input: {
  day: Intervention[]
  actor: Pick<User, 'id' | 'role'>
  technicianId: string
  date: Date
}): PlanningWritePayload {
  return {
    technicianId: input.technicianId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    date: toLocalDateStr(input.date),
    planningVersion: planningVersionFor(input.day),
    orderedWorkOrderIds: input.day.map(intervention => intervention.id),
  }
}
