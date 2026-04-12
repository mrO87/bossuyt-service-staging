'use client'

import { useState, useCallback } from 'react'

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

const DEFAULTS: Settings = {
  startLocation: 'atelier',
  homeAddress: null,
  startTime: '07:30',
}

const STORAGE_KEY = 'bossuyt.settings'

function getInitialSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        startLocation: parsed.startLocation === 'thuis' ? 'thuis' : DEFAULTS.startLocation,
        homeAddress: parsed.homeAddress ?? DEFAULTS.homeAddress,
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

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(getInitialSettings)

  const updateSetting = useCallback(function<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
      return next
    })
  }, [])

  return { settings, updateSetting }
}
