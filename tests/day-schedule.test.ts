/**
 * computeDaySchedule — van een geordende dag naar kloktijden.
 *
 * De regel die de gebruiker gaf: vertrekuur plus rijtijd is aankomst, en
 * aankomst is de start van de eerste job. Daarna telkens hetzelfde. Er wordt
 * nergens een uur opgeslagen, dus dit is de enige plek waar tijd ontstaat —
 * en de enige plek waar een fout van een minuut te zien is.
 */
import { describe, expect, it } from 'vitest'
import { computeDaySchedule, type ScheduleJob, type TravelLookup } from '@/lib/planning/daySchedule'

const HOME = { lat: 50.8582720, lon: 3.2584752 }
const FAR = { lat: 51.1307205, lon: 4.4779880 }
const NEAR = { lat: 50.8279, lon: 3.2646 }

/** Vaste rijtijden, zodat de test over de opeenvolging gaat en niet over routering. */
const travel: TravelLookup = (from, to) => {
  if (!from || !to) return null
  if (from.lat === to.lat && from.lon === to.lon) return 0
  return from === HOME || to === HOME ? 60 : 20
}

function day(jobs: ScheduleJob[]) {
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

/**
 * Een bon op een uur zetten.
 *
 * Tot hier rekende deze motor élk uur uit het vertrekuur. Nu mag een job zijn
 * eigen uur meebrengen — het uur waarop de gebruiker hem heeft neergezet.
 * De regel uit het ontwerp: waar je hem neerzet, daar staat hij. De motor
 * schuift nooit iets uit zichzelf op; botst het, dan zegt hij waar en waarom.
 */
describe('computeDaySchedule met een vastgezet uur', () => {
  it('starts a pinned job on its hour, not where the calculation would put it', () => {
    // Zonder uur zou deze job om 08:00 beginnen (07:00 + 60 min rijden).
    const result = day([{ id: 'a', estimatedMinutes: 90, at: FAR, startMinutes: 10 * 60 }])
    const job = result.blocks.find(b => b.kind === 'job')!
    expect(job.startMinutes).toBe(10 * 60)
    expect(job.endMinutes).toBe(11 * 60 + 30)
  })

  it('back-calculates the departure from the first job hour', () => {
    // Om 10:00 bij een klant te staan die 60 min ver ligt, vertrek je om 09:00.
    const result = day([{ id: 'a', estimatedMinutes: 90, at: FAR, startMinutes: 10 * 60 }])
    expect(result.departFromOriginMinutes).toBe(9 * 60)
    expect(result.blocks[0].kind).toBe('anchor')
    expect(result.blocks[0].endMinutes).toBe(9 * 60)
  })

  it('leaves a plain departure when nothing is pinned', () => {
    const result = day([{ id: 'a', estimatedMinutes: 90, at: FAR }])
    expect(result.departFromOriginMinutes).toBe(7 * 60)
  })

  it('drives just in time, so the waiting gap stays empty space', () => {
    // Job a: 08:00–09:00. Job b staat vast op 11:00 en ligt 20 min rijden weg.
    // De rit hoort tegen b aan te liggen (10:10–10:30 na de pauze), niet tegen
    // a — anders staat er een blok in een gat dat niemand kan uitleggen.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 11 * 60 },
    ])
    const jobB = result.blocks.find(b => b.interventionId === 'b')!
    const pause = result.blocks.find(b => b.kind === 'break')!
    const legToB = result.blocks.filter(b => b.kind === 'travel')[1]

    expect(jobB.startMinutes).toBe(11 * 60)
    expect(pause.endMinutes).toBe(11 * 60)
    expect(pause.startMinutes).toBe(10 * 60 + 30)
    expect(legToB.endMinutes).toBe(10 * 60 + 30)
    expect(legToB.startMinutes).toBe(10 * 60 + 10)
  })

  it('pushes everything after a pinned job later', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR, startMinutes: 10 * 60 },
      { id: 'b', estimatedMinutes: 60, at: NEAR },
    ])
    const jobB = result.blocks.find(b => b.interventionId === 'b')!
    // 11:00 einde a + 20 rijden + 30 pauze = 11:50.
    expect(jobB.startMinutes).toBe(11 * 60 + 50)
  })

  it('hatches exactly the stretch that cannot happen', () => {
    // a: 08:00–09:00. b staat vast op 09:15, maar je kunt er ten vroegste om
    // 09:50 zijn (20 min rijden + 30 min pauze). Onmogelijk van 09:00 tot 09:50.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 9 * 60 + 15 },
    ])
    expect(result.conflicts).toEqual([
      {
        interventionId: 'b',
        fromMinutes: 9 * 60,
        toMinutes: 9 * 60 + 50,
        earliestMinutes: 9 * 60 + 50,
      },
    ])
    const clash = result.blocks.find(b => b.kind === 'clash')!
    expect(clash.interventionId).toBe('b')
    expect(clash.startMinutes).toBe(9 * 60)
    expect(clash.endMinutes).toBe(9 * 60 + 50)
  })

  it('starts the hatching at the pinned hour when it overlaps the previous job', () => {
    // b staat vast op 08:30, midden in job a (08:00–09:00). Dan begint het
    // onmogelijke stuk bij 08:30 en niet bij het einde van a.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 8 * 60 + 30 },
    ])
    expect(result.conflicts[0].fromMinutes).toBe(8 * 60 + 30)
  })

  it('moves nothing by itself when there is a conflict', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 9 * 60 + 15 },
    ])
    const jobA = result.blocks.find(b => b.interventionId === 'a')!
    const jobB = result.blocks.find(b => b.interventionId === 'b')!
    expect(jobA.startMinutes).toBe(8 * 60)
    expect(jobA.endMinutes).toBe(9 * 60)
    expect(jobB.startMinutes).toBe(9 * 60 + 15)
  })

  it('calls the exact earliest moment no conflict', () => {
    // Precies op de grens: 09:00 + 20 rijden + 30 pauze = 09:50.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 9 * 60 + 50 },
    ])
    expect(result.conflicts).toEqual([])
    expect(result.blocks.some(b => b.kind === 'clash')).toBe(false)
  })

  it('never calls the first job of the day a conflict — it only leaves earlier', () => {
    // Er is niets waarmee de eerste job kan botsen. Vertrekken om 05:00 is een
    // waarschuwing voor het rooster, geen onmogelijkheid voor de planning.
    const result = day([{ id: 'a', estimatedMinutes: 60, at: FAR, startMinutes: 6 * 60 }])
    expect(result.conflicts).toEqual([])
    expect(result.departFromOriginMinutes).toBe(5 * 60)
  })

  it('reports a conflict per job, so the message can name the first one', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR, startMinutes: 9 * 60 },
      { id: 'c', estimatedMinutes: 60, at: NEAR, startMinutes: 9 * 60 + 30 },
    ])
    expect(result.conflicts.map(c => c.interventionId)).toEqual(['b', 'c'])
  })

  it('leaves a day with nothing pinned exactly as it was', () => {
    const result = day([
      { id: 'a', estimatedMinutes: 90, at: FAR },
      { id: 'b', estimatedMinutes: 45, at: NEAR },
    ])
    expect(result.conflicts).toEqual([])
    expect(result.blocks.some(b => b.kind === 'clash')).toBe(false)
  })
})
