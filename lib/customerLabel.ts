/**
 * Hoe een klant heet op het scherm, ook wanneer niemand dat heeft ingevuld.
 *
 * Op een papieren servicebon is het naamvak soms gewoon leeg gebleven. Dat is
 * geen leesfout van de app: er staat niets. Die bon moet toch bruikbaar zijn —
 * het adres, het ticketnummer en de omschrijving staan er wél, en daarmee kan
 * een technieker rijden en werken.
 *
 * Maar een lege naam mag nooit als een lege plek op het scherm belanden: een
 * blok zonder opschrift in de planning ziet eruit als een fout in de app, en
 * een technieker weet dan niet of de naam ontbreekt of dat het scherm hem kwijt
 * is. Vandaar één zin, overal dezelfde, die zegt wat er aan de hand is.
 */
export const MISSING_CUSTOMER_NAME = 'Naam ontbreekt'

export function customerLabel(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed : MISSING_CUSTOMER_NAME
}

/** Of deze klant zonder naam op de bon staat — voor wie het wil markeren. */
export function hasCustomerName(name: string | null | undefined): boolean {
  return Boolean(name?.trim())
}
