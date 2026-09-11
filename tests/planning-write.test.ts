/**
 * buildPlanningWrite — what the client sends when a day changes.
 *
 * Mostly one thing worth pinning: the planning version. The client used to send
 * the first job's, the server compares against the day's highest, and those
 * only agreed while every work order on a day was always written together. A
 * work order coming out of the pool breaks that assumption, which is exactly
 * the case this feature introduces.
 */
import { describe, expect, it } from 'vitest'
import { buildPlanningWrite, planningVersionFor, toLocalDateStr } from '@/lib/planning/planningWrite'
import type { Intervention } from '@/types'

function bon(id: string, planningVersion?: number): Intervention {
  return { id, planningVersion } as unknown as Intervention
}

const actor = { id: 'u1', role: 'technician' as const }

describe('planningVersionFor', () => {
  it('takes the highest version on the day, not the first', () => {
    // The pool bon dropped at the front still carries version 1 while the rest
    // of the day is on 7. Sending 1 would be read as a stale write.
    expect(planningVersionFor([bon('fresh', 1), bon('a', 7), bon('b', 7)])).toBe(7)
  })

  it('is 1 for an empty day', () => {
    // Matches the server's coalesce(max(...), 1).
    expect(planningVersionFor([])).toBe(1)
  })

  it('treats a missing version as 1', () => {
    expect(planningVersionFor([bon('a'), bon('b')])).toBe(1)
    expect(planningVersionFor([bon('a'), bon('b', 4)])).toBe(4)
  })
})

describe('buildPlanningWrite', () => {
  it('sends the whole day in order', () => {
    const payload = buildPlanningWrite({
      day: [bon('wo-2', 3), bon('wo-1', 3)],
      actor,
      technicianId: 'u1',
      date: new Date(2026, 8, 14),
    })

    expect(payload.orderedWorkOrderIds).toEqual(['wo-2', 'wo-1'])
    expect(payload.planningVersion).toBe(3)
    expect(payload.date).toBe('2026-09-14')
    expect(payload.actorRole).toBe('technician')
  })

  it('sends an empty day rather than nothing, so the last job can be released', () => {
    const payload = buildPlanningWrite({
      day: [],
      actor,
      technicianId: 'u1',
      date: new Date(2026, 8, 14),
    })

    expect(payload.orderedWorkOrderIds).toEqual([])
  })

  it('records who acted, separately from whose day it is', () => {
    // Today they are the same person. They stop being the same the moment a
    // planner moves someone else's work, which is what the notice will read.
    const payload = buildPlanningWrite({
      day: [bon('wo-1', 1)],
      actor: { id: 'planner-7', role: 'planner' },
      technicianId: 'u2',
      date: new Date(2026, 8, 14),
    })

    expect(payload.actorId).toBe('planner-7')
    expect(payload.actorRole).toBe('planner')
    expect(payload.technicianId).toBe('u2')
  })
})

describe('toLocalDateStr', () => {
  it('uses the local day, not UTC', () => {
    // A day that starts at 00:30 local in a +02:00 summer is still that day.
    expect(toLocalDateStr(new Date(2026, 8, 14, 0, 30))).toBe('2026-09-14')
    expect(toLocalDateStr(new Date(2026, 8, 14, 23, 30))).toBe('2026-09-14')
  })

  it('pads single digits', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
