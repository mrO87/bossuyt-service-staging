/**
 * splitCity / houseNumber — reading an address as it actually arrives.
 *
 * The case that prompted this: "Prinsbouwdewijnlaan 20, 2600 BERCHEM
 * (ANTWERPEN)" geocoded to nothing, so the work order had no coordinates and
 * its travel legs showed "? min". Two separate problems in one line — a town
 * field carrying a postal code and a province, and a street read wrong by OCR.
 * This handles the first; StreetCorrector handles the second.
 */
import { describe, expect, it } from 'vitest'
import { houseNumber, splitCity } from '@/lib/routing/addressParts'

describe('splitCity', () => {
  it('separates a postal code from the town', () => {
    expect(splitCity('2520 Broechem')).toEqual({ postalCode: '2520', city: 'Broechem' })
  })

  it('drops a province in brackets', () => {
    expect(splitCity('2600 BERCHEM (ANTWERPEN)')).toEqual({
      postalCode: '2600',
      city: 'BERCHEM',
    })
  })

  it('copes with a town on its own', () => {
    expect(splitCity('Gent')).toEqual({ postalCode: undefined, city: 'Gent' })
  })

  it('leaves a town whose name contains digits alone', () => {
    // Not a postal code unless it is four digits at the front.
    expect(splitCity('Sint-Job-in-t-Goor').city).toBe('Sint-Job-in-t-Goor')
    expect(splitCity('12 Apostelenstraat').postalCode).toBeUndefined()
  })

  it('never returns an empty town', () => {
    // A postal code with nothing after it is better kept whole than blanked,
    // since something is still more use to a geocoder than nothing.
    expect(splitCity('2600').city).toBe('2600')
    expect(splitCity('  ').city).toBe('')
  })

  it('tolerates extra whitespace', () => {
    expect(splitCity('  2520   Broechem  ')).toEqual({ postalCode: '2520', city: 'Broechem' })
  })
})

describe('houseNumber', () => {
  it('finds a plain number', () => {
    expect(houseNumber('Van den nestlaan 132')).toBe('132')
  })

  it('finds a number with a letter', () => {
    expect(houseNumber('Noordlaan 19A')).toBe('19A')
  })

  it('returns nothing when there is no number', () => {
    expect(houseNumber('Grote Markt')).toBe('')
  })
})
