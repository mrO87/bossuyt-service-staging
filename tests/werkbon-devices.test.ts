/**
 * De omschrijving van een toestel splitsen in merk en model.
 *
 * De regels komen van de Trianon-bon (TKT20/12781) en van de vorm die NAV
 * aanlevert. De splitsing is een gok — daarom staat hier ook vastgelegd wat er
 * gebeurt wanneer die gok niet opgaat, zodat niemand later denkt dat het
 * toevallig zo uitkwam.
 */
import { describe, expect, it } from 'vitest'
import { KNOWN_BRANDS, splitDeviceLabel } from '@/lib/werkbon-devices'

describe('splitDeviceLabel — echte bonregels', () => {
  it('leest een bekend merk uit het midden van de regel', () => {
    expect(splitDeviceLabel('VUUR GICO 8CG7N040D 4BR/INB')).toEqual({
      brand: 'GICO',
      model: '8CG7N040D 4BR/INB',
    })
  })

  it('laat de toestelsoort vóór het merk staan waar hij hoort: buiten het model', () => {
    // "SALAMANDER" is wat voor toestel het is, geen deel van het model.
    expect(splitDeviceLabel('SALAMANDER TECNO QSET 60/0 MONO')).toEqual({
      brand: 'TECNO',
      model: 'QSET 60/0 MONO',
    })
  })

  it('leest de tweede Gico-regel van dezelfde bon', () => {
    expect(splitDeviceLabel('VUUR GICO 8CG7N020D 2BR/INB')).toEqual({
      brand: 'GICO',
      model: '8CG7N020D 2BR/INB',
    })
  })
})

describe('splitDeviceLabel — zonder bekend merk', () => {
  it('neemt het tweede woord als merk en de rest als model', () => {
    expect(splitDeviceLabel('OVEN RATIONAL SCC 101')).toEqual({
      brand: 'RATIONAL',
      model: 'SCC 101',
    })
  })

  it('geeft een leeg model wanneer er niets na het merk staat', () => {
    expect(splitDeviceLabel('VAATWAS WINTERHALTER')).toEqual({
      brand: 'WINTERHALTER',
      model: '',
    })
  })

  it('verzint geen merk bij één woord', () => {
    // Een losse term is vaker een soort of een type dan een merk. Een merk
    // verzinnen zou het toestel aan het verkeerde type kunnen hangen.
    expect(splitDeviceLabel('SALAMANDER')).toEqual({ brand: '', model: 'SALAMANDER' })
  })
})

describe('splitDeviceLabel — niets bruikbaars', () => {
  it('geeft twee lege velden bij een lege regel', () => {
    expect(splitDeviceLabel('')).toEqual({ brand: '', model: '' })
    expect(splitDeviceLabel('   ')).toEqual({ brand: '', model: '' })
    expect(splitDeviceLabel(null)).toEqual({ brand: '', model: '' })
    expect(splitDeviceLabel(undefined)).toEqual({ brand: '', model: '' })
  })

  it('trekt zich niets aan van dubbele spaties of spaties aan de rand', () => {
    expect(splitDeviceLabel('  VUUR   GICO   8CG7N040D  ')).toEqual({
      brand: 'GICO',
      model: '8CG7N040D',
    })
  })
})

describe('splitDeviceLabel — hoofdletters', () => {
  it('herkent een bekend merk ongeacht hoe het geschreven staat', () => {
    // Op een foto van een bon komt de schrijfwijze er soms anders uit.
    expect(splitDeviceLabel('vuur Gico 8CG7N040D')).toEqual({
      brand: 'Gico',
      model: '8CG7N040D',
    })
  })

  it('bewaart de schrijfwijze van de bon in plaats van ze recht te trekken', () => {
    // Het merk is een etiket, geen sleutel: rechttrekken zou doen alsof we
    // weten hoe het hoort. Het aangeduide toesteltype draagt de documenten.
    expect(splitDeviceLabel('vuur Gico 8CG7N040D').brand).toBe('Gico')
  })
})

describe('KNOWN_BRANDS', () => {
  it('staat in hoofdletters, want daarop wordt vergeleken', () => {
    for (const brand of KNOWN_BRANDS) expect(brand).toBe(brand.toUpperCase())
  })
})

/**
 * Wat er écht uit docling kwam voor de Trianon-bon, gemeten op de foto die de
 * gebruiker met zijn gsm maakte. Op een foto plakt docling woorden aan elkaar;
 * deze drie regels zijn letterlijk wat er uit de omzetting kwam.
 */
describe('splitDeviceLabel — vastgeplakte tekst van een gefotografeerde bon', () => {
  it('vindt het merk midden in één aaneengeplakt woord', () => {
    expect(splitDeviceLabel('SALAMANDERTECNOQSET60/0MONO')).toEqual({
      brand: 'TECNO',
      model: 'QSET60/0MONO',
    })
  })

  it('werkt ook wanneer maar een deel is vastgeplakt', () => {
    expect(splitDeviceLabel('VUURGICO 8CG7N040D4BR/INB')).toEqual({
      brand: 'GICO',
      model: '8CG7N040D4BR/INB',
    })
  })

  it('geeft hetzelfde merk wanneer dezelfde bon wél netjes gescheiden is', () => {
    // Derde rij van dezelfde foto, die toevallig wel spaties kreeg. Merk gelijk,
    // model leesbaarder — en dus hangen beide aan hetzelfde toesteltype zodra
    // iemand dat aanduidt.
    expect(splitDeviceLabel('VUUR GICO 8CG7N020D 2BR/INB')).toEqual({
      brand: 'GICO',
      model: '8CG7N020D 2BR/INB',
    })
  })
})
