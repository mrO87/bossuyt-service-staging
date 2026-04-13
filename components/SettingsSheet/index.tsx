'use client'

import { useEffect } from 'react'
import { useSettings } from '@/lib/hooks/useSettings'
import AddressSearch from './AddressSearch'
import OvertimeWidget from './OvertimeWidget'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsSheet({ open, onClose }: Props) {
  const { settings, updateSetting } = useSettings()

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Sheet */}
      <div
        className={[
          'fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl',
          'transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stroke" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stroke">
          <h2 className="text-base font-bold text-ink">Instellingen</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-surface text-ink-soft text-lg leading-none"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-5 pb-10 max-h-[80vh] overflow-y-auto">

          {/* — Startlocatie — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Startlocatie
            </p>
            <div className="flex rounded-xl overflow-hidden border border-stroke">
              <button
                type="button"
                onClick={() => updateSetting('startLocation', 'atelier')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'atelier'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Atelier
              </button>
              <button
                type="button"
                onClick={() => updateSetting('startLocation', 'thuis')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'thuis'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Thuis
              </button>
            </div>

            {settings.startLocation === 'atelier' && (
              <p className="mt-2 text-xs text-ink-soft">
                Bossuyt Kitchen, Noordlaan 19, 8520 Kuurne
              </p>
            )}

            {settings.startLocation === 'thuis' && (
              <div className="mt-2">
                <AddressSearch
                  value={settings.homeAddress}
                  onChange={(addr) => updateSetting('homeAddress', addr)}
                />
              </div>
            )}
          </div>

          {/* — Gewenst startuur — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Gewenst startuur
            </p>
            <input
              type="time"
              value={settings.startTime}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) {
                  updateSetting('startTime', e.target.value)
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-stroke bg-surface text-ink text-base font-semibold"
            />
          </div>

          {/* — Overuren — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Overuren
            </p>
            <OvertimeWidget startTime={settings.startTime} saldo={null} />
          </div>

        </div>
      </div>
    </>
  )
}
