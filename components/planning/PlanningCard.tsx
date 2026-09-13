/**
 * PlanningCard — de dag en het uur van één werkbon, op de bon zelf.
 *
 * Tot nu toe kon een bon alleen een dag krijgen door hem te verslepen in de
 * planning. Dat werkt voor "morgen ergens", maar niet voor wat er aan de
 * telefoon gebeurt: "de klant kan enkel donderdag over veertien dagen, om twee
 * uur". Dat is een datum en een uur, geen kolom om naartoe te mikken.
 *
 * Schrijft via `update_placement` — één bon, één uitspraak — en niet via een
 * momentopname van een dag, want deze pagina kent de andere bonnen van die dag
 * niet. Zie updatePlacement voor waarom dat onderscheid bestaat.
 *
 * De botsing wordt hier niet opnieuw bedacht: de dag wordt opgehaald en door
 * dezelfde `computeDaySchedule` gehaald als het rooster, zodat er één waarheid
 * is over wat kan en wat niet.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { computeDaySchedule, type TravelLookup } from '@/lib/planning/daySchedule'
import { conflictMessage, sanitizeStartMinutes } from '@/lib/planning/pinnedHour'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { resolveLeg, sharedTravelCache } from '@/lib/routing/travelCache'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { canLeaveTheDay } from '@/lib/planning/dropIntent'
import { enqueuePendingWrite, upsertIntervention } from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import type { Intervention } from '@/types'

const lookupTravel: TravelLookup = (from, to) => {
  const leg = resolveLeg(sharedTravelCache, from, to)
  return leg.provider === 'unknown' ? null : leg.minutes
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`
}

/** De kalenderdag van een opgeslagen moment, in lokale tijd. */
function toDateInput(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(dateStr: string): string {
  // Kort: "do 10 sep". De lange vorm kostte een halve regel in een kaart die
  // juist kleiner moest.
  return new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${dateStr}T12:00:00`))
}

export function PlanningCard({ intervention }: { intervention: Intervention }) {
  const { settings } = useSettings()
  const { currentUser } = useTasks()

  const [date, setDate] = useState(() => toDateInput(intervention.plannedDate))
  const [minutes, setMinutes] = useState<number | null>(intervention.plannedStartMinutes ?? null)
  const [appointment, setAppointment] = useState(Boolean(intervention.startIsAppointment))
  const [day, setDay] = useState<Intervention[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = !canLeaveTheDay(intervention.status)

  // "Er wordt aan gewerkt" klopt niet voor een bon van vorig jaar. Het slot is
  // hetzelfde, de reden niet.
  const lockReason =
    intervention.status === 'afgewerkt' ? 'Afgewerkt'
      : intervention.status === 'geannuleerd' ? 'Geannuleerd'
        : intervention.status === 'wacht_onderdelen' ? 'Wacht op onderdelen'
          : 'Bezig'

  // De dag ophalen om de botsing te kunnen tonen. Alleen lezen; wat hier
  // geschreven wordt, gaat door de wachtrij.
  useEffect(() => {
    if (!date || locked) { setDay([]); return }
    let cancelled = false

    async function load() {
      try {
        const technicianId = intervention.technicians.find(t => t.isLead)?.technicianId ?? currentUser.id
        const res = await fetch(`/api/sync/today?technicianId=${technicianId}&date=${date}`)
        if (!res.ok) return
        const data = await res.json() as { planned: Intervention[] }
        if (!cancelled) setDay(data.planned)
      } catch {
        // Offline is geen fout: dan tonen we de botsing gewoon niet.
      }
    }

    void load()
    return () => { cancelled = true }
  }, [date, locked, intervention.technicians, currentUser.id])

  /**
   * Wat deze bon zou doen op die dag, met dit uur.
   *
   * De bon zelf vervangt zijn eigen versie in de opgehaalde dag — anders
   * rekenen we met het uur dat de server nog kent in plaats van met het uur dat
   * hier ingevuld staat.
   */
  const schedule = useMemo(() => {
    if (!date) return null

    const withThis = day.some(i => i.id === intervention.id)
      ? day.map(i => (i.id === intervention.id
          ? { ...i, plannedStartMinutes: minutes ?? undefined }
          : i))
      : [...day, { ...intervention, plannedStartMinutes: minutes ?? undefined }]

    return computeDaySchedule({
      departureMinutes: clockToMinutes(settings.startTime),
      origin: getStartCoordinatesFromSettings(settings),
      jobs: withThis.map(i => ({
        id: i.id,
        estimatedMinutes: i.estimatedMinutes,
        at: typeof i.siteLat === 'number' && typeof i.siteLon === 'number'
          ? { lat: i.siteLat, lon: i.siteLon }
          : undefined,
        startMinutes: i.plannedStartMinutes ?? null,
      })),
      travelBetween: lookupTravel,
      breakMinutes: UNPAID_BREAK_MINUTES,
    })
  }, [date, day, intervention, minutes, settings])

  const mine = schedule?.blocks.find(b => b.kind === 'job' && b.interventionId === intervention.id)
  const clash = schedule?.conflicts.find(c => c.interventionId === intervention.id)

  async function save(next: { date: string; minutes: number | null; appointment: boolean }) {
    setSaving(true)
    setError(null)

    try {
      await upsertIntervention({
        ...intervention,
        plannedDate: next.date ? `${next.date}T00:00:00.000Z` : undefined,
        plannedStartMinutes: next.minutes ?? undefined,
        startIsAppointment: next.minutes === null ? false : next.appointment,
      })
      await enqueuePendingWrite({
        type: 'update_placement',
        createdAt: new Date().toISOString(),
        payload: {
          workOrderId: intervention.id,
          date: next.date || null,
          startMinutes: next.minutes,
          appointment: next.appointment,
          actorId: currentUser.id,
          actorRole: currentUser.role,
        },
      })
      if (typeof navigator === 'undefined' || navigator.onLine) {
        await syncPendingWrites().catch(() => {})
      }
    } catch {
      setError('Bewaren is niet gelukt. Probeer het opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  function changeDate(value: string) {
    // Een uur hoort bij een dag: negen uur op dinsdag is niet negen uur op
    // woensdag, want de rit ernaartoe vertrekt van een andere plaats. Dezelfde
    // regel als bij het slepen.
    setDate(value)
    setMinutes(null)
    setAppointment(false)
    void save({ date: value, minutes: null, appointment: false })
  }

  function changeHour(value: string) {
    const parsed = value ? sanitizeStartMinutes(Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))) : null
    setMinutes(parsed)
    void save({ date, minutes: parsed, appointment: parsed === null ? false : appointment })
  }

  function toggleAppointment() {
    const next = !appointment
    setAppointment(next)
    void save({ date, minutes, appointment: next })
  }

  return (
    <section className="mb-3 rounded-xl border border-stroke bg-white px-3 py-2">
      {/*
        Eén rij: dag, uur, vinkje — meer staat er niet, en er staat ook geen
        opschrift boven. De regel eronder noemt de dag al, dus het opschrift
        kostte alleen breedte. Die breedte is krap: een telefoon die in
        12-uursnotatie staat maakt het uurveld een stuk breder, en dan moet de
        rij nog altijd passen.

        Ook een vergrendelde bon krijgt deze rij, alleen uitgeschakeld. Ze
        helemaal weglaten gaf elke afgewerkte bon een ander vak dan de rest,
        en dan moet je twee keer leren waar de dag staat.

        Het vinkje staat er altijd, ook zonder uur — dan uitgeschakeld.
        Verschijnen en verdwijnen zou de rij van breedte doen wisselen terwijl
        je hem invult.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`planning-date-${intervention.id}`}
          type="date"
          aria-label="Geplande dag"
          disabled={locked}
          value={date}
          onChange={event => changeDate(event.target.value)}
          className="h-9 rounded-md border border-stroke px-1.5 text-xs tabular-nums text-ink disabled:opacity-50"
        />

        {/* Geen vaste breedte: hoe breed een uurveld moet zijn hangt af van de
            taalinstelling van de telefoon — 24 uur is smaller dan 12 uur met
            AM/PM. Een maat die hier past, knipt daar het uur af. */}
        <input
          id={`planning-hour-${intervention.id}`}
          type="time"
          step={900}
          aria-label="Geplande uur"
          disabled={locked || !date}
          value={minutes === null ? '' : hhmm(minutes)}
          onChange={event => changeHour(event.target.value)}
          className="h-9 rounded-md border border-stroke px-1.5 text-xs tabular-nums text-ink disabled:opacity-50"
        />

        <label
          className={[
            'flex h-9 items-center gap-1.5 pr-1 text-xs',
            locked || minutes === null ? 'text-ink-faint' : 'text-ink-soft',
          ].join(' ')}
        >
          <input
            type="checkbox"
            checked={appointment}
            disabled={locked || minutes === null}
            onChange={toggleAppointment}
            aria-label="Vast uur afgesproken met de klant"
            className="h-5 w-5 accent-brand-red disabled:opacity-50"
          />
          vast
        </label>

        {saving && <span className="text-[10px] text-ink-faint">bewaren…</span>}
      </div>

      {locked ? (
        <p className="mt-1.5 text-[11px] text-ink-soft">
          <span className="font-semibold text-ink">{lockReason}</span>
          {' '}— dag en uur liggen vast.
        </p>
      ) : date && clash ? (
        // De enige plek waar de kaart groeit. Een botsing is het moment waarop
        // de woorden hun ruimte verdienen: zonder de drie uitwegen weet je wel
        // dát het niet kan, maar niet wat je eraan doet.
        <p className="mt-1.5 rounded-md border-l-4 border-brand-red bg-brand-red/10 px-2 py-1.5 text-[11px] text-ink">
          {conflictMessage(intervention.customerName)}
          <span className="mt-0.5 block tabular-nums text-ink-soft">
            Ten vroegste {hhmm(clash.earliestMinutes)}
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-soft">
          {!date
            ? 'Nog geen dag — staat in de open pool.'
            : mine
              ? (
                <>
                  {dayLabel(date)}{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {hhmm(mine.startMinutes)}–{hhmm(mine.endMinutes)}
                  </span>
                  {' '}{minutes === null ? 'berekend' : appointment ? 'afgesproken' : 'gekozen'}
                </>
              )
              : dayLabel(date)}
        </p>
      )}

      {error && <p className="mt-1 text-[11px] text-brand-red">{error}</p>}
    </section>
  )
}
