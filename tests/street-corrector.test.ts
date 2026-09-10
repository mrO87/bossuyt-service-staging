import { afterEach, describe, expect, it, vi } from 'vitest'
import { correctStreet, nameAtAddress } from '@/lib/routing/StreetCorrector'

/**
 * The shapes below are what Photon actually returned for these streets on
 * 10 September 2026, trimmed to the fields the corrector reads. Frozen here so
 * the suite stays offline and deterministic: what is under test is the rule that
 * decides which hit to trust, not whether a free service is up.
 */
function respond(
  features: {
    name?: string
    type: string
    postcode?: string
    city?: string
    street?: string
    housenumber?: string
  }[],
) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: features.map(properties => ({ properties })) }),
  } as unknown as Response)
}

afterEach(() => vi.unstubAllGlobals())

describe('correctStreet', () => {
  it('repairs a dropped letter when the postal code agrees', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Napelsstraat', type: 'street', postcode: '2000', city: 'Antwerpen' },
      { name: 'Namenstraat', type: 'street', postcode: '2000', city: 'Antwerpen' },
    ]))
    // OCR read NAPELSSTRAAT as NAPELSTRAAT — a street that does not exist.
    await expect(correctStreet('Napelstraat 42', '2000')).resolves.toEqual({
      street: 'Napelsstraat',
      city: 'Antwerpen',
      caseOnly: false,
    })
  })

  it('refuses a real street that sits in another postal code', async () => {
    // Kapelstraat exists — in 2070, 2660 and 2180. None of them is this customer.
    vi.stubGlobal('fetch', respond([
      { name: 'Kapelstraat', type: 'street', postcode: '2070', city: 'Zwijndrecht' },
      { name: 'Kapelstraat', type: 'street', postcode: '2660', city: 'Hoboken' },
    ]))
    await expect(correctStreet('Kappelstraat 5', '2000')).resolves.toBeNull()
  })

  it('says nothing when the street was already right', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Napelsstraat', type: 'street', postcode: '2000', city: 'Antwerpen' },
    ]))
    await expect(correctStreet('Napelsstraat 42', '2000')).resolves.toBeNull()
  })

  it('takes a better capitalisation, and marks it as only that', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Van den Nestlaan', type: 'street', postcode: '2520', city: 'Broechem' },
    ]))
    await expect(correctStreet('Van den nestlaan 132', '2520')).resolves.toEqual({
      street: 'Van den Nestlaan',
      city: 'Broechem',
      caseOnly: true,
    })
  })

  it('ignores a hit that is not a street', async () => {
    // Photon answers with businesses too; a shop named after the street is not
    // the street.
    vi.stubGlobal('fetch', respond([
      { name: 'Upton', type: 'house', postcode: '2000', city: 'Antwerpen' },
    ]))
    await expect(correctStreet('Napelstraat 42', '2000')).resolves.toBeNull()
  })

  it('refuses when nothing comes back at all', async () => {
    vi.stubGlobal('fetch', respond([]))
    await expect(correctStreet('Zzzzstraat 1', '2000')).resolves.toBeNull()
  })

  it('never asks without a usable postal code', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    await expect(correctStreet('Napelstraat 42', '')).resolves.toBeNull()
    await expect(correctStreet('Napelstraat 42', 'B-2000')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows a failing service rather than failing the upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await expect(correctStreet('Napelstraat 42', '2000')).resolves.toBeNull()
  })
})

describe('nameAtAddress', () => {
  it('offers the business registered at exactly this address', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Upton', type: 'house', postcode: '2000', city: 'Antwerpen', street: 'Napelsstraat', housenumber: '42' },
    ]))
    await expect(nameAtAddress('Napelsstraat', '42', '2000')).resolves.toBe('Upton')
  })

  it('does not mind how OpenStreetMap capitalises the street', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Sauna Molenhoeve', type: 'locality', postcode: '2520', city: 'Broechem', street: 'Van Den Nestlaan', housenumber: '132' },
    ]))
    await expect(nameAtAddress('Van den Nestlaan', '132', '2520')).resolves.toBe('Sauna Molenhoeve')
  })

  it('refuses a business on a neighbouring street', async () => {
    // A real answer to "Meir 1": two of these are a short walk away and both
    // would look entirely plausible in the customer name field.
    vi.stubGlobal('fetch', respond([
      { name: 'Q-Park Shopping Meir', type: 'house', postcode: '2000', street: 'Korte Klarenstraat', housenumber: '10' },
      { name: 'Kringwinkel Antwerpen', type: 'house', postcode: '2000', street: 'Otto Veniusstraat', housenumber: '11' },
    ]))
    await expect(nameAtAddress('Meir', '1', '2000')).resolves.toBeNull()
  })

  it('refuses a different house number in the right street', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Iemand anders', type: 'house', postcode: '2000', street: 'Napelsstraat', housenumber: '8' },
    ]))
    await expect(nameAtAddress('Napelsstraat', '42', '2000')).resolves.toBeNull()
  })

  it('stays silent when the address has no business on it', async () => {
    vi.stubGlobal('fetch', respond([
      { type: 'house', postcode: '2000', street: 'Napelsstraat', housenumber: '8' },
    ]))
    await expect(nameAtAddress('Napelsstraat', '8', '2000')).resolves.toBeNull()
  })

  it('never asks without a house number', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    await expect(nameAtAddress('Napelsstraat', '', '2000')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('correctStreet en tweetalige namen', () => {
  it('laat een Brusselse straat staan die OSM in twee talen kent', async () => {
    // Wetstraat is right. Rue de la Loi is the same street in French, and
    // handing that back would relabel a correct field as needing review.
    vi.stubGlobal('fetch', respond([
      { name: 'Rue de la Loi - Wetstraat', type: 'street', postcode: '1000', city: 'Brussel' },
    ]))
    await expect(correctStreet('WETSTRAAT 10', '1000')).resolves.toBeNull()
  })

  it('corrigeert nog steeds een straat die er echt naast zit', async () => {
    vi.stubGlobal('fetch', respond([
      { name: 'Napelsstraat', type: 'street', postcode: '2000', city: 'Antwerpen' },
    ]))
    await expect(correctStreet('Napelstraat 42', '2000')).resolves.toEqual({
      street: 'Napelsstraat', city: 'Antwerpen', caseOnly: false,
    })
  })
})
