'use client'

import { useEffect, useState } from 'react'
import type { Intervention } from '@/types'
import { getOpenInterventions, getPlannedInterventions } from '@/lib/idb'
import { shouldSync, syncPendingWrites, syncToday } from '@/lib/sync'

const DEFAULT_TECHNICIAN_ID = 'u1'

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isToday(date: Date): boolean {
  return toLocalDateStr(date) === toLocalDateStr(new Date())
}

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

export function useDayData(technicianId: string = DEFAULT_TECHNICIAN_ID, date: Date = new Date()) {
  const [planned, setPlanned] = useState<Intervention[]>([])
  const [open, setOpen] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const dateStr = toLocalDateStr(date)

  useEffect(() => {
    let isCancelled = false

    async function load() {
      setLoading(true)
      setPlanned([])
      setOpen([])
      setError(null)
      setNotice(null)

      if (isToday(date)) {
        // Today: use IDB cache + sync logic
        const cached = await readCachedDayData()
        if (isCancelled) return

        setPlanned(cached.planned)
        setOpen(cached.open)

        const hasCachedData = cached.planned.length + cached.open.length > 0
        const canSync = typeof navigator !== 'undefined' ? navigator.onLine : true
        if (canSync) {
          const writeResult = await syncPendingWrites()
          if (isCancelled) return

          if (writeResult.synced > 0 || writeResult.conflict) {
            const refreshed = await readCachedDayData()
            if (isCancelled) return

            setPlanned(refreshed.planned)
            setOpen(refreshed.open)
          }

          setNotice(writeResult.notice ?? null)
        }

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
      } else {
        // Past/future date: fetch directly, skip IDB
        try {
          const res = await fetch(`/api/sync/today?technicianId=${technicianId}&date=${dateStr}`)
          if (isCancelled) return
          if (res.ok) {
            const data = await res.json() as { planned: Intervention[]; open: Intervention[] }
            setPlanned(sortPlanned(data.planned))
            setOpen(data.open)
          } else {
            setError('Kon planning niet laden')
          }
        } catch {
          setError('Kon planning niet laden')
        }
        setLoading(false)
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [technicianId, dateStr])

  const all = [...planned, ...open]
  const done = all.filter(intervention => intervention.status === 'afgewerkt').length

  return {
    planned,
    open,
    done,
    total: all.length,
    loading,
    error,
    notice,
  }
}
