'use client'

import { useEffect, useState } from 'react'
import type { Device } from '@/types'
import NewDeviceForm, { type NewDeviceDraft } from '@/components/NewWorkOrder/NewDeviceForm'
import Section from './Section'

interface DevicesAtSite {
  siteId: string
  siteName: string
  siteCity: string
  devices: Device[]
}

interface Props {
  siteId: string
  /**
   * De klant van deze bon. Zonder dit zie je alleen de toestellen van déze
   * vestiging, en een klant met twee adressen mist de helft van zijn eigen
   * toestellen.
   */
  customerId?: string
  onPick: (device: Device) => void
}

/** Shown instead of DevicePanel when the ticket has no device yet. */
export default function DevicePicker({ siteId, customerId, onPick }: Props) {
  const [groups, setGroups] = useState<DevicesAtSite[]>([])
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Alle toestellen van de klant, met deze vestiging bovenaan. Is de klant
    // niet bekend, dan blijft het bij deze vestiging — beter een halve lijst
    // dan geen.
    const url = customerId
      ? `/api/customers/${customerId}/devices?site=${encodeURIComponent(siteId)}`
      : `/api/sites/${siteId}/devices`

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { sites?: DevicesAtSite[]; devices?: Device[] } | null) => {
        if (cancelled || !data) { if (!cancelled) setGroups([]); return }
        if (data.sites) { setGroups(data.sites); return }
        setGroups([{ siteId, siteName: '', siteCity: '', devices: data.devices ?? [] }])
      })
      .catch(() => { if (!cancelled) setGroups([]) })

    return () => { cancelled = true }
  }, [siteId, customerId])

  async function createDevice(draft: NewDeviceDraft) {
    setError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand: draft.brand,
          model: draft.model,
          unit_number: draft.unitNumber,
          serial_number: draft.serialNumber,
          delivery_date: draft.deliveryDate,
          warranty_until: draft.warrantyUntil,
        }),
      })
      if (!res.ok) throw new Error('create failed')
      const { device } = (await res.json()) as { device: Device }
      onPick(device)
    } catch {
      setError('Toestel kon niet opgeslagen worden — controleer je verbinding')
    }
  }

  return (
    <Section title="TOESTEL">
      <p className="text-sm text-ink-soft mb-3">
        Geen toestel gekend op dit ticket. Kies het toestel waaraan je werkt.
      </p>
      {showNew ? (
        <NewDeviceForm onSubmit={createDevice} onCancel={() => setShowNew(false)} submitLabel="Toestel opslaan" />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map(group => (
            <div key={group.siteId} className="flex flex-col gap-2">
              {/* Het opschrift alleen wanneer er meer dan één vestiging is:
                  bij één adres voegt het niets toe en kost het een regel. */}
              {groups.length > 1 && (
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  {group.siteName || group.siteCity || 'Vestiging'}
                  {group.siteId === siteId && <span className="ml-1 normal-case">· deze bon</span>}
                </p>
              )}
              {group.devices.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onPick(d)}
                  className="w-full text-left rounded-xl p-3 bg-surface border border-stroke"
                >
                  <p className="font-bold text-ink">
                    {[d.brand, d.model].filter(Boolean).join(' ') || 'Toestel zonder merk'}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {[d.unitNumber && `Unit ${d.unitNumber}`, d.serialNumber && `S/N ${d.serialNumber}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-green text-brand-green bg-white"
          >
            + Nieuw toestel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
    </Section>
  )
}
