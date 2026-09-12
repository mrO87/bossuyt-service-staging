/**
 * computeDaySchedule — van een geordende dag naar kloktijden.
 *
 * De regel die de gebruiker gaf: vertrekuur plus rijtijd is aankomst, en
 * aankomst is de start van de eerste job. Daarna telkens hetzelfde. Er wordt
 * nergens een uur opgeslagen, dus dit is de enige plek waar tijd ontstaat —
 * en de enige plek waar een fout van een minuut te zien is.
 */
import { describe, expect, it } from 'vitest'
import { computeDaySchedule, type TravelLookup } from '@/lib/planning/daySchedule'

const HOME = { lat: 50.8582720, lon: 3.2584752 }
const FAR = { lat: 51.1307205, lon: 4.4779880 }
const NEAR = { lat: 50.8279, lon: 3.2646 }

/** Vaste rijtijden, zodat de test over de opeenvolging gaat en niet over routering. */
const travel: TravelLookup = (from, to) => {
  if (!from || !to) return null
  if (from.lat === to.lat && from.lon === to.lon) return 0
  return from === HOME || to === HOME ? 60 : 20
}

function day(jobs: Array<{ id: string; estimatedMinutes?: number; at?: typeof HOME }>) {
  return computeDaySchedule({
    departureMinutes: 7 * 60,
    origin: HOME,
    jobs,
    travelBetween: travel,
    breakMinutes: 30,
  })
}

describe('computeDaySchedule', () => {
  it('has nothing to show for a day with no jobs', () => {
    const result = day([])
    expect(result.blocks).toEqual([])
    expect(result.backAtOriginMinutes).toBeNull()
    expect(result.workMinutes).toBe(0)
    expect(result.travelMinutes).toBe(0)
  })

  it('starts the first job on arrival, not on departure', () => {
    // 07:00 vertrek + 60 min rijden = 08:00 aankomst = start.
    const result = day([{ id: 'a', estimatedMinutes: 90, at: FAR }])
    const job = result.blocks.find(b => b.kind === 'job')!
    expect(job.startMinutes).toBe(8 * 60)
    expect(job.endMinutes).toBe(9 * 60 + 30)
  })

  it('opens and closes at the origin', () => {
    const result = day([{ id: 'a', estimatedMinutes: 90, at: FAR }])
    expect(result.blocks[0].kind).toBe('anchor')
    expect(result.blocks[result.blocks.length - 1].kind).toBe('anchor')
    // 09:30 einde job + 60 min terug = 10:30 thuis.
    expect(result.backAtOriginMinutes).toBe(10 * 60 + 30)
  })

  it('never puts two jobs against each other', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR },
    ])
    const kinds = result.blocks.map(b => b.kind)
    const firstJob = kinds.indexOf('job')
    const secondJob = kinds.indexOf('job', firstJob + 1)
    expect(kinds.slice(firstJob + 1, secondJob)).toContain('travel')
  })

  it('puts no travel between two jobs at the same address', () => {
    // Twee bonnen bij dezelfde klant. Dit is het geval dat in v1.59 nog twaalf
    // minuten rijden kreeg. Met een derde, andere job ervoor valt de pauze
    // (nu vanaf twee jobs) tussen a en b, niet tussen de twee gelijke adressen
    // — anders zou de pauze deze test verstoren in plaats van de rijtijd.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: NEAR },
      { id: 'b', estimatedMinutes: 60, at: FAR },
      { id: 'c', estimatedMinutes: 60, at: FAR },
    ])
    const jobs = result.blocks.filter(b => b.kind === 'job')
    expect(jobs[2].startMinutes).toBe(jobs[1].endMinutes)
  })

  it('counts a job with no estimate as taking no time, and says so', () => {
    const result = day([{ id: 'a', at: FAR }])
    const job = result.blocks.find(b => b.kind === 'job')!
    expect(job.endMinutes).toBe(job.startMinutes)
    expect(result.workMinutes).toBe(0)
  })

  it('marks a leg it cannot measure instead of guessing', () => {
    const result = computeDaySchedule({
      departureMinutes: 7 * 60,
      origin: HOME,
      jobs: [{ id: 'a', estimatedMinutes: 60 }],   // geen coördinaten
      travelBetween: travel,
      breakMinutes: 30,
    })
    expect(result.unknownLegs).toBeGreaterThan(0)
    const unknown = result.blocks.find(b => b.kind === 'travel' && b.minutes === null)
    expect(unknown).toBeDefined()
    // Een onbekende rit duurt nul in de tijdlijn — liegen over de duur zou de
    // hele dag verschuiven.
    expect(unknown!.startMinutes).toBe(unknown!.endMinutes)
  })

  it('inserts one break in the middle from two jobs on, none with a single job', () => {
    // De dagweergave tekent zelf al een pauze vanaf twee jobs
    // (insertMiddayBreak in useRouteTimeline.ts) — dit moet dat volgen, anders
    // toont de dag een pauze die de motor eronder ontkent.
    const one = day([{ id: 'a', estimatedMinutes: 60, at: FAR }])
    expect(one.blocks.filter(b => b.kind === 'break')).toHaveLength(0)

    const two = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR },
    ])
    expect(two.blocks.filter(b => b.kind === 'break')).toHaveLength(1)

    const three = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR },
      { id: 'c', estimatedMinutes: 60, at: NEAR },
    ])
    expect(three.blocks.filter(b => b.kind === 'break')).toHaveLength(1)
  })

  it('keeps every block in order and never overlapping', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 90, at: FAR },
      { id: 'b', estimatedMinutes: 45, at: NEAR },
      { id: 'c', estimatedMinutes: 120, at: NEAR },
    ])
    for (let i = 1; i < result.blocks.length; i++) {
      expect(result.blocks[i].startMinutes).toBeGreaterThanOrEqual(result.blocks[i - 1].endMinutes)
    }
  })

  it('carries the work order id on job blocks, so a click knows what it opened', () => {
    const result = day([{ id: 'wo-7', estimatedMinutes: 60, at: FAR }])
    expect(result.blocks.find(b => b.kind === 'job')!.interventionId).toBe('wo-7')
  })

  it('adds up work and travel separately', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 90, at: FAR },
      { id: 'b', estimatedMinutes: 30, at: NEAR },
    ])
    expect(result.workMinutes).toBe(120)
    expect(result.travelMinutes).toBe(60 + 20 + 60)   // heen, tussen, terug
  })

  it('runs past the roster rather than refusing to', () => {
    // Weekendwerk en uitlopende dagen moeten tekenbaar blijven; het rooster
    // waarschuwt, het verbiedt niet.
    const result = day([
      { id: 'a', estimatedMinutes: 600, at: FAR },
    ])
    expect(result.backAtOriginMinutes).toBeGreaterThan(18 * 60)
  })
})
