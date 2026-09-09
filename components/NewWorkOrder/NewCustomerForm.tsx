'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

/** Draft of a customer that does not exist yet. Created on the server by createWorkOrder. */
export interface NewCustomerDraft {
  number: string
  invoiceNumber: string
  name: string
  address: string
  postalCode: string
  city: string
  phone: string
  contact: string
  contactPhone: string
  closingDay: string
}

export const EMPTY_CUSTOMER: NewCustomerDraft = {
  number: '', invoiceNumber: '', name: '', address: '', postalCode: '', city: '',
  phone: '', contact: '', contactPhone: '', closingDay: '',
}

interface Props {
  onSubmit: (draft: NewCustomerDraft) => void
  onCancel: () => void
}

export default function NewCustomerForm({ onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<NewCustomerDraft>(EMPTY_CUSTOMER)
  const [touched, setTouched] = useState(false)

  const set = (key: keyof NewCustomerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))

  const missing = (key: keyof NewCustomerDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = ['number', 'name', 'address', 'city'].every(k => draft[k as keyof NewCustomerDraft].trim())

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuwe klant</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Klant nr L" required error={missing('number')}>
          <input className={inputClass} value={draft.number} onChange={set('number')} placeholder="K04647" />
        </Field>
        <Field label="Klant nr F">
          <input className={inputClass} value={draft.invoiceNumber} onChange={set('invoiceNumber')} placeholder="indien anders" />
        </Field>
      </div>
      <Field label="Naam" required error={missing('name')}>
        <input className={inputClass} value={draft.name} onChange={set('name')} />
      </Field>
      <Field label="Adres" required error={missing('address')}>
        <input className={inputClass} value={draft.address} onChange={set('address')} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Postcode">
          <input className={inputClass} inputMode="numeric" value={draft.postalCode} onChange={set('postalCode')} />
        </Field>
        <Field label="Gemeente" required error={missing('city')}>
          <input className={inputClass} value={draft.city} onChange={set('city')} />
        </Field>
      </div>
      <Field label="Tel & GSM">
        <input className={inputClass} inputMode="tel" value={draft.phone} onChange={set('phone')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact">
          <input className={inputClass} value={draft.contact} onChange={set('contact')} />
        </Field>
        <Field label="Tel contact">
          <input className={inputClass} inputMode="tel" value={draft.contactPhone} onChange={set('contactPhone')} />
        </Field>
      </div>
      <Field label="Sluitingsdag">
        <input className={inputClass} value={draft.closingDay} onChange={set('closingDay')} placeholder="bv. maandag" />
      </Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button
          type="button"
          onClick={() => { setTouched(true); if (valid) onSubmit(draft) }}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-orange disabled:opacity-50"
        >
          Klant gebruiken
        </button>
      </div>
    </div>
  )
}
