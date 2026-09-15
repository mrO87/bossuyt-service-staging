/**
 * orderDayByClock — de volgorde van een dag volgt de klok.
 *
 * Deze tests staan er omdat een technieker meldde dat een bon die hij op 14:00
 * had vastgezet bovenaan bleef staan, met een bon van 08:30 eronder en de
 * pauze ertussen. De dag liep achteruit. Elke test hieronder legt één regel
 * vast waarmee dat niet meer kan.
 */
import { describe, expect, it } from 'vitest'
import {
  BREAK_TARGET_MINUTES,
  breakBeforeIndexFor,
  orderDayByClock,
} from '@/lib/planning/dayOrder'
import type { ScheduleJob, TravelLookup } from '@/lib/planning/daySchedule'

const HOME = { lat: 50.8582720, lon: 3.2584752 }
const A = { lat: 51.1307205, lon: 4.4779880 }
const B = { lat: 50.8279, lon: 3.2646 }

/** Vaste rijtijden: deze tests gaan over volgorde, niet over routering. */
const travel: TravelLookup = (from, to) => {
  if (!from || !to) return null
  if (from.lat === to.lat && from.lon === to.lon) return 0
  return 30
}

function dag(jobs: ScheduleJob[], breakTargetMinutes?: number) {
  return orderDayByClock({
    jobs,
    departureMinutes: 7 * 60,
    origin: HOME,
    travelBetween: travel,
    breakMinutes: 30,
    breakTargetMinutes,
  })
}

const uur = (h: number, m = 0) => h * 60 + m

describe('breakBeforeIndexFor', () => {
  it('legt de pauze vóór de eerste job die op of na het pauze-uur begint', () => {
    expect(breakBeforeIndexFor([uur(8), uur(10), uur(13), uur(15)])).toBe(2)
  })

  it('pauzeert nooit vóór de eerste job van de dag', () => {
    // Zelfs als je pas om 14:00 begint: dan begin je later, je pauzeert niet.
    expect(breakBeforeIndexFor([uur(14), uur(16)])).toBe(1)
  })

  it('zet de pauze achteraan als het werk vóór de middag op is', () => {
    // De middagpauze telt altijd mee: je bent pas thuis na de pauze en de rit.
    expect(breakBeforeIndexFor([uur(7), uur(9), uur(11)])).toBe(3)
  })

  it('geeft geen pauze op een dag zonder werk', () => {
    expect(breakBeforeIndexFor([])).toBe(-1)
  })

  it('gebruikt de middag als standaard', () => {
    expect(BREAK_TARGET_MINUTES).toBe(uur(12))
  })
})

describe('orderDayByClock', () => {
  it('laat een dag zonder vaste uren staan zoals hij staat', () => {
    const { order } = dag([
      { id: 'a', at: A, estimatedMinutes: 90 },
      { id: 'b', at: B, estimatedMinutes: 90 },
      { id: 'c', at: A, estimatedMinutes: 90 },
    ])
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('zet een bon met een vroeg uur vooraan, ook als hij achteraan stond', () => {
    // Dit is de gemelde bon: 14:00 stond boven 08:30.
    const { order } = dag([
      { id: 'laat', at: A, estimatedMinutes: 90, startMinutes: uur(14) },
      { id: 'vroeg', at: B, estimatedMinutes: 90, startMinutes: uur(8, 30) },
    ])
    expect(order).toEqual(['vroeg', 'laat'])
  })

  it('laat de klok nooit achteruit lopen', () => {
    const { order } = dag([
      { id: 'middag', at: A, estimatedMinutes: 60, startMinutes: uur(13) },
      { id: 'ochtend', at: B, estimatedMinutes: 60, startMinutes: uur(9) },
      { id: 'avond', at: A, estimatedMinutes: 60, startMinutes: uur(16) },
    ])
    expect(order).toEqual(['ochtend', 'middag', 'avond'])
  })

  it('schuift bonnen zonder uur rond de vastgezette bonnen, met hun volgorde intact', () => {
    const { order } = dag([
      { id: 'vrij-1', at: A, estimatedMinutes: 60 },
      { id: 'vrij-2', at: B, estimatedMinutes: 60 },
      { id: 'vast-vroeg', at: A, estimatedMinutes: 60, startMinutes: uur(7, 30) },
    ])
    // De vastgezette bon van 07:30 kan alleen vooraan; de twee vrije bonnen
    // houden onderling hun volgorde.
    expect(order).toEqual(['vast-vroeg', 'vrij-1', 'vrij-2'])
  })

  it('legt de pauze rond de middag en niet in het midden van de lijst', () => {
    // Vijf korte jobs: het oude midden was index 2. Met vertrek om 07:00,
    // 30 min rijden en 60 min werk begint job 4 (index 3) om 12:30.
    // Om en om A en B, zodat er echt 30 minuten tussen elke job gereden wordt.
    // Alles op één plek zetten maakt de rijtijd nul, en dan is de dag al om
    // half twaalf gedaan — dan hoort er terecht géén middagpauze in.
    const jobs: ScheduleJob[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
      id, at: i % 2 === 0 ? A : B, estimatedMinutes: 60,
    }))
    const { breakBefore } = dag(jobs)
    expect(breakBefore).not.toBe(2)
    expect(breakBefore).toBeGreaterThan(2)
  })

  it('verschuift de pauze niet wanneer er een job bij komt', () => {
    const basis: ScheduleJob[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id, at: i % 2 === 0 ? A : B, estimatedMinutes: 60,
    }))
    const eerst = dag(basis).breakBefore
    expect(eerst).toBeGreaterThan(0)   // anders bewijst deze test niets
    // Een extra job achteraan verandert niets aan wanneer het middag wordt.
    const daarna = dag([...basis, { id: 'e', at: B, estimatedMinutes: 60 }]).breakBefore
    expect(daarna).toBe(eerst)
  })

  it('telt de pauze ook mee op een dag met één job', () => {
    // Eén job van 07:30 tot 08:30: de pauze komt achter die job, want ze telt
    // hoe dan ook mee. Achteraan is index 1, want er is één job.
    expect(dag([{ id: 'a', at: A, estimatedMinutes: 60 }]).breakBefore).toBe(1)
  })

  it('geeft geen pauze op een lege dag', () => {
    expect(dag([]).breakBefore).toBe(-1)
  })

  it('blijft een antwoord geven als twee vaste uren elkaar tegenspreken', () => {
    // Twee bonnen die allebei om 09:00 moeten beginnen, ver uit elkaar: dat
    // kan niet. De berekening mag daar niet op blijven hangen.
    const { order } = dag([
      { id: 'x', at: A, estimatedMinutes: 120, startMinutes: uur(9) },
      { id: 'y', at: B, estimatedMinutes: 120, startMinutes: uur(9) },
    ])
    expect(order).toHaveLength(2)
    expect([...order].sort()).toEqual(['x', 'y'])
  })
})

/**
 * De uren vormen het skelet, de rest vult de gaten.
 *
 * Dit sorteerde vroeger alles op het berekende startuur, en dat gaf een bon
 * zónder uur automatisch de eerste plaats: zonder uur rekent de motor je zo
 * vroeg mogelijk in. Eén bon waar nog geen uur van bekend was, duwde zo alle
 * afspraken van de dag naar achteren.
 */
describe('orderDayByClock: uren bepalen de dag', () => {
  it('laat een bon zonder uur een vroeger uur niet wegduwen', () => {
    // Zonder deze regel kwam 'vrij' vooraan en schoof 'negen' naar later.
    const { order } = dag([
      { id: 'vrij',  at: A, estimatedMinutes: 90 },
      { id: 'negen', at: B, estimatedMinutes: 60, startMinutes: uur(9) },
    ])
    expect(order[0]).toBe('negen')
  })

  it('zet de uren op volgorde van de klok, ongeacht hoe ze binnenkwamen', () => {
    const { order } = dag([
      { id: 'laat',    at: A, estimatedMinutes: 30, startMinutes: uur(14) },
      { id: 'vroeg',   at: B, estimatedMinutes: 30, startMinutes: uur(8) },
      { id: 'middag',  at: A, estimatedMinutes: 30, startMinutes: uur(11) },
    ])
    expect(order).toEqual(['vroeg', 'middag', 'laat'])
  })

  it('schuift een bon zonder uur in een gat waar hij past', () => {
    // 08:00–08:30, dan een gat tot 13:00. De vrije bon duurt 90 minuten en
    // past dus niet meer vóór acht uur — daar is maar een half uur, tussen
    // aankomst om 07:30 en het uur van 'ochtend'. In het gat erna past hij wel.
    const { order } = dag([
      { id: 'ochtend', at: A, estimatedMinutes: 30, startMinutes: uur(8) },
      { id: 'namiddag', at: A, estimatedMinutes: 30, startMinutes: uur(13) },
      { id: 'vrij', at: A, estimatedMinutes: 90 },
    ])
    expect(order).toEqual(['ochtend', 'vrij', 'namiddag'])
  })

  it('vult de dag van voren op wanneer dat kan', () => {
    // Past een vrije bon nog vóór het eerste vaste uur, dan hoort hij daar:
    // een technieker die om 07:30 ter plaatse kan zijn, hoort niet te wachten.
    const { order } = dag([
      { id: 'acht', at: A, estimatedMinutes: 30, startMinutes: uur(8) },
      { id: 'vrij', at: A, estimatedMinutes: 30 },
    ])
    expect(order).toEqual(['vrij', 'acht'])
  })

  it('zet een bon die nergens tussen past achteraan', () => {
    // Twee uren die vlak op elkaar volgen: er is geen gat van 90 minuten, dus
    // de vrije bon kan alleen nog achteraan zonder iets te verschuiven.
    const { order } = dag([
      { id: 'acht',  at: A, estimatedMinutes: 30, startMinutes: uur(8) },
      { id: 'negen', at: A, estimatedMinutes: 30, startMinutes: uur(9) },
      { id: 'vrij',  at: A, estimatedMinutes: 90 },
    ])
    expect(order).toEqual(['acht', 'negen', 'vrij'])
  })

  it('houdt de onderlinge volgorde van bonnen zonder uur', () => {
    // Zonder vaste uren valt er niets te schikken; dan telt alleen dat de
    // lijst blijft staan zoals hij stond. Dit ging ooit mis en draaide om.
    const { order } = dag(
      ['a', 'b', 'c', 'd'].map((id, i) => ({
        id, at: i % 2 === 0 ? A : B, estimatedMinutes: 45,
      })),
    )
    expect(order).toEqual(['a', 'b', 'c', 'd'])
  })
})
