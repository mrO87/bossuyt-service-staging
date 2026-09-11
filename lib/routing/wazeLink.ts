/**
 * wazeLink — a link that puts a technician in front of the right door.
 *
 * https://waze.com/ul is Waze's universal link: it opens the app where the app
 * is installed and the web map where it is not, so one href covers a phone in a
 * van and a laptop in the office. Documented at developers.google.com/waze/deeplinks.
 *
 * Three things can identify a destination and they are not equally good:
 *
 *   the name         Waze knows businesses, and a business knows which entrance
 *                    deliveries use. "Rustoord Ennea" lands better than the
 *                    street it sits on.
 *   the address      right, but a street number can be a long way from the door
 *                    on an industrial site.
 *   the coordinates  never ambiguous, never wrong, and never smarter than the
 *                    pin somebody dropped.
 *
 * So they are combined rather than ranked. `q` searches, `ll` says where to
 * search, and a name that Waze cannot place still leaves the coordinates to fall
 * back on — which is the failure that matters, because a technician sent to the
 * wrong town has lost an afternoon.
 */

export type Destination = {
  siteName?: string
  customerName?: string
  address?: string
  postalCode?: string
  city?: string
  lat?: number
  lon?: number
}

/** Belgian coordinates, roughly. Guards against a 0,0 that means "never set". */
function usableCoordinates(lat?: number, lon?: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  // Null Island is not a customer.
  return lat !== 0 && lon !== 0
}

/** The written address, as somebody would type it into a search box. */
function addressLine(d: Destination): string {
  return [d.address, [d.postalCode, d.city].filter(Boolean).join(' ')]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * The best link available, or null when there is nothing to go on.
 *
 * Null matters: a button that opens Waze at nowhere in particular is worse than
 * no button, because it looks like it worked.
 */
export function wazeLink(d: Destination): string | null {
  const coordinates = usableCoordinates(d.lat, d.lon)
  const line = addressLine(d)

  // A site name is the place; a customer name is the company, which is often the
  // same thing and occasionally a head office two provinces away. Prefer the
  // site, and use the customer only when the site has no name of its own.
  const name = d.siteName?.trim() || d.customerName?.trim() || ''

  // The search term: the name anchored to its address, so Waze has both the
  // thing and the street to match on.
  const query = [name, line].filter(Boolean).join(', ')

  if (!query && !coordinates) return null

  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (coordinates) params.set('ll', `${d.lat},${d.lon}`)
  params.set('navigate', 'yes')

  return `https://waze.com/ul?${params.toString()}`
}
