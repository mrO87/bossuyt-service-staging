'use client'

import { useRouter } from 'next/navigation'
import type { InterventionStatus } from '@/types'
import { interventions as MOCK_INTERVENTIONS } from '@/lib/mock-data'

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

// Left border color per job type
function getTypeBorderColor(type: string, isUrgent: boolean): string {
  if (isUrgent) return '#D64545'
  switch (type) {
    case 'warm':       return '#F28C28'
    case 'montage':    return '#4C6A85'
    case 'preventief': return '#2E9E5B'
    default:           return '#E5E7EB'
  }
}

function getStatusBadge(status: InterventionStatus) {
  switch (status) {
    case 'gepland':
      return { label: 'Gepland', bg: '#E5E7EB', color: '#6B7280' }
    case 'onderweg':
      return { label: 'Onderweg', bg: '#F28C28', color: '#fff' }
    case 'bezig':
      return { label: 'Bezig', bg: '#4C6A85', color: '#fff' }
    case 'wacht_onderdelen':
      return { label: 'Wacht onderdelen', bg: '#E5E7EB', color: '#6B7280' }
    case 'afgewerkt':
      return { label: 'Afgewerkt', bg: '#2E9E5B', color: '#fff' }
    case 'geannuleerd':
      return { label: 'Geannuleerd', bg: '#D64545', color: '#fff' }
    default:
      return { label: status, bg: '#E5E7EB', color: '#6B7280' }
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'warm':       return { label: 'Warm',       bg: '#F28C28', color: '#fff' }
    case 'montage':    return { label: 'Montage',    bg: '#4C6A85', color: '#fff' }
    case 'preventief': return { label: 'Preventief', bg: '#2E9E5B', color: '#fff' }
    default:           return { label: type,          bg: '#E5E7EB', color: '#6B7280' }
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

function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span
      style={{ backgroundColor: bg, color }}
      className="text-xs px-2.5 py-1 rounded-full font-medium"
    >
      {label}
    </span>
  )
}

export default function DayView() {
  const router = useRouter()
  const today = new Date()

  const done = MOCK_INTERVENTIONS.filter(i => i.status === 'afgewerkt').length
  const total = MOCK_INTERVENTIONS.length

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>

      {/* Header */}
      <header style={{ backgroundColor: '#2F343A' }} className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuyLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide" style={{ color: '#fff' }}>bossuyt</p>
            <p className="text-xs leading-tight" style={{ color: '#6B7280' }}>technieker</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: '#6B7280' }}>Vandaag</p>
            <p className="text-sm font-medium" style={{ color: '#fff' }}>{done}/{total} afgewerkt</p>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#F28C28' }}
          >
            <span className="text-white text-xs font-bold">OP</span>
          </div>
        </div>
      </header>

      {/* Date bar */}
      <div style={{ backgroundColor: '#2F343A', borderBottomColor: '#3A3F45' }} className="px-4 pb-3 border-b">
        <p className="text-sm capitalize" style={{ color: '#6B7280' }}>{formatDate(today)}</p>
      </div>

      {/* Job list */}
      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {MOCK_INTERVENTIONS.map((intervention) => {
          const status = getStatusBadge(intervention.status)
          const type = getTypeBadge(intervention.type)
          const borderColor = getTypeBorderColor(intervention.type, intervention.isUrgent)

          return (
            <div
              key={intervention.id}
              onClick={() => router.push(`/interventions/${intervention.id}`)}
              className="rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              {/* Left color border */}
              <div
                className="w-1 shrink-0"
                style={{ backgroundColor: borderColor }}
              />

              {/* Card content */}
              <div className="flex-1 p-4">
                {/* Top row */}
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base leading-tight" style={{ color: '#1F2933' }}>
                      {intervention.customerName}
                    </p>
                    <p className="text-sm" style={{ color: '#6B7280' }}>{intervention.siteCity}</p>
                  </div>
                  {/* Technician avatars */}
                  <div className="flex -space-x-2 ml-2 shrink-0">
                    {intervention.technicians.map((tech, i) => (
                      <div
                        key={tech.technicianId}
                        className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-white"
                        style={{ backgroundColor: i === 0 ? '#3A3F45' : '#4B5563' }}
                        title={tech.name}
                      >
                        <span className="text-white text-xs font-bold">{tech.initials}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Device */}
                {intervention.deviceBrand && (
                  <p className="text-sm font-medium mt-2" style={{ color: '#1F2933' }}>
                    {intervention.deviceBrand} {intervention.deviceModel}
                  </p>
                )}

                {/* Description */}
                <p className="text-sm mt-0.5 mb-3" style={{ color: '#6B7280' }}>
                  {intervention.description}
                </p>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge bg={type.bg} color={type.color} label={type.label} />
                  <Badge bg={status.bg} color={status.color} label={status.label} />
                  {intervention.estimatedMinutes && (
                    <Badge bg="#E5E7EB" color="#6B7280" label={formatMinutes(intervention.estimatedMinutes)} />
                  )}
                  {intervention.isUrgent && (
                    <Badge bg="#D64545" color="#fff" label="Dringend" />
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {MOCK_INTERVENTIONS.length === 0 && (
          <p className="text-center mt-16" style={{ color: '#6B7280' }}>
            Geen jobs gepland voor vandaag
          </p>
        )}
      </main>
    </div>
  )
}
