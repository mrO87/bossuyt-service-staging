/**
 * The travel cache — why the routing service gets asked so rarely.
 *
 * A matrix request over N stops answers for all N×N pairs, but only the N−1
 * consecutive ones were ever kept; the rest was thrown away and asked for again
 * the moment anything moved. Reordering a day therefore cost a request per
 * drag, which is how a day's quota disappeared in an afternoon.
 *
 * Keeping every pair instead means one request covers *every* order of those
 * stops. Shuffling is then free, which is exactly when a technician shuffles
 * most.
 */
import { describe, expect, it } from 'vitest'
import {
  CACHE_MAX_AGE_MS,
  type CachedLeg,
  legKey,
  missingPairs,
  pairsFromMatrix,
  readFresh,
} from '@/lib/routing/travelCache'

const A = { lat: 50.8582720, lon: 3.2584752 }
const B = { lat: 51.1307205, lon: 4.4779880 }
const C = { lat: 51.0543000, lon: 3.7174000 }

const NOW = Date.parse('2026-09-14T09:00:00.000Z')

function leg(minutes: number, fetchedAt = NOW): CachedLeg {
  return { minutes, km: minutes, provider: 'ors', fetchedAt }
}

describe('legKey', () => {
  it('is the same for the same two points', () => {
    expect(legKey(A, B)).toBe(legKey(A, B))
  })

  it('is direction-sensitive, because driving there is not driving back', () => {
    // One-way streets and motorway junctions are not symmetric. ORS answers
    // both directions in the same matrix anyway, so there is nothing to save
    // by pretending they are equal.
    expect(legKey(A, B)).not.toBe(legKey(B, A))
  })

  it('rounds to about a metre, so sub-metre noise usually collides', () => {
    // "Usually", not "always": rounding has boundaries, and a pair straddling
    // one lands in two cells. That costs an extra lookup and nothing else — a
    // miss re-fetches, where a false hit would hand back the wrong drive. The
    // safe side of the trade is the one we are on.
    const noisy = { lat: 50.858271999, lon: 3.258475201 }
    expect(legKey(noisy, B)).toBe(legKey({ lat: 50.858272, lon: 3.2584752 }, B))
  })

  it('does separate genuinely different addresses', () => {
    const downTheRoad = { lat: A.lat + 0.005, lon: A.lon }   // ~550 m
    expect(legKey(downTheRoad, B)).not.toBe(legKey(A, B))
  })
})

describe('readFresh', () => {
  const cache = new Map<string, CachedLeg>([[legKey(A, B), leg(70)]])

  it('returns an entry that is still young enough', () => {
    expect(readFresh(cache, A, B, NOW)?.minutes).toBe(70)
  })

  it('returns nothing for a pair it has never seen', () => {
    expect(readFresh(cache, A, C, NOW)).toBeNull()
  })

  it('keeps an entry for seven days', () => {
    const almost = NOW + CACHE_MAX_AGE_MS - 1000
    expect(readFresh(cache, A, B, almost)?.minutes).toBe(70)
  })

  it('drops an entry once it is older than that', () => {
    // Roads change, roadworks come and go. Seven days is long enough that a
    // week of dragging costs nothing and short enough to stay believable.
    const stale = NOW + CACHE_MAX_AGE_MS + 1000
    expect(readFresh(cache, A, B, stale)).toBeNull()
  })
})

describe('missingPairs', () => {
  it('is empty when every leg is already known', () => {
    const cache = new Map<string, CachedLeg>([
      [legKey(A, B), leg(70)],
      [legKey(B, C), leg(40)],
    ])

    expect(missingPairs(cache, [[A, B], [B, C]], NOW)).toEqual([])
  })

  it('names only the legs it has to ask about', () => {
    const cache = new Map<string, CachedLeg>([[legKey(A, B), leg(70)]])

    const missing = missingPairs(cache, [[A, B], [B, C]], NOW)

    expect(missing).toHaveLength(1)
    expect(legKey(missing[0][0], missing[0][1])).toBe(legKey(B, C))
  })

  it('counts a stale leg as missing', () => {
    const cache = new Map<string, CachedLeg>([[legKey(A, B), leg(70)]])
    const stale = NOW + CACHE_MAX_AGE_MS + 1000

    expect(missingPairs(cache, [[A, B]], stale)).toHaveLength(1)
  })

  it('asks for a pair only once even when the route repeats it', () => {
    const empty = new Map<string, CachedLeg>()
    expect(missingPairs(empty, [[A, B], [A, B]], NOW)).toHaveLength(1)
  })
})

describe('pairsFromMatrix', () => {
  const stops = [A, B, C]
  const matrix = [
    [{ minutes: 0, km: 0 },  { minutes: 70, km: 110 }, { minutes: 40, km: 50 }],
    [{ minutes: 72, km: 111 }, { minutes: 0, km: 0 },  { minutes: 45, km: 60 }],
    [{ minutes: 41, km: 51 }, { minutes: 44, km: 59 }, { minutes: 0, km: 0 }],
  ]

  it('keeps every pair, not only the consecutive ones', () => {
    // The whole saving. Nine cells in, nine entries out — after which any order
    // of these three stops is already answered.
    const entries = pairsFromMatrix(stops, matrix, 'ors', NOW)
    expect(entries.size).toBe(9)
  })

  it('stores what the matrix said, in both directions', () => {
    const entries = pairsFromMatrix(stops, matrix, 'ors', NOW)

    expect(entries.get(legKey(A, B))?.minutes).toBe(70)
    expect(entries.get(legKey(B, A))?.minutes).toBe(72)
    expect(entries.get(legKey(A, A))?.minutes).toBe(0)
  })

  it('stamps every entry so it can expire', () => {
    const entries = pairsFromMatrix(stops, matrix, 'ors', NOW)
    for (const entry of entries.values()) {
      expect(entry.fetchedAt).toBe(NOW)
      expect(entry.provider).toBe('ors')
    }
  })

  it('survives a ragged matrix rather than throwing', () => {
    // A quota error used to arrive here as undefined and take the route down.
    const ragged = [[{ minutes: 0, km: 0 }]]
    expect(() => pairsFromMatrix(stops, ragged, 'ors', NOW)).not.toThrow()
    expect(pairsFromMatrix(stops, ragged, 'ors', NOW).size).toBe(1)
  })
})
