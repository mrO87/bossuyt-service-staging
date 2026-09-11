/**
 * Pulling a Belgian address apart the way it arrives, not the way it should.
 *
 * Bons are scanned from paper and the town is written as it appears there:
 * "2600 BERCHEM (ANTWERPEN)". A geocoder reads that whole string as the name of
 * a place, and no place is called that, so the lookup fails and the work order
 * ends up with no coordinates — which the timeline then reports as "? min".
 *
 * The postal code is worth keeping rather than discarding: the street repair in
 * StreetCorrector uses it to stay in the right town, which is what stops it
 * "correcting" a street into an identically named one two provinces away.
 */

export interface CityParts {
  /** Four digits, when the town field carried them. */
  postalCode?: string
  /** The town on its own — no postal code, no province in brackets. */
  city: string
}

export function splitCity(raw: string): CityParts {
  const trimmed = raw.trim()
  const withCode = trimmed.match(/^(\d{4})\s+(.*)$/)

  const postalCode = withCode?.[1]
  const city = (withCode?.[2] ?? trimmed).replace(/\s*\([^)]*\)\s*$/, '').trim()

  return { postalCode, city: city || trimmed }
}

/** The house number at the end of a street line, if there is one. */
export function houseNumber(address: string): string {
  return address.match(/(\d+\s*[A-Za-z]?)\s*$/)?.[1]?.trim() ?? ''
}
