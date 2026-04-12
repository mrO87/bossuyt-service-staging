'use client'

import { useState, useEffect } from 'react'

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

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setSettings({ ...DEFAULTS, ...JSON.parse(stored) })
    } catch {
      // ignore corrupted storage
    }
  }, [])

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  return { settings, updateSetting }
}
