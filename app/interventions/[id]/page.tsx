'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import AvatarMenu from '@/components/AvatarMenu'
import WerkbonForm from '@/components/WerkbonForm'
import type { Intervention } from '@/types'
import { getIntervention, upsertIntervention } from '@/lib/idb'

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1"  y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1"  y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

export default function InterventionPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const searchParams = useSearchParams()
  const [intervention, setIntervention] = useState<Intervention | null>(null)
  const [loading, setLoading] = useState(true)
  const initialActivityId = searchParams.get('activity') ?? undefined

  useEffect(() => {
    let cancelled = false

    async function loadIntervention() {
      setLoading(true)

      const cached = await getIntervention(id)
      if (cached) {
        if (!cancelled) {
          setIntervention(cached)
          setLoading(false)
        }
        return
      }

      try {
        const response = await fetch(`/api/interventions/${id}`)
        if (!response.ok) {
          if (!cancelled) {
            setIntervention(null)
            setLoading(false)
          }
          return
        }

        const data = await response.json() as { intervention: Intervention }
        await upsertIntervention(data.intervention)

        if (!cancelled) {
          setIntervention(data.intervention)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setIntervention(null)
          setLoading(false)
        }
      }
    }

    void loadIntervention()

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (loading || !intervention || typeof window === 'undefined') return
    if (window.location.hash !== '#activiteiten') return

    const scrollToActivities = () => {
      document.getElementById('activiteiten')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const timeoutId = window.setTimeout(scrollToActivities, 50)
    return () => window.clearTimeout(timeoutId)
  }, [intervention, loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F6F8' }}>
        <p className="text-sm" style={{ color: '#1F2933' }}>Job laden...</p>
      </div>
    )
  }

  // Not found
  if (!intervention) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F6F8' }}>
        <div className="text-center">
          <p className="font-bold text-lg mb-2" style={{ color: '#1F2933' }}>Job niet gevonden</p>
          <button onClick={() => router.push('/')} className="text-sm" style={{ color: '#F28C28' }}>
            Terug naar dagoverzicht
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>

      {/* Header */}
      <header style={{ backgroundColor: '#2F343A' }} className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide" style={{ color: '#fff' }}>bossuyt</p>
            <p className="text-xs leading-tight" style={{ color: '#6B7280' }}>werkbon</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#3A3F45', color: '#fff' }}
          >
            ← Terug
          </button>
          <AvatarMenu />
        </div>
      </header>

      {/* Urgency bar */}
      {intervention.isUrgent && (
        <div className="px-4 py-2 text-center text-sm font-bold text-white" style={{ backgroundColor: '#D64545' }}>
          ⚠ Dringende interventie
        </div>
      )}

      <main className="px-4 py-4">
        <WerkbonForm
          key={`${intervention.id}-${initialActivityId ?? 'default'}`}
          intervention={intervention}
          initialActivityId={initialActivityId}
        />
      </main>

    </div>
  )
}
