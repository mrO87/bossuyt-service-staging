/**
 * Week of weekend volgt de bezoekdatum.
 *
 * De gebruiker meldde dat die knop "altijd op weekend" stond. De oorzaak lag
 * niet bij de knop maar bij de bezoekdatum, die was blijven hangen op zondag
 * 13 september — de dag waarop hij de bon voor het eerst opende. De knop volgde
 * die datum keurig. Deze tests leggen vast dat de datum beslist, en wanneer een
 * eigen keuze daar toch bovenop gaat.
 */
import { describe, expect, it } from 'vitest'
import { kindForDate, resolveInterventionKind } from '@/lib/werkbon/interventionKind'

describe('kindForDate', () => {
  it('noemt een doordeweekse dag week', () => {
    expect(kindForDate('2026-09-14')).toBe('week')   // maandag
    expect(kindForDate('2026-09-18')).toBe('week')   // vrijdag
  })

  it('noemt zaterdag en zondag weekend', () => {
    expect(kindForDate('2026-09-19')).toBe('weekend') // zaterdag
    expect(kindForDate('2026-09-13')).toBe('weekend') // zondag — de gemelde dag
  })

  it('leest de dag op de middag en niet op middernacht', () => {
    // Op middernacht kan een uurverschil de datum in de vorige dag laten
    // vallen, en dan zou deze maandag als zondag gelden.
    expect(kindForDate('2026-09-14')).toBe('week')
  })
})

describe('resolveInterventionKind', () => {
  it('laat de datum beslissen zolang niemand de knop omzette', () => {
    // Dit is precies het gemelde geval: opgeslagen stond 'weekend', maar het
    // bezoek staat op een maandag.
    expect(resolveInterventionKind({
      visitDate: '2026-09-14',
      stored: 'weekend',
      manual: false,
    })).toBe('week')
  })

  it('houdt een eigen keuze vast', () => {
    // Een feestdag op een maandag, of nachtwerk dat als weekend telt.
    expect(resolveInterventionKind({
      visitDate: '2026-09-14',
      stored: 'weekend',
      manual: true,
    })).toBe('weekend')
  })

  it('houdt ook een eigen keuze de andere kant op vast', () => {
    expect(resolveInterventionKind({
      visitDate: '2026-09-13',
      stored: 'week',
      manual: true,
    })).toBe('week')
  })

  it('komt op hetzelfde uit wanneer de keuze met de datum overeenstemt', () => {
    expect(resolveInterventionKind({
      visitDate: '2026-09-13',
      stored: 'weekend',
      manual: false,
    })).toBe('weekend')
  })
})
