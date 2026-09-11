/**
 * POST /api/route/daily — travel times between the day's stops.
 *
 * Returns **every** pair of the stops it was given, not only the consecutive
 * ones. That is the whole point: a matrix request answers for all N×N pairs
 * anyway, and the previous version kept N−1 of them and threw the rest away.
 * Every reorder then had to ask again, so an afternoon of planning emptied the
 * daily quota — which is exactly what happened this week.
 *
 * With all pairs returned and cached, one request covers every possible order
 * of those stops, and shuffling costs nothing.
 *
 * Three layers, cheapest first:
 *   1. the process cache — already known, seven days old at most
 *   2. the routing service — one matrix call for whatever is left
 *   3. a coordinate-based estimate — when the service cannot answer
 */

import { NextRequest, NextResponse } from 'next/server'
import { OrsRoutingService } from '@/lib/routing/OrsRoutingService'
import { geocodeSearchQuery } from '@/lib/routing/NominatimGeocoder'
import { estimateTravel } from '@/lib/routing/estimateTravel'
import { knownRoute } from '@/lib/routing/knownRoutes'
import {
  legKey,
  mergeIntoCache,
  missingPairs,
  pairsFromMatrix,
  pruneCache,
  readFresh,
  type TravelCache,
} from '@/lib/routing/travelCache'
import type { Coordinates } from '@/lib/routing/IRoutingService'

const routingService = new OrsRoutingService(process.env.ORS_API_KEY ?? '')

/**
 * Shared by every technician hitting this container, which is the point: one
 * person opening their day warms the cache for the next. It is lost on restart,
 * and that is acceptable — the browser keeps its own copy too.
 */
const serverCache: TravelCache = new Map()

type Leg = {
  from: Coordinates
  to: Coordinates
  minutes: number
  km: number
  provider: 'ors' | 'estimate'
}

/** Every ordered pair of the stops, including a stop with itself. */
function allPairs(stops: Coordinates[]): Array<[Coordinates, Coordinates]> {
  const pairs: Array<[Coordinates, Coordinates]> = []
  for (const from of stops) {
    for (const to of stops) pairs.push([from, to])
  }
  return pairs
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    stops: Array<{ lat: number; lon: number }>
    startAddress?: string
    endAddress?: string
    sameAsStart?: boolean
    startFallback?: Coordinates
    endFallback?: Coordinates
  }

  if (!body.stops || body.stops.length < 2) {
    return NextResponse.json({ legs: [] })
  }

  const resolvedStops = [...body.stops]

  const resolveEndpoint = async (
    address?: string,
    fallback?: Coordinates,
  ): Promise<Coordinates> => {
    if (!address?.trim()) {
      if (fallback) return fallback
      throw new Error('Adres ontbreekt')
    }

    const geocoded = await geocodeSearchQuery(address)
    if (geocoded) return geocoded
    if (fallback) return fallback
    throw new Error(`Adres niet gevonden: ${address}`)
  }

  try {
    resolvedStops[0] = await resolveEndpoint(body.startAddress, body.startFallback)

    const lastIndex = resolvedStops.length - 1
    resolvedStops[lastIndex] = body.sameAsStart
      ? resolvedStops[0]
      : await resolveEndpoint(body.endAddress, body.endFallback)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Adres niet gevonden'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const now = Date.now()
  pruneCache(serverCache, now)

  // Only ask about what we do not already know.
  const outstanding = missingPairs(serverCache, allPairs(resolvedStops), now)

  if (outstanding.length > 0) {
    try {
      if (!process.env.ORS_API_KEY) throw new Error('Geen ORS-sleutel ingesteld')

      const matrix = await routingService.getRouteMatrix(resolvedStops)
      mergeIntoCache(
        serverCache,
        pairsFromMatrix(
          resolvedStops,
          matrix.map(row =>
            row.map(cell => ({ minutes: cell.travelMinutes, km: cell.distanceKm })),
          ),
          'ors',
          now,
        ),
      )
    } catch (err) {
      // Quota spent, key missing, service down — say so once and carry on with
      // estimates rather than failing the whole day view. Estimates are not
      // cached: they cost nothing to recompute, and caching them would keep a
      // guess around for a week after the service came back.
      console.warn('[route/daily] routing onbeschikbaar, val terug op schatting:',
        err instanceof Error ? err.message : err)
    }
  }

  const legs: Leg[] = []
  for (const [from, to] of allPairs(resolvedStops)) {
    const cached = readFresh(serverCache, from, to, now)
    if (cached) {
      legs.push({ from, to, minutes: cached.minutes, km: cached.km, provider: cached.provider })
      continue
    }

    // A road somebody has actually measured beats arithmetic over a straight
    // line — and the atelier/home leg bookends nearly every day.
    const fallback = knownRoute(from, to) ?? estimateTravel(from, to)
    if (fallback) {
      legs.push({ from, to, minutes: fallback.minutes, km: fallback.km, provider: 'estimate' })
    }
    // No coordinates, no estimate: the leg is left out and the client shows
    // that it does not know, rather than inventing a number.
  }

  return NextResponse.json({
    legs,
    // The start and end addresses are geocoded here, so the client cannot know
    // their coordinates on its own. Handing them back lets it look up its own
    // cache for those legs instead of asking again.
    stops: resolvedStops,
    cached: legs.length - outstanding.length,
    provider: legs.every(l => l.provider === 'ors')
      ? 'ors'
      : legs.every(l => l.provider === 'estimate')
        ? 'estimate'
        : 'mixed',
  })
}

/** Exported for tests — the key shape the client has to agree on. */
export { legKey }
