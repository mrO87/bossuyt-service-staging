/**
 * Het vastgezette uur — de regels die client en server allebei moeten kennen.
 *
 * Deze module is klein met opzet. Ze bestaat omdat "op welk uur mag dit staan"
 * op twee plaatsen beantwoord wordt — het scherm bij het slepen, de server bij
 * het opslaan — en twee antwoorden vroeg of laat uit elkaar lopen. Zie de
 * splitsing die in v1.59 op `source` versus `plannedDate` misging.
 */
import { describe, expect, it } from 'vitest'
import {
  SNAP_MINUTES,
  conflictMessage,
  orderByHour,
  sanitizeStartMinutes,
  snapToStep,
} from '@/lib/planning/pinnedHour'

describe('snapToStep', () => {
  it('snaps to the nearest quarter of an hour', () => {
    expect(snapToStep(9 * 60 + 7)).toBe(9 * 60)
    expect(snapToStep(9 * 60 + 8)).toBe(9 * 60 + 15)
    expect(snapToStep(9 * 60 + 22)).toBe(9 * 60 + 15)
    expect(snapToStep(9 * 60 + 23)).toBe(9 * 60 + 30)
  })

  it('uses fifteen minutes, the step the prototype was tested with', () => {
    expect(SNAP_MINUTES).toBe(15)
  })

  it('never lands outside the day', () => {
    expect(snapToStep(-40)).toBe(0)
    expect(snapToStep(25 * 60)).toBe(24 * 60)
  })
})

describe('sanitizeStartMinutes', () => {
  it('keeps an hour on the step', () => {
    expect(sanitizeStartMinutes(9 * 60 + 15)).toBe(9 * 60 + 15)
  })

  it('reads no hour as no hour', () => {
    expect(sanitizeStartMinutes(null)).toBeNull()
    expect(sanitizeStartMinutes(undefined)).toBeNull()
  })

  it('refuses nonsense rather than storing it', () => {
    // Dit is de buitenrand van de app: een oude tab, een herspeelde
    // wachtrij-schrijfactie, iemand met curl. Niets hiervan mag als uur in de
    // database terechtkomen.
    expect(sanitizeStartMinutes('09:00')).toBeNull()
    expect(sanitizeStartMinutes(Number.NaN)).toBeNull()
    expect(sanitizeStartMinutes(Infinity)).toBeNull()
    expect(sanitizeStartMinutes(-1)).toBeNull()
    expect(sanitizeStartMinutes(24 * 60 + 1)).toBeNull()
  })

  it('rounds a fractional minute instead of dropping the hour', () => {
    // Een halve minuut komt uit een deling door de pixelhoogte, niet uit een
    // bedoeling. Weggooien zou het uur laten verdwijnen onder de vinger.
    expect(sanitizeStartMinutes(540.4)).toBe(540)
  })
})

describe('conflictMessage', () => {
  it('names the work order and all three ways out', () => {
    const message = conflictMessage('Jan Decan')
    expect(message).toContain('Jan Decan')
    expect(message).toContain('inkorten')
    expect(message).toContain('later')
    expect(message).toContain('vaste uur')
  })

  it('still reads as a sentence when the customer has no name', () => {
    expect(conflictMessage(undefined)).toContain('Deze werkbon')
  })
})

/**
 * De volgorde volgt het uur.
 *
 * Zonder dit duwt een bon die op een laat uur gezet wordt alles wat ná hem in
 * de lijst staat mee naar de avond — de rekenkern loopt de dag af in
 * lijstvolgorde, en die lijst zou dan niet meer op de klok lijken.
 */
describe('orderByHour', () => {
  const at = (id: string, start: number, length = 60) => ({
    id,
    startMinutes: start,
    endMinutes: start + length,
  })

  it('puts the day in the order the clock shows', () => {
    expect(orderByHour([at('c', 14 * 60), at('a', 8 * 60), at('b', 10 * 60)]))
      .toEqual(['a', 'b', 'c'])
  })

  it('sorts on the middle of a block, not its start', () => {
    // Een lange job die om 09:00 begint en een korte die om 09:30 begint: de
    // korte hoort ertussen te vallen waar hij ligt, niet erachter omdat hij
    // later begint. Dit is de regel uit het prototype (indexAt), die met de
    // vinger uitgetest is.
    expect(orderByHour([at('lang', 9 * 60, 240), at('kort', 9 * 60 + 30, 30)]))
      .toEqual(['kort', 'lang'])
  })

  it('leaves two blocks that lie identically in the order they already had', () => {
    // Gelijke uren mogen niet van plaats wisselen: dan zou een bon verspringen
    // door een herberekening die niets met hem te maken heeft.
    expect(orderByHour([at('eerste', 9 * 60), at('tweede', 9 * 60)]))
      .toEqual(['eerste', 'tweede'])
  })

  it('is empty for an empty day', () => {
    expect(orderByHour([])).toEqual([])
  })
})
