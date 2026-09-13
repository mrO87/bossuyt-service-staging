/**
 * buildPlanningWrite — what the client sends when a day changes.
 *
 * Mostly one thing worth pinning: the planning version. The client used to send
 * the first job's, the server compares against the day's highest, and those
 * only agreed while every work order on a day was always written together. A
 * work order coming out of the pool breaks that assumption, which is exactly
 * the case this feature introduces.
 *
 * A second thing worth pinning: which queued write a new one may replace.
 * `supersededPlanningWrites` decides that without touching IndexedDB, because
 * IndexedDB itself cannot be unit tested here.
 */
import { describe, expect, it } from 'vitest'
import {
  buildPlanningWrite,
  planningVersionFor,
  supersededPlanningWrites,
} from '@/lib/planning/planningWrite'
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

  it('ignores an arriving work order even when its version is higher than the day', () => {
    // The bon carries version 20 from the day it left; this day is on 3. If
    // that 20 leaked into the max, the server would refuse a write against a
    // conflict that never happened.
    expect(planningVersionFor([bon('a', 3), bon('arriving', 20)], ['arriving'])).toBe(3)
  })

  it('ignores an arriving work order even when its version is lower than the day', () => {
    // The original bug this module fixed: a pool arrival still on version 1
    // must not drag a version-7 day down to 1.
    expect(planningVersionFor([bon('a', 7), bon('arriving', 1)], ['arriving'])).toBe(7)
  })

  it('is 1 when every work order present is arriving', () => {
    expect(planningVersionFor([bon('arriving', 9)], ['arriving'])).toBe(1)
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

  it('threads arrivingIds through to the version, not to the ordered ids', () => {
    // The arriving bon still has to be sent in orderedWorkOrderIds — it is
    // joining the day — only its own version must not count toward the day's.
    const payload = buildPlanningWrite({
      day: [bon('resident', 4), bon('arriving', 99)],
      actor,
      technicianId: 'u1',
      date: new Date(2026, 8, 14),
      arrivingIds: ['arriving'],
    })

    expect(payload.orderedWorkOrderIds).toEqual(['resident', 'arriving'])
    expect(payload.planningVersion).toBe(4)
  })

  it('sends the hours along with the order, for every work order on the day', () => {
    // De lijst beschrijft de hele dag, ook de bonnen zonder uur: de server
    // leest hem als resultaat, niet als wijziging, en wist wat er niet in
    // staat. Zonder de lege regels zou een weggehaald uur nooit aankomen.
    const payload = buildPlanningWrite({
      day: [
        { id: 'wo-1', planningVersion: 2, plannedStartMinutes: 9 * 60, startIsAppointment: true },
        { id: 'wo-2', planningVersion: 2 },
      ] as unknown as Intervention[],
      actor,
      technicianId: 'u1',
      date: new Date(2026, 8, 14),
    })

    expect(payload.startTimes).toEqual([
      { workOrderId: 'wo-1', startMinutes: 9 * 60, appointment: true },
      { workOrderId: 'wo-2', startMinutes: null, appointment: false },
    ])
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

// toLocalDateStr is pinned once, in tests/week-days.test.ts — this module now
// imports lib/planning/weekDays.ts's implementation rather than defining its
// own, so testing it again here would only duplicate that coverage.

function pending(type: string, technicianId: string, date: string) {
  return { type, payload: { technicianId, date } }
}

describe('supersededPlanningWrites', () => {
  const incoming = { technicianId: 'tech-1', date: '2026-09-15' }

  it('supersedes a queued write for the same technician and day', () => {
    const same = pending('update_planning', 'tech-1', '2026-09-15')
    expect(supersededPlanningWrites([same], incoming)).toEqual([same])
  })

  it('keeps a queued write for a different day', () => {
    // Exactly the origin-day write in a day-to-day move: it must survive the
    // destination-day write that follows it moments later.
    const otherDay = pending('update_planning', 'tech-1', '2026-09-14')
    expect(supersededPlanningWrites([otherDay], incoming)).toEqual([])
  })

  it('keeps a queued write for a different technician', () => {
    const otherTech = pending('update_planning', 'tech-2', '2026-09-15')
    expect(supersededPlanningWrites([otherTech], incoming)).toEqual([])
  })

  it('never touches a non-planning write type, even with matching payload fields', () => {
    const notPlanning = pending('patch_status', 'tech-1', '2026-09-15')
    expect(supersededPlanningWrites([notPlanning], incoming)).toEqual([])
  })

  it('recognises update_sequence as a planning write too', () => {
    const legacy = pending('update_sequence', 'tech-1', '2026-09-15')
    expect(supersededPlanningWrites([legacy], incoming)).toEqual([legacy])
  })
})
