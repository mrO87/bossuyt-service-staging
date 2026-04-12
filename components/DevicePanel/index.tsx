'use client'

import { useState, useEffect } from 'react'

interface Props {
  deviceId: string
  brand?: string
  model?: string
  currentWorkOrderId?: string
  refreshKey?: number
}

interface DeviceDetail {
  serialNumber: string | null
  installDate:  string | null
}

interface Docs {
  schematic: string | null
  exploded:  string | null
  manual:    string | null
}

interface HistoryEntry {
  id:          string
  workOrderId: string
  type:        string
  plannedDate: string
  description: string | null   // original problem reported
  isUrgent:    boolean
  workStart:   string | null
  workEnd:     string | null
  notes:       string | null   // technician work description
  parts:       string | null   // JSON: PdfPart[]
  pdfPath:     string | null
  completedAt: string | null
  changedBy:   string | null
}

// ── Icons ──────────────────────────────────────────────────────────────────
function IconSchematic({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" className={className}>
      <rect x="4"  y="14" width="8" height="8" rx="1.5" strokeWidth="1.8" stroke="currentColor" fill="none"/>
      <rect x="24" y="14" width="8" height="8" rx="1.5" strokeWidth="1.8" stroke="currentColor" fill="none"/>
      <line x1="12" y1="18" x2="24" y2="18" strokeWidth="1.8" stroke="currentColor"/>
      <line x1="18" y1="14" x2="18" y2="6"  strokeWidth="1.8" stroke="currentColor"/>
      <line x1="18" y1="22" x2="18" y2="30" strokeWidth="1.8" stroke="currentColor"/>
      <circle cx="18" cy="6"  r="2" fill="currentColor"/>
      <circle cx="18" cy="30" r="2" fill="currentColor"/>
      <circle cx="18" cy="18" r="2" fill="currentColor"/>
    </svg>
  )
}

function IconExploded({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" className={className}>
      <path d="M18 4L30 10L18 16L6 10Z" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinejoin="round"/>
      <path d="M6 16L18 22L30 16"       strokeWidth="1.8" stroke="currentColor" strokeLinejoin="round"/>
      <path d="M6 22L18 28L30 22"       strokeWidth="1.8" stroke="currentColor" strokeLinejoin="round"/>
      <line x1="6"  y1="10" x2="6"  y2="22" strokeWidth="1.4" stroke="currentColor" strokeDasharray="2 2"/>
      <line x1="30" y1="10" x2="30" y2="22" strokeWidth="1.4" stroke="currentColor" strokeDasharray="2 2"/>
    </svg>
  )
}

function IconManual({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" className={className}>
      <path d="M18 8V30" strokeWidth="1.8" stroke="currentColor"/>
      <path d="M18 8C14 6 8 6 4 8V30C8 28 14 28 18 30"  strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinejoin="round"/>
      <path d="M18 8C22 6 28 6 32 8V30C28 28 22 28 18 30" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinejoin="round"/>
      <line x1="8"  y1="14" x2="14" y2="13" strokeWidth="1.4" stroke="currentColor"/>
      <line x1="8"  y1="19" x2="14" y2="18" strokeWidth="1.4" stroke="currentColor"/>
      <line x1="22" y1="13" x2="28" y2="14" strokeWidth="1.4" stroke="currentColor"/>
      <line x1="22" y1="18" x2="28" y2="19" strokeWidth="1.4" stroke="currentColor"/>
    </svg>
  )
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" className={className}>
      <circle cx="18" cy="18" r="12" strokeWidth="1.8" stroke="currentColor" fill="none"/>
      <polyline points="18,10 18,19 24,22" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 18A11 11 0 0 1 7.5 14" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round"/>
      <polyline points="4,11 7.5,14 10,10.5" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="M4 6.5L9 11.5L14 6.5" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────
function DocCard({
  label, sublabel, path, icon, ringColor, onClick, badge,
}: {
  label:     string
  sublabel:  string
  path?:     string | null
  icon:      React.ReactNode
  ringColor: string
  onClick?:  () => void
  badge?:    number
}) {
  const missing = path !== undefined && !path

  const inner = (
    <div className="flex flex-col items-center justify-center gap-2 h-full py-2 relative">
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-0 right-0 w-5 h-5 rounded-full bg-brand-orange text-white text-[9px] font-black flex items-center justify-center">
          {badge}
        </span>
      )}
      {icon}
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[9px] font-black uppercase tracking-widest text-ink leading-tight">{label}</span>
        <span className="text-[8px] text-ink-soft leading-tight">{sublabel}</span>
        {missing && <span className="text-[8px] font-semibold text-brand-red uppercase mt-0.5">Ontbreekt</span>}
      </div>
    </div>
  )

  const base = 'rounded-2xl border border-stroke bg-white transition-all duration-150'

  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} shadow-sm hover:shadow-md active:scale-95 cursor-pointer ${ringColor} w-full`}>
        {inner}
      </button>
    )
  }

  if (missing) return <div className={`${base} opacity-40 w-full`}>{inner}</div>

  return (
    <a href={path!} target="_blank" rel="noopener noreferrer"
      className={`${base} shadow-sm hover:shadow-md active:scale-95 cursor-pointer ${ringColor} w-full`}>
      {inner}
    </a>
  )
}

// ── History list ───────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  warm:       'Storing',
  montage:    'Montage',
  preventief: 'Preventief',
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  // Index 0 (newest) starts expanded; all others start collapsed
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (entries.length === 0) return new Set()
    return new Set([entries[0].id])
  })

  if (entries.length === 0) {
    return <p className="text-xs text-ink-soft text-center py-3">Geen historiek beschikbaar</p>
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3 mt-1">
      {entries.map(e => {
        const isOpen = expanded.has(e.id)
        const parts: Array<{ code: string; description: string; quantity: number }> =
          e.parts ? (() => { try { return JSON.parse(e.parts!) } catch { return [] } })() : []

        return (
          <div key={e.id} className="rounded-xl border border-stroke bg-surface px-3 py-3 space-y-2">
            {/* Header row: type + date + chevron — clickable to collapse/expand */}
            <button
              onClick={() => toggle(e.id)}
              className="w-full flex items-center justify-between gap-2"
            >
              <span className="text-xs font-bold text-ink">{TYPE_LABEL[e.type] ?? e.type}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-ink-soft">
                  {new Date(e.completedAt ?? e.plannedDate).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-ink-soft"><ChevronDown open={isOpen} /></span>
              </div>
            </button>

            {/* Detail section — only visible when expanded */}
            {isOpen && (
              <div className="space-y-2">
                {/* Probleem (original description) */}
                {e.description && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-ink-soft mb-0.5">Probleem</p>
                    <p className="text-xs text-ink leading-snug">{e.description}</p>
                  </div>
                )}

                {/* Oplossing (technician notes) */}
                {e.notes && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-ink-soft mb-0.5">Oplossing</p>
                    <p className="text-xs text-ink leading-snug">{e.notes}</p>
                  </div>
                )}

                {/* Onderdelen */}
                {parts.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-ink-soft mb-1">Onderdelen</p>
                    <div className="space-y-0.5">
                      {parts.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-ink">
                          <span className="font-mono text-[10px] text-ink-soft w-4 text-center">{p.quantity}×</span>
                          <span>{p.description || p.code || '—'}</span>
                          {p.code && p.description && (
                            <span className="text-[9px] text-ink-soft font-mono">({p.code})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PDF link */}
                {e.pdfPath && (
                  <a
                    href={e.pdfPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-orange underline underline-offset-2"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2h5l3 3v5H2V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M7 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    </svg>
                    Werkbon PDF
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function DevicePanel({ deviceId, brand, model, currentWorkOrderId, refreshKey }: Props) {
  const [open,          setOpen]          = useState(false)
  const [detail,        setDetail]        = useState<DeviceDetail | null>(null)
  const [docs,          setDocs]          = useState<Docs | null>(null)
  const [history,       setHistory]       = useState<HistoryEntry[] | null>(null)
  const [showHistory,   setShowHistory]   = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Reset all fetched data when refreshKey changes (e.g. after a werkbon is saved)
  // so the next open fetches fresh history from the server
  useEffect(() => {
    if (refreshKey === undefined) return
    setDetail(null)
    setHistory(null)
  }, [refreshKey])

  useEffect(() => {
    if (!open || detail) return
    setLoadingDetail(true)

    const historyUrl = `/api/devices/${deviceId}/history`

    Promise.all([
      fetch(`/api/devices/${deviceId}`).then(r => r.ok ? r.json() : null),
      brand && model
        ? fetch(`/api/devices/documents?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`).then(r => r.json())
        : Promise.resolve(null),
      fetch(historyUrl).then(r => r.json()),
    ]).then(([dev, docsData, hist]) => {
      setDetail({ serialNumber: dev?.serialNumber ?? null, installDate: dev?.installDate ?? null })
      setDocs(docsData)
      setHistory(hist ?? [])
    }).finally(() => setLoadingDetail(false))
  }, [open, deviceId, brand, model, detail, currentWorkOrderId])

  const histCount = history?.length ?? 0

  return (
    <div className="rounded-xl overflow-hidden border border-stroke bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-brand-dark"
      >
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-brand-orange" />
          <div className="text-left">
            <p className="font-bold text-sm tracking-wide text-white">
              {brand && model ? `${brand} ${model}` : 'TOESTEL'}
            </p>
            <p className="text-[10px] text-ink-soft uppercase tracking-wider">
              Toestelinfo, documenten &amp; historiek
            </p>
          </div>
        </div>
        <span className="text-ink-soft"><ChevronDown open={open} /></span>
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 py-4 space-y-4">
          {/* Device details */}
          {loadingDetail ? (
            <div className="space-y-2">
              <div className="h-3 w-40 bg-surface rounded animate-pulse" />
              <div className="h-3 w-32 bg-surface rounded animate-pulse" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-soft">Merk</p>
                <p className="font-semibold text-ink">{brand ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-soft">Type / Model</p>
                <p className="font-semibold text-ink">{model ?? '—'}</p>
              </div>
              {detail?.serialNumber && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-soft">Serienummer</p>
                  <p className="font-semibold text-ink font-mono text-xs">{detail.serialNumber}</p>
                </div>
              )}
              {detail?.installDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-soft">Installatiedatum</p>
                  <p className="font-semibold text-ink">{detail.installDate}</p>
                </div>
              )}
            </div>
          )}

          {/* 2×2 grid: 3 doc cards + history */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-soft mb-2">
              Documenten &amp; historiek
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DocCard
                label="Schema"      sublabel="Elektrisch"
                path={docs?.schematic ?? null}
                ringColor="hover:border-brand-orange hover:ring-2 hover:ring-brand-orange/20"
                icon={<IconSchematic className="text-brand-orange" />}
              />
              <DocCard
                label="Onderdelen"  sublabel="Exploded view"
                path={docs?.exploded ?? null}
                ringColor="hover:border-brand-blue hover:ring-2 hover:ring-brand-blue/20"
                icon={<IconExploded className="text-brand-blue" />}
              />
              <DocCard
                label="Handleiding" sublabel="Service"
                path={docs?.manual ?? null}
                ringColor="hover:border-brand-green hover:ring-2 hover:ring-brand-green/20"
                icon={<IconManual className="text-brand-green" />}
              />
              <DocCard
                label="Historiek"   sublabel="Afgewerkte jobs"
                ringColor="hover:border-brand-orange hover:ring-2 hover:ring-brand-orange/20"
                badge={histCount}
                onClick={() => setShowHistory(h => !h)}
                icon={<IconHistory className={histCount > 0 ? 'text-brand-orange' : 'text-ink-soft'} />}
              />
            </div>
          </div>

          {/* History list — slides in when toggled */}
          {showHistory && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-soft mb-1">
                Interventiegeschiedenis ({histCount})
              </p>
              {history === null
                ? <p className="text-xs text-ink-soft">Laden…</p>
                : <HistoryList entries={history} />
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
