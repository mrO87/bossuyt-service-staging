import { describe, expect, it } from 'vitest'
import { wazeLink } from '@/lib/routing/wazeLink'

/** Read a link back as the parts Waze will act on. */
function parts(url: string | null) {
  if (!url) return null
  const u = new URL(url)
  return {
    base: `${u.origin}${u.pathname}`,
    q: u.searchParams.get('q'),
    ll: u.searchParams.get('ll'),
    navigate: u.searchParams.get('navigate'),
  }
}

describe('wazeLink', () => {
  it('sends the name and the coordinates together', () => {
    // Both, not one: the name is what Waze can place at the right entrance, the
    // coordinates are what keeps a failed search from going anywhere.
    expect(parts(wazeLink({
      siteName: 'Rustoord Ennea',
      address: 'Napelsstraat 42',
      postalCode: '2000',
      city: 'Antwerpen',
      lat: 51.2313,
      lon: 4.4111,
    }))).toEqual({
      base: 'https://waze.com/ul',
      q: 'Rustoord Ennea, Napelsstraat 42, 2000 Antwerpen',
      ll: '51.2313,4.4111',
      navigate: 'yes',
    })
  })

  it('falls back to the address when the site has no name', () => {
    expect(parts(wazeLink({
      address: 'Prins Boudewijnlaan 20',
      postalCode: '2600',
      city: 'Berchem',
    }))).toEqual({
      base: 'https://waze.com/ul',
      q: 'Prins Boudewijnlaan 20, 2600 Berchem',
      ll: null,
      navigate: 'yes',
    })
  })

  it('falls back to coordinates alone when there is no address', () => {
    expect(parts(wazeLink({ lat: 51.1724, lon: 4.5637 }))).toEqual({
      base: 'https://waze.com/ul',
      q: null,
      ll: '51.1724,4.5637',
      navigate: 'yes',
    })
  })

  it('uses the customer name only when the site has none', () => {
    expect(parts(wazeLink({ customerName: 'Bossuyt NV', city: 'Kuurne' })?.valueOf() ?? null)?.q)
      .toBe('Bossuyt NV, Kuurne')
    expect(parts(wazeLink({ siteName: 'Keuken', customerName: 'Bossuyt NV', city: 'Kuurne' }))?.q)
      .toBe('Keuken, Kuurne')
  })

  it('refuses to build a link to nowhere', () => {
    // A button that opens Waze at nothing in particular looks like it worked.
    expect(wazeLink({})).toBeNull()
    expect(wazeLink({ siteName: '   ' })).toBeNull()
  })

  it('does not treat a never-set coordinate as a place', () => {
    // 0,0 is in the Atlantic and means the column was never filled in.
    expect(parts(wazeLink({ address: 'Wetstraat 10', city: 'Brussel', lat: 0, lon: 0 }))?.ll)
      .toBeNull()
  })

  it('encodes what it is given', () => {
    const url = wazeLink({ siteName: "Café L'Étoile & Zoon", city: 'Luik' })!
    expect(url).not.toContain(' ')
    expect(new URL(url).searchParams.get('q')).toBe("Café L'Étoile & Zoon, Luik")
  })
})
