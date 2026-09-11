/**
 * Settings storage — regression tests.
 *
 * The bug these exist for: a technician set a start time and start location,
 * and later found them back on the defaults. Reproduced against staging with
 * Playwright: the normal path is fine, but a single refused `setItem` deleted
 * the whole settings key — not just the new value, but everything stored
 * before it. `catch { localStorage.removeItem(...) }` in both the read and the
 * write path turned one hiccup into total loss.
 *
 * A phone in the field fills up (this app caches work order photos as blobs in
 * IndexedDB), and a full store makes `setItem` throw. So the failure is not
 * exotic — it is the expected end state of a busy week.
 *
 * Rule under test: a failed read or write may lose the current change, but must
 * never destroy settings that were already stored.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_ADDRESS,
  SETTINGS_STORAGE_KEY,
  readSettingsFrom,
  writeSettingsTo,
  type Settings,
  type SettingsStore,
} from '@/lib/hooks/useSettings'

const DEFAULTS: Settings = {
  startLocation: 'atelier',
  homeAddress: DEFAULT_HOME_ADDRESS,
  startTime: '07:00',
}

const CHOSEN: Settings = {
  startLocation: 'thuis',
  homeAddress: DEFAULT_HOME_ADDRESS,
  startTime: '09:45',
}

/** A stand-in for localStorage that can be told to refuse writes. */
function fakeStore(
  initial: string | null = null,
  options: { refuseWrites?: boolean } = {},
) {
  let value = initial

  const store: SettingsStore & { raw: () => string | null } = {
    getItem: (key) => (key === SETTINGS_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (options.refuseWrites) throw new Error('QuotaExceededError')
      if (key === SETTINGS_STORAGE_KEY) value = next
    },
    raw: () => value,
  }

  return store
}

describe('settings storage', () => {
  it('reads back what it wrote', () => {
    const store = fakeStore()

    writeSettingsTo(store, CHOSEN)

    expect(readSettingsFrom(store)).toEqual(CHOSEN)
  })

  it('falls back to defaults when nothing is stored yet', () => {
    expect(readSettingsFrom(fakeStore())).toEqual(DEFAULTS)
  })

  it('falls back to defaults when there is no store at all (server render)', () => {
    expect(readSettingsFrom(null)).toEqual(DEFAULTS)
  })

  // ---- the regressions ----

  it('keeps earlier settings when a write is refused', () => {
    // Something was stored successfully first.
    const store = fakeStore()
    writeSettingsTo(store, CHOSEN)
    expect(store.raw()).toContain('09:45')

    // Now the store refuses — full disk, or a browser blocking site data.
    const refusing = fakeStore(store.raw(), { refuseWrites: true })
    const persisted = writeSettingsTo(refusing, {
      ...CHOSEN,
      startTime: '06:15',
    })

    expect(persisted).toBe(false)              // it reports the failure...
    expect(refusing.raw()).toBe(store.raw())   // ...and changes nothing
    expect(readSettingsFrom(refusing)).toEqual(CHOSEN)
  })

  it('does not delete unreadable stored text', () => {
    const store = fakeStore('{ this is not json')

    expect(readSettingsFrom(store)).toEqual(DEFAULTS)
    expect(store.raw()).toBe('{ this is not json')
  })

  // ---- per-field validation ----

  it('replaces only the fields it cannot trust', () => {
    const store = fakeStore(
      JSON.stringify({ startLocation: 'thuis', startTime: 'kwart over acht' }),
    )

    const settings = readSettingsFrom(store)

    expect(settings.startLocation).toBe('thuis')            // kept
    expect(settings.startTime).toBe(DEFAULTS.startTime)     // rejected
    expect(settings.homeAddress).toEqual(DEFAULT_HOME_ADDRESS)
  })

  it('rejects a home address with coordinates that are not numbers', () => {
    const store = fakeStore(
      JSON.stringify({
        startLocation: 'thuis',
        homeAddress: { display: 'Ergens', lat: 'x', lon: 4.2 },
        startTime: '07:00',
      }),
    )

    expect(readSettingsFrom(store).homeAddress).toEqual(DEFAULT_HOME_ADDRESS)
  })
})
