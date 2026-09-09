'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

export interface NewDeviceDraft {
  unitNumber: string
  brand: string
  model: string
  serialNumber: string
  deliveryDate: string   // yyyy-mm-dd
  warrantyUntil: string  // yyyy-mm-dd
}

interface Props {
  onSubmit: (draft: NewDeviceDraft) => void
  onCancel: () => void
  submitLabel?: string
}

export default function NewDeviceForm({ onSubmit, onCancel, submitLabel = 'Toestel gebruiken' }: Props) {
  const [draft, setDraft] = useState<NewDeviceDraft>({ unitNumber: '', brand: '', model: '', serialNumber: '', deliveryDate: '', warrantyUntil: '' })
  const [touched, setTouched] = useState(false)
  const set = (key: keyof NewDeviceDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))
  const missing = (key: keyof NewDeviceDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = draft.brand.trim() && draft.model.trim()

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuw toestel</p>
      <Field label="Unit nr"><input className={inputClass} value={draft.unitNumber} onChange={set('unitNumber')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Merk" required error={missing('brand')}><input className={inputClass} value={draft.brand} onChange={set('brand')} placeholder="Berner" /></Field>
        <Field label="Model" required error={missing('model')}><input className={inputClass} value={draft.model} onChange={set('model')} /></Field>
      </div>
      <Field label="Serienummer"><input className={inputClass} value={draft.serialNumber} onChange={set('serialNumber')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Leverdatum"><input type="date" className={inputClass} value={draft.deliveryDate} onChange={set('deliveryDate')} /></Field>
        <Field label="Garantie tot"><input type="date" className={inputClass} value={draft.warrantyUntil} onChange={set('warrantyUntil')} /></Field>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button type="button" onClick={() => { setTouched(true); if (valid) onSubmit(draft) }} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-green">{submitLabel}</button>
      </div>
    </div>
  )
}
