'use client'

import { useEffect, useState } from 'react'
import Field, { inputClass } from './Field'

export interface TicketDraft {
  ticketNumber: string
  ticketDate: string     // yyyy-mm-dd
  plannedDate: string    // yyyy-mm-dd
  description: string
  isUrgent: boolean
  technicianIds: string[]
}

interface TechnicianOption { id: string; name: string; initials: string; role: string }

interface Props {
  submitting: boolean
  serverError: { field?: string; message: string } | null
  onSubmit: (draft: TicketDraft) => void
}

function today(): string { return new Date().toISOString().slice(0, 10) }

export default function TicketForm({ submitting, serverError, onSubmit }: Props) {
  const [draft, setDraft] = useState<TicketDraft>({
    ticketNumber: '', ticketDate: today(), plannedDate: today(), description: '', isUrgent: false, technicianIds: [],
  })
  const [touched, setTouched] = useState(false)
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])

  useEffect(() => {
    fetch('/api/technicians')
      .then(r => r.ok ? r.json() : { technicians: [] })
      .then((data: { technicians: TechnicianOption[] }) => setTechnicians(data.technicians.filter(t => t.role === 'technician')))
      .catch(() => setTechnicians([]))
  }, [])

  const missing = (key: 'ticketNumber' | 'plannedDate' | 'description') =>
    touched && !draft[key].trim() ? 'Verplicht' : undefined
  const fieldError = (wire: string) => serverError?.field === wire ? serverError.message : undefined
  const valid = draft.ticketNumber.trim() && draft.plannedDate && draft.description.trim()

  function toggleTechnician(id: string) {
    setDraft(prev => ({
      ...prev,
      technicianIds: prev.technicianIds.includes(id) ? prev.technicianIds.filter(t => t !== id) : [...prev.technicianIds, id],
    }))
  }

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Ticket</p>
      <Field label="Ticket nr" required error={missing('ticketNumber') ?? fieldError('ticket_number')}>
        <input className={`${inputClass} font-mono`} value={draft.ticketNumber} onChange={e => setDraft(p => ({ ...p, ticketNumber: e.target.value }))} placeholder="TKT20/12752" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum ticket">
          <input type="date" className={inputClass} value={draft.ticketDate} onChange={e => setDraft(p => ({ ...p, ticketDate: e.target.value }))} />
        </Field>
        <Field label="Geplande datum" required error={missing('plannedDate') ?? fieldError('planned_date')}>
          <input type="date" className={inputClass} value={draft.plannedDate} onChange={e => setDraft(p => ({ ...p, plannedDate: e.target.value }))} />
        </Field>
      </div>
      <Field label="Omschrijving klant" required error={missing('description') ?? fieldError('description')}>
        <textarea rows={4} className={`${inputClass} resize-none`} value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} placeholder="Nazicht / herstel ..." />
      </Field>
      <button
        type="button"
        onClick={() => setDraft(p => ({ ...p, isUrgent: !p.isUrgent }))}
        className={`w-full py-3 rounded-xl font-bold text-sm border ${draft.isUrgent ? 'bg-brand-red text-white border-brand-red' : 'bg-surface text-ink border-stroke'}`}
      >
        {draft.isUrgent ? '⚠ Dringend' : 'Niet dringend'}
      </button>
      {technicians.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Technieker(s)</p>
          <div className="flex flex-wrap gap-2">
            {technicians.map(t => {
              const active = draft.technicianIds.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggleTechnician(t.id)}
                  className={`px-3 py-2 rounded-full text-sm font-semibold border ${active ? 'bg-brand-orange text-white border-brand-orange' : 'bg-surface text-ink border-stroke'}`}>
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {serverError && !serverError.field && (
        <p className="text-sm font-semibold text-brand-red">{serverError.message}</p>
      )}
      <button
        type="button"
        disabled={submitting}
        onClick={() => { setTouched(true); if (valid) onSubmit(draft) }}
        className="w-full py-4 rounded-xl font-bold text-white text-base bg-brand-orange disabled:opacity-60"
      >
        {submitting ? 'Aanmaken...' : 'Werkbon aanmaken'}
      </button>
    </div>
  )
}
