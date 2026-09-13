/**
 * Van één regel uit de UNIT-tabel naar een merk en een model.
 *
 * De omschrijving op een servicebon volgt een vast patroon: eerst wat voor
 * toestel het is, dan het merk, dan het model.
 *
 *     VUUR       GICO   8CG7N040D 4BR/INB
 *     SALAMANDER TECNO  QSET 60/0 MONO
 *
 * Dat patroon is een gewoonte en geen regel, dus dit is een gok. De gok mag
 * hier omdat hij niets draagt: merk en model zijn het **etiket** van de bon, en
 * de handleidingen hangen aan een aangeduid toesteltype (`device_type_id`).
 * Staat er iets fout, dan ontbreken er geen documenten — er is alleen nog geen
 * type aangeduid.
 *
 * De volledige regel wordt daarom altijd bewaard door de aanroeper
 * (`devices.source_label`). Zonder die bron zou een verkeerde splitsing
 * betekenen dat iemand de papieren bon terug moet zoeken.
 */

/**
 * Merken die we op echte bonnen gezien hebben.
 *
 * Een lijst en geen slimmigheid: merknamen hebben geen vorm waaraan je ze
 * herkent — `GICO` en `QSET` zien er even merkachtig uit, en alleen het eerste
 * is er een. De lijst groeit mee met wat er binnenkomt; wat er niet in staat,
 * valt terug op de plaatsregel hieronder.
 *
 * De lijst draagt meer gewicht dan bij een schone PDF nodig zou zijn, en dat is
 * gemeten: op een foto van een bon plakt docling woorden aan elkaar. De echte
 * uitvoer van de Trianon-bon was `SALAMANDERTECNOQSET60/0MONO` — één woord.
 * Een regel die op spaties splitst maakt daar niets van; een bekend merk is er
 * wél in terug te vinden.
 */
export const KNOWN_BRANDS: readonly string[] = [
  'GICO',
  'TECNO',
]

export interface DeviceLabel {
  brand: string
  model: string
}

/**
 * Splits een omschrijving in merk en model.
 *
 * Twee regels, in deze volgorde.
 *
 * **Een bekend merk, waar het ook staat.** Gezocht als stuk tekst en niet als
 * los woord, want op een foto staan de woorden vastgeplakt. Alles ervóór is de
 * toestelsoort en verdwijnt; alles erna is het model.
 *
 * **Anders de plaats:** het tweede woord is het merk en de rest het model. Bij
 * één woord is er geen tweede, en dan is dat woord het model — een losse term
 * is vaker een soort of een type dan een merk, en een merk verzinnen zou een
 * toestel aan het verkeerde type kunnen hangen.
 *
 * De schrijfwijze van de bon blijft staan, ook wanneer die door het aaneenplakken
 * lelijk is (`QSET60/0MONO`). Rechttrekken zou doen alsof we weten hoe het hoort;
 * dit is een etiket, en het aangeduide toesteltype draagt de documenten.
 */
export function splitDeviceLabel(label: string | null | undefined): DeviceLabel {
  const raw = (label ?? '').trim()
  if (!raw) return { brand: '', model: '' }

  const upper = raw.toUpperCase()
  for (const brand of KNOWN_BRANDS) {
    const at = upper.indexOf(brand)
    if (at === -1) continue
    return {
      brand: raw.slice(at, at + brand.length),
      model: raw.slice(at + brand.length).trim(),
    }
  }

  const words = raw.split(/\s+/).filter(Boolean)
  if (words.length === 1) return { brand: '', model: words[0] }

  return {
    brand: words[1],
    model: words.slice(2).join(' '),
  }
}
