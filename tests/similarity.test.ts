/**
 * Street name similarity — the gate on rewriting a customer's address.
 *
 * The postal code already keeps a correction inside the right town. This is the
 * second gate: a scanned street may only be overwritten when the proposal is
 * near enough to be the same street misread, not a different one nearby.
 */
import { describe, expect, it } from 'vitest'
import {
  STREET_MATCH_THRESHOLD,
  isCloseEnoughToCorrect,
  levenshtein,
  similarity,
} from '@/lib/routing/similarity'

describe('levenshtein', () => {
  it('is zero for identical text', () => {
    expect(levenshtein('kapelstraat', 'kapelstraat')).toBe(0)
  })

  it('counts a dropped letter as one', () => {
    expect(levenshtein('napelsstraat', 'napelstraat')).toBe(1)
  })

  it('handles an empty side', () => {
    expect(levenshtein('', 'meir')).toBe(4)
    expect(levenshtein('meir', '')).toBe(4)
  })

  it('is symmetric', () => {
    expect(levenshtein('kapelstraat', 'kasteelstraat'))
      .toBe(levenshtein('kasteelstraat', 'kapelstraat'))
  })
})

describe('similarity', () => {
  it('ignores case and punctuation', () => {
    expect(similarity('Van den nestlaan', 'Van Den Nestlaan')).toBe(1)
    expect(similarity("Sint-Job-in-'t-Goor", 'Sint Job in t Goor')).toBe(1)
  })

  it('ignores spacing, because OCR merges words as readily as it drops letters', () => {
    expect(similarity('Prins Boudewijnlaan', 'PrinsBoudewijnlaan')).toBe(1)
  })

  it('is zero against nothing', () => {
    expect(similarity('', 'Meir')).toBe(0)
  })
})

describe('isCloseEnoughToCorrect', () => {
  it('accepts the Berchem case — one dropped letter', () => {
    // The address that started this: Prinsbouwdewijnlaan for Prins
    // Boudewijnlaan. Same street, one stray letter from the scan.
    expect(similarity('Prinsbouwdewijnlaan', 'Prins Boudewijnlaan'))
      .toBeGreaterThan(STREET_MATCH_THRESHOLD)
    expect(isCloseEnoughToCorrect('Prinsbouwdewijnlaan', 'Prins Boudewijnlaan')).toBe(true)
  })

  it('accepts a single dropped letter', () => {
    expect(isCloseEnoughToCorrect('Napelstraat', 'Napelsstraat')).toBe(true)
  })

  it('refuses two genuinely different streets', () => {
    // Both real, both plausible, and swapping them puts a technician at the
    // wrong door. Refusing leaves the scanned text for a human to read.
    expect(isCloseEnoughToCorrect('Kapelstraat', 'Kasteelstraat')).toBe(false)
    expect(isCloseEnoughToCorrect('Meir', 'Melkmarkt')).toBe(false)
    expect(isCloseEnoughToCorrect('Noordlaan', 'Zuidlaan')).toBe(false)
  })

  it('refuses a short name whose one letter changed', () => {
    // On a short name a single letter is a large share of it, which is exactly
    // when a "correction" is most likely to be a different place.
    expect(isCloseEnoughToCorrect('Meir', 'Meer')).toBe(false)
  })

  it('sets the bar at nine tenths', () => {
    expect(STREET_MATCH_THRESHOLD).toBe(0.9)
  })
})
