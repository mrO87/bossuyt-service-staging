'use client'

/**
 * DayView — het dagoverzicht van de technieker.
 *
 * v1.6: de Planning-sectie is nu een route-timeline (DayTimeline).
 * Start → rijtijd → job → rijtijd → job → pauze → rijtijd → job → rijtijd → einde.
 *
 * De open pool blijft als aparte sectie onderaan staan.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SettingsSheet from '@/components/SettingsSheet'
import CalendarSheet from '@/components/CalendarSheet'
import { useSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import type { InterventionStatus, InterventionType } from '@/types'
import { usePushNotifications } from '@/lib/usePushNotifications'
import { DayTimeline } from '@/components/DayTimeline/DayTimeline'
import { useDayData } from '@/lib/useDayData'

// ---------- helpers ----------

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date)
}

function formatMinutes(minutes?: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}u`
  return `${h}u${m}`
}

function typeBorderClass(type: InterventionType, urgent: boolean): string {
  if (urgent) return 'bg-brand-red'
  switch (type) {
    case 'warm':       return 'bg-brand-orange'
    case 'montage':    return 'bg-brand-blue'
    case 'preventief': return 'bg-brand-green'
  }
}
function typeClass(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'bg-brand-orange text-white'
    case 'montage':    return 'bg-brand-blue text-white'
    case 'preventief': return 'bg-brand-green text-white'
  }
}
function typeLabel(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'Warm'
    case 'montage':    return 'Montage'
    case 'preventief': return 'Preventief'
  }
}
function statusClass(status: InterventionStatus): string {
  switch (status) {
    case 'onderweg':         return 'bg-brand-orange text-white'
    case 'bezig':            return 'bg-brand-blue text-white'
    case 'afgewerkt':        return 'bg-brand-green text-white'
    case 'geannuleerd':      return 'bg-brand-red text-white'
    default:                 return 'bg-stroke text-ink-soft'
  }
}
function statusLabel(status: InterventionStatus): string {
  switch (status) {
    case 'aangemaakt':       return 'Aangemaakt'
    case 'gepland':          return 'Gepland'
    case 'onderweg':         return 'Onderweg'
    case 'bezig':            return 'Bezig'
    case 'wacht_onderdelen': return 'Wacht onderdelen'
    case 'afgewerkt':        return 'Afgewerkt'
    case 'geannuleerd':      return 'Geannuleerd'
  }
}

function BossuyLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1"  y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1"  y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

function Badge({ className, label }: { className: string; label: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${className}`}>
      {label}
    </span>
  )
}

// ---------- main view ----------

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function DayView() {
  const router = useRouter()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showOpenPool, setShowOpenPool] = useState(true)

  function navigate(delta: number) {
    setSelectedDate(d => {
      const next = new Date(d)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  function isSelectedToday(): boolean {
    return toLocalDateStr(selectedDate) === toLocalDateStr(today)
  }
  const { subscribed, loading, error, subscribe, sendTestNotification } = usePushNotifications()
  const { currentUser, getOpenTaskCountForUser } = useTasks()
  const { settings } = useSettings()
  const {
    planned,
    open: openPool,
    done,
    total,
    error: dayDataError,
    notice,
  } = useDayData(currentUser.id, selectedDate)
  const openTaskCount = getOpenTaskCountForUser(currentUser.id)

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuyLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">technieker</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-ink-soft">
              {isSelectedToday() ? 'Vandaag' : new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: 'short' }).format(selectedDate)}
            </p>
            <p className="text-sm font-medium text-white">{done}/{total} afgewerkt</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center bg-brand-orange active:opacity-80 transition-opacity"
            aria-label="Instellingen openen"
          >
            <span className="text-white text-sm font-bold">{currentUser.initials}</span>
            {openTaskCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-brand-red text-[10px] font-bold text-white flex items-center justify-center">
                {openTaskCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Date bar with navigation */}
      <div className="bg-brand-dark border-b border-brand-mid px-2 pb-2">
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-brand-mid/40 transition-colors text-ink-soft"
            aria-label="Vorige dag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={() => setCalendarOpen(true)}
            className="flex-1 flex flex-col items-center py-1 active:opacity-70 transition-opacity"
            aria-label="Kalender openen"
          >
            <p className="text-sm capitalize text-ink-soft">{formatDate(selectedDate)}</p>
            {isSelectedToday() && (
              <span className="text-[10px] font-semibold text-brand-orange leading-none mt-0.5">Vandaag</span>
            )}
          </button>
          <button
            onClick={() => navigate(1)}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-brand-mid/40 transition-colors text-ink-soft"
            aria-label="Volgende dag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Push notification bar */}
      {!subscribed && (
        <div className="bg-ink px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">
            {error ?? 'Schakel meldingen in om nieuwe jobs te ontvangen'}
          </p>
          <button
            onClick={subscribe}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 bg-brand-orange text-white"
          >
            {loading ? 'Even wachten...' : 'Inschakelen'}
          </button>
        </div>
      )}
      {subscribed && (
        <div className="bg-brand-green px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-white">Meldingen actief</p>
          <button
            onClick={sendTestNotification}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-brand-green"
          >
            Stuur testmelding
          </button>
        </div>
      )}

      <main className="px-4 py-4 pb-24">
        {dayDataError && (
          <div className="mb-4 rounded-xl border border-brand-orange/30 bg-brand-orange/10 px-3 py-2 text-xs text-ink">
            {dayDataError}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-brand-blue/30 bg-brand-blue/10 px-3 py-2 text-xs text-ink">
            {notice}
          </div>
        )}

        {/* ---------- Planning — route timeline ---------- */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold tracking-wide text-ink uppercase">
            Planning
          </h2>
          <span className="text-[11px] text-ink-soft">sleep om te herschikken</span>
        </div>

          <DayTimeline plannedInterventions={planned} settings={settings} />

        {/* ---------- Open pool ---------- */}
        <div className="flex items-center justify-between mt-8 mb-2">
          <h2 className="text-sm font-bold tracking-wide text-ink uppercase">
            Open pool
          </h2>
          <button
            onClick={() => setShowOpenPool(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stroke text-ink-soft text-[11px] font-semibold active:opacity-70 transition-opacity"
          >
            {showOpenPool ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Verbergen
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {openPool.length} tonen
              </>
            )}
          </button>
        </div>

        {showOpenPool && (
        <p className="text-xs text-ink-soft mb-3">
          Flexibele jobs — pak er eentje op als je tijd over hebt. Ze
          worden niet in de route meegerekend tot je ze toewijst.
        </p>
        )}

        {showOpenPool && (
        <div className="flex flex-col gap-3">
          {openPool.map(intervention => (
            <div
              key={intervention.id}
              onClick={() => router.push(`/interventions/${intervention.id}`)}
              className="rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden bg-white/70 border border-dashed border-stroke"
            >
              <div className={`w-1 shrink-0 ${typeBorderClass(intervention.type, intervention.isUrgent)}`} />
              <div className="flex-1 p-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight text-ink">{intervention.customerName}</p>
                    <p className="text-xs text-ink-soft">{intervention.siteCity}</p>
                  </div>
                </div>
                {intervention.deviceBrand && (
                  <p className="text-xs font-medium mt-1 text-ink">
                    {intervention.deviceBrand} {intervention.deviceModel}
                  </p>
                )}
                {intervention.description && (
                  <p className="text-xs mt-0.5 mb-2 text-ink-soft">{intervention.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={typeClass(intervention.type)} label={typeLabel(intervention.type)} />
                  <Badge className={statusClass(intervention.status)} label={statusLabel(intervention.status)} />
                  {intervention.estimatedMinutes && (
                    <Badge className="bg-stroke text-ink-soft" label={formatMinutes(intervention.estimatedMinutes)} />
                  )}
                  {intervention.isUrgent && <Badge className="bg-brand-red text-white" label="Dringend" />}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {showOpenPool && openPool.length === 0 && (
          <p className="text-center mt-6 text-ink-soft text-sm">
            Geen jobs in de pool
          </p>
        )}
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selected={selectedDate}
        onSelect={(date) => { setSelectedDate(date); setCalendarOpen(false) }}
        technicianId={currentUser.id}
      />
    </div>
  )
}
