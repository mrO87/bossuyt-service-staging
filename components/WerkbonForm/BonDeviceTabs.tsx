/**
 * De toestellen van deze bon, als rij om uit te kiezen.
 *
 * Een servicebon noemt er soms drie. Tot nu toe toonde de werkbon er één — het
 * hoofdtoestel, waar het verslag en de onderdelen aan hangen — en waren de
 * andere twee onzichtbaar, ook al stonden ze netjes in de database. Wie ter
 * plaatse het schema van het tweede vuur nodig had, vond het niet.
 *
 * Kiezen verandert alléén wat je ziet. Het verslag blijft aan het hoofdtoestel
 * hangen; dat is wat de gebruiker gevraagd heeft en het staat er ook bij. Een
 * tik hier schrijft niets weg.
 *
 * Bij één toestel toont dit niets: een keuze uit één is geen keuze, en een lege
 * rij knoppen is enkel ruis op een telefoonscherm.
 *
 * De lijst zelf haalt dit niet meer op — die komt van boven, uit
 * `useBonDevices`, omdat de afgewerkte bon hem ook nodig heeft. Zie daar.
 */
'use client'

import { deviceLabel, type BonDevice } from './useBonDevices'

export { deviceLabel, type BonDevice }

export function BonDeviceTabs({
  devices,
  selectedId,
  onSelect,
}: {
  devices: BonDevice[]
  selectedId: string | null
  onSelect: (device: BonDevice) => void
}) {
  if (devices.length < 2) return null

  return (
    <div className="mb-2">
      <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        {devices.length} toestellen op deze bon
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {devices.map(device => {
          const gekozen = device.id === selectedId
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => onSelect(device)}
              aria-pressed={gekozen}
              className={[
                'shrink-0 rounded-lg border px-2.5 py-1.5 text-left',
                gekozen
                  ? 'border-brand-orange bg-brand-orange/10'
                  : 'border-stroke bg-white',
              ].join(' ')}
            >
              <span className="block text-xs font-bold text-ink">{deviceLabel(device)}</span>
              <span className="block text-[10px] tabular-nums text-ink-soft">
                {device.unitNumber ?? '—'}
                {device.isMain && <span className="ml-1 text-brand-orange">· verslag</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
