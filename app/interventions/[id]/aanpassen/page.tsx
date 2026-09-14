/**
 * Een bon rechtzetten.
 *
 * De bon van Villa Lorraine kwam binnen zonder klantnaam — die stond niet op
 * het papier. Wie ter plaatse staat en dat ziet, moet het dáár kunnen
 * verbeteren; hem naar een ander scherm sturen betekent dat het niet gebeurt.
 *
 * De velden staan gegroepeerd naar **wat een wijziging raakt**, en dat is het
 * hele punt van dit scherm. Het ticketnummer hoort bij deze bon. De naam, het
 * adres en het telefoonnummer horen bij de klant en de vestiging, en die deelt
 * hij met elke andere bon van datzelfde huis. Dat is meestal precies wat je
 * wil, maar je hoort het te weten vóór je tikt — vandaar het merkje met het
 * aantal bonnen erop.
 *
 * Een eigen pagina en geen venster bovenop: op een telefoon werkt de terugknop
 * dan gewoon, en een half ingevuld formulier gaat niet verloren achter een tik
 * naast het venster.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTasks } from '@/lib/task-store'

interface Details {
  ticketNumber: string
  description: string
  isUrgent: boolean
  alertNote: string
  customerName: string
  customerNumber: string
  address: string
  city: string
  phone: string
  sharedWithCustomer: number
  sharedWithSite: number
  editable: boolean
}

const INVOER = 'w-full rounded-lg border border-stroke bg-surface px-2.5 py-2 text-sm text-ink'

/** Het merkje dat zegt hoe ver een wijziging reikt. */
function Bereik({ aantal }: { aantal: number }) {
  // Bij één bon is er niets gedeeld: dan is "geldt voor 1 bon" ruis die de
  // aandacht wegneemt van de gevallen waar het wél telt.
  if (aantal < 2) {
    return (
      <span className="rounded-full border border-stroke px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-ink-soft">
        alleen deze bon
      </span>
    )
  }

  return (
    <span className="rounded-full border border-brand-blue/45 bg-brand-blue/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-blue">
      geldt voor {aantal} bonnen
    </span>
  )
}

function Groep({
  titel,
  aantal,
  children,
}: {
  titel: string
  aantal: number
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{titel}</h2>
        <Bereik aantal={aantal} />
      </div>
      {children}
    </section>
  )
}

function Veld({
  label,
  children,
  hint,
  waarschuwing,
}: {
  label: string
  children: React.ReactNode
  hint?: string
  waarschuwing?: string
}) {
  return (
    <label className="mb-2.5 block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-soft">{hint}</span>}
      {waarschuwing && <span className="mt-1 block text-[11px] text-brand-blue">{waarschuwing}</span>}
    </label>
  )
}

export default function BonAanpassenPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { currentUser } = useTasks()

  const [details, setDetails] = useState<Details | null>(null)
  const [vorige, setVorige] = useState<Details | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/work-orders/${id}/details`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: Details | null) => {
        if (cancelled || !data) { if (!cancelled) setFout('Gegevens konden niet geladen worden'); return }
        setDetails(data)
        setVorige(data)
      })
      .catch(() => { if (!cancelled) setFout('Gegevens konden niet geladen worden') })
    return () => { cancelled = true }
  }, [id])

  const zet = useCallback(<K extends keyof Details>(sleutel: K, waarde: Details[K]) => {
    setDetails(huidig => (huidig ? { ...huidig, [sleutel]: waarde } : huidig))
  }, [])

  /** Of dit veld sinds het openen gewijzigd is — dan pas waarschuwen we. */
  const gewijzigd = (sleutel: keyof Details) =>
    Boolean(details && vorige && details[sleutel] !== vorige[sleutel])

  async function bewaren() {
    if (!details) return
    setBezig(true)
    setFout(null)

    try {
      const res = await fetch(`/api/work-orders/${id}/details`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticket_number: details.ticketNumber,
          description: details.description,
          is_urgent: details.isUrgent,
          alert_note: details.alertNote,
          customer_name: details.customerName,
          customer_number: details.customerNumber,
          address: details.address,
          city: details.city,
          phone: details.phone,
          changed_by: currentUser?.id,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        setFout(json.error ?? 'Opslaan is niet gelukt')
        return
      }

      router.push(`/interventions/${id}`)
    } catch {
      setFout('Opslaan is niet gelukt — controleer je verbinding')
    } finally {
      setBezig(false)
    }
  }

  if (fout && !details) {
    return (
      <main className="min-h-screen bg-surface p-4">
        <p className="rounded-xl border border-brand-red bg-brand-red/10 px-3 py-3 text-sm font-semibold text-brand-red">
          {fout}
        </p>
      </main>
    )
  }

  if (!details) {
    return <main className="min-h-screen bg-surface p-4"><p className="text-sm text-ink-soft">Laden…</p></main>
  }

  if (!details.editable) {
    return (
      <main className="min-h-screen bg-surface p-4">
        <p className="rounded-xl border border-stroke bg-white px-3 py-3 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Aan deze bon wordt al gewerkt.</span>{' '}
          De gegevens liggen vast zolang hij loopt.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface pb-28">
      <header className="flex items-center gap-2 bg-brand-dark px-4 py-3">
        <div className="h-4 w-1 shrink-0 rounded-full bg-brand-orange" />
        <p className="text-sm font-bold tracking-wide text-white">BON AANPASSEN</p>
      </header>

      <div className="p-4">
        <Groep titel="Deze bon" aantal={1}>
          <Veld label="Ticket n°">
            <input
              className={INVOER}
              value={details.ticketNumber}
              onChange={e => zet('ticketNumber', e.target.value)}
            />
          </Veld>
          <Veld label="Omschrijving">
            <textarea
              className={`${INVOER} min-h-20`}
              value={details.description}
              onChange={e => zet('description', e.target.value)}
            />
          </Veld>
          <Veld label="Melding" hint="Verschijnt als rood uitroepteken in de lijst.">
            <input
              className={INVOER}
              value={details.alertNote}
              onChange={e => zet('alertNote', e.target.value)}
            />
          </Veld>
          <label className="mb-2.5 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={details.isUrgent}
              onChange={e => zet('isUrgent', e.target.checked)}
              className="h-5 w-5 accent-brand-red"
            />
            Dringend
          </label>
        </Groep>

        <Groep titel="Klant" aantal={details.sharedWithCustomer}>
          <Veld
            label="Naam"
            hint={!details.customerName.trim() ? 'Stond niet op de bon. Vul in wat je ter plaatse ziet.' : undefined}
            waarschuwing={
              gewijzigd('customerName') && details.sharedWithCustomer > 1
                ? `Verandert ook op de ${details.sharedWithCustomer - 1} andere bon${details.sharedWithCustomer > 2 ? 'nen' : ''} van deze klant.`
                : undefined
            }
          >
            <input
              className={`${INVOER} ${!details.customerName.trim() ? 'border-brand-red' : ''}`}
              value={details.customerName}
              placeholder="stond niet op de bon"
              onChange={e => zet('customerName', e.target.value)}
            />
          </Veld>
          <Veld label="Klant n°">
            <input
              className={INVOER}
              value={details.customerNumber}
              onChange={e => zet('customerNumber', e.target.value)}
            />
          </Veld>
        </Groep>

        <Groep titel="Vestiging" aantal={details.sharedWithSite}>
          <Veld
            label="Adres"
            waarschuwing={
              gewijzigd('address') && details.sharedWithSite > 1
                ? 'Verandert ook voor de andere bonnen op dit adres.'
                : undefined
            }
          >
            <input
              className={INVOER}
              value={details.address}
              onChange={e => zet('address', e.target.value)}
            />
          </Veld>
          <Veld label="Gemeente">
            <input className={INVOER} value={details.city} onChange={e => zet('city', e.target.value)} />
          </Veld>
          <Veld label="Telefoon">
            <input className={INVOER} value={details.phone} onChange={e => zet('phone', e.target.value)} />
          </Veld>
        </Groep>

        {fout && (
          <p className="mb-3 rounded-xl border border-brand-red bg-brand-red/10 px-3 py-3 text-sm font-semibold text-brand-red">
            {fout}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[60] flex gap-2 border-t border-stroke bg-white p-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-xl border border-stroke py-3 text-sm font-bold text-ink-soft"
        >
          Laat staan
        </button>
        <button
          type="button"
          onClick={bewaren}
          disabled={bezig}
          className="flex-1 rounded-xl bg-brand-orange py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {bezig ? 'Bewaren…' : 'Bewaren'}
        </button>
      </div>
    </main>
  )
}
