/**
 * Drives we know the real answer to, pinned by hand.
 *
 * The generic estimate works from a straight line and an average speed, which
 * is fine for a stranger's address and needlessly vague for a road somebody
 * drives every week. Kuurne to Kontich is the atelier to the technician's home:
 * it bookends most days as the start and the end of the route, so getting it
 * wrong is not one mistake in a day but two.
 *
 * Measured at an hour and a half. The estimate puts it at 1u41 — close enough
 * to be plausible, wrong enough to shift a day's total by twenty minutes.
 *
 * These never expire. A pinned drive is not a cached answer from a service that
 * might have improved; it is somebody saying how long the road actually takes.
 * Add to this table whenever a route is driven often enough that somebody knows
 * it better than a formula does.
 */
import { legKey } from './travelCache'
import type { Coordinates } from './IRoutingService'
import type { TravelLeg } from './estimateTravel'

export const ATELIER_KUURNE: Coordinates = { lat: 50.8582720, lon: 3.2584752 }
export const THUIS_KONTICH: Coordinates = { lat: 51.1307205, lon: 4.4779880 }

interface PinnedRoute {
  from: Coordinates
  to: Coordinates
  minutes: number
  km: number
}

const PINNED: PinnedRoute[] = [
  // Atelier ⇄ thuis. Both directions: the morning and the evening of most days.
  { from: ATELIER_KUURNE, to: THUIS_KONTICH, minutes: 90, km: 110 },
  { from: THUIS_KONTICH, to: ATELIER_KUURNE, minutes: 90, km: 110 },
]

const BY_KEY = new Map<string, TravelLeg>(
  PINNED.map(route => [
    legKey(route.from, route.to),
    { minutes: route.minutes, km: route.km, provider: 'estimate' as const },
  ]),
)

/**
 * A hand-measured drive for these two points, if there is one.
 *
 * Consulted after the routing service's own answers and before the generic
 * estimate: real data still wins, but a known road beats arithmetic.
 */
export function knownRoute(from: Coordinates, to: Coordinates): TravelLeg | null {
  return BY_KEY.get(legKey(from, to)) ?? null
}
