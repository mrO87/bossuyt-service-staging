/**
 * De zeven dagen van de week waarin een datum valt.
 *
 * Maandag eerst, want dat is hoe het rooster loopt en hoe een planner ernaar
 * kijkt. JavaScript telt de week vanaf zondag, en dat verschil van één dag is
 * precies het soort fout dat pas opvalt als iemand op zondag werkt.
 */
import { describe, expect, it } from 'vitest'
import { shiftDateStr, toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'

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

/**
 * Een datum zeven dagen op- of afschuiven.
 *
 * De weekranden doen niets anders dan dit, en het is precies het soort rekenwerk
 * waar maand- en jaargrenzen fout gaan. Date doet die overloop zelf, mits je
 * hem op de middag zet — zie de toelichting bij shiftDateStr.
 */
describe('shiftDateStr', () => {
  it('schuift een week vooruit en achteruit', () => {
    expect(shiftDateStr('2026-09-13', 7)).toBe('2026-09-20')
    expect(shiftDateStr('2026-09-13', -7)).toBe('2026-09-06')
  })

  it('loopt over een maandgrens', () => {
    expect(shiftDateStr('2026-09-28', 7)).toBe('2026-10-05')
    expect(shiftDateStr('2026-10-03', -7)).toBe('2026-09-26')
  })

  it('loopt over een jaargrens', () => {
    expect(shiftDateStr('2026-12-29', 7)).toBe('2027-01-05')
    expect(shiftDateStr('2027-01-02', -7)).toBe('2026-12-26')
  })

  it('overleeft de sprong naar zomertijd', () => {
    // In België gaat de klok vooruit in de nacht van 28 op 29 maart 2026. Een
    // datum op middernacht kan daardoor in de vorige dag vallen; op de middag
    // niet. Dit is de test die dat vastpint.
    expect(shiftDateStr('2026-03-25', 7)).toBe('2026-04-01')
    expect(shiftDateStr('2026-04-01', -7)).toBe('2026-03-25')
  })

  it('laat de datum met rust bij nul dagen', () => {
    expect(shiftDateStr('2026-09-13', 0)).toBe('2026-09-13')
  })
})
