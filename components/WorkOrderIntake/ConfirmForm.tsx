'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Customer } from '@/types'
import CustomerSelect from '@/components/CustomerSelect'
import { inputClass } from '@/components/NewWorkOrder/Field'
import SourceField, { type FieldSource } from './SourceField'

export type ExtractedFields = Record<string, string>
export type FieldSources = Record<string, FieldSource>

/** Eén toestelregel zoals ze van de bon komt. */
export interface ExtractedDevice {
  unitNumber: string
  description: string
  brand: string
  model: string
  deliveryDate: string
  warrantyUntil: string
}

interface Props {
  extracted: ExtractedFields
  /** De toestellen uit de UNIT-tabel, in de volgorde van de bon. */
  devices?: ExtractedDevice[]
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
  devices = [],
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
    // Never read off the bon — this is an internal instruction someone types.
    alertNote: '',
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

  // Every field `valid` checks belongs here. It used to name only two, which is
  // why an empty customer name left the button doing nothing and the form
  // saying nothing — the check was there, the way to see it failing was not.
  const missing = (
    key: 'ticketNumber' | 'description' | 'customerNumber' | 'customerName' | 'address' | 'city',
  ) => (touched && !draft[key].trim() ? 'Verplicht' : undefined)
  const fieldError = (wire: string) => (serverError?.field === wire ? serverError.message : undefined)

  // Which fields are missing, not merely whether any are: the button has to be
  // able to name them, and a boolean cannot.
  const missingFields = useMemo(() => {
    const out: string[] = []
    if (!draft.ticketNumber.trim()) out.push('Ticket nr')
    if (!draft.description.trim()) out.push('Omschrijving')
    // A brand-new customer has to describe itself; an existing one is an id.
    if (!matched) {
      if (!draft.customerNumber.trim()) out.push('Klant nr')
      // De naam staat hier bewust niet bij. Op een papieren bon blijft dat vak
      // soms leeg; dat is geen leesfout van de app maar een leeg vak op papier.
      // Het rode merkje "niet gevonden" naast het veld zegt dat al — de bon
      // tegenhouden om iets wat de admin niet invulde, helpt niemand.
      if (!draft.address.trim()) out.push('Adres')
      if (!draft.city.trim()) out.push('Gemeente')
    }
    return out
  }, [draft, matched])

  // Nothing is refused here any more. `missingFields` still drives the note above
  // the button and the marks on the fields; it no longer decides whether the
  // press counts.
  const allFilled = missingFields.length === 0

  function submit() {
    setTouched(true)

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
      alert_note: draft.alertNote.trim() || undefined,
      customer,
      device: null,
      // De toestellen uit de UNIT-tabel. De server maakt ze aan op de
      // vestiging van deze bon en hangt ze aan de werkbon; het eerste wordt
      // het hoofdtoestel, waar het verslag en de onderdelen aan hangen.
      devices: devices.map(device => ({
        unit_number: device.unitNumber || undefined,
        brand: device.brand || undefined,
        model: device.model || undefined,
        delivery_date: device.deliveryDate || undefined,
        warranty_until: device.warrantyUntil || undefined,
        // De regel zoals ze op de bon stond. Merk en model zijn eruit gegokt;
        // zonder de bron zou een verkeerde gok betekenen dat iemand de papieren
        // bon terug moet zoeken.
        source_label: device.description || undefined,
      })),
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

            <SourceField label="Melding (optioneel)">
              <textarea
                rows={2}
                className={`${inputClass} resize-none`}
                value={draft.alertNote}
                onChange={e => set('alertNote', e.target.value)}
                placeholder="Klant eerst bellen op 0477/93 15 70"
              />
              <span className="block mt-1 text-xs text-ink-soft">
                Verschijnt als rood uitroepteken in de lijst en bovenaan de werkbon. Komt niet op de PDF.
              </span>
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
                <SourceField label="Klant nr" required source={sources.customerNumber} error={missing('customerNumber') ?? fieldError('customer.number')}>
                  <input
                    className={`${inputClass} font-mono`}
                    value={draft.customerNumber}
                    onChange={e => set('customerNumber', e.target.value)}
                    placeholder="K04647"
                  />
                </SourceField>

                <SourceField label="Naam" source={sources.customerName} error={fieldError('customer.name')}>
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

                <SourceField label="Adres" required source={sources.address} error={missing('address') ?? fieldError('customer.address')}>
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
                    <SourceField label="Gemeente" required source={sources.address} error={missing('city') ?? fieldError('customer.city')}>
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

          {/*
            De toestellen uit de UNIT-tabel, om te tonen en niet om te wijzigen.
            Wat hier staat wordt straks aangemaakt op de vestiging van deze bon,
            en het eerste wordt het hoofdtoestel.

            Tonen en niet bewerken is een keuze: op het kleine scherm van een
            telefoon zou een bewerkbare tabel van drie toestellen dit formulier
            verdubbelen, terwijl de gegevens er meestal gewoon goed uit komen.
            Rechtzetten gebeurt in de toestellenlijst, waar ook de toesteltypes
            aangeduid worden.
          */}
          {devices.length > 0 && (
            <div className="rounded-xl border border-stroke bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
                {devices.length === 1 ? 'Toestel op de bon' : `${devices.length} toestellen op de bon`}
              </p>
              <ul className="flex flex-col gap-2">
                {devices.map((device, index) => (
                  <li
                    key={device.unitNumber || `toestel-${index}`}
                    className="border-l-4 border-brand-orange/40 pl-2 text-sm"
                  >
                    <p className="font-semibold text-ink">
                      {device.brand || device.model
                        ? [device.brand, device.model].filter(Boolean).join(' ')
                        : device.description}
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      {device.unitNumber && (
                        <span className="font-mono tabular-nums">{device.unitNumber}</span>
                      )}
                      {device.unitNumber && device.deliveryDate ? ' · ' : ''}
                      {device.deliveryDate && <>geleverd {device.deliveryDate}</>}
                      {index === 0 && devices.length > 1 && (
                        <span className="ml-1 text-ink-faint">· hoofdtoestel</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Every refusal shows here, including the ones that also mark a
              field. A server error naming "ticket_number" used to appear only
              beside that field, at the top of a form whose button is at the
              bottom — which from the button looked like nothing happening. */}
          {serverError && (
            <p className="rounded-xl bg-brand-red/10 border border-brand-red px-3 py-3 text-sm font-semibold text-brand-red">
              {serverError.message}
            </p>
          )}

          {/* Not waiting for a press: needing the button to learn why the button
              does nothing is the trap this is here to close. */}
          {missingFields.length > 0 && (
            <p className="rounded-xl bg-brand-orange/10 border border-brand-orange px-3 py-3 text-sm font-semibold text-brand-orange">
              {missingFields.length === 1
                ? `${missingFields[0]} is nog leeg.`
                : `Nog leeg: ${missingFields.join(', ')}.`}
            </p>
          )}

          {/* Muted rather than disabled. A disabled button cannot be pressed,
              and pressing is what marks the fields for somebody who wants to
              know exactly which one is holding things up. */}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={`w-full py-4 rounded-xl font-bold text-base text-white disabled:opacity-50 ${
              allFilled ? 'bg-brand-orange' : 'bg-brand-orange/40'
            }`}
          >
            {submitting ? 'Bezig…' : 'Zet in de open pool'}
          </button>
        </div>
      </div>
    </div>
  )
}
