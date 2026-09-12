/**
 * The cache key for driving from one point to another.
 *
 * Split out from travelCache.ts so it has no dependency on anything else in
 * `lib/routing` — knownRoutes.ts needs it to build its pinned-route table, and
 * travelCache.ts needs knownRoutes.ts (for the shared resolveLeg chain), so
 * this had to live somewhere neither of them depends on to avoid a cycle that
 * breaks on their top-level constants.
 */
import type { Coordinates } from './IRoutingService'

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

function round(value: number): string {
  return value.toFixed(KEY_PRECISION)
}

/**
 * Direction matters: one-way systems and motorway junctions are not symmetric,
 * and a routing matrix answers both directions anyway, so there is nothing to
 * gain by folding them together.
 */
export function legKey(from: Coordinates, to: Coordinates): string {
  return `${round(from.lat)},${round(from.lon)}>${round(to.lat)},${round(to.lon)}`
}
