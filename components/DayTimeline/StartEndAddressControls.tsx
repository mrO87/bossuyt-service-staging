/**
 * StartEndAddressControls — expandable panel to edit the day's start/end.
 *
 * Collapsed state is one small line showing the current start (+ "→ zelfde"
 * or the end address). Tapping it expands inputs for start, a checkbox
 * "Einde = Start", and an end input that stays disabled while the box
 * is ticked.
 */
'use client'

import { useState } from 'react'

export function StartEndAddressControls({
  startAddress,
  endAddress,
  sameAsStart,
  onChangeStart,
  onChangeEnd,
  onToggleSame,
}: {
  startAddress: string
  endAddress: string
  sameAsStart: boolean
  onChangeStart: (value: string) => void
  onChangeEnd: (value: string) => void
  onToggleSame: (value: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white border border-stroke rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
            Start &amp; einde
          </p>
          <p className="text-xs text-ink truncate">
            {startAddress}
            {sameAsStart ? (
              <span className="text-ink-soft"> · einde = zelfde</span>
            ) : (
              <span className="text-ink-soft"> → {endAddress}</span>
            )}
          </p>
        </div>
        <span className="text-ink-soft text-xs shrink-0">
          {open ? 'Sluit' : 'Bewerk'}
        </span>
      </button>

      {open && (
        <div className="border-t border-stroke p-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
              Start-adres
            </span>
            <input
              type="text"
              value={startAddress}
              onChange={e => onChangeStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stroke text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-orange"
              placeholder="Bijv. Bossuyt Depot · Sint-Niklaas"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={sameAsStart}
              onChange={e => onToggleSame(e.target.checked)}
              className="w-4 h-4 accent-brand-orange"
            />
            Einde = zelfde als start
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
              Einde-adres
            </span>
            <input
              type="text"
              value={endAddress}
              onChange={e => onChangeEnd(e.target.value)}
              disabled={sameAsStart}
              className="w-full px-3 py-2 rounded-lg border border-stroke text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-orange disabled:bg-stroke/40 disabled:text-ink-soft"
              placeholder="Eindpunt voor vandaag"
            />
          </label>
        </div>
      )}
    </div>
  )
}
