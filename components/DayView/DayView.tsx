'use client'

import { useRouter } from 'next/navigation'
import type { InterventionStatus } from '@/types'
import { interventions as MOCK_INTERVENTIONS } from '@/lib/mock-data'
import { usePushNotifications } from '@/lib/usePushNotifications'

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

// Tailwind bg class for the left color strip per job type / urgency
function getTypeBorderClass(type: string, isUrgent: boolean): string {
  if (isUrgent) return 'bg-brand-red'
  switch (type) {
    case 'warm':       return 'bg-brand-orange'
    case 'montage':    return 'bg-brand-blue'
    case 'preventief': return 'bg-brand-green'
    default:           return 'bg-stroke'
  }
}

// Returns the Tailwind classes for each status badge
function getStatusClass(status: InterventionStatus): string {
  switch (status) {
    case 'gepland':          return 'bg-stroke text-ink-soft'
    case 'onderweg':         return 'bg-brand-orange text-white'
    case 'bezig':            return 'bg-brand-blue text-white'
    case 'wacht_onderdelen': return 'bg-stroke text-ink-soft'
    case 'afgewerkt':        return 'bg-brand-green text-white'
    case 'geannuleerd':      return 'bg-brand-red text-white'
    default:                 return 'bg-stroke text-ink-soft'
  }
}

function getStatusLabel(status: InterventionStatus): string {
  switch (status) {
    case 'gepland':          return 'Gepland'
    case 'onderweg':         return 'Onderweg'
    case 'bezig':            return 'Bezig'
    case 'wacht_onderdelen': return 'Wacht onderdelen'
    case 'afgewerkt':        return 'Afgewerkt'
    case 'geannuleerd':      return 'Geannuleerd'
    default:                 return status
  }
}

function getTypeClass(type: string): string {
  switch (type) {
    case 'warm':       return 'bg-brand-orange text-white'
    case 'montage':    return 'bg-brand-blue text-white'
    case 'preventief': return 'bg-brand-green text-white'
    default:           return 'bg-stroke text-ink-soft'
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'warm':       return 'Warm'
    case 'montage':    return 'Montage'
    case 'preventief': return 'Preventief'
    default:           return type
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
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${className}`}>
      {label}
    </span>
  )
}

export default function DayView() {
  const router = useRouter()
  const today  = new Date()
  const { subscribed, loading, error, subscribe, sendTestNotification } = usePushNotifications()

  const done  = MOCK_INTERVENTIONS.filter(i => i.status === 'afgewerkt').length
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

      {/* Push notification bar — shown until subscribed */}
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

      {/* Test button — only shown after subscribing */}
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

      {/* Job list */}
      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {MOCK_INTERVENTIONS.map((intervention) => (
          <div
            key={intervention.id}
            onClick={() => router.push(`/interventions/${intervention.id}`)}
            className="rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden bg-white border border-stroke shadow-sm"
          >
            {/* Left color strip — indicates job type or urgency */}
            <div className={`w-1 shrink-0 ${getTypeBorderClass(intervention.type, intervention.isUrgent)}`} />

            {/* Card content */}
            <div className="flex-1 p-4">
              {/* Top row */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base leading-tight text-ink">
                    {intervention.customerName}
                  </p>
                  <p className="text-sm text-ink-soft">{intervention.siteCity}</p>
                </div>
                {/* Technician avatars */}
                <div className="flex -space-x-2 ml-2 shrink-0">
                  {intervention.technicians.map((tech, i) => (
                    <div
                      key={tech.technicianId}
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white ${i === 0 ? 'bg-brand-mid' : 'bg-gray-600'}`}
                      title={tech.name}
                    >
                      <span className="text-white text-xs font-bold">{tech.initials}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Device */}
              {intervention.deviceBrand && (
                <p className="text-sm font-medium mt-2 text-ink">
                  {intervention.deviceBrand} {intervention.deviceModel}
                </p>
              )}

              {/* Description */}
              <p className="text-sm mt-0.5 mb-3 text-ink-soft">
                {intervention.description}
              </p>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getTypeClass(intervention.type)} label={getTypeLabel(intervention.type)} />
                <Badge className={getStatusClass(intervention.status)} label={getStatusLabel(intervention.status)} />
                {intervention.estimatedMinutes && (
                  <Badge className="bg-stroke text-ink-soft" label={formatMinutes(intervention.estimatedMinutes)} />
                )}
                {intervention.isUrgent && (
                  <Badge className="bg-brand-red text-white" label="Dringend" />
                )}
              </div>
            </div>
          </div>
        ))}

        {MOCK_INTERVENTIONS.length === 0 && (
          <p className="text-center mt-16 text-ink-soft">
            Geen jobs gepland voor vandaag
          </p>
        )}
      </main>
    </div>
  )
}
