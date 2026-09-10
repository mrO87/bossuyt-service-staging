'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Customer } from '@/types'
import CustomerSelect from '@/components/CustomerSelect'
import { inputClass } from '@/components/NewWorkOrder/Field'
import SourceField, { type FieldSource } from './SourceField'

export type ExtractedFields = Record<string, string>
export type FieldSources = Record<string, FieldSource>

interface Props {
  extracted: ExtractedFields
  sources: FieldSources
  /** The stored bon, shown next to the fields so the values can be checked. */
  previewUrl: string
  isPdf: boolean
  submitting: boolean
  serverError: { field?: string; message: string; existingId?: string } | null
  onSubmit: (body: Record<string, unknown>) => void
}

/** yyyy-mm-dd for an <input type="date">; blank when there is no date. */
function dateInputValue(iso: string | undefined): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : ''
}

/**
 * The confirmation step: what OCR proposed, next to the bon it came from.
 *
 * Nothing here is submitted automatically. That is the whole point of the step —
 * a wrong customer number does not announce itself, so a person looks at the
 * paper and the proposal side by side before this becomes a work order.
 */
export default function ConfirmForm({
  extracted,
  sources,
  previewUrl,
  isPdf,
  submitting,
  serverError,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState(() => ({
    ticketNumber: extracted.ticketNumber ?? '',
    ticketDate: dateInputValue(extracted.ticketDate),
    description: extracted.description ?? '',
    customerNumber: extracted.customerNumber ?? '',
    invoiceNumber: extracted.invoiceNumber ?? '',
    customerName: extracted.customerName ?? '',
    address: extracted.address ?? '',
    postalCode: extracted.postalCode ?? '',
    city: extracted.city ?? '',
    contact: extracted.contact ?? '',
    phone: extracted.phone ?? '',
    closingDay: extracted.closingDay ?? '',
    isUrgent: false,
  }))

  // Either an existing customer picked from the list, or null meaning "create a
  // new one from the fields above". The wizard makes the same distinction, and
  // for the same reason: sending an id stops the server cloning a customer that
  // already exists.
  const [matched, setMatched] = useState<Customer | null>(null)
  const [fetchedCandidates, setFetchedCandidates] = useState<Customer[]>([])
  const [searching, setSearching] = useState(false)
  const [touched, setTouched] = useState(false)

  const searchTerm = draft.customerNumber.trim() || draft.customerName.trim()

  // Look the customer up on whatever was read off the bon. Debounced, so typing
  // a correction does not fire a request per keystroke.
  //
  // The effect only ever fetches; it never clears. Clearing here would be a
  // setState in an effect body, which costs an extra render pass — and it is
  // unnecessary, because what to show is a question the render can answer for
  // itself, just below.
  useEffect(() => {
    if (matched || !searchTerm) return

    const handle = window.setTimeout(() => {
      setSearching(true)
      fetch(`/api/customers?q=${encodeURIComponent(searchTerm)}`)
        .then(r => (r.ok ? r.json() : { customers: [] }))
        .then((data: { customers: Customer[] }) => setFetchedCandidates(data.customers))
        .catch(() => setFetchedCandidates([]))
        .finally(() => setSearching(false))
    }, 300)

    return () => window.clearTimeout(handle)
  }, [searchTerm, matched])

  // Once a customer is picked, or the search box is empty, there is nothing to
  // offer — regardless of what the last request happened to return.
  const candidates = matched || !searchTerm ? [] : fetchedCandidates

  const missing = (key: 'ticketNumber' | 'description') =>
    touched && !draft[key].trim() ? 'Verplicht' : undefined
  const fieldError = (wire: string) => (serverError?.field === wire ? serverError.message : undefined)

  const valid = useMemo(() => {
    if (!draft.ticketNumber.trim() || !draft.description.trim()) return false
    // A brand-new customer has to describe itself; an existing one is an id.
    if (matched) return true
    return Boolean(draft.customerNumber.trim() && draft.customerName.trim() && draft.address.trim() && draft.city.trim())
  }, [draft, matched])

  function submit() {
    setTouched(true)
    if (!valid) return

    // Exactly the shape POST /api/work-orders accepts — the confirm route hands
    // it to the same parser the wizard and the ERP route use.
    const customer = matched
      ? { id: matched.id, number: matched.customerNumber }
      : {
          number: draft.customerNumber.trim(),
          invoice_number: draft.invoiceNumber.trim(),
          name: draft.customerName.trim(),
          address: draft.address.trim(),
          postal_code: draft.postalCode.trim(),
          city: draft.city.trim(),
          phone: draft.phone.trim(),
          contact: draft.contact.trim(),
          closing_day: draft.closingDay.trim(),
        }

    onSubmit({
      ticket_number: draft.ticketNumber.trim(),
      ticket_date: draft.ticketDate || undefined,
      description: draft.description.trim(),
      is_urgent: draft.isUrgent,
      customer,
      device: null,
    })
  }

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }))

  return (
    <div className="flex flex-col gap-3">
      {/* The bon itself. On a phone it sits above the fields; side by side from
          a tablet up, which is where an office user checks these. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start flex flex-col gap-3">
        <div className="rounded-xl overflow-hidden border border-stroke bg-white lg:sticky lg:top-4">
          {isPdf ? (
            <object data={previewUrl} type="application/pdf" className="w-full h-[60vh]">
              <a href={previewUrl} target="_blank" rel="noreferrer" className="block p-4 font-bold text-brand-orange">
                Open de geüploade PDF
              </a>
            </object>
          ) : (
            // Served from /api/uploads at a size only known at runtime, so
            // next/image has nothing to optimise against.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Geüploade werkbon" className="block w-full h-auto" />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
            <p className="font-bold text-base text-ink">Ticket</p>

            <SourceField
              label="Ticket nr"
              required
              source={sources.ticketNumber}
              error={missing('ticketNumber') ?? fieldError('ticket_number')}
            >
              <input
                className={`${inputClass} font-mono`}
                value={draft.ticketNumber}
                onChange={e => set('ticketNumber', e.target.value)}
                placeholder="TKT20/12752"
              />
            </SourceField>

            <SourceField label="Datum ticket" source={sources.ticketDate}>
              <input
                type="date"
                className={inputClass}
                value={draft.ticketDate}
                onChange={e => set('ticketDate', e.target.value)}
              />
            </SourceField>

            <SourceField
              label="Omschrijving klant"
              required
              source={sources.description}
              error={missing('description') ?? fieldError('description')}
            >
              <textarea
                rows={3}
                className={`${inputClass} resize-none`}
                value={draft.description}
                onChange={e => set('description', e.target.value)}
              />
            </SourceField>

            <label className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={draft.isUrgent}
                onChange={e => set('isUrgent', e.target.checked)}
                className="w-6 h-6 accent-brand-orange"
              />
              <span className="font-semibold text-base text-ink">Dringend</span>
            </label>
          </div>

          <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
            <p className="font-bold text-base text-ink">Klant</p>

            {matched ? (
              <div className="rounded-xl border border-brand-green bg-brand-green/10 p-3">
                <p className="font-bold text-base text-ink">{matched.name}</p>
                <p className="text-sm text-ink-soft">
                  {matched.customerNumber} — {matched.address}, {matched.city}
                </p>
                <button
                  type="button"
                  onClick={() => setMatched(null)}
                  className="mt-2 text-sm font-bold text-brand-orange"
                >
                  Andere klant kiezen
                </button>
              </div>
            ) : (
              <>
                <SourceField label="Klant nr" required source={sources.customerNumber} error={fieldError('customer.number')}>
                  <input
                    className={`${inputClass} font-mono`}
                    value={draft.customerNumber}
                    onChange={e => set('customerNumber', e.target.value)}
                    placeholder="K04647"
                  />
                </SourceField>

                <SourceField label="Naam" required source={sources.customerName} error={fieldError('customer.name')}>
                  <input
                    className={inputClass}
                    value={draft.customerName}
                    onChange={e => set('customerName', e.target.value)}
                  />
                </SourceField>

                {candidates.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                      Bestaande klant — kies deze in plaats van een nieuwe aan te maken
                    </p>
                    <CustomerSelect customers={candidates} onSelect={setMatched} />
                  </div>
                )}
                {searching && <p className="text-sm text-ink-soft">Zoeken…</p>}

                <SourceField label="Adres" required source={sources.address} error={fieldError('customer.address')}>
                  <input
                    className={inputClass}
                    value={draft.address}
                    onChange={e => set('address', e.target.value)}
                  />
                </SourceField>

                <div className="grid grid-cols-3 gap-3">
                  <SourceField label="Postcode" source={sources.address}>
                    <input
                      className={inputClass}
                      value={draft.postalCode}
                      onChange={e => set('postalCode', e.target.value)}
                    />
                  </SourceField>
                  <div className="col-span-2">
                    <SourceField label="Gemeente" required source={sources.address} error={fieldError('customer.city')}>
                      <input
                        className={inputClass}
                        value={draft.city}
                        onChange={e => set('city', e.target.value)}
                      />
                    </SourceField>
                  </div>
                </div>

                <SourceField label="Contact" source={sources.contact}>
                  <input
                    className={inputClass}
                    value={draft.contact}
                    onChange={e => set('contact', e.target.value)}
                  />
                </SourceField>

                <SourceField label="Telefoon" source={sources.phone}>
                  <input
                    className={inputClass}
                    value={draft.phone}
                    onChange={e => set('phone', e.target.value)}
                  />
                </SourceField>
              </>
            )}
          </div>

          {serverError && !serverError.field && (
            <p className="rounded-xl bg-brand-red/10 border border-brand-red px-3 py-3 text-sm font-semibold text-brand-red">
              {serverError.message}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-4 rounded-xl font-bold text-base bg-brand-orange text-white disabled:opacity-50"
          >
            {submitting ? 'Bezig…' : 'Zet in de open pool'}
          </button>
        </div>
      </div>
    </div>
  )
}
