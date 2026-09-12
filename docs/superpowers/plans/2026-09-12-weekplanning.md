# Weekplanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een weekweergave die de planning toont als agenda — zeven dagkolommen, 06:30–18:00, blokken op schaal van hun duur — met dezelfde open pool en slepen over de hele week.

**Architecture:** Eén pure functie (`computeDaySchedule`) zet een geordende dag om in blokken met kloktijden: vertrekuur + rijtijd = aankomst = start van de eerste job, daarna telkens hetzelfde. Er wordt nergens een uur opgeslagen, dus slepen naar de pool laat het uur vanzelf verdwijnen. De weergave tekent alleen wat die functie teruggeeft; de Gantt-weergave die hierna komt draait op dezelfde functie met techniekers als rijen.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, @dnd-kit, vitest (node-omgeving, geen jsdom).

**Spec:** `docs/superpowers/specs/2026-09-12-weekplanning-design.md`

## Global Constraints

- UI-taal **Nederlands (nl-BE)**; code, commentaar en variabelen **Engels**.
- Telefoon eerst. Minimaal 16 px zijmarge; niets mag horizontaal laten scrollen behalve het agendaraster zelf, in een eigen `overflow-x: auto`.
- Tests draaien met **`npm test`**, nooit `npx vitest` — die pikt een verouderde kopie in `.next/standalone/tests/` op en lost de `@/`-alias niet op.
- Testomgeving is **node zonder jsdom**. Alleen pure functies en server-integratie zijn te testen; React-componenten niet. Geen testbibliotheek toevoegen voor dit plan.
- **Geen schemawijziging.** Er wordt geen starttijd opgeslagen.
- Venster is vast: **06:30–18:00** (`VIEW_START = 390`, `VIEW_END = 1080`).
- Rooster komt uit `lib/planning/workSchedule.ts`: ma–do 07:00–16:00, vr 07:00–13:30, 30 min onbetaalde pauze.
- Ondergrens: **368 tests groen**, typecheck schoon, `npm run lint` schoon.
- Versie nooit zelf verhogen. `scripts/bump-version.js` draait pas bij het uitrollen, en de release notes worden dáárna geschreven.

---

### Task 1: De tijdmotor

**Files:**
- Create: `lib/planning/daySchedule.ts`
- Test: `tests/day-schedule.test.ts`

**Interfaces:**
- Consumes: `Coordinates` uit `@/lib/routing/IRoutingService` (`{ lat: number; lon: number }`); `UNPAID_BREAK_MINUTES` en `clockToMinutes` uit `@/lib/planning/workSchedule`.
- Produces: `computeDaySchedule(input): DayScheduleResult`, `ScheduleBlock`, `DayScheduleResult`, `TravelLookup`. Task 2 en 3 tekenen `blocks`; Task 4 gebruikt `computeDaySchedule` in de dagweergave.

- [ ] **Step 1: Write the failing test**

Create `tests/day-schedule.test.ts`:

```ts
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
    // minuten rijden kreeg.
    const result = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: FAR },
    ])
    const jobs = result.blocks.filter(b => b.kind === 'job')
    expect(jobs[1].startMinutes).toBe(jobs[0].endMinutes)
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

  it('inserts one break in the middle from three jobs on', () => {
    const two = day([
      { id: 'a', estimatedMinutes: 60, at: FAR },
      { id: 'b', estimatedMinutes: 60, at: NEAR },
    ])
    expect(two.blocks.filter(b => b.kind === 'break')).toHaveLength(0)

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
    expect(result.travelMinutes).toBe(60 + 20 + 20)   // heen, tussen, terug
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/day-schedule.test.ts`
Expected: FAIL met `Cannot find package '@/lib/planning/daySchedule'`

- [ ] **Step 3: Write the implementation**

Create `lib/planning/daySchedule.ts`:

```ts
/**
 * Van een geordende dag naar kloktijden.
 *
 * De regel, zoals de technieker hem gaf: het ingestelde vertrekuur plus de
 * rijtijd naar de eerste klant is de aankomst, en de aankomst is de start van
 * de eerste job. Daarna telkens hetzelfde — einde job, rijden, volgende job.
 * De dag loopt van de ingestelde startlocatie tot diezelfde locatie terug.
 *
 * Niets hiervan wordt opgeslagen. Een werkbon kent een dag en een volgorde; het
 * uur bestaat alleen zolang deze functie draait. Dat is met opzet: loopt een job
 * uit, dan schuift alles erachter mee, en een bon naar de pool slepen laat zijn
 * uur verdwijnen zonder dat er iets gewist hoeft te worden.
 *
 * Apart van de weergave gehouden omdat de Gantt-weergave er straks op draait —
 * techniekers als rijen is deze functie, één keer per technieker.
 */
import type { Coordinates } from '@/lib/routing/IRoutingService'

export interface ScheduleBlock {
  kind: 'anchor' | 'travel' | 'job' | 'break'
  /** Uniek binnen de dag, bruikbaar als React-key en als sleep-id. */
  id: string
  startMinutes: number
  endMinutes: number
  /** Alleen op job-blokken. */
  interventionId?: string
  /** Alleen op travel-blokken. Null wanneer de rit niet te meten was. */
  minutes?: number | null
}

export interface DayScheduleResult {
  blocks: ScheduleBlock[]
  /** Wanneer je terug bent op de startlocatie, of null bij een lege dag. */
  backAtOriginMinutes: number | null
  workMinutes: number
  travelMinutes: number
  /** Ritten die niemand kon meten, meestal een adres dat nooit geocodeerd is. */
  unknownLegs: number
}

/** Minuten tussen twee punten, of null wanneer dat niet te bepalen is. */
export type TravelLookup = (
  from: Coordinates | undefined,
  to: Coordinates | undefined,
) => number | null

export interface ScheduleJob {
  id: string
  estimatedMinutes?: number
  at?: Coordinates
}

export function computeDaySchedule(input: {
  departureMinutes: number
  origin: Coordinates | undefined
  jobs: ScheduleJob[]
  travelBetween: TravelLookup
  breakMinutes: number
}): DayScheduleResult {
  const { departureMinutes, origin, jobs, travelBetween, breakMinutes } = input

  const blocks: ScheduleBlock[] = []
  let workMinutes = 0
  let travelMinutes = 0
  let unknownLegs = 0

  if (jobs.length === 0) {
    return { blocks, backAtOriginMinutes: null, workMinutes, travelMinutes, unknownLegs }
  }

  let cursor = departureMinutes

  // Het vertrekpunt krijgt een klein blok, zodat de kolom laat zien waar de dag
  // begint in plaats van in het niets te openen.
  blocks.push({ kind: 'anchor', id: 'origin-start', startMinutes: cursor - 10, endMinutes: cursor })

  // Eén pauze, en pas vanaf drie jobs: bij twee is er geen midden.
  const breakBefore = jobs.length >= 3 ? Math.floor(jobs.length / 2) : -1

  let previous: Coordinates | undefined = origin

  jobs.forEach((job, index) => {
    const legMinutes = travelBetween(previous, job.at)

    if (legMinutes === null) {
      // Onbekend duurt nul. Een verzonnen duur zou de hele dag erachter
      // verschuiven, en dat is erger dan een gat dat zichzelf aanwijst.
      unknownLegs++
      blocks.push({
        kind: 'travel',
        id: `travel-${index}`,
        startMinutes: cursor,
        endMinutes: cursor,
        minutes: null,
      })
    } else if (legMinutes > 0) {
      blocks.push({
        kind: 'travel',
        id: `travel-${index}`,
        startMinutes: cursor,
        endMinutes: cursor + legMinutes,
        minutes: legMinutes,
      })
      cursor += legMinutes
      travelMinutes += legMinutes
    }

    if (index === breakBefore) {
      blocks.push({
        kind: 'break',
        id: 'break',
        startMinutes: cursor,
        endMinutes: cursor + breakMinutes,
      })
      cursor += breakMinutes
    }

    const length = job.estimatedMinutes ?? 0
    blocks.push({
      kind: 'job',
      id: `job-${job.id}`,
      interventionId: job.id,
      startMinutes: cursor,
      endMinutes: cursor + length,
    })
    cursor += length
    workMinutes += length

    previous = job.at
  })

  const homeLeg = travelBetween(previous, origin)
  if (homeLeg === null) {
    unknownLegs++
    blocks.push({
      kind: 'travel', id: 'travel-home',
      startMinutes: cursor, endMinutes: cursor, minutes: null,
    })
  } else if (homeLeg > 0) {
    blocks.push({
      kind: 'travel', id: 'travel-home',
      startMinutes: cursor, endMinutes: cursor + homeLeg, minutes: homeLeg,
    })
    cursor += homeLeg
    travelMinutes += homeLeg
  }

  blocks.push({ kind: 'anchor', id: 'origin-end', startMinutes: cursor, endMinutes: cursor + 10 })

  return { blocks, backAtOriginMinutes: cursor, workMinutes, travelMinutes, unknownLegs }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/day-schedule.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen uitvoer van tsc, geen fouten van eslint

- [ ] **Step 6: Commit**

```bash
git add lib/planning/daySchedule.ts tests/day-schedule.test.ts
git commit -m "Turn an ordered day into clock times

A job starts on arrival: the configured departure time plus the drive to
the first customer, then each job after it the same way. The day opens and
closes at the configured start location.

None of it is stored. A work order knows a day and a position; the hour
exists only while this function runs. That is deliberate — an overrunning
job pushes the rest along by itself, and dragging a bon to the pool loses
its hour without anything having to be cleared.

Kept apart from the view because the Gantt runs on it next: technicians as
rows is this function, once per technician.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DhsoABidXn8ohhP5oMNX2a"
```

---

### Task 2: De weekweergave, alleen lezen

**Files:**
- Create: `lib/planning/weekDays.ts`
- Create: `tests/week-days.test.ts`
- Create: `components/WeekView/WeekGrid.tsx`
- Create: `components/WeekView/WeekView.tsx`
- Create: `app/planning/week/page.tsx`
- Modify: `components/DayView/DayView.tsx` — knop naar de weekweergave in de datumbalk

**Interfaces:**
- Consumes: `computeDaySchedule`, `ScheduleBlock` (Task 1); `scheduleForDate`, `UNPAID_BREAK_MINUTES` uit `@/lib/planning/workSchedule`; `useSettings`, `getStartCoordinatesFromSettings`; `typeBorderClass`, `formatHours` uit `@/components/planning/interventionLabels`.
- Produces: `weekDaysAround(date): Date[]`, `toLocalDateStr(date): string`; component `WeekGrid`.

- [ ] **Step 1: Write the failing test**

Create `tests/week-days.test.ts`:

```ts
/**
 * De zeven dagen van de week waarin een datum valt.
 *
 * Maandag eerst, want dat is hoe het rooster loopt en hoe een planner ernaar
 * kijkt. JavaScript telt de week vanaf zondag, en dat verschil van één dag is
 * precies het soort fout dat pas opvalt als iemand op zondag werkt.
 */
import { describe, expect, it } from 'vitest'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'

describe('weekDaysAround', () => {
  it('gives seven days', () => {
    expect(weekDaysAround(new Date(2026, 8, 16))).toHaveLength(7)
  })

  it('starts on Monday', () => {
    // 16 september 2026 is een woensdag.
    const days = weekDaysAround(new Date(2026, 8, 16))
    expect(days[0].getDay()).toBe(1)
    expect(toLocalDateStr(days[0])).toBe('2026-09-14')
  })

  it('ends on Sunday', () => {
    const days = weekDaysAround(new Date(2026, 8, 16))
    expect(days[6].getDay()).toBe(0)
    expect(toLocalDateStr(days[6])).toBe('2026-09-20')
  })

  it('treats Sunday as the end of its week, not the start', () => {
    // 20 september 2026 is een zondag. Zonder correctie zou JavaScript die week
    // op 20 september laten beginnen.
    const days = weekDaysAround(new Date(2026, 8, 20))
    expect(toLocalDateStr(days[0])).toBe('2026-09-14')
    expect(toLocalDateStr(days[6])).toBe('2026-09-20')
  })

  it('crosses a month boundary without losing a day', () => {
    const days = weekDaysAround(new Date(2026, 8, 30))   // woensdag 30 september
    expect(toLocalDateStr(days[0])).toBe('2026-09-28')
    expect(toLocalDateStr(days[6])).toBe('2026-10-04')
  })
})

describe('toLocalDateStr', () => {
  it('uses the local day, not UTC', () => {
    expect(toLocalDateStr(new Date(2026, 8, 14, 0, 30))).toBe('2026-09-14')
    expect(toLocalDateStr(new Date(2026, 8, 14, 23, 30))).toBe('2026-09-14')
  })

  it('pads single digits', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/week-days.test.ts`
Expected: FAIL met `Cannot find package '@/lib/planning/weekDays'`

- [ ] **Step 3: Write the date helper**

Create `lib/planning/weekDays.ts`:

```ts
/**
 * De week waarin een datum valt, maandag eerst.
 *
 * JavaScript nummert zondag als 0, dus een week die op maandag begint vraagt een
 * correctie. Zonder die correctie valt zondag in de week erna, wat pas opvalt
 * wanneer er op zondag gewerkt wordt — en dan is de planning al fout.
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function weekDaysAround(date: Date): Date[] {
  const weekday = date.getDay()              // 0 = zondag
  const sinceMonday = (weekday + 6) % 7      // maandag = 0, zondag = 6

  const monday = new Date(date)
  monday.setHours(12, 0, 0, 0)               // middag: geen zomertijdsprongen
  monday.setDate(monday.getDate() - sinceMonday)

  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + offset)
    return day
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/week-days.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Write the grid component**

Create `components/WeekView/WeekGrid.tsx`:

```tsx
/**
 * WeekGrid — zeven dagkolommen met de tijd verticaal.
 *
 * Tekent alleen wat computeDaySchedule teruggeeft. Op 62 px past geen
 * klantnaam, dus de kleur draagt het overzicht en een tik draagt het detail.
 * Dat is de afweging die indeling A maakt: de hele week in beeld in ruil voor
 * blokken die je moet aantikken.
 */
'use client'

import type { ReactNode } from 'react'
import type { DayScheduleResult, ScheduleBlock } from '@/lib/planning/daySchedule'
import { scheduleForDate, clockToMinutes } from '@/lib/planning/workSchedule'
import { typeBorderClass } from '@/components/planning/interventionLabels'
import type { Intervention } from '@/types'

export const VIEW_START_MINUTES = 6 * 60 + 30
export const VIEW_END_MINUTES = 18 * 60

const DOW = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function WeekGrid({
  days,
  schedules,
  interventionsById,
  pixelsPerHour,
  selectedDate,
  onOpenIntervention,
  renderDayColumn,
}: {
  days: Date[]
  schedules: DayScheduleResult[]
  interventionsById: Record<string, Intervention>
  pixelsPerHour: number
  selectedDate: Date
  onOpenIntervention: (id: string) => void
  /** Laat Task 3 een droppable om elke kolom hangen zonder dit bestand te wijzigen. */
  renderDayColumn?: (day: Date, index: number, column: ReactNode) => ReactNode
}) {
  const toPx = (minutes: number) => ((minutes - VIEW_START_MINUTES) * pixelsPerHour) / 60
  const totalPx = ((VIEW_END_MINUTES - VIEW_START_MINUTES) * pixelsPerHour) / 60

  const hours: number[] = []
  for (let m = Math.ceil(VIEW_START_MINUTES / 60) * 60; m <= VIEW_END_MINUTES; m += 60) hours.push(m)

  return (
    <div className="rounded-xl border border-stroke bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: `34px repeat(${days.length}, 62px)` }}
        >
          <div className="sticky left-0 top-0 z-30 bg-white border-b border-stroke px-1 py-1.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">uur</span>
          </div>

          {days.map((day, index) => {
            const rest = scheduleForDate(day) === null
            return (
              <div
                key={toKey(day)}
                className={[
                  'sticky top-0 z-20 border-b border-stroke bg-white px-1 py-1.5 text-center',
                  rest ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  {DOW[day.getDay()]}
                </div>
                <div
                  className={[
                    'text-sm font-bold tabular-nums',
                    isSameDay(day, selectedDate) ? 'text-brand-orange' : 'text-ink',
                  ].join(' ')}
                >
                  {day.getDate()}
                </div>
                <div className="text-[9px] tabular-nums text-ink-faint">
                  {schedules[index].workMinutes + schedules[index].travelMinutes > 0
                    ? shortHours(schedules[index].workMinutes + schedules[index].travelMinutes)
                    : '—'}
                </div>
              </div>
            )
          })}

          <div
            className="sticky left-0 z-10 relative border-r border-stroke bg-white"
            style={{ height: totalPx }}
          >
            {hours.map(m => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[9px] tabular-nums text-ink-faint"
                style={{ top: toPx(m) }}
              >
                {hhmm(m)}
              </span>
            ))}
          </div>

          {days.map((day, index) => {
            const column = (
              <DayColumn
                day={day}
                schedule={schedules[index]}
                interventionsById={interventionsById}
                toPx={toPx}
                totalPx={totalPx}
                hours={hours}
                onOpenIntervention={onOpenIntervention}
              />
            )
            return (
              <div key={toKey(day)}>
                {renderDayColumn ? renderDayColumn(day, index, column) : column}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day, schedule, interventionsById, toPx, totalPx, hours, onOpenIntervention,
}: {
  day: Date
  schedule: DayScheduleResult
  interventionsById: Record<string, Intervention>
  toPx: (minutes: number) => number
  totalPx: number
  hours: number[]
  onOpenIntervention: (id: string) => void
}) {
  const roster = scheduleForDate(day)

  return (
    <div
      className={['relative border-r border-stroke/60', roster ? '' : 'bg-surface'].join(' ')}
      style={{ height: totalPx }}
    >
      {hours.map(m => (
        <div key={m} className="absolute left-0 right-0 h-px bg-stroke/60" style={{ top: toPx(m) }} />
      ))}

      {roster && (
        <>
          <div
            className="absolute left-0 right-0 bg-surface"
            style={{ top: 0, height: Math.max(0, toPx(clockToMinutes(roster.start))) }}
          />
          <div
            className="absolute left-0 right-0 bg-surface"
            style={{
              top: toPx(clockToMinutes(roster.end)),
              height: Math.max(0, totalPx - toPx(clockToMinutes(roster.end))),
            }}
          />
        </>
      )}

      {schedule.blocks.map(block => (
        <Block
          key={block.id}
          block={block}
          intervention={block.interventionId ? interventionsById[block.interventionId] : undefined}
          top={toPx(block.startMinutes)}
          height={Math.max(9, toPx(block.endMinutes) - toPx(block.startMinutes))}
          onOpen={onOpenIntervention}
        />
      ))}
    </div>
  )
}

function Block({
  block, intervention, top, height, onOpen,
}: {
  block: ScheduleBlock
  intervention?: Intervention
  top: number
  height: number
  onOpen: (id: string) => void
}) {
  if (block.kind === 'anchor') {
    return (
      <div
        className="absolute inset-x-0.5 rounded bg-brand-dark px-1 text-[8.5px] font-semibold text-white flex items-center"
        style={{ top, height }}
      >
        {hhmm(block.endMinutes)}
      </div>
    )
  }

  if (block.kind === 'travel') {
    return (
      <div
        className="absolute inset-x-1.5 rounded-sm bg-stroke/70 flex items-center justify-center text-[8px] font-semibold text-ink-soft"
        style={{ top, height }}
        title={block.minutes === null ? 'Rijtijd onbekend — adres ontbreekt' : `Rijden ${block.minutes} min`}
      >
        {height >= 13 ? (block.minutes === null ? '?' : `${block.minutes}′`) : ''}
      </div>
    )
  }

  if (block.kind === 'break') {
    return (
      <div
        className="absolute inset-x-0.5 rounded-sm bg-stroke flex items-center justify-center text-[8px] font-semibold text-ink-soft"
        style={{ top, height }}
        title="Middagpauze"
      >
        {height >= 13 ? 'pauze' : ''}
      </div>
    )
  }

  if (!intervention) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(intervention.id)}
      className={[
        'absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-white shadow-sm active:opacity-80',
        typeBorderClass(intervention.type, intervention.isUrgent),
      ].join(' ')}
      style={{ top, height }}
      title={`${hhmm(block.startMinutes)}–${hhmm(block.endMinutes)} · ${intervention.customerName}, ${intervention.siteCity}`}
    >
      <span className="block text-[9px] font-bold leading-tight tabular-nums">
        {hhmm(block.startMinutes)}
      </span>
      {height >= 24 && (
        <span className="block truncate text-[9.5px] font-semibold leading-tight">
          {intervention.customerName}
        </span>
      )}
    </button>
  )
}

function shortHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}u` : `${h}u${String(m).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
}
```

- [ ] **Step 6: Write the page and the container**

Create `components/WeekView/WeekView.tsx`:

```tsx
/**
 * WeekView — de week als agenda, met de open pool eronder.
 *
 * Haalt per dag de planning op en laat computeDaySchedule er kloktijden van
 * maken. In deze taak is alles alleen-lezen; het slepen komt in Task 3.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { computeDaySchedule, type DayScheduleResult, type TravelLookup } from '@/lib/planning/daySchedule'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'
import { estimateTravel } from '@/lib/routing/estimateTravel'
import { knownRoute } from '@/lib/routing/knownRoutes'
import type { Intervention } from '@/types'
import { WeekGrid } from './WeekGrid'

/**
 * Dezelfde lagen als de dagweergave, minus de cache: die leeft in
 * useRouteTimeline en hoort niet in twee componenten tegelijk te staan. Voor de
 * weekweergave zijn geschatte tijden genoeg — het gaat om overzicht, niet om de
 * minuut.
 */
const lookupTravel: TravelLookup = (from, to) => {
  if (!from || !to) return null
  const pinned = knownRoute(from, to)
  if (pinned) return pinned.minutes
  const estimated = estimateTravel(from, to)
  return estimated ? estimated.minutes : null
}

export default function WeekView() {
  const router = useRouter()
  const { settings } = useSettings()
  const { currentUser } = useTasks()

  const [anchor, setAnchor] = useState(() => new Date())
  const [pixelsPerHour, setPixelsPerHour] = useState(54)
  const [byDate, setByDate] = useState<Record<string, Intervention[]>>({})
  const [pool, setPool] = useState<Intervention[]>([])

  const days = useMemo(() => weekDaysAround(anchor), [anchor])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const results = await Promise.all(
        days.map(async day => {
          const date = toLocalDateStr(day)
          try {
            const res = await fetch(`/api/sync/today?technicianId=${currentUser.id}&date=${date}`)
            if (!res.ok) return { date, planned: [] as Intervention[], open: [] as Intervention[] }
            const data = await res.json() as { planned: Intervention[]; open: Intervention[] }
            return { date, planned: data.planned, open: data.open }
          } catch {
            return { date, planned: [] as Intervention[], open: [] as Intervention[] }
          }
        }),
      )

      if (cancelled) return
      const next: Record<string, Intervention[]> = {}
      for (const r of results) next[r.date] = r.planned
      setByDate(next)
      setPool(results[0]?.open ?? [])
    }

    void load()
    return () => { cancelled = true }
  }, [days, currentUser.id])

  const origin = useMemo(() => getStartCoordinatesFromSettings(settings), [settings])
  const departureMinutes = useMemo(() => clockToMinutes(settings.startTime), [settings.startTime])

  const schedules: DayScheduleResult[] = useMemo(
    () => days.map(day =>
      computeDaySchedule({
        departureMinutes,
        origin,
        jobs: (byDate[toLocalDateStr(day)] ?? []).map(i => ({
          id: i.id,
          estimatedMinutes: i.estimatedMinutes,
          at: typeof i.siteLat === 'number' && typeof i.siteLon === 'number'
            ? { lat: i.siteLat, lon: i.siteLon }
            : undefined,
        })),
        travelBetween: lookupTravel,
        breakMinutes: UNPAID_BREAK_MINUTES,
      }),
    ),
    [days, byDate, departureMinutes, origin],
  )

  const interventionsById = useMemo(() => {
    const map: Record<string, Intervention> = {}
    for (const list of Object.values(byDate)) for (const i of list) map[i.id] = i
    return map
  }, [byDate])

  function shiftWeek(weeks: number) {
    setAnchor(current => {
      const next = new Date(current)
      next.setDate(next.getDate() + weeks * 7)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between bg-brand-dark px-4 py-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-xs font-semibold text-ink-soft active:opacity-70"
        >
          ← Dag
        </button>
        <p className="text-sm font-bold text-white">Weekplanning</p>
        <span className="w-10" />
      </header>

      <div className="flex items-center justify-between border-b border-brand-mid bg-brand-dark px-2 pb-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="h-9 w-9 rounded-full text-ink-soft active:bg-brand-mid/40"
          aria-label="Vorige week"
        >
          ‹
        </button>
        <p className="text-sm text-ink-soft">
          {days[0].getDate()} {monthName(days[0])} — {days[6].getDate()} {monthName(days[6])}
        </p>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="h-9 w-9 rounded-full text-ink-soft active:bg-brand-mid/40"
          aria-label="Volgende week"
        >
          ›
        </button>
      </div>

      <main className="px-4 py-4 pb-24">
        <label className="mb-2 flex items-center gap-3 text-xs text-ink-soft">
          Hoogte per uur
          <input
            id="week-zoom"
            type="range"
            min={34}
            max={96}
            step={2}
            value={pixelsPerHour}
            onChange={event => setPixelsPerHour(Number(event.target.value))}
            className="max-w-44 flex-1 accent-brand-orange"
          />
          <span className="tabular-nums">{pixelsPerHour} px</span>
        </label>

        <WeekGrid
          days={days}
          schedules={schedules}
          interventionsById={interventionsById}
          pixelsPerHour={pixelsPerHour}
          selectedDate={new Date()}
          onOpenIntervention={id => router.push(`/interventions/${id}`)}
        />

        <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-ink">Open pool</h2>
        <p className="mb-3 text-xs text-ink-soft">{pool.length} job(s) zonder dag</p>
      </main>
    </div>
  )
}

function monthName(day: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { month: 'short' }).format(day)
}
```

Create `app/planning/week/page.tsx`:

```tsx
import WeekView from '@/components/WeekView/WeekView'

export default function WeekPlanningPage() {
  return <WeekView />
}
```

- [ ] **Step 7: Add the way in**

In `components/DayView/DayView.tsx`, inside the date bar `<div className="flex items-center">`, directly after the "Volgende dag" button, add:

```tsx
          <button
            type="button"
            onClick={() => router.push('/planning/week')}
            className="h-10 px-2 text-[11px] font-semibold text-ink-soft active:opacity-70"
            aria-label="Weekplanning openen"
          >
            Week
          </button>
```

- [ ] **Step 8: Verify it builds and renders**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: typecheck en lint stil; de build noemt `/planning/week` in de routelijst.

- [ ] **Step 9: Commit**

```bash
git add lib/planning/weekDays.ts tests/week-days.test.ts components/WeekView app/planning/week components/DayView/DayView.tsx
git commit -m "Show the week as a calendar

Seven columns, 06:30 to 18:00, blocks to the scale of their duration —
layout A of the three that were mocked up, chosen for having the whole
week in one glance.

At 62px a customer name does not fit, so colour carries the overview and a
tap carries the detail. That is the trade layout A makes, and it is only
affordable because the hours are derived: a block's position says what it
means without needing a label.

Read-only for now; dragging is next.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DhsoABidXn8ohhP5oMNX2a"
```

---

### Task 3: Slepen over de week

**Files:**
- Create: `lib/planning/weekDropIntent.ts`
- Create: `tests/week-drop-intent.test.ts`
- Modify: `components/WeekView/WeekView.tsx` — `DndContext`, pool, schrijfbewegingen
- Modify: `components/WeekView/WeekGrid.tsx` — `renderDayColumn` gebruiken voor droppables

**Interfaces:**
- Consumes: `resolveDropIntent`, `canLeaveTheDay`, `POOL_DROPPABLE_ID` (`lib/planning/dropIntent.ts`); `buildPlanningWrite` (`lib/planning/planningWrite.ts`); `enqueuePlanningWrite`, `upsertIntervention` (`lib/idb.ts`).
- Produces: `resolveWeekDrop(context): WeekDropIntent`, `dayDroppableId(dateStr): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/week-drop-intent.test.ts`:

```ts
/**
 * Wat een drop in de weekweergave betekent.
 *
 * De dagweergave kent één dag, dus daar is een drop altijd "deze dag". Over een
 * week heen komt er een richting bij die de dagweergave niet heeft: van dag
 * naar dag. Dat is geen verplaatsing maar twee momentopnames — één per dag —
 * en de volgorde waarin ze wegschrijven bepaalt wat er gebeurt als de tweede
 * mislukt.
 */
import { describe, expect, it } from 'vitest'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'

const MON = '2026-09-14'
const TUE = '2026-09-15'

const context = {
  activeId: 'wo-1',
  overId: dayDroppableId(TUE),
  dayOf: { 'wo-1': MON } as Record<string, string | undefined>,
  statusById: { 'wo-1': 'gepland' as const },
}

describe('dayDroppableId', () => {
  it('round-trips a date', () => {
    expect(dayDroppableId(MON)).toContain(MON)
    expect(dayDroppableId(MON)).not.toBe(dayDroppableId(TUE))
  })
})

describe('resolveWeekDrop', () => {
  it('moves a work order from one day to another', () => {
    expect(resolveWeekDrop(context)).toEqual({
      kind: 'move',
      workOrderId: 'wo-1',
      fromDate: MON,
      toDate: TUE,
    })
  })

  it('does nothing when dropped on the day it already sits on', () => {
    expect(resolveWeekDrop({ ...context, overId: dayDroppableId(MON) }).kind).toBe('none')
  })

  it('schedules a pool work order onto a day', () => {
    expect(resolveWeekDrop({
      ...context,
      dayOf: { 'wo-1': undefined },
    })).toEqual({ kind: 'schedule', workOrderId: 'wo-1', toDate: TUE })
  })

  it('releases a work order dropped on the pool', () => {
    expect(resolveWeekDrop({ ...context, overId: POOL_DROPPABLE_ID })).toEqual({
      kind: 'unschedule', workOrderId: 'wo-1', fromDate: MON,
    })
  })

  it('does nothing when a pool work order is dropped back on the pool', () => {
    expect(resolveWeekDrop({
      ...context,
      overId: POOL_DROPPABLE_ID,
      dayOf: { 'wo-1': undefined },
    }).kind).toBe('none')
  })

  it('refuses to move work that has already been started', () => {
    // Dezelfde grens als in de dagweergave: vanaf 'bezig' blijft de bon staan.
    const result = resolveWeekDrop({ ...context, statusById: { 'wo-1': 'bezig' } })
    expect(result.kind).toBe('none')
    expect(result).toHaveProperty('reason')
  })

  it('still refuses when that work is dropped on the pool', () => {
    const result = resolveWeekDrop({
      ...context,
      overId: POOL_DROPPABLE_ID,
      statusById: { 'wo-1': 'afgewerkt' },
    })
    expect(result.kind).toBe('none')
  })

  it('does nothing when let go outside any list', () => {
    expect(resolveWeekDrop({ ...context, overId: null }).kind).toBe('none')
  })

  it('treats a card it has never placed as coming from the pool', () => {
    // Niet in dayOf betekent: staat op geen enkele dag. Dat is precies wat de
    // pool is, dus er is niets bijzonders aan de hand — de bon wordt ingepland.
    // De caller kent alleen kaarten die hij zelf getekend heeft, dus een
    // werkelijk onbekend id bestaat hier niet.
    expect(resolveWeekDrop({ ...context, activeId: 'wo-nieuw', dayOf: {} })).toEqual({
      kind: 'schedule', workOrderId: 'wo-nieuw', toDate: TUE,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/week-drop-intent.test.ts`
Expected: FAIL met `Cannot find package '@/lib/planning/weekDropIntent'`

- [ ] **Step 3: Write the implementation**

Create `lib/planning/weekDropIntent.ts`:

```ts
/**
 * Wat een drop in de weekweergave betekent.
 *
 * De dagweergave kent maar één dag, dus daar is een drop altijd "deze dag".
 * Over een week heen komt er een richting bij: van dag naar dag. Die is geen
 * enkele schrijfbeweging — savePlanningSnapshot beschrijft één dag — maar twee
 * momentopnames, en welke eerst gaat bepaalt wat er gebeurt als de tweede
 * mislukt. Zie de opmerking bij 'move'.
 */
import { canLeaveTheDay, POOL_DROPPABLE_ID } from './dropIntent'
import type { InterventionStatus } from '@/types'

const DAY_PREFIX = 'weekday:'

export function dayDroppableId(dateStr: string): string {
  return `${DAY_PREFIX}${dateStr}`
}

function dateFromDroppable(id: string): string | null {
  return id.startsWith(DAY_PREFIX) ? id.slice(DAY_PREFIX.length) : null
}

export type WeekDropIntent =
  | { kind: 'schedule'; workOrderId: string; toDate: string }
  | { kind: 'unschedule'; workOrderId: string; fromDate: string }
  | { kind: 'move'; workOrderId: string; fromDate: string; toDate: string }
  | { kind: 'none'; reason: string }

export interface WeekDropContext {
  activeId: string
  overId: string | null
  /** De dag waarop elke werkbon nu staat; ontbreekt hij, dan zit hij in de pool. */
  dayOf: Record<string, string | undefined>
  statusById: Record<string, InterventionStatus | undefined>
}

export function resolveWeekDrop(context: WeekDropContext): WeekDropIntent {
  const { activeId, overId, dayOf, statusById } = context

  if (!overId) return { kind: 'none', reason: 'losgelaten naast de lijst' }

  const fromDate = dayOf[activeId]
  const toDate = dateFromDroppable(overId)

  // De grendel geldt overal waar een bon zijn dag zou verlaten — hem verbergen
  // is comfort, dit is de regel.
  const mustStay = Boolean(fromDate) && !canLeaveTheDay(statusById[activeId])

  if (overId === POOL_DROPPABLE_ID) {
    if (!fromDate) return { kind: 'none', reason: 'staat al in de pool' }
    if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }
    return { kind: 'unschedule', workOrderId: activeId, fromDate }
  }

  if (!toDate) return { kind: 'none', reason: 'geen geldig doel' }
  if (fromDate === toDate) return { kind: 'none', reason: 'staat al op die dag' }
  if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }

  if (!fromDate) return { kind: 'schedule', workOrderId: activeId, toDate }

  return { kind: 'move', workOrderId: activeId, fromDate, toDate }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/week-drop-intent.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Wire the drag context into the week view**

In `components/WeekView/WeekView.tsx`:

Add to the imports:

```tsx
import {
  DndContext, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import { enqueuePlanningWrite, upsertIntervention } from '@/lib/idb'
import { OpenPool } from '@/components/DayView/OpenPool'
import type { ReactNode } from 'react'
```

Add inside the component, after the existing state:

```tsx
  const [refusal, setRefusal] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const dayOf = useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const [date, list] of Object.entries(byDate)) for (const i of list) map[i.id] = date
    return map
  }, [byDate])

  const statusById = useMemo(() => {
    const map: Record<string, Intervention['status']> = {}
    for (const i of [...Object.values(byDate).flat(), ...pool]) map[i.id] = i.status
    return map
  }, [byDate, pool])

  /**
   * Eén dag wegschrijven. savePlanningSnapshot beschrijft altijd precies één
   * dag, dus een verplaatsing tussen twee dagen is twee van deze.
   */
  async function persistDay(dateStr: string, list: Intervention[], moved?: Intervention) {
    await Promise.all(list.map((i, index) => updateInterventionSequence(i.id, index + 1)))
    if (moved) await upsertIntervention(moved)
    await enqueuePlanningWrite(
      buildPlanningWrite({
        day: list,
        actor: currentUser,
        technicianId: currentUser.id,
        date: new Date(`${dateStr}T12:00:00`),
      }),
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    setRefusal(null)

    const intent = resolveWeekDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      dayOf,
      statusById,
    })

    if (intent.kind === 'none') {
      if (intent.reason === 'het werk is al begonnen') {
        setRefusal('Deze werkbon is al gestart en blijft op zijn dag staan.')
      }
      return
    }

    const all = [...Object.values(byDate).flat(), ...pool]
    const moving = all.find(i => i.id === intent.workOrderId)
    if (!moving) return

    if (intent.kind === 'unschedule') {
      const rest = (byDate[intent.fromDate] ?? []).filter(i => i.id !== moving.id)
      const released: Intervention = {
        ...moving,
        plannedDate: undefined,
        status: moving.status === 'gepland' || moving.status === 'onderweg' ? 'aangemaakt' : moving.status,
      }
      setByDate(current => ({ ...current, [intent.fromDate]: rest }))
      setPool(current => [released, ...current])
      await persistDay(intent.fromDate, rest, released)
      return
    }

    if (intent.kind === 'schedule') {
      const target = [...(byDate[intent.toDate] ?? []), moving]
      const scheduled: Intervention = {
        ...moving,
        plannedDate: `${intent.toDate}T00:00:00.000Z`,
        status: moving.status === 'aangemaakt' ? 'gepland' : moving.status,
      }
      setPool(current => current.filter(i => i.id !== moving.id))
      setByDate(current => ({ ...current, [intent.toDate]: [...(current[intent.toDate] ?? []), scheduled] }))
      await persistDay(intent.toDate, target.map(i => (i.id === moving.id ? scheduled : i)), scheduled)
      return
    }

    // move: de oude dag eerst. Mislukt de tweede schrijfbeweging, dan staat de
    // bon in de pool — vervelend, maar beter dan op twee dagen tegelijk.
    const without = (byDate[intent.fromDate] ?? []).filter(i => i.id !== moving.id)
    const scheduled: Intervention = { ...moving, plannedDate: `${intent.toDate}T00:00:00.000Z` }
    const target = [...(byDate[intent.toDate] ?? []), scheduled]

    setByDate(current => ({ ...current, [intent.fromDate]: without, [intent.toDate]: target }))
    await persistDay(intent.fromDate, without)
    await persistDay(intent.toDate, target, scheduled)
  }
```

Add `updateInterventionSequence` to the `@/lib/idb` import.

Wrap the `<main>` contents in the drag context and hang a droppable on each column:

```tsx
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {refusal && (
            <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-ink">
              {refusal}
            </div>
          )}

          <WeekGrid
            days={days}
            schedules={schedules}
            interventionsById={interventionsById}
            pixelsPerHour={pixelsPerHour}
            selectedDate={new Date()}
            onOpenIntervention={id => router.push(`/interventions/${id}`)}
            renderDayColumn={(day, index, column) => (
              <DayDroppable dateStr={toLocalDateStr(day)}>{column}</DayDroppable>
            )}
          />

          <OpenPool
            interventions={pool}
            visible
            onToggleVisible={() => {}}
            onOpen={id => router.push(`/interventions/${id}`)}
          />
        </DndContext>
```

And add the droppable wrapper at the bottom of the file:

```tsx
/**
 * Een hele dagkolom als doelwit, niet de blokken erin.
 *
 * Dat is wat 62 px bruikbaar maakt met een duim: je mikt op een dag, niet op
 * een uur. Het uur volgt uit de berekening, dus grof richten is genoeg.
 */
function DayDroppable({ dateStr, children }: { dateStr: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(dateStr) })
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'bg-brand-orange/10 outline-2 outline-dashed outline-brand-orange' : ''}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Run the full suite, typecheck, lint and build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: alles groen, ten minste 385 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/planning/weekDropIntent.ts tests/week-drop-intent.test.ts components/WeekView
git commit -m "Drag across the week, a day at a time

The day view knows one day, so a drop there is always 'this day'. Across a
week a third direction appears — day to day — and that is not one write
but two snapshots, because savePlanningSnapshot describes a single day.

The old day goes first. If the second write fails the bon is in the pool,
which is inconvenient and honest; the other order would leave it on two
days at once, which is neither.

A whole column is the drop target, not the blocks in it. That is what
makes 62px workable with a thumb: you aim at a day, and the hour follows
from the calculation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DhsoABidXn8ohhP5oMNX2a"
```

---

### Task 4: Kloktijden in de dagweergave

**Files:**
- Modify: `components/DayTimeline/useRouteTimeline.ts` — `computeDaySchedule` gebruiken voor de tijden
- Modify: `components/DayTimeline/JobTimelineCard.tsx` — het uur tonen

**Interfaces:**
- Consumes: `computeDaySchedule` (Task 1).
- Produces: `startMinutes` op elk `JobItem` in `fullSequence`.

- [ ] **Step 1: Add the clock to the timeline hook**

In `components/DayTimeline/useRouteTimeline.ts`, inside the `useMemo` that builds `fullSequence`, after the tally loop, compute the schedule and hang a start time on each job block:

```tsx
    // Dezelfde motor als de weekweergave, zodat dag en week nooit een andere
    // tijd tonen voor dezelfde job.
    const schedule = computeDaySchedule({
      departureMinutes: clockToMinutes(settings.startTime),
      origin: startCoordinates,
      jobs: state.movableItems
        .filter((item): item is JobItem => item.kind === 'job')
        .map(item => ({
          id: item.intervention.id,
          estimatedMinutes: item.intervention.estimatedMinutes,
          at: jobCoordinates(item.intervention),
        })),
      travelBetween: (from, to) => {
        const leg = resolveLeg(cacheSnapshot, from, to)
        return leg.provider === 'unknown' ? null : leg.minutes
      },
      breakMinutes: DEFAULT_BREAK_MINUTES,
    })

    const startByIntervention: Record<string, number> = {}
    for (const block of schedule.blocks) {
      if (block.kind === 'job' && block.interventionId) {
        startByIntervention[block.interventionId] = block.startMinutes
      }
    }
```

Return `startByIntervention` alongside `fullSequence` and `totals`, and add it to the hook's return object.

- [ ] **Step 2: Show it on the card**

In `components/DayTimeline/JobTimelineCard.tsx`, add a `startMinutes?: number` prop and render it beside the customer name:

```tsx
                  {typeof startMinutes === 'number' && (
                    <p className="text-[11px] font-bold tabular-nums text-brand-orange">
                      {String(Math.floor(startMinutes / 60)).padStart(2, '0')}:
                      {String(startMinutes % 60).padStart(2, '0')}
                    </p>
                  )}
```

Pass it from `DayTimeline.tsx`:

```tsx
                      startMinutes={timeline.startByIntervention[item.intervention.id]}
```

- [ ] **Step 3: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen; geen nieuwe tests nodig, de motor is in Task 1 gedekt.

- [ ] **Step 4: Commit**

```bash
git add components/DayTimeline
git commit -m "Put the hour on the day's cards too

The week view and the day view now run the same engine, so the same job
cannot show one time in one place and another time in the other — which is
exactly the kind of disagreement nobody notices until a technician is late.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DhsoABidXn8ohhP5oMNX2a"
```

---

## Na afloop

- Met de hand testen op een echte telefoon: **is 62 px breed genoeg om met een duim te slepen?** Zo niet, dan is indeling B de terugval — dat is `62px` → `108px` in `WeekGrid` en meer tekst per blok.
- De 11 bonnen met `10:11` als tijdstip verdelen over de week, zodat de weekweergave met een deels gevulde planning te beoordelen is.
- Versie bumpen en release notes schrijven, in die volgorde. Dan uitrollen.
