/**
 * BreakTimelineCard — the movable midday break on the timeline.
 *
 * v1.7: Added start/stop button with GPS location capture.
 * When the tech starts their break, we grab their GPS position
 * and reverse-geocode it to show a readable address.
 * A live timer counts the elapsed break time.
 */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimelineRail, RailLine } from './TimelineRail'
import { getGeolocationErrorMessage } from './geolocationError'

type BreakState = 'idle' | 'active' | 'done'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BossuytServiceApp/1.0' },
    })
    if (!res.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    const data = await res.json()
    // Build a short address: road + city
    const a = data.address ?? {}
    const parts = [a.road, a.house_number].filter(Boolean).join(' ')
    const city = a.city || a.town || a.village || a.municipality || ''
    return [parts, city].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
  }
}

export function BreakTimelineCard({
  id,
  label,
}: {
  id: string
  minutes: number
  label: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const [breakState, setBreakState] = useState<BreakState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [location, setLocation] = useState<string | null>(null)
  const [locAccuracy, setLocAccuracy] = useState<number | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Pre-request location permission on mount so the browser prompt appears
  // early — before any notification banners or overlays that would block it.
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'prompt') {
        // Trigger the permission dialog now (result is discarded).
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, {
          enableHighAccuracy: false,
          timeout: 5000,
        })
      }
    }).catch(() => {
      // Permissions API not supported — we'll prompt on Start instead.
    })
  }, [])

  // Live timer while break is active
  useEffect(() => {
    if (breakState === 'active') {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [breakState])

  // Safety cleanup: if the component unmounts while we're still watching, release the GPS.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  // Target accuracy in meters: once the GPS fix is this good, we stop watching.
  const GOOD_ACCURACY_M = 50
  // Hard cutoff: after 20s we accept whatever we have.
  const WATCH_TIMEOUT_MS = 20000

  const handleStart = useCallback(() => {
    setBreakState('active')
    setElapsed(0)
    setLocation(null)
    setLocAccuracy(null)
    setLocError(null)

    if (!navigator.geolocation) {
      setLocError('GPS niet beschikbaar')
      return
    }

    setLocLoading(true)

    // Track the best fix we've seen so far — GPS accuracy improves over time.
    let bestAccuracy = Infinity
    let bestCoords: { lat: number; lon: number } | null = null

    const finishWith = async (coords: { lat: number; lon: number }, accuracy: number) => {
      setLocAccuracy(accuracy)
      const addr = await reverseGeocode(coords.lat, coords.lon)
      setLocation(addr)
      setLocLoading(false)
    }

    const stopWatching = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy
        if (acc < bestAccuracy) {
          bestAccuracy = acc
          bestCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          // Show intermediate accuracy so the user sees it tightening up.
          setLocAccuracy(Math.round(acc))
        }
        if (acc <= GOOD_ACCURACY_M) {
          stopWatching()
          void finishWith({ lat: pos.coords.latitude, lon: pos.coords.longitude }, acc)
        }
      },
      (err) => {
        stopWatching()
        setLocError(getGeolocationErrorMessage(err))
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: WATCH_TIMEOUT_MS, maximumAge: 0 },
    )

    // Hard timeout: if we never hit 50m, accept the best we have.
    setTimeout(() => {
      if (watchIdRef.current === null) return
      stopWatching()
      if (bestCoords) {
        void finishWith(bestCoords, bestAccuracy)
      } else {
        setLocError('Geen GPS-fix gekregen')
        setLocLoading(false)
      }
    }, WATCH_TIMEOUT_MS)
  }, [])

  const handleStop = useCallback(() => {
    setBreakState('done')
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  const isActive = breakState === 'active'
  const isDone = breakState === 'done'

  return (
    <div ref={setNodeRef} style={style}>
      <TimelineRail
        className="py-1"
        railContent={
          <>
            <RailLine variant="full" />
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-4 ring-surface ${
              isActive ? 'bg-brand-orange animate-pulse' : isDone ? 'bg-brand-green' : 'bg-stroke'
            }`} />
          </>
        }
      >
        <div className={`my-1 ml-3 flex flex-col rounded-xl overflow-hidden border ${
          isActive
            ? 'bg-brand-orange/10 border-brand-orange/40'
            : isDone
              ? 'bg-brand-green/10 border-brand-green/40'
              : 'bg-stroke/40 border-dashed border-stroke'
        }`}>
          <div className="flex">
            {/* drag handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Verplaats de pauze"
              className="w-8 shrink-0 flex items-center justify-center active:bg-stroke/70 cursor-grab touch-none"
            >
              <span className="text-ink-soft text-lg select-none">⋮⋮</span>
            </button>

            <div className="flex-1 flex items-center gap-2 px-3 py-2.5">
              <span className="text-lg" aria-hidden>{isDone ? '✅' : '☕'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
                  Pauze
                </p>
                <p className="text-sm font-bold text-ink">{label}</p>
              </div>

              {breakState === 'idle' && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-orange text-white active:scale-95 transition"
                >
                  Start
                </button>
              )}

              {isActive && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-brand-orange">
                    {formatElapsed(elapsed)}
                  </span>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-red text-white active:scale-95 transition"
                  >
                    Stop
                  </button>
                </div>
              )}

              {isDone && (
                <span className="text-xs font-semibold text-brand-green">
                  {formatElapsed(elapsed)}
                </span>
              )}
            </div>
          </div>

          {/* Location bar — shown when active or done */}
          {(isActive || isDone) && (
            <div className="px-3 pb-2.5 pl-11">
              <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span aria-hidden>📍</span>
                {locLoading && (
                  <span className="animate-pulse">
                    Locatie ophalen{locAccuracy !== null ? ` (±${locAccuracy}m)` : '...'}
                  </span>
                )}
                {locError && <span>{locError}</span>}
                {location && (
                  <span className="truncate">
                    {location}
                    {locAccuracy !== null && (
                      <span className="ml-1 text-ink-faint">±{Math.round(locAccuracy)}m</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </TimelineRail>
    </div>
  )
}
