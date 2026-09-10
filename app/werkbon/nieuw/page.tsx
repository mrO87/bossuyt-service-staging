'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer, Site, Device, Contact } from '@/types'
import CustomerSelect from '@/components/CustomerSelect'
import SiteSelect from '@/components/SiteSelect'
import DeviceSelect from '@/components/DeviceSelect'
import NewCustomerForm, { type NewCustomerDraft } from '@/components/NewWorkOrder/NewCustomerForm'
import NewSiteForm, { type NewSiteDraft } from '@/components/NewWorkOrder/NewSiteForm'
import NewDeviceForm, { type NewDeviceDraft } from '@/components/NewWorkOrder/NewDeviceForm'
import TicketForm, { type TicketDraft } from '@/components/NewWorkOrder/TicketForm'
import { inputClass } from '@/components/NewWorkOrder/Field'
import { useTasks } from '@/lib/task-store'

type Screen = 'customer' | 'site' | 'device' | 'ticket'

const STEPS: Record<Screen, number> = { customer: 1, site: 2, device: 3, ticket: 4 }
const STEP_LABELS: Record<Screen, string> = {
  customer: 'Selecteer klant',
  site:     'Selecteer locatie',
  device:   'Selecteer toestel',
  ticket:   'Ticket',
}

type SiteWithContacts = Site & { contacts: Contact[] }

/** Either an existing record picked from the list, or a draft typed in the "nieuw" form. */
type Picked<T, D> = { kind: 'existing'; value: T } | { kind: 'new'; value: D }

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1"  y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1"  y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

export default function NieuwWerkbon() {
  const router = useRouter()
  const { currentUser } = useTasks()

  const [screen, setScreen] = useState<Screen>('customer')
  const [customer, setCustomer] = useState<Picked<Customer, NewCustomerDraft> | null>(null)
  const [site, setSite]         = useState<Picked<SiteWithContacts, NewSiteDraft> | null>(null)
  const [device, setDevice]     = useState<Picked<Device, NewDeviceDraft> | 'none' | null>(null)

  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sites, setSites] = useState<SiteWithContacts[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<{ field?: string; message: string; existingId?: string } | null>(null)

  // Customer search, debounced 300 ms
  useEffect(() => {
    if (screen !== 'customer') return
    const handle = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/customers?q=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : { customers: [] })
        .then((data: { customers: Customer[] }) => setCustomers(data.customers))
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(handle)
  }, [query, screen])

  // Sites for an existing customer
  useEffect(() => {
    if (screen !== 'site' || customer?.kind !== 'existing') return
    setLoading(true)
    fetch(`/api/customers/${customer.value.id}/sites`)
      .then(r => r.ok ? r.json() : { sites: [] })
      .then((data: { sites: SiteWithContacts[] }) => setSites(data.sites))
      .catch(() => setSites([]))
      .finally(() => setLoading(false))
  }, [screen, customer])

  // Devices for an existing site
  useEffect(() => {
    if (screen !== 'device' || site?.kind !== 'existing') return
    setLoading(true)
    fetch(`/api/sites/${site.value.id}/devices`)
      .then(r => r.ok ? r.json() : { devices: [] })
      .then((data: { devices: Device[] }) => setDevices(data.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [screen, site])

  function pickCustomer(value: Picked<Customer, NewCustomerDraft>) {
    setCustomer(value)
    setShowNew(false)
    // A brand-new customer has exactly one address: skip the site step.
    if (value.kind === 'new') { setSite(null); setScreen('device') } else { setScreen('site') }
  }

  function pickSite(value: Picked<SiteWithContacts, NewSiteDraft>) {
    setSite(value); setShowNew(false); setScreen('device')
  }

  function pickDevice(value: Picked<Device, NewDeviceDraft> | 'none') {
    setDevice(value); setShowNew(false); setScreen('ticket')
  }

  function handleBack() {
    setShowNew(false)
    setServerError(null)
    if (screen === 'site')   { setCustomer(null); setScreen('customer') }
    if (screen === 'device') { setSite(null); setScreen(customer?.kind === 'new' ? 'customer' : 'site') }
    if (screen === 'ticket') { setDevice(null); setScreen('device') }
  }

  /** Build the snake_case body that POST /api/work-orders expects (same shape as the ERP route). */
  function buildBody(ticket: TicketDraft): Record<string, unknown> {
    if (!customer) throw new Error('no customer')

    // Anything picked from a list is referenced by id, so the server never has to
    // guess which row we meant. Only a record typed into a "nieuw" form describes
    // itself. Sending a customer number here would clone any customer that has
    // none — and most legacy customers have none.
    const customerBody = customer.kind === 'existing'
      ? {
          id: customer.value.id,
          number: customer.value.customerNumber,
        }
      : {
          number: customer.value.number,
          invoice_number: customer.value.invoiceNumber,
          name: customer.value.name,
          address: customer.value.address,
          postal_code: customer.value.postalCode,
          city: customer.value.city,
          phone: customer.value.phone,
          contact: customer.value.contact,
          contact_phone: customer.value.contactPhone,
          closing_day: customer.value.closingDay,
        }

    const siteBody = site?.kind === 'existing'
      ? { id: site.value.id }
      : site?.kind === 'new'
        ? { name: site.value.name, address: site.value.address, postal_code: site.value.postalCode, city: site.value.city }
        : undefined

    const deviceBody = device === 'none' || device === null
      ? null
      : device.kind === 'existing'
        ? { id: device.value.id }
        : { unit_number: device.value.unitNumber, brand: device.value.brand, model: device.value.model, serial_number: device.value.serialNumber, delivery_date: device.value.deliveryDate, warranty_until: device.value.warrantyUntil }

    return {
      ticket_number: ticket.ticketNumber,
      ticket_date: ticket.ticketDate,
      planned_date: ticket.plannedDate,
      description: ticket.description,
      is_urgent: ticket.isUrgent,
      alert_note: ticket.alertNote.trim() || undefined,
      customer: customerBody,
      site: siteBody,
      device: deviceBody,
      technician_ids: ticket.technicianIds,
      created_by: currentUser.id,
    }
  }

  async function submit(ticket: TicketDraft) {
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(ticket)),
      })
      const json = await res.json() as { id?: string; error?: string; field?: string }
      if (res.status === 201 && json.id) {
        router.push(`/interventions/${json.id}`)
        return
      }
      if (res.status === 409 && json.id) {
        setServerError({ field: 'ticket_number', message: 'Ticket bestaat al', existingId: json.id })
        return
      }
      setServerError({ field: json.field, message: json.error ?? 'Aanmaken mislukt' })
    } catch {
      setServerError({ message: 'Geen verbinding — probeer opnieuw' })
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = STEPS[screen]
  const customerName = customer?.value.name
  const siteName = site?.value.name
  const deviceName = device && device !== 'none' ? `${device.value.brand} ${device.value.model}` : device === 'none' ? 'Geen toestel' : undefined

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">nieuwe werkbon</p>
          </div>
        </div>
        <button
          onClick={() => (screen === 'customer' ? router.push('/') : handleBack())}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-mid text-white"
        >
          ← Terug
        </button>
      </header>

      <div className="bg-brand-dark border-b border-brand-mid px-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          {([1, 2, 3, 4] as const).map(step => (
            <div key={step} className={`h-1 rounded-full flex-1 transition-all ${step <= currentStep ? 'bg-brand-orange' : 'bg-brand-mid'}`} />
          ))}
        </div>
        <p className="text-xs text-ink-soft">
          Stap {currentStep} van 4 — <span className="text-white">{STEP_LABELS[screen]}</span>
        </p>
      </div>

      {(customerName || siteName || deviceName) && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs flex-wrap bg-stroke">
          {customerName && <span className="font-medium text-ink">{customerName}</span>}
          {siteName && <><span className="text-ink-faint">›</span><span className="font-medium text-ink">{siteName}</span></>}
          {deviceName && <><span className="text-ink-faint">›</span><span className="font-medium text-ink">{deviceName}</span></>}
        </div>
      )}

      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {screen === 'customer' && (
          <>
            <input
              className={inputClass}
              placeholder="Zoek op naam of klantnummer"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {showNew
              ? <NewCustomerForm onSubmit={draft => pickCustomer({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
              : (
                <>
                  {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                  <CustomerSelect customers={customers} onSelect={c => pickCustomer({ kind: 'existing', value: c })} />
                  <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-orange text-brand-orange bg-white">
                    + Nieuwe klant
                  </button>
                </>
              )}
          </>
        )}

        {screen === 'site' && customer?.kind === 'existing' && (
          showNew
            ? <NewSiteForm defaultName={customer.value.name} onSubmit={draft => pickSite({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
            : (
              <>
                {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                <SiteSelect customer={customer.value} sites={sites} onSelect={s => pickSite({ kind: 'existing', value: s as SiteWithContacts })} />
                <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-blue text-brand-blue bg-white">
                  + Nieuwe locatie
                </button>
              </>
            )
        )}

        {screen === 'device' && (
          showNew
            ? <NewDeviceForm onSubmit={draft => pickDevice({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
            : (
              <>
                {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                {site?.kind === 'existing' && (
                  <DeviceSelect site={site.value} devices={devices} onSelect={d => pickDevice({ kind: 'existing', value: d })} />
                )}
                <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-green text-brand-green bg-white">
                  + Nieuw toestel
                </button>
                <button type="button" onClick={() => pickDevice('none')} className="w-full py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">
                  Geen toestel gekend
                </button>
              </>
            )
        )}

        {screen === 'ticket' && (
          <TicketForm submitting={submitting} serverError={serverError} onSubmit={submit} />
        )}
      </main>
    </div>
  )
}
