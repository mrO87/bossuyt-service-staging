/**
 * app/api/route/route.ts — Routing API endpoint
 *
 * This is a Next.js Route Handler (App Router).
 * It sits between the Service App and ORS/TomTom.
 *
 * Why a backend endpoint instead of calling ORS directly from the browser?
 *   1. We keep the API key secret (never exposed to the client)
 *   2. We can swap ORS → TomTom without touching the Service App
 *   3. We can add caching or rate limiting here later
 *
 * Two routes in this file:
 *   POST /api/route         — single hop: from → to
 *   POST /api/route/daily   — full day: array of stops → sequential steps
 */

import { NextRequest, NextResponse } from 'next/server'
import { OrsRoutingService } from '@/lib/routing/OrsRoutingService'
// Fase 2: swap this import ↓ — nothing else changes
// import { TomTomRoutingService } from '@/lib/routing/TomTomRoutingService'

// The routing service is created once per server process
// It reads the API key from environment variables (never hardcoded)
const routingService = new OrsRoutingService(
  process.env.ORS_API_KEY ?? ''
)

// ---------- POST /api/route ----------
// Single hop: "how long from point A to point B?"
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    from: { lat: number; lon: number }
    to:   { lat: number; lon: number }
  }

  if (!body.from || !body.to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  // Skip ORS call if no API key configured yet (development)
  if (!process.env.ORS_API_KEY) {
    return NextResponse.json({
      distanceKm: 0,
      travelMinutes: 0,
      provider: 'mock',
    })
  }

  try {
    const result = await routingService.getETA(body.from, body.to)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[route] ORS error:', err)
    return NextResponse.json({ error: 'Routing mislukt' }, { status: 502 })
  }
}
