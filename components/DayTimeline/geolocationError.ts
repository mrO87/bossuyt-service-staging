export function getGeolocationErrorMessage(error: { code: number }): string {
  if (error.code === 1) {
    return 'Locatie geblokkeerd. Sluit zwevende vensters en geef locatie toe via het slotje in je browser.'
  }

  if (error.code === 2) {
    return 'Locatie niet beschikbaar'
  }

  return 'Locatie timeout'
}
