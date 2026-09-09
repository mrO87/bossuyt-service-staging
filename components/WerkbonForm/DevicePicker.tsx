'use client'

import { useEffect, useState } from 'react'
import type { Device } from '@/types'
import NewDeviceForm, { type NewDeviceDraft } from '@/components/NewWorkOrder/NewDeviceForm'
import Section from './Section'

interface Props {
  siteId: string
  onPick: (device: Device) => void
}

/** Shown instead of DevicePanel when the ticket has no device yet. */
export default function DevicePicker({ siteId, onPick }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sites/${siteId}/devices`)
      .then(r => (r.ok ? r.json() : { devices: [] }))
      .then((data: { devices: Device[] }) => { if (!cancelled) setDevices(data.devices ?? []) })
      .catch(() => { if (!cancelled) setDevices([]) })
    return () => { cancelled = true }
  }, [siteId])

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
          {devices.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d)}
              className="w-full text-left rounded-xl p-3 bg-surface border border-stroke"
            >
              <p className="font-bold text-ink">{d.brand} {d.model}</p>
              <p className="text-xs text-ink-soft">
                {[d.unitNumber && `Unit ${d.unitNumber}`, d.serialNumber && `S/N ${d.serialNumber}`]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </button>
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
