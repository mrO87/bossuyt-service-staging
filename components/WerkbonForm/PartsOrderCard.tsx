'use client'

import { useState } from 'react'
import type { DbTask } from '@/types'
import type { Intervention } from '@/types'
import { lookupPart } from '@/lib/parts-catalog'
import { generatePartsOrderPDF } from '@/lib/pdf-parts-order'
import type { PartsOrderRow } from '@/lib/pdf-parts-order'

interface Props {
  orderTasks:   DbTask[]
  intervention: Intervention
  showSupplier: boolean
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:     { label: 'In wachtrij',    color: 'text-ink-soft bg-surface' },
  ready:       { label: 'In bestelling',  color: 'text-orange-700 bg-orange-50' },
  in_progress: { label: 'Verwerkt',       color: 'text-blue-700 bg-blue-50' },
  done:        { label: 'Ontvangen',      color: 'text-green-700 bg-green-50' },
  skipped:     { label: 'Overgeslagen',   color: 'text-ink-faint bg-surface' },
  cancelled:   { label: 'Geannuleerd',    color: 'text-red-600 bg-red-50' },
  blocked:     { label: 'Geblokkeerd',    color: 'text-red-600 bg-red-50' },
}

function overallStatus(tasks: DbTask[]): { label: string; color: string } {
  if (tasks.every(t => t.status === 'done'))
    return { label: 'Alle ontvangen', color: 'text-green-700 bg-green-50' }
  if (tasks.some(t => t.status === 'in_progress'))
    return { label: 'Deels verwerkt', color: 'text-blue-700 bg-blue-50' }
  if (tasks.some(t => t.status === 'ready'))
    return { label: 'In bestelling',  color: 'text-orange-700 bg-orange-50' }
  return { label: 'In wachtrij', color: 'text-ink-soft bg-surface' }
}

export default function PartsOrderCard({ orderTasks, intervention, showSupplier }: Props) {
  const [expanded,       setExpanded]       = useState(false)
  const [printing,       setPrinting]       = useState(false)
  const [creatingFollowUp, setCreatingFollowUp] = useState(false)
  const [followUpId,     setFollowUpId]     = useState<string | null>(null)
  const [followUpError,  setFollowUpError]  = useState<string | null>(null)

  if (orderTasks.length === 0) return null

  const status     = overallStatus(orderTasks)
  const allDone    = orderTasks.every(t => t.status === 'done')
  const urgentCount = orderTasks.filter(
    t => (t.payload as Record<string, unknown> | null)?.urgency === 'urgent',
  ).length

  // ── Build PDF rows ──────────────────────────────────────────────────────────
  function buildRows(): PartsOrderRow[] {
    return orderTasks.map(task => {
      const payload = (task.payload ?? {}) as Record<string, unknown>
      const code    = String(payload.part_number ?? '')
      const catalog = lookupPart(code)
      return {
        code,
        description:  String(payload.description  ?? task.title ?? ''),
        brand:        catalog?.brand,
        quantity:     Number(payload.quantity ?? 1),
        urgency:      (payload.urgency as 'urgent' | 'normal') ?? 'normal',
        supplier:     showSupplier ? catalog?.suppliers[0]?.name    : undefined,
        supplierRef:  showSupplier ? catalog?.suppliers[0]?.ref     : undefined,
      }
    })
  }

  // ── Print PDF ───────────────────────────────────────────────────────────────
  async function handlePrint() {
    setPrinting(true)
    try {
      const blob = generatePartsOrderPDF({
        workOrderId:     intervention.id,
        customerName:    intervention.customerName,
        siteName:        intervention.siteName,
        deviceBrand:     intervention.deviceBrand ?? '',
        deviceModel:     intervention.deviceModel ?? '',
        parts:           buildRows(),
        includeSupplier: showSupplier,
        date:            new Date().toISOString(),
      })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } finally {
      setPrinting(false)
    }
  }

  // ── Create follow-up work order ─────────────────────────────────────────────
  async function handleFollowUp() {
    setCreatingFollowUp(true)
    setFollowUpError(null)
    try {
      const res = await fetch(`/api/work-orders/${intervention.id}/follow-up`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ changed_by: 'office' }),
      })
      const json = await res.json() as { newWorkOrderId?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setFollowUpId(json.newWorkOrderId ?? null)
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setCreatingFollowUp(false)
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 overflow-hidden">

      {/* ── Collapsed header row ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-sm">📦</span>

        {/* Title — smaller than before */}
        <span className="text-xs font-medium text-ink-soft flex-1">
          Bestelling — {orderTasks.length} onderdeel{orderTasks.length !== 1 ? 'en' : ''}
          {urgentCount > 0 && (
            <span className="ml-1.5 font-bold text-brand-red">{urgentCount} dringend</span>
          )}
        </span>

        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
          {status.label}
        </span>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-ink-faint text-sm px-1 shrink-0"
          aria-label={expanded ? 'Inklappen' : 'Uitklappen'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <>
          {/* Parts table */}
          <div className="border-t border-orange-200">
            {(['stock_replenish', 'supplier_order'] as const).map(orderType => {
              const group = orderTasks.filter(t => {
                const p  = (t.payload ?? {}) as Record<string, unknown>
                const ot = p.order_type as string | undefined
                return orderType === 'stock_replenish'
                  ? (ot === 'stock_replenish' || (!ot && !t.title?.startsWith('Bestellen')))
                  : (ot === 'supplier_order'  || (!ot &&  t.title?.startsWith('Bestellen')))
              })
              if (group.length === 0) return null

              const label = orderType === 'stock_replenish' ? 'Aanvullen stock' : 'Te bestellen bij leverancier'
              const cols  = showSupplier ? 'grid-cols-[2fr_3fr_1fr_2fr_1fr]' : 'grid-cols-[2fr_3fr_1fr_1fr]'

              return (
                <div key={orderType} className="border-b border-orange-100 last:border-b-0">
                  <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide px-3 py-1.5 bg-white">
                    {label}
                  </p>
                  <div className={`grid text-xs font-semibold text-ink-faint bg-orange-50/40 px-3 py-1 ${cols}`}>
                    <span>Artikelcode</span>
                    <span>Omschrijving</span>
                    <span>Merk</span>
                    {showSupplier && <span>Leverancier</span>}
                    <span className="text-right">Aantal</span>
                  </div>

                  <div className="divide-y divide-orange-100">
                    {group.map((task, idx) => {
                      const payload = (task.payload ?? {}) as Record<string, unknown>
                      const code    = String(payload.part_number ?? '')
                      const catalog = lookupPart(code)
                      const qty     = Number(payload.quantity ?? 1)
                      const urgent  = payload.urgency === 'urgent'
                      const s       = STATUS_LABEL[task.status] ?? STATUS_LABEL.pending

                      return (
                        <div
                          key={task.id}
                          className={`grid items-center px-3 py-2 text-sm gap-x-2 ${idx % 2 === 1 ? 'bg-white' : 'bg-orange-50/20'} ${cols}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {urgent && <span className="w-1.5 h-1.5 rounded-full bg-brand-red shrink-0" />}
                            <span className="font-mono text-xs text-ink">{code || '—'}</span>
                          </div>

                          <div>
                            <p className="text-ink text-xs leading-tight">
                              {String(payload.description ?? task.title ?? '—')}
                            </p>
                            <span className={`mt-0.5 inline-block text-xs px-1.5 py-px rounded-full ${s.color}`}>
                              {s.label}
                            </span>
                          </div>

                          <span className="text-xs text-ink-soft">{catalog?.brand ?? '—'}</span>

                          {showSupplier && (
                            <div className="text-xs">
                              {catalog ? (
                                <div>
                                  <p className="text-ink font-medium">{catalog.suppliers[0]?.name}</p>
                                  <p className="text-ink-faint">{catalog.suppliers[0]?.ref}</p>
                                </div>
                              ) : (
                                <span className="text-ink-faint">—</span>
                              )}
                            </div>
                          )}

                          <span className="text-right text-ink font-medium text-xs">{qty}×</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Actions strip ── */}
          <div className="border-t border-orange-200 bg-white px-3 py-2.5 flex flex-wrap items-center gap-2">

            {/* Print PDF */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-orange px-3 py-1.5 rounded-lg border border-brand-orange/30 hover:bg-orange-50 disabled:opacity-50 transition-colors"
            >
              {printing ? '…' : '🖨 Print PDF'}
            </button>

            {/* Nieuwe Opvolgbon — only active once all parts received */}
            {!followUpId && (
              <button
                type="button"
                onClick={handleFollowUp}
                disabled={!allDone || creatingFollowUp}
                title={!allDone ? 'Beschikbaar zodra alle onderdelen ontvangen zijn' : ''}
                className={[
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                  allDone
                    ? 'text-brand-green border-brand-green/40 hover:bg-green-50'
                    : 'text-ink-faint border-stroke cursor-not-allowed',
                ].join(' ')}
              >
                {creatingFollowUp ? '…' : '📋 Nieuwe Opvolgbon'}
              </button>
            )}

            {/* Success: follow-up created */}
            {followUpId && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                ✓ Opvolgbon aangemaakt
              </span>
            )}

            {/* Error */}
            {followUpError && (
              <span className="text-xs text-brand-red">{followUpError}</span>
            )}

            {showSupplier && !followUpId && (
              <p className="text-xs text-ink-faint ml-auto hidden sm:block">
                Tip: zie catalogus voor alternatieve leveranciers.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
