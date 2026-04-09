'use client'

/**
 * DayView — het dagoverzicht van de technieker.
 *
 * v1.6: de Planning-sectie is nu een route-timeline (DayTimeline).
 * Start → rijtijd → job → rijtijd → job → pauze → rijtijd → job → rijtijd → einde.
 *
 * De open pool blijft als aparte sectie onderaan staan.
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Intervention, InterventionStatus, InterventionType } from '@/types'
import { interventions as MOCK_INTERVENTIONS } from '@/lib/mock-data'
import { usePushNotifications } from '@/lib/usePushNotifications'
import { DayTimeline } from '@/components/DayTimeline/DayTimeline'

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

export default function DayView() {
  const router = useRouter()
  const today = new Date()
  const { subscribed, loading, error, subscribe, sendTestNotification } = usePushNotifications()

  const planned = useMemo<Intervention[]>(
    () =>
      MOCK_INTERVENTIONS
        .filter(i => i.source === 'planned')
        .sort((a, b) => {
          const ao = a.technicians.find(t => t.isLead)?.plannedOrder ?? 0
          const bo = b.technicians.find(t => t.isLead)?.plannedOrder ?? 0
          return ao - bo
        }),
    [],
  )
  const openPool = useMemo<Intervention[]>(
    () => MOCK_INTERVENTIONS.filter(i => i.source === 'reactive'),
    [],
  )

  const done = MOCK_INTERVENTIONS.filter(i => i.status === 'afgewerkt').length
  const total = MOCK_INTERVENTIONS.length

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
            <p className="text-xs text-ink-soft">Vandaag</p>
            <p className="text-sm font-medium text-white">{done}/{total} afgewerkt</p>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-orange">
            <span className="text-white text-xs font-bold">OP</span>
          </div>
        </div>
      </header>

      {/* Date bar */}
      <div className="bg-brand-dark border-b border-brand-mid px-4 pb-3">
        <p className="text-sm capitalize text-ink-soft">{formatDate(today)}</p>
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
        {/* ---------- Planning — route timeline ---------- */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold tracking-wide text-ink uppercase">
            Planning
          </h2>
          <span className="text-[11px] text-ink-soft">sleep om te herschikken</span>
        </div>

        <DayTimeline plannedInterventions={planned} />

        {/* ---------- Open pool ---------- */}
        <div className="flex items-center justify-between mt-8 mb-2">
          <h2 className="text-sm font-bold tracking-wide text-ink uppercase">
            Open pool
          </h2>
          <span className="text-[11px] text-ink-soft">{openPool.length} extra beschikbaar</span>
        </div>
        <p className="text-xs text-ink-soft mb-3">
          Flexibele jobs — pak er eentje op als je tijd over hebt. Ze
          worden niet in de route meegerekend tot je ze toewijst.
        </p>

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

        {openPool.length === 0 && (
          <p className="text-center mt-6 text-ink-soft text-sm">
            Geen jobs in de pool
          </p>
        )}
      </main>
    </div>
  )
}
