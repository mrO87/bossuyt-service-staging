'use client'

import { useState, useRef, useEffect } from 'react'
import { formatAddressLabel, type HomeAddress } from '@/lib/hooks/useSettings'

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

interface Props {
  value: HomeAddress | null
  onChange: (addr: HomeAddress) => void
}

function normalizeQuery(text: string): string {
  return text
    .trim()
    .replace(/\bte\b/gi, ' ')
    .replace(/\s+in\s+/gi, ' ')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
}

function buildCandidateQueries(query: string): string[] {
  const normalized = normalizeQuery(query)
  const variants = [
    query.trim(),
    normalized,
    normalized.replace(/\s+(\d+[A-Za-z/-]*)\s+/, ' $1, '),
    normalized.replace(/\s+/, ', '),
  ]

  return [...new Set(variants.filter(candidate => candidate.length >= 3))]
}

async function fetchSuggestions(query: string): Promise<NominatimResult[]> {
  const candidateQueries = buildCandidateQueries(query)
  const results: NominatimResult[] = []
  const seen = new Set<string>()

  for (const candidate of candidateQueries) {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&countrycodes=be&limit=5&q=${encodeURIComponent(candidate)}`
    const res = await fetch(url)
    if (!res.ok) continue

    const data: NominatimResult[] = await res.json()
    data.forEach(result => {
      const key = `${result.lat},${result.lon}`
      if (seen.has(key)) return
      seen.add(key)
      results.push(result)
    })

    if (results.length >= 5) {
      return results.slice(0, 5)
    }
  }

  return results
}

export default function AddressSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value ? formatAddressLabel(value.display) : '')
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(value ? formatAddressLabel(value.display) : '')
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
        const data = await fetchSuggestions(text)
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
    setQuery(formatAddressLabel(result.display_name))
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
              {formatAddressLabel(s.display_name)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
