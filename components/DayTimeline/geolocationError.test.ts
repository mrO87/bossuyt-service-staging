import test from 'node:test'
import assert from 'node:assert/strict'

import { getGeolocationErrorMessage } from './geolocationError'

test('permission denied gives mobile-specific recovery guidance', () => {
  const message = getGeolocationErrorMessage({ code: 1 })

  assert.equal(
    message,
    'Locatie geblokkeerd. Sluit zwevende vensters en geef locatie toe via het slotje in je browser.',
  )
})

test('position unavailable keeps the existing unavailable message', () => {
  const message = getGeolocationErrorMessage({ code: 2 })

  assert.equal(message, 'Locatie niet beschikbaar')
})

test('other geolocation failures fall back to timeout copy', () => {
  const message = getGeolocationErrorMessage({ code: 3 })

  assert.equal(message, 'Locatie timeout')
})
