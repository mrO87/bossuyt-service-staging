'use client'

import { useCallback, useEffect, useState } from 'react'
import AvatarMenu from '@/components/AvatarMenu'
import type { PickingGroup, WarehouseGroup, WarehouseQueueResponse } from '@/app/api/warehouse/queue/route'
import type { DbTask, DbTaskStatus } from '@/types'
import type { PdfPart } from '@/lib/pdf'

// ── Bossuyt logo ──────────────────────────────────────────────────────────────
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

// ── Status badge for order_part tasks ─────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  ready:       { label: 'Te bestellen',  cls: 'bg-orange-100 text-orange-700' },
  in_progress: { label: 'Besteld',       cls: 'bg-blue-100   text-blue-700'   },
  done:        { label: 'Ontvangen',     cls: 'bg-green-100  text-green-700'  },
}
function statusBadge(s: DbTaskStatus) {
  return STATUS[s] ?? { label: s, cls: 'bg-surface text-ink-soft' }
}

// ── Individual order_part row ─────────────────────────────────────────────────
function PartRow({
  task, onAction, busy, readOnly,
}: {
  task: DbTask; onAction: (id: string, action: 'start' | 'complete') => void; busy: boolean; readOnly: boolean
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
            <button type="button" disabled={busy} onClick={() => onAction(task.id, 'start')}
              className="min-h-[44px] min-w-[100px] px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold shadow-sm disabled:opacity-40 active:scale-95 transition-transform">
              {busy ? '…' : 'Besteld ✓'}
            </button>
          )}
          {task.status === 'in_progress' && (
            <button type="button" disabled={busy} onClick={() => onAction(task.id, 'complete')}
              className="min-h-[44px] min-w-[100px] px-4 rounded-xl bg-brand-green text-white text-sm font-semibold shadow-sm disabled:opacity-40 active:scale-95 transition-transform">
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

// ── Order_part work order group card ──────────────────────────────────────────
function OrderCard({
  group, onAction, busyIds, readOnly,
}: {
  group: WarehouseGroup; onAction: (id: string, action: 'start' | 'complete') => void; busyIds: Set<string>; readOnly: boolean
}) {
  const allOrdered  = !readOnly && group.tasks.every(t => t.status === 'in_progress')
  const borderColor = readOnly
    ? 'border-l-4 border-l-brand-green'
    : group.isUrgent
      ? 'border-l-4 border-l-brand-red'
      : 'border-l-4 border-l-brand-orange'

  return (
    <div className={`rounded-xl border border-stroke bg-white shadow-sm overflow-hidden ${borderColor}`}>
      <div className="px-4 py-3 bg-white border-b border-stroke">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-base text-ink leading-tight">{group.customerName}</p>
              {group.isUrgent && !readOnly && (
                <span className="text-[11px] font-bold text-brand-red bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">DRINGEND</span>
              )}
              {allOrdered && (
                <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Alles besteld</span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5 truncate">{group.siteName}</p>
            <p className="text-xs text-ink-faint mt-0.5">{group.deviceBrand} {group.deviceModel}</p>
          </div>
          <div className="shrink-0 text-right pt-0.5">
            <p className="text-xs font-semibold text-ink">{group.tasks.length} st.</p>
            {group.plannedDate && (
              <p className="text-[11px] text-ink-faint mt-0.5">
                {new Date(group.plannedDate).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        {group.tasks.map(task => (
          <PartRow key={task.id} task={task} onAction={onAction} busy={busyIds.has(task.id)} readOnly={readOnly} />
        ))}
      </div>
    </div>
  )
}

// ── Picking card for pick_parts tasks (follow-up workorders) ──────────────────
//
// Explains what this component does:
// When a technician needs parts for a follow-up visit, the warehouse gets a
// "pick_parts" task. This card shows the picking list with checkboxes so the
// warehouse worker can track progress before confirming everything is ready.
function PickingCard({
  group, onConfirm, busy,
}: {
  group: PickingGroup; onConfirm: (taskId: string) => void; busy: boolean
}) {
  const parts   = (group.task.payload?.parts ?? []) as PdfPart[]
  const isDone  = group.task.status === 'done'
  const [checked, setChecked] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function checkAll() {
    setChecked(new Set(parts.map(p => p.id)))
  }

  return (
    <div className="rounded-xl border border-stroke bg-white shadow-sm overflow-hidden border-l-4 border-l-brand-blue">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-stroke">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-base text-ink">Pickinglijst bus {group.technicianName}</p>
            <p className="text-sm text-ink-soft mt-0.5">{group.customerName}</p>
            <p className="text-xs text-ink-faint">{group.siteName}</p>
          </div>
          <span className="text-[11px] font-bold text-brand-blue bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full shrink-0">
            Opvolgbon
          </span>
        </div>
      </div>

      {/* Parts table */}
      {parts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-ink-soft border-b border-stroke">
                <th className="px-3 py-2 text-left font-medium w-10" />
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Omschrijving</th>
                <th className="px-3 py-2 pr-4 text-right font-medium">Aantal</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(part => (
                <tr key={part.id} className="border-t border-stroke/40">
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={checked.has(part.id) || isDone}
                      onChange={() => !isDone && toggle(part.id)}
                      disabled={isDone}
                      className="h-5 w-5 rounded accent-brand-blue"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink-faint">{part.code || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={checked.has(part.id) || isDone ? 'line-through text-ink-soft' : 'text-ink'}>
                      {part.description}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 pr-4 text-right font-bold text-ink">{part.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {!isDone ? (
        <div className="px-4 py-3 border-t border-stroke flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-2 flex-wrap">
            {parts.length > 0 && (
              <button type="button" onClick={checkAll}
                className="min-h-[44px] px-4 rounded-xl border border-stroke text-sm font-medium text-ink bg-surface active:scale-95 transition-transform">
                Alles aanvinken
              </button>
            )}
            <button type="button" onClick={() => window.print()}
              className="min-h-[44px] px-4 rounded-xl border border-stroke text-sm font-medium text-ink bg-surface active:scale-95 transition-transform">
              Paklijst afdrukken
            </button>
          </div>
          <button type="button" disabled={busy} onClick={() => onConfirm(group.task.id)}
            className="min-h-[44px] px-5 rounded-xl bg-brand-green text-white text-sm font-bold shadow-sm disabled:opacity-40 active:scale-95 transition-transform">
            {busy ? '…' : '✓ Bevestig klaargelegd'}
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-stroke">
          <p className="text-sm font-semibold text-brand-green">✓ Klaargelegd voor technieker</p>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MagazijnPage() {
  const [groups,        setGroups]        = useState<WarehouseGroup[]>([])
  const [doneToday,     setDoneToday]     = useState<WarehouseGroup[]>([])
  const [pickingGroups, setPickingGroups] = useState<PickingGroup[]>([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [busyIds,       setBusyIds]       = useState<Set<string>>(new Set())
  const [showDone,      setShowDone]      = useState(false)

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
      setPickingGroups(data.pickingGroups ?? [])
    } catch {
      setError('Kon wachtrij niet laden. Controleer je verbinding en probeer opnieuw.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  // ── Order_part transition (start / complete) ─────────────────────────────────
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
        setGroups(prev => prev.map(g => ({
          ...g,
          tasks: g.tasks.filter(t => t.id !== taskId),
        })).filter(g => g.tasks.length > 0))
        setDoneToday(prev => {
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

  // ── Pick_parts confirmation (ready → in_progress → done) ────────────────────
  //
  // Why two transitions instead of one? The state machine only allows
  // ready→in_progress and in_progress→done. A single "confirm" button needs
  // both steps so the dependency chain fires (activateReadySuccessors runs
  // after the task reaches "done", which promotes the technician's load_parts
  // task from pending → ready).
  const handleConfirmPicking = useCallback(async (taskId: string) => {
    setBusyIds(prev => new Set(prev).add(taskId))
    try {
      const group = pickingGroups.find(g => g.task.id === taskId)
      if (!group) return

      if (group.task.status === 'ready') {
        const startRes = await fetch(`/api/tasks/${taskId}/transition`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'start', changed_by: 'warehouse' }),
        })
        if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`)
      }

      const completeRes = await fetch(`/api/tasks/${taskId}/transition`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'complete', changed_by: 'warehouse' }),
      })
      if (!completeRes.ok) {
        const json = await completeRes.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? `HTTP ${completeRes.status}`)
      }

      // Reload queue — the picking group disappears, technician's load_parts is now ready
      await loadQueue()
    } catch (err) {
      alert(`Fout: ${err instanceof Error ? err.message : 'Onbekende fout'}`)
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
    }
  }, [pickingGroups, loadQueue])

  // ── Derived counts ──────────────────────────────────────────────────────────
  const toOrderCount   = groups.reduce((n, g) => n + g.tasks.filter(t => t.status === 'ready').length, 0)
  const orderedCount   = groups.reduce((n, g) => n + g.tasks.filter(t => t.status === 'in_progress').length, 0)
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
          <button type="button" onClick={() => loadQueue(true)} disabled={refreshing || loading}
            className="rounded-lg bg-brand-mid px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {refreshing ? '↻' : '↻ Sync'}
          </button>
          <AvatarMenu />
        </div>
      </header>

      <main className="px-4 py-4 flex flex-col gap-5 pb-12">

        {loading && (
          <div className="rounded-xl border border-stroke bg-white px-4 py-10 shadow-sm text-center">
            <p className="text-sm text-ink-soft">Bestellingen laden…</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-brand-red/30 bg-red-50 px-4 py-4 shadow-sm">
            <p className="text-sm font-medium text-brand-red">{error}</p>
            <button type="button" onClick={() => loadQueue(true)}
              className="mt-2 text-sm font-semibold text-brand-orange underline">
              Opnieuw proberen
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Picking section (follow-up workorders) ── */}
            {pickingGroups.length > 0 && (
              <section className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide px-1">
                  Pickinglijsten opvolgbonnen
                </p>
                {pickingGroups.map(group => (
                  <PickingCard
                    key={group.task.id}
                    group={group}
                    onConfirm={handleConfirmPicking}
                    busy={busyIds.has(group.task.id)}
                  />
                ))}
              </section>
            )}

            {/* ── Stats for order_part tasks ── */}
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

            {/* ── Active order_part orders ── */}
            {groups.length > 0 && (
              <section className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide px-1">
                  Openstaande bestellingen
                </p>
                {groups.map(group => (
                  <OrderCard key={group.workOrderId} group={group} onAction={handleAction} busyIds={busyIds} readOnly={false} />
                ))}
              </section>
            )}

            {groups.length === 0 && pickingGroups.length === 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-8 shadow-sm text-center">
                <p className="text-3xl mb-2">✓</p>
                <p className="font-bold text-green-800">Niets meer te doen</p>
                <p className="text-sm text-green-700 mt-1">Alle openstaande taken zijn verwerkt.</p>
              </div>
            )}

            {/* ── Done today (collapsible) ── */}
            {doneTodayCount > 0 && (
              <section className="flex flex-col gap-3">
                <button type="button" onClick={() => setShowDone(v => !v)}
                  className="flex items-center justify-between px-1">
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
                  <OrderCard key={group.workOrderId} group={group} onAction={handleAction} busyIds={busyIds} readOnly />
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
