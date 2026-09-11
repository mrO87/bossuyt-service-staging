'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Coordinates } from '@/lib/routing/IRoutingService'

export interface HomeAddress {
  display: string
  lat: number
  lon: number
}

export interface Settings {
  startLocation: 'atelier' | 'thuis'
  homeAddress: HomeAddress | null
  startTime: string  // "HH:MM"
}

export const ATELIER_ADDRESS = 'Noordlaan 19, Kuurne'
export const ATELIER_COORDINATES: Coordinates = {
  lat: 50.8582720,
  lon: 3.2584752,
}
export const DEFAULT_HOME_ADDRESS: HomeAddress = {
  display: '25, Lintsesteenweg, Kontich, Antwerpen, Vlaanderen, 2550, België / Belgique / Belgien',
  lat: 51.1307205,
  lon: 4.4779880,
}

const DEFAULTS: Settings = {
  startLocation: 'atelier',
  homeAddress: DEFAULT_HOME_ADDRESS,
  // Matches the roster start in lib/planning/workSchedule.ts.
  startTime: '07:00',
}

export const SETTINGS_STORAGE_KEY = 'bossuyt.settings'

/**
 * The slice of localStorage the read/write helpers need. Narrowing it this far
 * is what lets them be tested without a browser, and lets a server render pass
 * `null` instead of pretending storage exists.
 */
export type SettingsStore = Pick<Storage, 'getItem' | 'setItem'>

const listeners = new Set<(settings: Settings) => void>()
let currentSettings: Settings | null = null

function isHouseNumberSegment(segment: string): boolean {
  return /^\d+[A-Za-z/-]*$/.test(segment.trim())
}

export function formatAddressLabel(displayName: string): string {
  const parts = displayName
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return displayName.trim()
  }

  const [first, second, third] = parts

  if (second && isHouseNumberSegment(first)) {
    const streetAndNumber = `${second} ${first}`.trim()
    return third ? `${streetAndNumber}, ${third}` : streetAndNumber
  }

  return second ? `${first}, ${second}` : first
}

function parseHomeAddress(value: unknown): HomeAddress | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<HomeAddress>

  const usable =
    typeof candidate.display === 'string' &&
    typeof candidate.lat === 'number' &&
    typeof candidate.lon === 'number' &&
    isFinite(candidate.lat) &&
    isFinite(candidate.lon)

  return usable ? (candidate as HomeAddress) : null
}

/**
 * Read settings out of `store`, replacing per field whatever it cannot trust.
 * Pass `null` when there is no store — during a server render, for instance.
 *
 * Deliberately never deletes what it failed to read. Unreadable text is left
 * where it is: the next successful write overwrites it anyway, and throwing it
 * away would turn a parsing hiccup into permanent loss.
 */
export function readSettingsFrom(store: SettingsStore | null): Settings {
  if (!store) return DEFAULTS

  let parsed: Record<string, unknown>
  try {
    const stored = store.getItem(SETTINGS_STORAGE_KEY)
    if (!stored) return DEFAULTS
    parsed = JSON.parse(stored) as Record<string, unknown>
  } catch {
    return DEFAULTS
  }

  return {
    startLocation: parsed.startLocation === 'thuis' ? 'thuis' : DEFAULTS.startLocation,
    homeAddress: parseHomeAddress(parsed.homeAddress) ?? DEFAULTS.homeAddress,
    startTime:
      typeof parsed.startTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.startTime)
        ? parsed.startTime
        : DEFAULTS.startTime,
  }
}

/**
 * Write settings to `store`. Returns whether they actually landed.
 *
 * A refused write — storage full, or a browser blocking site data — loses only
 * this one change. It must never remove what was stored before. An earlier
 * version called `removeItem` here, so a single failure wiped the technician's
 * start time and start location; see tests/settings-storage.test.ts.
 */
export function writeSettingsTo(store: SettingsStore | null, next: Settings): boolean {
  if (!store) return false

  try {
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/** localStorage, or null when it is missing or refuses to be touched. */
function browserStore(): SettingsStore | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Some browsers throw on the property access itself when site data is off.
    return null
  }
}

function ensureSettings(): Settings {
  if (!currentSettings) {
    currentSettings = readSettingsFrom(browserStore())
  }

  return currentSettings
}

function persistSettings(next: Settings) {
  // The in-memory value updates either way, so the rest of the session stays
  // consistent even when the write below cannot land.
  currentSettings = next
  writeSettingsTo(browserStore(), next)
  listeners.forEach(listener => listener(next))
}

export function getStartAddressFromSettings(settings: Settings): string {
  if (settings.startLocation === 'thuis' && settings.homeAddress) {
    return formatAddressLabel(settings.homeAddress.display)
  }

  return ATELIER_ADDRESS
}

export function getStartCoordinatesFromSettings(settings: Settings): Coordinates {
  if (settings.startLocation === 'thuis' && settings.homeAddress) {
    return {
      lat: settings.homeAddress.lat,
      lon: settings.homeAddress.lon,
    }
  }

  return ATELIER_COORDINATES
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(ensureSettings)

  useEffect(() => {
    function handleSettingsChange(next: Settings) {
      setSettings(next)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== SETTINGS_STORAGE_KEY) return

      const next = readSettingsFrom(browserStore())
      currentSettings = next
      listeners.forEach(listener => listener(next))
    }

    listeners.add(handleSettingsChange)
    window.addEventListener('storage', handleStorage)

    return () => {
      listeners.delete(handleSettingsChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const updateSetting = useCallback(function<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...ensureSettings(), [key]: value }
    persistSettings(next)
  }, [])

  return { settings, updateSetting }
}
