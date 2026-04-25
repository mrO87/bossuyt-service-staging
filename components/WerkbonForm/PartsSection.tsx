import { useState } from 'react'
import type { PdfPart } from '@/lib/pdf'
import { PARTS_CATALOG } from '@/lib/parts-catalog'
import Section from './Section'

interface Props {
  parts: PdfPart[]
  onAddPart: (toOrder: boolean) => void
  onUpdatePart: (id: string, field: keyof PdfPart, value: string | number | boolean) => void
  onRemovePart: (id: string) => void
  queuedPartIds: Set<string>
}

export default function PartsSection({ parts, onAddPart, onUpdatePart, onRemovePart, queuedPartIds }: Props) {
  const [catalogSearch, setCatalogSearch] = useState<{ partId: string; query: string } | null>(null)

  function renderPartRow(part: PdfPart, isOrder: boolean) {
    const isSearchOpen = catalogSearch?.partId === part.id
    const searchResults = isSearchOpen
      ? PARTS_CATALOG.filter(c =>
          c.partNumber.toLowerCase().includes(catalogSearch.query.toLowerCase()) ||
          c.description.toLowerCase().includes(catalogSearch.query.toLowerCase())
        ).slice(0, 8)
      : []

    return (
      <div
        key={part.id}
        className={`relative rounded-lg border p-2 flex flex-col gap-1.5 ${
          isOrder ? 'border-orange-200 bg-orange-50/30' : 'border-stroke bg-surface'
        }`}
      >
        {/* Line 1: code + qty + remove */}
        <div className="flex items-center gap-2">
          <input
            placeholder="Artikelcode"
            value={part.code}
            onChange={e => onUpdatePart(part.id, 'code', e.target.value)}
            className="flex-1 rounded-lg px-2 py-1.5 text-sm font-mono outline-none bg-white border border-stroke text-ink"
          />
          <input
            type="number"
            min={1}
            value={part.quantity}
            onChange={e => onUpdatePart(part.id, 'quantity', parseInt(e.target.value) || 1)}
            className="w-14 shrink-0 rounded-lg px-2 py-1.5 text-sm text-center outline-none bg-white border border-stroke text-ink"
          />
          <button type="button" onClick={() => onRemovePart(part.id)} className="shrink-0 text-brand-red text-lg leading-none px-1">×</button>
        </div>

        {/* Line 2: description + urgent (order only) + catalog search */}
        <div className="flex items-center gap-2">
          <input
            placeholder="Omschrijving"
            value={part.description}
            onChange={e => onUpdatePart(part.id, 'description', e.target.value)}
            className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm outline-none bg-white border border-stroke text-ink"
          />
          {isOrder && (
            <button
              type="button"
              onClick={() => onUpdatePart(part.id, 'urgent', !part.urgent)}
              className={`shrink-0 text-xs px-2 py-1.5 rounded-lg border font-bold ${
                part.urgent ? 'border-brand-red text-white bg-brand-red' : 'border-stroke text-ink-faint'
              }`}
              title="Dringend"
            >
              {part.urgent ? '🔴' : '!'}
            </button>
          )}
          {queuedPartIds.has(part.id) && <span className="shrink-0 text-xs text-green-600">✓</span>}
          <button
            type="button"
            onClick={() => setCatalogSearch(isSearchOpen ? null : { partId: part.id, query: part.code || part.description || '' })}
            className={`shrink-0 px-2 py-1.5 rounded-lg border text-sm ${
              isSearchOpen ? 'border-brand-orange text-brand-orange bg-orange-50' : 'border-stroke text-ink-faint'
            }`}
            title="Zoek in catalogus"
          >
            🔍
          </button>
        </div>

        {/* Catalog dropdown */}
        {isSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-stroke bg-white shadow-lg overflow-hidden">
            <input
              autoFocus
              placeholder="Zoeken op code of naam..."
              value={catalogSearch.query}
              onChange={e => setCatalogSearch({ partId: part.id, query: e.target.value })}
              className="w-full border-b border-stroke px-3 py-2 text-sm outline-none"
            />
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-faint">Geen resultaten</p>
            ) : (
              <ul>
                {searchResults.map(c => (
                  <li key={c.partNumber}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface border-b border-stroke last:border-b-0"
                      onClick={() => {
                        onUpdatePart(part.id, 'code', c.partNumber)
                        onUpdatePart(part.id, 'description', c.description)
                        setCatalogSearch(null)
                      }}
                    >
                      <span className="font-mono text-xs text-brand-orange">{c.partNumber}</span>
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span className="text-ink">{c.description}</span>
                      <span className="ml-2 text-xs text-ink-faint">{c.brand}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Section title="ONDERDELEN">
      <div className="flex flex-col gap-4">

        {/* Verbruikt */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Verbruikt</p>
          {parts.filter(p => !p.toOrder).length === 0 && (
            <p className="text-sm text-center py-1.5 text-ink-faint">Geen verbruikte onderdelen</p>
          )}
          {parts.filter(p => !p.toOrder).map(part => renderPartRow(part, false))}
          <button
            type="button"
            onClick={() => onAddPart(false)}
            className="w-full py-2 rounded-xl text-sm font-medium border-2 border-dashed border-stroke text-ink-soft"
          >
            + Verbruikt onderdeel
          </button>
        </div>

        {/* Te bestellen */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Te bestellen</p>
          {parts.filter(p => p.toOrder).length === 0 && (
            <p className="text-sm text-center py-1.5 text-ink-faint">Geen onderdelen te bestellen</p>
          )}
          {parts.filter(p => p.toOrder).map(part => renderPartRow(part, true))}
          <button
            type="button"
            onClick={() => onAddPart(true)}
            className="w-full py-2 rounded-xl text-sm font-medium border-2 border-dashed border-orange-200 text-brand-orange"
          >
            + Te bestellen onderdeel
          </button>
        </div>

      </div>
    </Section>
  )
}
