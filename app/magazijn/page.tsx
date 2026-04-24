'use client'

import { useCallback, useEffect, useState } from 'react'
import AvatarMenu from '@/components/AvatarMenu'
import type { WarehouseGroup, WarehouseQueueResponse } from '@/app/api/warehouse/queue/route'
import type { DbTask, DbTaskStatus } from '@/types'

// ── Bossuyt logo (matches every other page in the app) ───────────────────────
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

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  ready:       { label: 'Te bestellen',  cls: 'bg-orange-100 text-orange-700' },
  in_progress: { label: 'Besteld',       cls: 'bg-blue-100   text-blue-700'   },
  done:        { label: 'Ontvangen',     cls: 'bg-green-100  text-green-700'  },
}
function statusBadge(s: DbTaskStatus) {
  return STATUS[s] ?? { label: s, cls: 'bg-surface text-ink-soft' }
}

// ── Individual part row ───────────────────────────────────────────────────────
function PartRow({
  task,
  onAction,
  busy,
  readOnly,
}: {
  task:     DbTask
  onAction: (id: string, action: 'start' | 'complete') => void
  busy:     boolean
  readOnly: boolean
}) {
  const p      = (task.payload ?? {}) as Record<string, unknown>
  const code   = String(p.part_number ?? '')
  const desc   = String(p.description ?? task.title ?? '—')
  const qty    = Number(p.quantity ?? 1)
  const urgent = p.urgency === 'urgent'
  const badge  = statusBadge(task.status as DbTaskStatus)

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-stroke last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          {urgent && <span className="w-2 h-2 rounded-full bg-brand-red shrink-0" />}
          {code && <span className="font-mono text-[11px] text-ink-faint bg-surface rounded px-1.5 py-0.5">{code}</span>}
          <span className="text-xs font-bold text-ink">{qty}×</span>
        </div>
        <p className="text-sm text-ink leading-snug">{desc}</p>
        <span className={`mt-1 inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {!readOnly && (
        <div className="shrink-0">
          {task.status === 'ready' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(task.id, 'start')}
              className="min-h-[44px] min-w-[100px] px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold shadow-sm disabled:opacity-40 active:scale-95 transition-transform"
            >
              {busy ? '…' : 'Besteld ✓'}
            </button>
          )}
          {task.status === 'in_progress' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(task.id, 'complete')}
              className="min-h-[44px] min-w-[100px] px-4 rounded-xl bg-brand-green text-white text-sm font-semibold shadow-sm disabled:opacity-40 active:scale-95 transition-transform"
            >
              {busy ? '…' : 'Ontvangen ✓'}
            </button>
          )}
        </div>
      )}

      {readOnly && task.status === 'done' && (
        <span className="text-brand-green text-xl shrink-0">✓</span>
      )}
    </div>
  )
}

// ── Work order group card ─────────────────────────────────────────────────────
function OrderCard({
  group,
  onAction,
  busyIds,
  readOnly,
}: {
  group:    WarehouseGroup
  onAction: (id: string, action: 'start' | 'complete') => void
  busyIds:  Set<string>
  readOnly: boolean
}) {
  const allOrdered = !readOnly && group.tasks.every(t => t.status === 'in_progress')
  const borderColor = readOnly
    ? 'border-l-4 border-l-brand-green'
    : group.isUrgent
      ? 'border-l-4 border-l-brand-red'
      : 'border-l-4 border-l-brand-orange'

  return (
    <div className={`rounded-xl border border-stroke bg-white shadow-sm overflow-hidden ${borderColor}`}>
      {/* Card header */}
      <div className="px-4 py-3 bg-white border-b border-stroke">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-base text-ink leading-tight">{group.customerName}</p>
              {group.isUrgent && !readOnly && (
                <span className="text-[11px] font-bold text-brand-red bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  DRINGEND
                </span>
              )}
              {allOrdered && (
                <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  Alles besteld
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5 truncate">{group.siteName}</p>
            <p className="text-xs text-ink-faint mt-0.5">
              {group.deviceBrand} {group.deviceModel}
            </p>
          </div>
          <div className="shrink-0 text-right pt-0.5">
            <p className="text-xs font-semibold text-ink">
              {group.tasks.length} st.
            </p>
            {group.plannedDate && (
              <p className="text-[11px] text-ink-faint mt-0.5">
                {new Date(group.plannedDate).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Parts list */}
      <div>
        {group.tasks.map(task => (
          <PartRow
            key={task.id}
            task={task}
            onAction={onAction}
            busy={busyIds.has(task.id)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MagazijnPage() {
  const [groups,     setGroups]     = useState<WarehouseGroup[]>([])
  const [doneToday,  setDoneToday]  = useState<WarehouseGroup[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [busyIds,    setBusyIds]    = useState<Set<string>>(new Set())
  const [showDone,   setShowDone]   = useState(false)

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true)
    setError(null)
    try {
      const res  = await fetch('/api/warehouse/queue', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as WarehouseQueueResponse
      setGroups(data.groups)
      setDoneToday(data.doneToday ?? [])
    } catch {
      setError('Kon wachtrij niet laden. Controleer je verbinding en probeer opnieuw.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  // ── Transition ──────────────────────────────────────────────────────────────
  const handleAction = useCallback(async (taskId: string, action: 'start' | 'complete') => {
    setBusyIds(prev => new Set(prev).add(taskId))
    try {
      const res = await fetch(`/api/tasks/${taskId}/transition`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, changed_by: 'warehouse' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const { task: updated } = await res.json() as { task: DbTask }

      if (updated.status === 'done') {
        // Move task from active groups → doneToday
        setGroups(prev => {
          const next = prev.map(g => ({
            ...g,
            tasks: g.tasks.filter(t => t.id !== taskId),
          })).filter(g => g.tasks.length > 0)
          return next
        })
        setDoneToday(prev => {
          // Find the work order group this task belongs to
          const sourceGroup = groups.find(g => g.tasks.some(t => t.id === taskId))
          if (!sourceGroup) return prev
          const existing = prev.find(g => g.workOrderId === sourceGroup.workOrderId)
          if (existing) {
            return prev.map(g => g.workOrderId === sourceGroup.workOrderId
              ? { ...g, tasks: [...g.tasks, updated] }
              : g)
          }
          return [{ ...sourceGroup, tasks: [updated] }, ...prev]
        })
        setShowDone(true)
      } else {
        // Update in place (ready → in_progress)
        setGroups(prev => prev.map(g => ({
          ...g,
          tasks: g.tasks.map(t => t.id === taskId ? updated : t),
        })))
      }
    } catch (err) {
      alert(`Fout: ${err instanceof Error ? err.message : 'Onbekende fout'}`)
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
    }
  }, [groups])

  // ── Derived counts ──────────────────────────────────────────────────────────
  const toOrderCount  = groups.reduce((n, g) => n + g.tasks.filter(t => t.status === 'ready').length, 0)
  const orderedCount  = groups.reduce((n, g) => n + g.tasks.filter(t => t.status === 'in_progress').length, 0)
  const doneTodayCount = doneToday.reduce((n, g) => n + g.tasks.length, 0)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface">

      {/* ── Header ── */}
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">magazijn</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadQueue(true)}
            disabled={refreshing || loading}
            className="rounded-lg bg-brand-mid px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {refreshing ? '↻' : '↻ Sync'}
          </button>
          <AvatarMenu />
        </div>
      </header>

      <main className="px-4 py-4 flex flex-col gap-5 pb-12">

        {/* ── Loading ── */}
        {loading && (
          <div className="rounded-xl border border-stroke bg-white px-4 py-10 shadow-sm text-center">
            <p className="text-sm text-ink-soft">Bestellingen laden…</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl border border-brand-red/30 bg-red-50 px-4 py-4 shadow-sm">
            <p className="text-sm font-medium text-brand-red">{error}</p>
            <button
              type="button"
              onClick={() => loadQueue(true)}
              className="mt-2 text-sm font-semibold text-brand-orange underline"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-orange-200 bg-white p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-orange-600">{toOrderCount}</p>
                <p className="text-[11px] text-orange-500 font-medium mt-0.5 leading-tight">Te bestellen</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-blue-600">{orderedCount}</p>
                <p className="text-[11px] text-blue-500 font-medium mt-0.5 leading-tight">Besteld</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-white p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-brand-green">{doneTodayCount}</p>
                <p className="text-[11px] text-green-600 font-medium mt-0.5 leading-tight">Ontvangen</p>
              </div>
            </div>

            {/* ── Active orders ── */}
            {groups.length > 0 && (
              <section className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide px-1">
                  Openstaande bestellingen
                </p>
                {groups.map(group => (
                  <OrderCard
                    key={group.workOrderId}
                    group={group}
                    onAction={handleAction}
                    busyIds={busyIds}
                    readOnly={false}
                  />
                ))}
              </section>
            )}

            {/* ── Empty active state ── */}
            {groups.length === 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-8 shadow-sm text-center">
                <p className="text-3xl mb-2">✓</p>
                <p className="font-bold text-green-800">Niets meer te bestellen</p>
                <p className="text-sm text-green-700 mt-1">Alle openstaande onderdelen zijn verwerkt.</p>
              </div>
            )}

            {/* ── Done today (collapsible) ── */}
            {doneTodayCount > 0 && (
              <section className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowDone(v => !v)}
                  className="flex items-center justify-between px-1"
                >
                  <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide">
                    Vandaag ontvangen
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-brand-green bg-green-100 rounded-full px-2 py-0.5">
                      {doneTodayCount}
                    </span>
                    <span className="text-xs text-ink-faint">{showDone ? '▲' : '▼'}</span>
                  </div>
                </button>

                {showDone && doneToday.map(group => (
                  <OrderCard
                    key={group.workOrderId}
                    group={group}
                    onAction={handleAction}
                    busyIds={busyIds}
                    readOnly
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
