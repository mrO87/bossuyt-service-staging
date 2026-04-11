'use client'

import { useEffect, useState } from 'react'
import type { Intervention } from '@/types'
import { getOpenInterventions, getPlannedInterventions } from '@/lib/idb'
import { shouldSync, syncToday } from '@/lib/sync'

const DEFAULT_TECHNICIAN_ID = 'u1'

function sortPlanned(interventions: Intervention[]): Intervention[] {
  return [...interventions].sort((a, b) => {
    const aLead = a.technicians.find(technician => technician.isLead)?.plannedOrder ?? Number.MAX_SAFE_INTEGER
    const bLead = b.technicians.find(technician => technician.isLead)?.plannedOrder ?? Number.MAX_SAFE_INTEGER
    return aLead - bLead
  })
}

async function readCachedDayData(): Promise<{ planned: Intervention[]; open: Intervention[] }> {
  const [planned, open] = await Promise.all([
    getPlannedInterventions(),
    getOpenInterventions(),
  ])

  return {
    planned: sortPlanned(planned),
    open,
  }
}

export function useDayData(technicianId: string = DEFAULT_TECHNICIAN_ID) {
  const [planned, setPlanned] = useState<Intervention[]>([])
  const [open, setOpen] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function load() {
      setLoading(true)

      const cached = await readCachedDayData()
      if (isCancelled) return

      setPlanned(cached.planned)
      setOpen(cached.open)

      const hasCachedData = cached.planned.length + cached.open.length > 0
      const canSync = typeof navigator !== 'undefined' ? navigator.onLine : true
      const needsSync = canSync
        ? !hasCachedData || await shouldSync(technicianId)
        : !hasCachedData

      if (!needsSync) {
        setError(null)
        setLoading(false)
        return
      }

      const result = await syncToday(technicianId)
      if (isCancelled) return

      const fresh = await readCachedDayData()
      if (isCancelled) return

      setPlanned(fresh.planned)
      setOpen(fresh.open)
      setError(result.success ? null : result.error ?? 'Synchronisatie mislukt')
      setLoading(false)
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [technicianId])

  const all = [...planned, ...open]
  const done = all.filter(intervention => intervention.status === 'afgewerkt').length

  return {
    planned,
    open,
    done,
    total: all.length,
    loading,
    error,
  }
}
