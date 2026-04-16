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
  startTime: '07:30',
}

const STORAGE_KEY = 'bossuyt.settings'
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

function readSettingsFromStorage(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        startLocation: parsed.startLocation === 'thuis' ? 'thuis' : DEFAULTS.startLocation,
        homeAddress:
          parsed.homeAddress &&
          typeof parsed.homeAddress.display === 'string' &&
          typeof parsed.homeAddress.lat === 'number' &&
          typeof parsed.homeAddress.lon === 'number' &&
          isFinite(parsed.homeAddress.lat) &&
          isFinite(parsed.homeAddress.lon)
            ? parsed.homeAddress
            : DEFAULTS.homeAddress,
        startTime: typeof parsed.startTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.startTime)
          ? parsed.startTime
          : DEFAULTS.startTime,
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  return DEFAULTS
}

function ensureSettings(): Settings {
  if (!currentSettings) {
    currentSettings = readSettingsFromStorage()
  }

  return currentSettings
}

function persistSettings(next: Settings) {
  currentSettings = next

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }

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
      if (event.key !== STORAGE_KEY) return

      const next = readSettingsFromStorage()
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
