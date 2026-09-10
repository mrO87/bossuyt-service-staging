import type { InterventionKind, WerkbonFormState } from '@/types'
import Section from './Section'

/** A technician who can be put on this visit, as /api/technicians returns them. */
export interface TechnicianOption {
  id: string
  name: string
}

interface Props {
  form: WerkbonFormState
  /**
   * Everyone who could have worked this visit — all active technicians, not
   * only the ones planning assigned. A colleague who came along to lift a
   * fryer has to be nameable without being re-planned first.
   */
  technicians: TechnicianOption[]
  onChange: <K extends keyof WerkbonFormState>(field: K, value: WerkbonFormState[K]) => void
}

const inputClass =
  'w-full rounded-xl px-3 py-3 text-base bg-surface border border-stroke text-ink outline-none text-center font-bold'

function isoToHHMM(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Combine the visit date with an HH:MM string into an ISO datetime. */
function withTime(visitDate: string, hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const base = visitDate ? new Date(`${visitDate}T00:00:00`) : new Date()
  base.setHours(h, m, 0, 0)
  return base.toISOString()
}

type TimeField = 'arrivalTime' | 'departureTime' | 'workStart' | 'workEnd'

/** Right-hand block of the paper bon: technicus, bezoekdatum, uren, week/weekend, ritten, personen. */
export default function VisitSection({ form, technicians, onChange }: Props) {
  function renderTimeField(label: string, field: TimeField) {
    return (
      <div key={field} className="rounded-xl p-3 bg-surface flex flex-col gap-2">
        <p className="text-xs text-ink-soft text-center">{label}</p>
        <input
          type="time"
          value={isoToHHMM(form[field])}
          onChange={e => onChange(field, withTime(form.visitDate, e.target.value))}
          className="w-full text-xl font-bold text-ink bg-transparent text-center outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(field, new Date().toISOString())}
          className="w-full py-2 rounded-lg text-xs font-bold text-white bg-brand-blue"
        >
          Nu
        </button>
      </div>
    )
  }

  return (
    <Section title="BEZOEK">
      <div className="flex flex-col gap-3">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Technicus | Technicien
          </span>
          {/*
            Chips rather than a dropdown, because more than one person can work
            a visit and a <select> only holds one. The first one tapped stays
            first: that is the lead, whose name signs the bon.
          */}
          <div className="flex flex-wrap gap-2">
            {technicians.map(technician => {
              const picked = form.technicianIds.includes(technician.id)
              return (
                <button
                  key={technician.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => {
                    const next = picked
                      ? form.technicianIds.filter(id => id !== technician.id)
                      : [...form.technicianIds, technician.id]
                    onChange('technicianIds', next)
                    // The lead is always the first of the list, so the two can
                    // never disagree about who signed.
                    onChange('technicianId', next[0] ?? null)
                  }}
                  className={`px-3 py-2.5 rounded-full text-sm font-semibold border ${
                    picked
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-surface text-ink border-stroke'
                  }`}
                >
                  {technician.name}
                  {picked && <span className="ml-1.5 font-bold">×</span>}
                </button>
              )
            })}
          </div>
          {form.technicianIds.length === 0 && (
            <span className="block mt-1 text-xs text-brand-red font-semibold">
              Kies minstens één technicus
            </span>
          )}
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Bezoekdatum | Date de la visite
          </span>
          <input
            type="date"
            value={form.visitDate}
            onChange={e => {
              const value = e.target.value
              onChange('visitDate', value)
              if (value) {
                const day = new Date(`${value}T12:00:00`).getDay()
                onChange('interventionKind', day === 0 || day === 6 ? 'weekend' : 'week')
              }
            }}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {renderTimeField('Aankomstuur', 'arrivalTime')}
          {renderTimeField('Vertrekuur', 'departureTime')}
          {renderTimeField('Werk start', 'workStart')}
          {renderTimeField('Werk einde', 'workEnd')}
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Interventie | Intervention
          </span>
          <div className="flex rounded-xl overflow-hidden border border-stroke">
            {(['week', 'weekend'] as InterventionKind[]).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => onChange('interventionKind', kind)}
                className={`flex-1 py-3 text-sm font-bold uppercase ${
                  form.interventionKind === kind ? 'bg-brand-orange text-white' : 'bg-white text-ink'
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
              Aantal ritten
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.tripCount}
              onChange={e => onChange('tripCount', Math.max(0, Number(e.target.value) || 0))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
              Aantal personen
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={form.personCount}
              onChange={e => onChange('personCount', Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </label>
        </div>
      </div>
    </Section>
  )
}
