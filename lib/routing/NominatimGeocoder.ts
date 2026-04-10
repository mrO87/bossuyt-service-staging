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

export async function geocodeAddress(
  address: string,
  city: string,
  country = 'Belgium',
): Promise<Coordinates | null> {
  const query = `${address}, ${city}, ${country}`
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'BossuytServiceApp/1.0' },
  })
  if (!res.ok) return null

  const data: NominatimResult[] = await res.json()
  if (data.length === 0) return null

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
  }
}
