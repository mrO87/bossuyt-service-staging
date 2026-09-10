/**
 * StreetCorrector — repair a street name OCR read slightly wrong.
 *
 * OCR drops a letter without hesitating, and on a street name the mistake is
 * silent: "NAPELSSTRAAT" comes back as "NAPELSTRAAT", which is a street that
 * does not exist and which no geocoder will ever find. The postal code survives
 * the same scan intact, because digits are easier to read than letters — and
 * that is what makes a correction checkable rather than a guess.
 *
 * Photon is used rather than Nominatim because it is built for exactly this:
 * Nominatim wants the name spelled right, Photon tolerates a letter out of
 * place. Both read the same OpenStreetMap data.
 *
 * Three rules keep this from moving a customer to another town:
 *
 *   1. Search the street on its own. Including the house number sent
 *      "Napelstraat 42" to Klazienaveen in the Netherlands — the number pulls
 *      the match towards addresses instead of streets.
 *   2. Keep only results that are streets.
 *   3. Require the postal code to be the one already on the bon. "Kappelstraat"
 *      in 2000 finds a real Kapelstraat in 2070, 2660 and 2180, and every one of
 *      them is the wrong customer. Refusing is the right answer there.
 *
 * A refusal is not a failure. The street stays as it was read, the person
 * checking the form sees it, and nothing has been invented.
 */

/** Roughly where each Belgian postal code sits, so Photon searches nearby. */
const REGION_HINT: Record<string, [number, number]> = {
  '1': [50.85, 4.35], // Brussels
  '2': [51.22, 4.40], // Antwerp
  '3': [50.88, 5.34], // Limburg / Leuven
  '4': [50.63, 5.57], // Liège
  '5': [50.47, 4.87], // Namur
  '6': [50.41, 5.85], // Luxembourg / Charleroi
  '7': [50.45, 3.95], // Hainaut
  '8': [51.05, 3.12], // West Flanders
  '9': [51.05, 3.72], // East Flanders
}

type PhotonProperties = {
  name?: string
  type?: string
  postcode?: string
  city?: string
}

export type StreetCorrection = {
  /** The street as OpenStreetMap spells it. */
  street: string
  city?: string
  /**
   * True when only the capitals moved. "Van den nestlaan" becoming "Van den
   * Nestlaan" is worth taking, and not worth interrupting anybody over; a
   * dropped letter is both.
   */
  caseOnly: boolean
}

/**
 * The street OSM knows at this postal code, when it differs from what was read.
 *
 * Returns null when the street is already right, when nothing matches inside the
 * postal code, or when anything at all goes wrong — a correction is a courtesy
 * and must never be able to fail an upload.
 */
export async function correctStreet(
  street: string,
  postalCode: string,
  signal?: AbortSignal,
): Promise<StreetCorrection | null> {
  const name = street.trim()
  if (!name || !/^\d{4}$/.test(postalCode)) return null

  // Strip a trailing house number: it is not part of the name, and it drags the
  // search away from streets and towards addresses in other countries.
  const bare = name.replace(/[\s,]+\d+\s*[A-Za-z]?(\s*(bus|bte)\s*\S+)?$/i, '').trim()
  if (!bare) return null

  const hint = REGION_HINT[postalCode[0]!] ?? [50.85, 4.35]

  try {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', bare)
    url.searchParams.set('limit', '8')
    url.searchParams.set('lat', String(hint[0]))
    url.searchParams.set('lon', String(hint[1]))
    url.searchParams.set('osm_tag', 'highway')

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'BossuytServiceApp/1.0' },
      signal: signal ?? AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const json = (await res.json()) as { features?: { properties: PhotonProperties }[] }
    const match = (json.features ?? [])
      .map(f => f.properties)
      .find(p => p.type === 'street' && p.postcode === postalCode && p.name)

    if (!match?.name) return null

    // Identical: nothing to say, and saying it would badge a field that is right.
    if (match.name === bare) return null

    return {
      street: match.name,
      city: match.city,
      caseOnly: match.name.toLowerCase() === bare.toLowerCase(),
    }
  } catch {
    return null
  }
}
