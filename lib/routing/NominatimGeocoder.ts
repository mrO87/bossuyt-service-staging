/**
 * NominatimGeocoder — free address-to-coordinates lookup via OpenStreetMap.
 *
 * No API key needed. Rate limit: max 1 request/second (Nominatim usage policy).
 * Used to convert Belgian street addresses into GPS coordinates that
 * ORS/TomTom can use for route calculations.
 */

import type { Coordinates } from './IRoutingService'

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

const geocodeCache = new Map<string, Promise<Coordinates | null>>()

function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/·/g, ', ')
    .replace(/\bte\b/gi, ' ')
    .replace(/\s+in\s+/gi, ' ')
    .replace(/\s+/g, ' ')
}

function buildCandidateQueries(query: string, country: string): string[] {
  const normalized = normalizeQuery(query)
  const variants = [
    `${query.trim()}, ${country}`,
    `${normalized}, ${country}`,
    `${normalized.replace(/\s+(\d+[A-Za-z/-]*)\s+/, ' $1, ')}, ${country}`,
    `${normalized.replace(/\s+/, ', ')}, ${country}`,
  ]

  return [...new Set(variants.filter(candidate => candidate.trim().length > 0))]
}

async function geocodeQuery(query: string): Promise<Coordinates | null> {
  const cached = geocodeCache.get(query)
  if (cached) {
    return cached
  }

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'be')

  const request = fetch(url.toString(), {
    headers: {
      'User-Agent': 'BossuytServiceApp/1.0',
      'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
    },
  })
    .then(async res => {
      if (!res.ok) return null

      const data: NominatimResult[] = await res.json()
      if (data.length === 0) return null

      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      }
    })

  geocodeCache.set(query, request)
  return request
}

export async function geocodeAddress(
  address: string,
  city: string,
  country = 'Belgium',
): Promise<Coordinates | null> {
  const query = `${address}, ${city}, ${country}`
  return geocodeQuery(query)
}

export async function geocodeSearchQuery(
  query: string,
  country = 'Belgium',
): Promise<Coordinates | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  for (const candidate of buildCandidateQueries(trimmed, country)) {
    const result = await geocodeQuery(candidate)
    if (result) {
      return result
    }
  }

  return null
}
