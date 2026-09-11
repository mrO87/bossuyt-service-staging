/**
 * Remembering how long it takes to drive from one point to another.
 *
 * The routing service answers a matrix request for every pair of stops it is
 * given, but only the consecutive ones were kept — the other 80% was discarded
 * and asked for again the moment anything moved. So reordering a day cost a
 * request per drag, and an afternoon of planning emptied the day's quota. It
 * did, this week: the key came back 403 "Quota exceeded".
 *
 * Keeping every pair turns that around. One request over the day's stops
 * answers for *every* possible order of them, so shuffling costs nothing —
 * which is precisely when a technician shuffles most.
 *
 * Pure on purpose: the storage behind it is a plain Map here, IndexedDB in the
 * browser, a process-wide Map on the server. The rules for what is fresh and
 * what still has to be asked live in one place and are tested without either.
 */
import type { Coordinates } from './IRoutingService'

/** How long a remembered drive stays believable. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Five decimals is about a metre — far finer than any address needs, so two
 * lookups of the same building almost always land on the same key.
 *
 * Almost: rounding has boundaries, and a coordinate sitting on one splits into
 * two keys. That is deliberately the harmless direction. A miss costs one extra
 * request; a key coarse enough to never miss would eventually merge two
 * neighbouring addresses and hand back the wrong drive.
 */
const KEY_PRECISION = 5

export interface CachedLeg {
  minutes: number
  km: number
  provider: 'ors' | 'estimate'
  fetchedAt: number
}

/** One cell of a routing matrix, before it is stamped and stored. */
export interface MatrixCell {
  minutes: number
  km: number
}

export type TravelCache = Map<string, CachedLeg>

function round(value: number): string {
  return value.toFixed(KEY_PRECISION)
}

/**
 * The cache key for driving from one point to another.
 *
 * Direction matters: one-way systems and motorway junctions are not symmetric,
 * and the matrix answers both directions anyway, so there is nothing to gain by
 * folding them together.
 */
export function legKey(from: Coordinates, to: Coordinates): string {
  return `${round(from.lat)},${round(from.lon)}>${round(to.lat)},${round(to.lon)}`
}

/** The remembered drive, if we have one and it has not gone stale. */
export function readFresh(
  cache: TravelCache,
  from: Coordinates,
  to: Coordinates,
  now: number = Date.now(),
): CachedLeg | null {
  const entry = cache.get(legKey(from, to))
  if (!entry) return null
  if (now - entry.fetchedAt > CACHE_MAX_AGE_MS) return null
  return entry
}

/**
 * Which of these drives we still have to ask about — each named once, however
 * often the route uses it.
 */
export function missingPairs(
  cache: TravelCache,
  pairs: Array<[Coordinates, Coordinates]>,
  now: number = Date.now(),
): Array<[Coordinates, Coordinates]> {
  const seen = new Set<string>()
  const missing: Array<[Coordinates, Coordinates]> = []

  for (const [from, to] of pairs) {
    const key = legKey(from, to)
    if (seen.has(key)) continue
    seen.add(key)
    if (!readFresh(cache, from, to, now)) missing.push([from, to])
  }

  return missing
}

/**
 * Turn a whole routing matrix into cache entries — every cell, not just the
 * consecutive ones. This is where the saving actually happens.
 *
 * Tolerates a matrix that is shorter or narrower than the stop list. A routing
 * error used to arrive here as `undefined` and take the request down with it.
 */
export function pairsFromMatrix(
  stops: Coordinates[],
  matrix: MatrixCell[][],
  provider: 'ors' | 'estimate',
  now: number = Date.now(),
): TravelCache {
  const entries: TravelCache = new Map()

  for (let i = 0; i < stops.length; i++) {
    const row = matrix[i]
    if (!Array.isArray(row)) continue

    for (let j = 0; j < stops.length; j++) {
      const cell = row[j]
      if (!cell || typeof cell.minutes !== 'number') continue

      entries.set(legKey(stops[i], stops[j]), {
        minutes: cell.minutes,
        km: cell.km,
        provider,
        fetchedAt: now,
      })
    }
  }

  return entries
}

/** Fold newly fetched legs into a cache, newest winning. */
export function mergeIntoCache(cache: TravelCache, fresh: TravelCache): TravelCache {
  for (const [key, entry] of fresh) cache.set(key, entry)
  return cache
}

/** Drop everything past its seven days, so the store cannot grow forever. */
export function pruneCache(cache: TravelCache, now: number = Date.now()): TravelCache {
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt > CACHE_MAX_AGE_MS) cache.delete(key)
  }
  return cache
}
