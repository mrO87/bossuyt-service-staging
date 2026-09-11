/**
 * Travel times worked out from coordinates, for when the routing service
 * cannot answer — no key, no quota left, no signal.
 *
 * It replaces mockTravel, which hashed the two work order ids into
 * `10 + (h % 35)` minutes. That had no idea where anything was: two work orders
 * at one address were charged ten to forty-four minutes of driving, and zero
 * was not reachable at all. A day total built on it was fiction.
 *
 * This is still an estimate and says so through `provider: 'estimate'`, but it
 * is an estimate of something real: the distance between two points, driven at
 * a speed that depends on how far it is. The screen can be honest about it.
 */
import type { Coordinates } from './IRoutingService'

/**
 * What the timeline draws on a travel segment. Deliberately not RouteResult:
 * that is the routing service's wire shape (distanceKm/travelMinutes), while
 * this is what a segment on screen needs, and `provider` says where it came
 * from so the day summary can admit when the numbers are guesses.
 */
export interface TravelLeg {
  minutes: number
  km: number
  provider: 'ors' | 'estimate'
}

/** Roads are not straight. Regional Flanders sits near 1.3× the crow's flight. */
const DETOUR_FACTOR = 1.3

/** Below this, the two stops are the same place and there is nothing to drive. */
const SAME_PLACE_KM = 0.05

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance in kilometres. */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.lat - from.lat)
  const dLon = toRadians(to.lon - from.lon)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Average speed for a drive of this length.
 *
 * Short trips are slow — junctions, town centres, finding the building. Long
 * ones spend most of their distance on a motorway. A single average would
 * overstate exactly the short hops a service technician makes most.
 */
function averageSpeedKmh(roadKm: number): number {
  if (roadKm < 2) return 25
  if (roadKm < 10) return 40
  if (roadKm < 30) return 55
  return 70
}

/**
 * Estimate the drive between two points.
 *
 * Returns null when either point is unknown. That is deliberate: a work order
 * whose address never geocoded should show as unknown rather than be given an
 * average, which is the habit this module exists to break.
 */
export function estimateTravel(
  from: Coordinates | undefined,
  to: Coordinates | undefined,
): TravelLeg | null {
  if (!from || !to) return null

  const straightKm = haversineKm(from, to)
  if (straightKm < SAME_PLACE_KM) {
    return { minutes: 0, km: 0, provider: 'estimate' }
  }

  const roadKm = straightKm * DETOUR_FACTOR
  const minutes = Math.max(1, Math.round((roadKm / averageSpeedKmh(roadKm)) * 60))

  return {
    minutes,
    km: Math.round(roadKm * 10) / 10,
    provider: 'estimate',
  }
}
