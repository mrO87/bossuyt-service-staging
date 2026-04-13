'use client'

import { useState, useRef, useEffect } from 'react'
import type { HomeAddress } from '@/lib/hooks/useSettings'

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

interface Props {
  value: HomeAddress | null
  onChange: (addr: HomeAddress) => void
}

function shortLabel(displayName: string): string {
  // "Straat 1, Gemeente, Provincie, België" → "Straat 1, Gemeente"
  return displayName.split(',').slice(0, 2).join(',').trim()
}

export default function AddressSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value ? shortLabel(value.display) : '')
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(value ? shortLabel(value.display) : '')
  }, [value])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleInput(text: string) {
    setQuery(text)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (text.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?format=json&countrycodes=be&limit=5&q=${encodeURIComponent(text)}`
        const res = await fetch(url)
        if (!res.ok) {
          setSuggestions([])
          setOpen(false)
          return
        }
        const data: NominatimResult[] = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch {
        // offline or network error — keep whatever is typed
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  function select(result: NominatimResult) {
    onChange({
      display: result.display_name,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    })
    setQuery(shortLabel(result.display_name))
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Zoek thuisadres..."
        className="w-full px-3 py-2.5 rounded-xl border border-stroke bg-white text-ink text-sm"
      />

      {loading && (
        <p className="text-xs text-ink-soft mt-1 px-1">Zoeken...</p>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute z-10 inset-x-0 top-full mt-1 bg-white rounded-xl border border-stroke shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={`${s.lat},${s.lon}`}
              type="button"
              onClick={() => select(s)}
              className="w-full text-left px-3 py-2.5 text-sm text-ink hover:bg-surface border-b last:border-b-0 border-stroke"
            >
              {shortLabel(s.display_name)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
