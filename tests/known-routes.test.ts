/**
 * Pinned drives — the roads somebody knows better than a formula does.
 *
 * Atelier ⇄ thuis bookends most days, so an estimate that is twenty minutes out
 * is twenty minutes out twice. Measured at 1u30; the generic estimate says
 * 1u41. Close enough to look right, wrong enough to matter.
 */
import { describe, expect, it } from 'vitest'
import { ATELIER_KUURNE, THUIS_KONTICH, knownRoute } from '@/lib/routing/knownRoutes'
import { estimateTravel } from '@/lib/routing/estimateTravel'

describe('knownRoute', () => {
  it('knows the atelier to home at an hour and a half', () => {
    expect(knownRoute(ATELIER_KUURNE, THUIS_KONTICH)).toEqual({
      minutes: 90,
      km: 110,
      provider: 'estimate',
    })
  })

  it('knows the way back too', () => {
    // Not symmetric by assumption — both directions are pinned explicitly, so a
    // road that really is slower one way can say so later.
    expect(knownRoute(THUIS_KONTICH, ATELIER_KUURNE)?.minutes).toBe(90)
  })

  it('has nothing to say about a road nobody pinned', () => {
    const gent = { lat: 51.0543, lon: 3.7174 }
    expect(knownRoute(ATELIER_KUURNE, gent)).toBeNull()
  })

  it('is closer to the truth than the generic estimate', () => {
    // The reason this table exists at all.
    const pinned = knownRoute(ATELIER_KUURNE, THUIS_KONTICH)!
    const guessed = estimateTravel(ATELIER_KUURNE, THUIS_KONTICH)!

    expect(pinned.minutes).toBe(90)
    expect(guessed.minutes).toBeGreaterThan(pinned.minutes)
  })

  it('tolerates the coordinates arriving with more decimals', () => {
    // Settings and the database round differently; the lookup rounds both.
    const wobbled = { lat: 50.85827204, lon: 3.25847518 }
    expect(knownRoute(wobbled, THUIS_KONTICH)?.minutes).toBe(90)
  })
})
