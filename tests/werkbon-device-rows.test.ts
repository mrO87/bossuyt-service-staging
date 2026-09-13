/**
 * De toestellentabel uitlezen, rij per rij.
 *
 * De fixture is de échte Trianon-bon (TKT20/12781) zoals de gebruiker hem met
 * zijn gsm fotografeerde, één keer door docling gehaald en hier bevroren. Dat
 * is met opzet een foto en geen nette PDF: op een foto plakt docling woorden
 * aan elkaar en liggen de rijen niet op ronde getallen. Precies daar ging het
 * mis, en daar moet het dus kloppen.
 *
 * Wat er op het papier staat:
 *
 *   U188231  SALAMANDER TECNO QSET 60/0 MONO   13/11/17
 *   U188217  VUUR GICO 8CG7N040D 4BR/INB       13/11/17
 *   U188238  VUUR GICO 8CG7N020D 2BR/INB       13/11/17
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { extractDevices, toFragments, ZONES, type DoclingDocument } from '@/lib/werkbon-zones'
import { splitDeviceLabel } from '@/lib/werkbon-devices'

const doclingDoc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/trianon-antwerpen-docling.json'), 'utf-8'),
) as DoclingDocument

const fragments = toFragments(doclingDoc)
const devices = extractDevices(fragments)

describe('extractDevices — de Trianon-bon', () => {
  it('vindt alle drie de toestellen', () => {
    // Hiervóór werd er geen enkel gevonden: de zone hield op bij y=112 en de
    // gewone zonelezer plakte wat er wél in viel tot één brei aaneen.
    expect(devices).toHaveLength(3)
  })

  it('houdt de volgorde van de bon aan', () => {
    expect(devices.map(d => d.unitNumber)).toEqual(['U188231', 'U188217', 'U188238'])
  })

  it('houdt elke omschrijving bij zijn eigen unitnummer', () => {
    // De kern van het rij-groeperen: drie omschrijvingen die niet mogen
    // verschuiven ten opzichte van hun nummer.
    expect(devices[0].description).toContain('TECNO')
    expect(devices[1].description).toContain('8CG7N040D')
    expect(devices[2].description).toContain('8CG7N020D')
  })

  it('leest de leverdatum van elke rij', () => {
    for (const device of devices) expect(device.deliveryDate).toBe('2017-11-13')
  })

  it('laat de garantie leeg, want die staat niet op deze bon', () => {
    for (const device of devices) expect(device.warrantyUntil).toBe('')
  })

  it('houdt de opschriften van het formulier buiten de toestellen', () => {
    // UNIT N°, OMSCHRIJVING | DÉSIGNATION, LEVERDATUM en GARANTIE staan in
    // dezelfde band en overlappen zelfs de eerste rij in hoogte.
    const alles = devices.map(d => `${d.unitNumber} ${d.description}`).join(' ').toUpperCase()
    expect(alles).not.toContain('LEVERDATUM')
    expect(alles).not.toContain('GARANTIE')
    expect(alles).not.toContain('DESIGNATION')
  })
})

describe('extractDevices — samen met de splitser', () => {
  it('levert voor elk toestel een merk en een model', () => {
    const gesplitst = devices.map(d => splitDeviceLabel(d.description))

    expect(gesplitst[0].brand.toUpperCase()).toBe('TECNO')
    expect(gesplitst[1].brand.toUpperCase()).toBe('GICO')
    expect(gesplitst[2].brand.toUpperCase()).toBe('GICO')

    // Twee toestellen van hetzelfde merk: zodra iemand daar één toesteltype
    // voor aanduidt, hebben ze allebei dezelfde handleidingen.
    expect(gesplitst[1].brand.toUpperCase()).toBe(gesplitst[2].brand.toUpperCase())
  })

  it('houdt de modellen uit elkaar', () => {
    const modellen = devices.map(d => splitDeviceLabel(d.description).model)
    expect(new Set(modellen).size).toBe(3)
  })
})

describe('extractDevices — niets te vinden', () => {
  it('geeft een lege lijst wanneer er geen fragmenten zijn', () => {
    expect(extractDevices([])).toEqual([])
  })

  it('geeft een lege lijst wanneer er alleen opschriften staan', () => {
    const alleenLabels = fragments.filter(f => /UNIT|LEVERDATUM|GARANTIE|DESIGNATION/i.test(f.text))
    expect(extractDevices(alleenLabels)).toEqual([])
  })
})

describe('de zones die dit mogelijk maken', () => {
  it('reikt tot onder de laatste rij', () => {
    // Op deze bon loopt de derde rij door tot y = 117.7.
    expect(ZONES.unitNumber.y2).toBeGreaterThan(118)
  })

  it('botst niet met de klantomschrijving eronder', () => {
    // Die begint op y = 122.8. Overlapten ze, dan at de omschrijving de
    // toestelregels op — precies wat er eerder gebeurde.
    expect(ZONES.description.y1).toBeGreaterThanOrEqual(ZONES.unitNumber.y2)
    expect(ZONES.description.y1).toBeLessThan(122.8)
  })
})
