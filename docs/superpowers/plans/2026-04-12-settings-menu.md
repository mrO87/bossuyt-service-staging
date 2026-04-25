# Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings bottom sheet behind the OP-badge in the DayView header, with start location toggle (atelier / thuis + Nominatim autocomplete), start time picker, and a live overtime widget.

**Architecture:** A `useSettings` hook owns all localStorage state. Three presentational components (`SettingsSheet`, `AddressSearch`, `OvertimeWidget`) consume that hook. The existing `DayView` header OP-badge gets an `onClick` that opens the sheet via local `useState`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4. No test runner present — verification is done by running `npm run dev` and checking in browser.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/hooks/useSettings.ts` | Read/write settings from localStorage |
| Create | `components/SettingsSheet/index.tsx` | Bottom sheet container, open/close animation, all three sections |
| Create | `components/SettingsSheet/AddressSearch.tsx` | Nominatim autocomplete input + suggestions dropdown |
| Create | `components/SettingsSheet/OvertimeWidget.tsx` | Live elapsed timer + saldo placeholder |
| Modify | `components/DayView/DayView.tsx` | Wire OP-badge onClick, import & render SettingsSheet |

---

## Task 1: useSettings hook

**Files:**
- Create: `lib/hooks/useSettings.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/hooks/useSettings.ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no errors in `lib/hooks/useSettings.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useSettings.ts
git commit -m "feat: add useSettings hook for localStorage-backed technician prefs"
```

---

## Task 2: OvertimeWidget component

**Files:**
- Create: `components/SettingsSheet/OvertimeWidget.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/SettingsSheet/OvertimeWidget.tsx
'use client'

import { useState, useEffect } from 'react'

interface Props {
  startTime: string   // "HH:MM"
  saldo: number | null  // total overtime in minutes; null = not yet loaded from DB
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}u${m.toString().padStart(2, '0')}`
}

function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}u${m}min`
  if (h > 0) return `${h}u`
  return `${m}min`
}

function formatSaldo(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  return `${sign}${h}u${m.toString().padStart(2, '0')}`
}

const TARGET_MINUTES = 7 * 60 + 45  // 7u45

export default function OvertimeWidget({ startTime, saldo }: Props) {
  const [elapsed, setElapsed] = useState(0)  // minutes since startTime

  useEffect(() => {
    function update() {
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const startMinutes = parseMinutes(startTime)
      setElapsed(Math.max(0, nowMinutes - startMinutes))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [startTime])

  const progress = Math.min(100, (elapsed / TARGET_MINUTES) * 100)
  const remaining = TARGET_MINUTES - elapsed

  return (
    <div className="rounded-xl border border-stroke bg-surface p-4">
      <div className="flex justify-between items-start mb-3">
        {/* Vandaag */}
        <div>
          <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">
            Vandaag
          </p>
          <p className="text-2xl font-bold text-brand-orange leading-none">
            {formatElapsed(elapsed)}
            <span className="text-sm font-normal text-ink-soft ml-1">/ 7u45</span>
          </p>
        </div>

        {/* Saldo */}
        <div className="text-right">
          <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">
            Saldo
          </p>
          {saldo === null ? (
            <p className="text-2xl font-bold text-ink-soft leading-none">--u--</p>
          ) : (
            <p className={`text-2xl font-bold leading-none ${saldo >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
              {formatSaldo(saldo)}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-stroke rounded-full mb-2">
        <div
          className="h-1.5 bg-brand-orange rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status line */}
      <div className="mb-2">
        {remaining > 0 ? (
          <p className="text-xs text-ink-soft">
            Nog {formatRemaining(remaining)} tot einde dag
          </p>
        ) : (
          <p className="text-xs text-brand-orange font-medium">Dagdoel bereikt</p>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-ink-soft italic">
        Berekende tijden — nog niet goedgekeurd
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no errors in `components/SettingsSheet/OvertimeWidget.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/SettingsSheet/OvertimeWidget.tsx
git commit -m "feat: add OvertimeWidget with live elapsed timer and saldo placeholder"
```

---

## Task 3: AddressSearch component

**Files:**
- Create: `components/SettingsSheet/AddressSearch.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/SettingsSheet/AddressSearch.tsx
'use client'

import { useState, useRef } from 'react'
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
          {suggestions.map((s, i) => (
            <button
              key={i}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no errors in `components/SettingsSheet/AddressSearch.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/SettingsSheet/AddressSearch.tsx
git commit -m "feat: add AddressSearch with Nominatim autocomplete for Belgian addresses"
```

---

## Task 4: SettingsSheet container

**Files:**
- Create: `components/SettingsSheet/index.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/SettingsSheet/index.tsx
'use client'

import { useEffect } from 'react'
import { useSettings } from '@/lib/hooks/useSettings'
import AddressSearch from './AddressSearch'
import OvertimeWidget from './OvertimeWidget'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsSheet({ open, onClose }: Props) {
  const { settings, updateSetting } = useSettings()

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Sheet */}
      <div
        className={[
          'fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl',
          'transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stroke" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stroke">
          <h2 className="text-base font-bold text-ink">Instellingen</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface text-ink-soft text-lg leading-none"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-5 pb-10 max-h-[80vh] overflow-y-auto">

          {/* — Startlocatie — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Startlocatie
            </p>
            <div className="flex rounded-xl overflow-hidden border border-stroke">
              <button
                onClick={() => updateSetting('startLocation', 'atelier')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'atelier'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Atelier
              </button>
              <button
                onClick={() => updateSetting('startLocation', 'thuis')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'thuis'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Thuis
              </button>
            </div>

            {settings.startLocation === 'atelier' && (
              <p className="mt-2 text-xs text-ink-soft">
                Bossuyt Kitchen, Noordlaan 19, 8520 Kuurne
              </p>
            )}

            {settings.startLocation === 'thuis' && (
              <div className="mt-2">
                <AddressSearch
                  value={settings.homeAddress}
                  onChange={(addr) => updateSetting('homeAddress', addr)}
                />
              </div>
            )}
          </div>

          {/* — Gewenst startuur — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Gewenst startuur
            </p>
            <input
              type="time"
              value={settings.startTime}
              onChange={(e) => updateSetting('startTime', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stroke bg-surface text-ink text-base font-semibold"
            />
          </div>

          {/* — Overuren — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Overuren
            </p>
            <OvertimeWidget startTime={settings.startTime} saldo={null} />
          </div>

        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no errors in `components/SettingsSheet/`

- [ ] **Step 3: Commit**

```bash
git add components/SettingsSheet/index.tsx
git commit -m "feat: add SettingsSheet bottom sheet with startlocatie, startuur and overuren sections"
```

---

## Task 5: Wire OP-badge in DayView

**Files:**
- Modify: `components/DayView/DayView.tsx`

The OP-badge is at line 129 of `DayView.tsx`. Three changes:
1. Add `useState` import (already imported via React — add `useState` to the destructure)
2. Import `SettingsSheet`
3. Add `settingsOpen` state and toggle the badge's `onClick`
4. Render `<SettingsSheet>` inside the component return

- [ ] **Step 1: Add useState to the existing React imports and import SettingsSheet**

Find at the top of `components/DayView/DayView.tsx`:
```tsx
import { useRouter } from 'next/navigation'
```

Replace with:
```tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SettingsSheet from '@/components/SettingsSheet'
```

- [ ] **Step 2: Add settingsOpen state inside the DayView component**

Find (inside `export default function DayView()`):
```tsx
  const router = useRouter()
  const today = new Date()
```

Replace with:
```tsx
  const router = useRouter()
  const today = new Date()
  const [settingsOpen, setSettingsOpen] = useState(false)
```

- [ ] **Step 3: Add onClick to the OP badge**

Find:
```tsx
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-orange">
            <span className="text-white text-xs font-bold">OP</span>
          </div>
```

Replace with:
```tsx
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-orange active:opacity-80 transition-opacity"
            aria-label="Instellingen openen"
          >
            <span className="text-white text-xs font-bold">OP</span>
          </button>
```

- [ ] **Step 4: Render SettingsSheet in the component return**

Find:
```tsx
      </main>
    </div>
  )
}
```

Replace with:
```tsx
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Start dev server and test manually**

Run: `npm run dev`

Check in browser at http://localhost:3000:
- [ ] Tap the OP badge → bottom sheet slides up
- [ ] "Atelier" is selected by default, shows the Kuurne address below
- [ ] Switch to "Thuis" → address autocomplete input appears
- [ ] Type 3+ characters in the address field → Nominatim suggestions appear
- [ ] Select a suggestion → input fills, dropdown closes
- [ ] Switch back to "Atelier" → address input hides
- [ ] Startuur shows 07:30, can be changed
- [ ] OvertimeWidget shows elapsed time since startuur and "--u--" for saldo
- [ ] Disclaimer "Berekende tijden — nog niet goedgekeurd" zichtbaar
- [ ] Tap overlay (dark area) → sheet closes
- [ ] Tap ✕ button → sheet closes
- [ ] Refresh page → settings still set (localStorage persisted)

- [ ] **Step 7: Commit**

```bash
git add components/DayView/DayView.tsx
git commit -m "feat: open settings sheet from OP badge in DayView header"
```

---

## Done

All five tasks complete. The settings sheet is fully wired. Future work:
- Replace `saldo={null}` in `SettingsSheet/index.tsx` with a real API call to `/api/user/overtime` once that endpoint exists
- Add swipe-to-close gesture (optional UX improvement)
- Replace hardcoded "OP" initials with the authenticated user's initials from NextAuth session
