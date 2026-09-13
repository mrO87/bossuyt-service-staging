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
import { dayDroppableId, PAST_DAY_REASON, resolveWeekDrop, weekEdgeDroppableId } from '@/lib/planning/weekDropIntent'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'

const MON = '2026-09-14'
const TUE = '2026-09-15'

const context = {
  activeId: 'wo-1',
  overId: dayDroppableId(TUE),
  dayOf: { 'wo-1': MON } as Record<string, string | undefined>,
  poolIds: [] as string[],
  statusById: { 'wo-1': 'gepland' as const },
  // Vandaag staat hier vast, ver genoeg vóór MON dat ook een week terugschuiven
  // nog in de toekomst valt. Zonder dit hing de uitkomst van deze tests af van
  // de dag waarop ze draaien: de regel die voorbije dagen weigert kijkt naar de
  // echte klok, en dan gaat dit bestand vanzelf rood op een willekeurige datum.
  today: '2026-09-01',
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

  it('releases a work order dropped on a card that sits in the pool', () => {
    // Dit is de bug die op staging naar boven kwam: naar een dag slepen lukte,
    // terug naar de pool niet. De blokken op een dag zijn alleen sleepbaar, dus
    // een drop op een dagkolom raakt altijd de kolom zelf. De kaarten in de pool
    // zijn sortable en dus óók loslaatdoel — laat je een bon boven een kaart
    // los, dan is dát het doel, en de pool zelf werd nooit geraakt.
    const result = resolveWeekDrop({
      ...context,
      overId: 'wo-pool-2',
      poolIds: ['wo-pool-2', 'wo-pool-3'],
    })
    expect(result).toEqual({ kind: 'unschedule', workOrderId: 'wo-1', fromDate: MON })
  })

  it('refuses a started work order dropped on a pool card, same as on the pool', () => {
    const result = resolveWeekDrop({
      ...context,
      overId: 'wo-pool-2',
      poolIds: ['wo-pool-2'],
      statusById: { 'wo-1': 'bezig' },
    })
    expect(result.kind).toBe('none')
  })

  it('does not read a day column as the pool just because the pool is empty', () => {
    const result = resolveWeekDrop({ ...context, poolIds: [] })
    expect(result.kind).toBe('move')
  })

  it('still does nothing for a card that belongs to no list at all', () => {
    const result = resolveWeekDrop({ ...context, overId: 'iets-anders', poolIds: [] })
    expect(result.kind).toBe('none')
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

/**
 * Loslaten op je eigen dag, op een andere hoogte.
 *
 * Dat is de vierde uitkomst, en de enige die geen verplaatsing is: de bon
 * blijft waar hij staat en krijgt een uur. Zonder dit zou verticaal slepen
 * niets doen — precies de variant die in het prototype sneuvelde omdat slepen
 * dan stuk voelt.
 */
describe('resolveWeekDrop — een uur zetten', () => {
  const sameDay = {
    ...context,
    overId: dayDroppableId(MON),
    startMinutesOf: { 'wo-1': 8 * 60 } as Record<string, number | undefined>,
  }

  it('turns a drop on its own day into an hour', () => {
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: 62 })).toEqual({
      kind: 'set_hour',
      workOrderId: 'wo-1',
      date: MON,
      startMinutes: 9 * 60,
    })
  })

  it('snaps to the quarter, so a thumb lands on a usable hour', () => {
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: 8 })).toMatchObject({
      startMinutes: 8 * 60 + 15,
    })
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: 7 })).toMatchObject({
      startMinutes: 8 * 60,
    })
  })

  it('does nothing when the finger did not really move', () => {
    // Een tik is geen sleep. Zonder deze regel zou elke tik een uur vastzetten
    // op het uur dat er toch al berekend stond.
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: 2 }).kind).toBe('none')
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: 0 }).kind).toBe('none')
  })

  it('does nothing when nobody knows what hour it stands on', () => {
    expect(resolveWeekDrop({ ...sameDay, startMinutesOf: {}, deltaMinutes: 60 }).kind).toBe('none')
  })

  it('never lets an hour land outside the day', () => {
    expect(resolveWeekDrop({ ...sameDay, deltaMinutes: -600 })).toMatchObject({ startMinutes: 0 })
  })

  it('refuses to re-time work that has already started', () => {
    // Bij een gestarte job is het uur geen plan meer maar een feit. Dezelfde
    // grendel die hem op de dag houdt, houdt ook zijn uur tegen.
    const started = resolveWeekDrop({
      ...sameDay,
      statusById: { 'wo-1': 'bezig' },
      deltaMinutes: 60,
    })
    expect(started.kind).toBe('none')
    if (started.kind !== 'none') return
    expect(started.reason).toBe('het werk is al begonnen')
  })

  it('leaves a move to another day a move, hour or no hour', () => {
    // De regel die de gebruiker koos: een uur hoort bij een dag. Naar een
    // andere dag slepen wist het, en dat gebeurt in savePlanningSnapshot —
    // hier is er dus niets bijzonders aan een verplaatsing.
    expect(resolveWeekDrop({ ...context, startMinutesOf: { 'wo-1': 8 * 60 }, deltaMinutes: 60 }))
      .toEqual({ kind: 'move', workOrderId: 'wo-1', fromDate: MON, toDate: TUE })
  })

  it('leaves a pool work order without an hour', () => {
    // De poolkaart staat ergens anders op het scherm; hoe hoog je hem in de
    // kolom loslaat zegt niets. Hij komt op de dag en het uur wordt berekend.
    expect(resolveWeekDrop({
      ...context,
      dayOf: { 'wo-1': undefined },
      deltaMinutes: 120,
    })).toEqual({ kind: 'schedule', workOrderId: 'wo-1', toDate: TUE })
  })
})

/**
 * De weekranden.
 *
 * Losgelaten op de strook links of rechts van het rooster: zeven dagen vroeger
 * of later. Dat is de enige uitkomst die een dag oplevert die niet op het
 * scherm staat — en dus de enige die niet via een momentopname van een dag kan
 * wegschrijven, want die dag is niet geladen.
 */
describe('resolveWeekDrop — de weekranden', () => {
  const onEdge = (edge: 'prev' | 'next', extra = {}) =>
    resolveWeekDrop({ ...context, overId: weekEdgeDroppableId(edge), ...extra })

  it('schuift een week vooruit', () => {
    expect(onEdge('next')).toEqual({
      kind: 'shift_week',
      workOrderId: 'wo-1',
      fromDate: MON,
      toDate: '2026-09-21',
    })
  })

  it('schuift een week terug', () => {
    expect(onEdge('prev')).toMatchObject({ kind: 'shift_week', toDate: '2026-09-07' })
  })

  it('weigert een bon die al gestart is', () => {
    // De versiegrendel gaat hier omheen, de statusgrendel niet: aan een bon
    // waaraan gewerkt wordt, verzet niemand de dag.
    const started = onEdge('next', { statusById: { 'wo-1': 'bezig' } })
    expect(started.kind).toBe('none')
    if (started.kind !== 'none') return
    expect(started.reason).toBe('het werk is al begonnen')
  })

  it('doet niets met een bon uit de pool', () => {
    // Een bon zonder dag heeft geen week om van weg te schuiven. Hem stilletjes
    // op vandaag plus zeven zetten zou een datum verzinnen die niemand koos.
    expect(onEdge('next', { dayOf: { 'wo-1': undefined } }).kind).toBe('none')
  })
})

/**
 * Geen enkele sleep mag in het verleden landen.
 *
 * De vier uitkomsten die een bon op een dag zetten worden alle vier geweigerd;
 * de uitweg naar de pool blijft open, want dat is juist waar een vergeten bon
 * heen moet.
 */
describe('resolveWeekDrop — geen enkele dag in het verleden', () => {
  const VANDAAG = '2026-09-14'

  it('weigert een verplaatsing naar een dag die voorbij is', () => {
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: { 'wo-1': '2026-09-16' },
      overId: dayDroppableId('2026-09-13'),
    })
    expect(intent).toEqual({ kind: 'none', reason: PAST_DAY_REASON })
  })

  it('weigert een bon uit de pool op een dag die voorbij is', () => {
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: {},
      overId: dayDroppableId('2026-09-13'),
    })
    expect(intent).toEqual({ kind: 'none', reason: PAST_DAY_REASON })
  })

  it('weigert een week terugschuiven wanneer die week voorbij is', () => {
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: { 'wo-1': '2026-09-16' },
      overId: weekEdgeDroppableId('prev'),
    })
    expect(intent).toEqual({ kind: 'none', reason: PAST_DAY_REASON })
  })

  it('weigert ook een uur zetten op een dag die voorbij is', () => {
    // Je kan naar vorige week bladeren en daar een blok verslepen. Dat is
    // dezelfde fout, alleen binnen één kolom.
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: { 'wo-1': '2026-09-10' },
      overId: dayDroppableId('2026-09-10'),
      startMinutesOf: { 'wo-1': 8 * 60 },
      deltaMinutes: 60,
    })
    expect(intent).toEqual({ kind: 'none', reason: PAST_DAY_REASON })
  })

  it('laat vandaag wél toe', () => {
    // De grens ligt bij gisteren. Een dag die nog bezig is blijft bruikbaar.
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: { 'wo-1': '2026-09-16' },
      overId: dayDroppableId(VANDAAG),
    })
    expect(intent).toMatchObject({ kind: 'move', toDate: VANDAAG })
  })

  it('laat een bon van een voorbije dag wél naar de pool', () => {
    // De uitweg moet openblijven: dat is precies waar een vergeten bon heen
    // moet, en de opkuis doet hetzelfde vanzelf.
    const intent = resolveWeekDrop({
      ...context,
      today: VANDAAG,
      dayOf: { 'wo-1': '2026-09-10' },
      overId: POOL_DROPPABLE_ID,
    })
    expect(intent).toMatchObject({ kind: 'unschedule', fromDate: '2026-09-10' })
  })
})
