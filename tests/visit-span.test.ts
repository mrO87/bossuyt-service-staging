/**
 * Het werkelijke bezoek, voor de weekweergave.
 *
 * De gebruiker: "in het weekview zou ik de bonnen uitgerekt willen zien tot de
 * ingevulde tijd eens ze afgewerkt zijn." Deze tests leggen vast wanneer dat
 * wél en wanneer dat níét gebeurt — want een half ingevuld bezoek mag geen
 * verzonnen duur op de week zetten.
 *
 * De testomgeving draait op UTC (zie tests/setup.ts), dus de uren hieronder
 * zijn UTC-uren.
 */
import { describe, expect, it } from 'vitest'
import { actualVisitSpan } from '@/lib/planning/visitSpan'
import type { Intervention } from '@/types'

const bon = (over: Partial<Intervention>) => ({
  status: 'afgewerkt' as const,
  arrivalTime: '2026-09-14T08:30:00.000Z',
  departureTime: '2026-09-14T11:45:00.000Z',
  ...over,
})

describe('actualVisitSpan', () => {
  it('geeft het aankomstuur en de echte duur van een afgewerkte bon', () => {
    expect(actualVisitSpan(bon({}))).toEqual({
      startMinutes: 8 * 60 + 30,
      minutes: 3 * 60 + 15,
    })
  })

  it('geeft niets zolang de bon niet afgewerkt is', () => {
    // Nog bezig: het vertrekuur dat er staat is dan niet het einde.
    expect(actualVisitSpan(bon({ status: 'bezig' }))).toBeNull()
    expect(actualVisitSpan(bon({ status: 'gepland' }))).toBeNull()
  })

  it('geeft niets met alleen een aankomstuur', () => {
    expect(actualVisitSpan(bon({ departureTime: undefined }))).toBeNull()
    expect(actualVisitSpan(bon({ arrivalTime: undefined }))).toBeNull()
  })

  it('geeft niets wanneer het vertrek niet ná de aankomst ligt', () => {
    // Een vertikking, of een bezoek over middernacht. Allebei geven ze een
    // onbruikbare duur, en dan is de raming beter dan een verzonnen balk.
    expect(actualVisitSpan(bon({ departureTime: '2026-09-14T08:30:00.000Z' }))).toBeNull()
    expect(actualVisitSpan(bon({ departureTime: '2026-09-14T07:00:00.000Z' }))).toBeNull()
  })

  it('geeft niets bij een onleesbaar uur', () => {
    expect(actualVisitSpan(bon({ arrivalTime: 'gisteren rond acht uur' }))).toBeNull()
  })

  it('rekent een bezoek van een kwartier ook mee', () => {
    // Kort is niet hetzelfde als leeg: een controle van een kwartier is een
    // echt bezoek en hoort op de week te staan zoals het geweest is.
    const span = actualVisitSpan(bon({ departureTime: '2026-09-14T08:45:00.000Z' }))
    expect(span).toEqual({ startMinutes: 8 * 60 + 30, minutes: 15 })
  })
})
