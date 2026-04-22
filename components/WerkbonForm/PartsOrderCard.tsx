'use client'

import { useState } from 'react'
import type { DbTask } from '@/types'
import type { Intervention } from '@/types'
import { lookupPart } from '@/lib/parts-catalog'
import { generatePartsOrderPDF } from '@/lib/pdf-parts-order'
import type { PartsOrderRow } from '@/lib/pdf-parts-order'

interface Props {
  orderTasks: DbTask[]
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
    return { label: 'In bestelling', color: 'text-orange-700 bg-orange-50' }
  return { label: 'In wachtrij', color: 'text-ink-soft bg-surface' }
}

export default function PartsOrderCard({ orderTasks, intervention, showSupplier }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [printing, setPrinting] = useState(false)

  if (orderTasks.length === 0) return null

  const status = overallStatus(orderTasks)
  const urgentCount = orderTasks.filter(t => (t.payload as Record<string, unknown> | null)?.urgency === 'urgent').length

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

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-base">📦</span>
        <span className="text-sm font-semibold text-ink flex-1">
          Bestelling — {orderTasks.length} onderdeel{orderTasks.length !== 1 ? 'en' : ''}
          {urgentCount > 0 && (
            <span className="ml-2 text-xs font-bold text-brand-red">
              {urgentCount} dringend
            </span>
          )}
        </span>

        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>
          {status.label}
        </span>

        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="text-xs font-medium text-brand-orange px-2 py-1 rounded-lg border border-brand-orange/30 hover:bg-orange-50 disabled:opacity-50 shrink-0"
        >
          {printing ? '...' : 'Print PDF'}
        </button>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-ink-faint text-sm px-1"
          aria-label={expanded ? 'Inklappen' : 'Uitklappen'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded parts table */}
      {expanded && (
        <div className="border-t border-orange-200">
          {/* Table header */}
          <div className={`grid text-xs font-semibold text-ink-soft bg-white px-3 py-1.5 ${showSupplier ? 'grid-cols-[2fr_3fr_1fr_2fr_1fr]' : 'grid-cols-[2fr_3fr_1fr_1fr]'}`}>
            <span>Artikelcode</span>
            <span>Omschrijving</span>
            <span>Merk</span>
            {showSupplier && <span>Leverancier</span>}
            <span className="text-right">Aantal</span>
          </div>

          <div className="divide-y divide-orange-100">
            {orderTasks.map((task, idx) => {
              const payload = (task.payload ?? {}) as Record<string, unknown>
              const code    = String(payload.part_number ?? '')
              const catalog = lookupPart(code)
              const qty     = Number(payload.quantity ?? 1)
              const urgent  = payload.urgency === 'urgent'
              const s       = STATUS_LABEL[task.status] ?? STATUS_LABEL.pending

              return (
                <div
                  key={task.id}
                  className={`grid items-center px-3 py-2 text-sm gap-x-2 ${idx % 2 === 1 ? 'bg-white' : 'bg-orange-50/30'} ${showSupplier ? 'grid-cols-[2fr_3fr_1fr_2fr_1fr]' : 'grid-cols-[2fr_3fr_1fr_1fr]'}`}
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

          {/* Multiple supplier options hint for warehouse */}
          {showSupplier && (
            <div className="px-3 py-2 bg-white border-t border-orange-200">
              <p className="text-xs text-ink-faint">
                Tip: sommige onderdelen zijn beschikbaar bij meerdere leveranciers — zie de catalogus voor alternatieven.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
