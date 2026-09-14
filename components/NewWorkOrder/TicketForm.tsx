'use client'

import { todayInBelgium } from '@/lib/planning/pastDays'
import { useEffect, useState } from 'react'
import Field, { inputClass } from './Field'

export interface TicketDraft {
  ticketNumber: string
  ticketDate: string     // yyyy-mm-dd
  plannedDate: string    // yyyy-mm-dd
  description: string
  isUrgent: boolean
  technicianIds: string[]
  /** Warning for whoever picks this up. Never printed on the bon. */
  alertNote: string
}

interface TechnicianOption { id: string; name: string; initials: string; role: string }

interface Props {
  submitting: boolean
  serverError: { field?: string; message: string; existingId?: string } | null
  onSubmit: (draft: TicketDraft) => void
}

/** Vandaag in België — niet UTC; zie todayInBelgium. */
function today(): string { return todayInBelgium() }

export default function TicketForm({ submitting, serverError, onSubmit }: Props) {
  const [draft, setDraft] = useState<TicketDraft>({
    ticketNumber: '', ticketDate: today(), plannedDate: today(), description: '', isUrgent: false, technicianIds: [], alertNote: '',
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
  // Fields this step renders inline; anything else needs the banner below.
  const LOCAL_FIELDS = ['ticket_number', 'planned_date', 'description']
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
      <Field label="Melding (optioneel)">
        <textarea
          rows={2}
          className={`${inputClass} resize-none`}
          value={draft.alertNote}
          onChange={e => setDraft(p => ({ ...p, alertNote: e.target.value }))}
          placeholder="Klant eerst bellen op 0477/93 15 70"
        />
        <span className="block mt-1 text-xs text-ink-soft">
          Verschijnt als rood uitroepteken in de lijst en bovenaan de werkbon. Komt niet op de PDF.
        </span>
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
      {/* A 409 names the ticket that already exists — make it reachable. */}
      {serverError?.existingId && (
        <a
          href={`/interventions/${serverError.existingId}`}
          className="block text-sm font-bold text-brand-blue underline underline-offset-2"
        >
          Open bestaande werkbon →
        </a>
      )}

      {/* Any error this step does not own would otherwise be invisible: the button
          re-enables and nothing is shown. Rejected customer or site fields land here. */}
      {serverError && !LOCAL_FIELDS.includes(serverError.field ?? '') && (
        <div className="rounded-xl border border-brand-red bg-white px-3 py-2">
          <p className="text-sm font-semibold text-brand-red">
            {serverError.field ? `${serverError.field}: ${serverError.message}` : serverError.message}
          </p>
        </div>
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
