'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

export interface NewSiteDraft {
  name: string
  address: string
  postalCode: string
  city: string
  phone: string
}

interface Props {
  defaultName: string
  onSubmit: (draft: NewSiteDraft) => void
  onCancel: () => void
}

export default function NewSiteForm({ defaultName, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<NewSiteDraft>({ name: defaultName, address: '', postalCode: '', city: '', phone: '' })
  const [touched, setTouched] = useState(false)
  const set = (key: keyof NewSiteDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))
  const missing = (key: keyof NewSiteDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = draft.address.trim() && draft.city.trim()

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuwe locatie</p>
      <Field label="Naam locatie">
        <input className={inputClass} value={draft.name} onChange={set('name')} />
      </Field>
      <Field label="Adres" required error={missing('address')}>
        <input className={inputClass} value={draft.address} onChange={set('address')} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Postcode"><input className={inputClass} inputMode="numeric" value={draft.postalCode} onChange={set('postalCode')} /></Field>
        <Field label="Gemeente" required error={missing('city')}><input className={inputClass} value={draft.city} onChange={set('city')} /></Field>
      </div>
      <Field label="Tel"><input className={inputClass} inputMode="tel" value={draft.phone} onChange={set('phone')} /></Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button type="button" onClick={() => { setTouched(true); if (valid) onSubmit(draft) }} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-blue">Locatie gebruiken</button>
      </div>
    </div>
  )
}
