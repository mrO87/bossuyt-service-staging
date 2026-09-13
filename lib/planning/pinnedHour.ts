/**
 * Het vastgezette uur: wat een geldig uur is, en wat je erover zegt.
 *
 * Klein, en toch een eigen bestand. De vraag "op welk uur mag deze bon staan"
 * wordt op twee plaatsen beantwoord — in het scherm terwijl er gesleept wordt,
 * en op de server vlak voor het opslaan — en twee antwoorden lopen vroeg of
 * laat uiteen. Dat is in v1.59 al een keer gebeurd met de splitsing tussen pool
 * en planning: de server keek naar `plannedDate`, de browsercache nog naar
 * `source`, en beide kanten waren op zich consistent. Geen enkele unittest zag
 * het; alleen slepen op de draaiende site.
 */

/**
 * De stap waarmee een bon inklikt bij het slepen.
 *
 * Vijftien minuten is wat in het prototype met de hand getest is. Op de
 * standaardhoogte van 54 px per uur is dat zo'n 13 px — met een duim te raken.
 * Vijf minuten werd afgewogen en niet gekozen: dat is nog geen 5 px per stap,
 * en dan wordt mikken trillen.
 */
export const SNAP_MINUTES = 15

const DAY_MINUTES = 24 * 60

/** Het dichtstbijzijnde kwartier, en nooit buiten de dag. */
export function snapToStep(minutes: number): number {
  const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
  return Math.min(DAY_MINUTES, Math.max(0, snapped))
}

/**
 * Een uur zoals het uit de buitenwereld binnenkomt, of null.
 *
 * Dit is de rand van de app: een herspeelde schrijfactie uit een wachtrij van
 * weken geleden, een oude tab, iemand met curl. Alles wat geen echt uur is
 * wordt null — geen uur is een geldige toestand, dus er valt niets te weigeren.
 * Een gebroken minuut wordt wél afgerond: die komt uit een deling door de
 * pixelhoogte en niet uit een bedoeling.
 */
export function sanitizeStartMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 0 || rounded > DAY_MINUTES) return null
  return rounded
}

/**
 * De volgorde van een dag, afgeleid uit waar de blokken liggen.
 *
 * De rekenkern loopt een dag af in lijstvolgorde: elke job volgt op de vorige.
 * Zet je een bon op 15:00 terwijl hij vooraan in die lijst staat, dan duwt hij
 * alles wat erachter komt mee naar de avond — de lijst en de klok zeggen dan
 * iets anders. Daarom verhuist een bon die een uur krijgt meteen naar zijn
 * plaats in de rij.
 *
 * Er wordt op het midden van een blok gesorteerd en niet op zijn begin: een
 * korte job die midden in een lange valt, hoort ervóór te komen als hij er ook
 * ervóór ligt. Dat is de regel die in het prototype met de vinger uitgetest is.
 * Gelijke middens houden hun bestaande volgorde — een bon die niets met een
 * wijziging te maken heeft, hoort niet te verspringen.
 */
export function orderByHour(
  blocks: Array<{ id: string; startMinutes: number; endMinutes: number }>,
): string[] {
  const middle = (block: { startMinutes: number; endMinutes: number }) =>
    (block.startMinutes + block.endMinutes) / 2

  return blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => middle(a.block) - middle(b.block) || a.index - b.index)
    .map(entry => entry.block.id)
}

/**
 * De melding bij een botsing.
 *
 * Ze noemt alle drie de uitwegen, want welke de juiste is hangt af van iets dat
 * alleen de gebruiker weet. En ze zegt er bewust bij dat inkorten niet altijd
 * helpt: ligt het uur vóór het moment waarop je er überhaupt kunt zijn, dan
 * maakt de rijtijd alleen al het onmogelijk, hoe kort de vorige job ook wordt.
 */
export function conflictMessage(customerName: string | undefined): string {
  const who = customerName ?? 'Deze werkbon'
  return (
    `${who} kan daar niet staan. Het gearceerde stuk ligt vóór het moment waarop `
    + 'je er ten vroegste kunt zijn. Kort de vorige job in, zet deze later, of haal '
    + 'het vaste uur weg. Let op: inkorten helpt niet als de rijtijd alleen al te '
    + 'lang is.'
  )
}
