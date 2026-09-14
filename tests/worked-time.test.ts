/**
 * Gewerkte tijd volgt de dagklok, niet de wandklok.
 *
 * De gemelde fout: de widget zei "16u" terwijl er niets gewerkt was. Ze rekende
 * `nu − het ingestelde startuur`, dus 's avonds om elf uur stond er zestien uur,
 * en één minuut na middernacht zeventien — want dan telde ze er een hele dag bij
 * op om over middernacht te kunnen rekenen.
 *
 * De testomgeving draait op UTC (zie tests/setup.ts), dus de uren hieronder
 * zijn UTC-uren.
 */
import { describe, expect, it } from 'vitest'
import { workedToday } from '@/lib/planning/workedTime'

const PAUZE = 30
const op = (hhmm: string) => new Date(`2026-09-14T${hhmm}:00.000Z`)

describe('workedToday', () => {
  it('geeft niets zolang er niet vertrokken is', () => {
    // Dit is het gemelde geval: geen vertrek, dus geen gewerkte tijd — en
    // zeker geen zestien uur.
    expect(workedToday({
      startedAt: null,
      endedAt: null,
      now: op('23:59'),
      breakMinutes: PAUZE,
    })).toBeNull()
  })

  it('telt een afgesloten dag van vertrek tot thuiskomst, pauze eraf', () => {
    // 07:12 → 16:43 is 9u31; min een half uur pauze is 9u01.
    expect(workedToday({
      startedAt: '2026-09-14T07:12:00.000Z',
      endedAt: '2026-09-14T16:43:00.000Z',
      now: op('20:00'),
      breakMinutes: PAUZE,
    })).toEqual({ minutes: 9 * 60 + 1, running: false })
  })

  it('telt de pauze ook mee als het werk vóór de middag op was', () => {
    // 07:00 → 10:00 is drie uur; de middagpauze telt altijd mee, dus 2u30.
    expect(workedToday({
      startedAt: '2026-09-14T07:00:00.000Z',
      endedAt: '2026-09-14T10:00:00.000Z',
      now: op('20:00'),
      breakMinutes: PAUZE,
    })).toEqual({ minutes: 2 * 60 + 30, running: false })
  })

  it('trekt de pauze nog niet af van een lopende ochtend', () => {
    // Om half elf heb je nog niet geluncht: 07:00 → 10:30 is 3u30, en dat is
    // ook wat er staat.
    expect(workedToday({
      startedAt: '2026-09-14T07:00:00.000Z',
      endedAt: null,
      now: op('10:30'),
      breakMinutes: PAUZE,
    })).toEqual({ minutes: 3 * 60 + 30, running: true })
  })

  it('trekt de pauze wél af zodra de middag voorbij is', () => {
    // 07:00 → 14:00 is zeven uur; na de middag komt de pauze eraf: 6u30.
    expect(workedToday({
      startedAt: '2026-09-14T07:00:00.000Z',
      endedAt: null,
      now: op('14:00'),
      breakMinutes: PAUZE,
    })).toEqual({ minutes: 6 * 60 + 30, running: true })
  })

  it('telt nooit door na de thuiskomst', () => {
    // Een afgesloten dag staat stil, ook als je er 's avonds nog naar kijkt.
    const vroeg = workedToday({
      startedAt: '2026-09-14T07:00:00.000Z',
      endedAt: '2026-09-14T16:00:00.000Z',
      now: op('16:05'),
      breakMinutes: PAUZE,
    })
    const laat = workedToday({
      startedAt: '2026-09-14T07:00:00.000Z',
      endedAt: '2026-09-14T16:00:00.000Z',
      now: op('23:59'),
      breakMinutes: PAUZE,
    })
    expect(vroeg).toEqual(laat)
    expect(laat).toEqual({ minutes: 8 * 60 + 30, running: false })
  })

  it('geeft nul en geen negatief getal bij een vertrek in de toekomst', () => {
    expect(workedToday({
      startedAt: '2026-09-14T09:00:00.000Z',
      endedAt: null,
      now: op('08:00'),
      breakMinutes: PAUZE,
    })).toEqual({ minutes: 0, running: true })
  })

  it('geeft niets bij een onleesbaar vertrekuur', () => {
    expect(workedToday({
      startedAt: 'vanmorgen vroeg',
      endedAt: null,
      now: op('12:00'),
      breakMinutes: PAUZE,
    })).toBeNull()
  })
})
