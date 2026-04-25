/**
 * app/api/route/daily/route.ts — Full day route
 *
 * POST /api/route/daily
 * Body: { stops: Array<{ lat: number; lon: number }> }
 *
 * Returns the travel time between each consecutive pair of stops.
 * Example: 4 stops → 3 steps (0→1, 1→2, 2→3)
 *
 * Uses the matrix API which fetches all pairs in one ORS call
 * instead of making N separate requests — much faster.
 */

import { NextRequest, NextResponse } from 'next/server'
import { OrsRoutingService } from '@/lib/routing/OrsRoutingService'
import { geocodeSearchQuery } from '@/lib/routing/NominatimGeocoder'
import type { Coordinates } from '@/lib/routing/IRoutingService'

const routingService = new OrsRoutingService(
  process.env.ORS_API_KEY ?? ''
)

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
    return NextResponse.json({ steps: [] })
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

  // Dev fallback: return mock travel times when no ORS key
  if (!process.env.ORS_API_KEY) {
    const steps = resolvedStops.slice(0, -1).map(() => ({
      distanceKm: 0,
      travelMinutes: 0,
      provider: 'mock',
    }))
    return NextResponse.json({ steps })
  }

  try {
    const matrix = await routingService.getRouteMatrix(resolvedStops)
    // From the full N×N matrix, only keep consecutive pairs
    const steps = resolvedStops.slice(0, -1).map((_, i) => matrix[i][i + 1])
    return NextResponse.json({ steps })
  } catch (err) {
    console.error('[route/daily] ORS error:', err)
    return NextResponse.json({ error: 'Routing mislukt' }, { status: 502 })
  }
}
