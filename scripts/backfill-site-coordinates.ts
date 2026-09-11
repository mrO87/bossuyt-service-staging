/**
 * Give coordinates to the sites that never got any.
 *
 * createWorkOrder geocodes a new site on the way past (locateSite), but that
 * only started in v1.56 and it stays silent when Nominatim is slow or absent.
 * Sites from before it, and the ones where the lookup happened to fail, have no
 * lat/lon — and a work order at such a site now shows "? min · adres ontbreekt"
 * on the timeline, because the travel estimate has nowhere to measure from.
 *
 * Dry run by default: it prints what it would write and changes nothing. This
 * touches real customer records, so seeing the answer before storing it is the
 * point, not a formality.
 *
 *   npx tsx scripts/backfill-site-coordinates.ts           # laat zien
 *   npx tsx scripts/backfill-site-coordinates.ts --write   # schrijft weg
 *
 * Nominatim allows one request per second, so it waits between lookups. With a
 * handful of sites that is a few seconds; it is not built for thousands.
 */
import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, sites } from '@/lib/db/schema'
import { geocodeAddress, geocodeSearchQuery } from '@/lib/routing/NominatimGeocoder'
import { correctStreet } from '@/lib/routing/StreetCorrector'
import { houseNumber, splitCity } from '@/lib/routing/addressParts'

const NOMINATIM_GAP_MS = 1100

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')

  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      address: sites.address,
      city: sites.city,
      customer: customers.name,
    })
    .from(sites)
    .leftJoin(customers, eq(customers.id, sites.customerId))
    .where(or(isNull(sites.lat), isNull(sites.lon)))

  if (rows.length === 0) {
    console.log('Elke vestiging heeft al coördinaten.')
    return
  }

  console.log(
    `${rows.length} vestiging(en) zonder coördinaten.` +
    (write ? ' Schrijven staat AAN.' : ' Proefdraai — er wordt niets gewijzigd.'),
  )
  console.log('')

  let located = 0
  let failed = 0

  for (const [index, site] of rows.entries()) {
    if (index > 0) await sleep(NOMINATIM_GAP_MS)

    const label = `${site.customer ?? '?'} — ${site.address ?? '(geen adres)'}, ${site.city ?? ''}`

    if (!site.address || !site.city) {
      console.log(`  OVERGESLAGEN  ${label}`)
      console.log('                geen adres of gemeente om op te zoeken')
      failed++
      continue
    }

    const { postalCode, city } = splitCity(site.city)
    let via = 'adres zoals opgeslagen'
    let correction: string | null = null

    // 1. Exactly what the create path does.
    let at = await geocodeAddress(site.address, site.city)

    // 2. Again with the town cleaned up. "2600 BERCHEM (ANTWERPEN)" carries a
    //    postal code and a province in brackets; Nominatim reads that as part
    //    of the place name and finds nothing.
    if (!at && city !== site.city) {
      await sleep(NOMINATIM_GAP_MS)
      at = await geocodeAddress(site.address, city)
      if (at) via = 'gemeente opgeschoond'
    }

    // 3. Repair the street first. Paper bons are scanned, and a street read
    //    slightly wrong is a street no geocoder will ever find —
    //    "Prinsbouwdewijnlaan" for "Prins Boudewijnlaan". Photon tolerates the
    //    typo where Nominatim does not, and the postal code keeps the answer
    //    honest.
    if (!at && postalCode) {
      const corrected = await correctStreet(site.address, postalCode)
      if (corrected) {
        const repaired = `${corrected.street} ${houseNumber(site.address)}`.trim()
        correction = `${site.address} → ${repaired}`

        await sleep(NOMINATIM_GAP_MS)
        at = await geocodeAddress(repaired, city)
        if (at) via = 'straat gecorrigeerd'
      }
    }

    // 4. Last resort: throw the whole thing at the free-text search.
    if (!at) {
      await sleep(NOMINATIM_GAP_MS)
      at = await geocodeSearchQuery(`${site.address}, ${city}`)
      if (at) via = 'vrije tekst'
    }

    if (!at) {
      console.log(`  NIET GEVONDEN ${label}`)
      if (correction) console.log(`                straat lijkt wel: ${correction}`)
      failed++
      continue
    }

    console.log(`  GEVONDEN      ${label}`)
    console.log(`                ${at.lat.toFixed(6)}, ${at.lon.toFixed(6)}  (${via})`)
    if (correction) {
      // Reported, never written. Rewriting a customer's street is a decision
      // about their record, not a side effect of looking up a pin.
      console.log(`                LET OP, straatnaam wijkt af: ${correction}`)
    }
    located++

    if (write) {
      await db
        .update(sites)
        .set({ lat: at.lat, lon: at.lon })
        .where(and(eq(sites.id, site.id), isNull(sites.lat)))
    }
  }

  console.log('')
  console.log(`Gevonden: ${located} · niet gevonden: ${failed}`)
  if (!write && located > 0) {
    console.log('Draai opnieuw met --write om deze coördinaten te bewaren.')
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Bijvullen mislukt:', error)
    process.exit(1)
  })
