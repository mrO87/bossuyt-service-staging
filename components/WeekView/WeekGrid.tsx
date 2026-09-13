/**
 * WeekGrid — zeven dagkolommen met de tijd verticaal.
 *
 * Tekent alleen wat computeDaySchedule teruggeeft. Op 62 px past geen
 * klantnaam, dus de kleur draagt het overzicht en een tik draagt het detail.
 * Dat is de afweging die indeling A maakt: de hele week in beeld in ruil voor
 * blokken die je moet aantikken.
 */
'use client'

import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { draggableIdFor, type DayScheduleResult, type ScheduleBlock } from '@/lib/planning/daySchedule'
import { scheduleForDate, clockToMinutes } from '@/lib/planning/workSchedule'
import { formatHours, typeBorderClass } from '@/components/planning/interventionLabels'
import type { Intervention } from '@/types'
import { customerLabel } from '@/lib/customerLabel'

export const VIEW_START_MINUTES = 6 * 60 + 30
export const VIEW_END_MINUTES = 18 * 60

/**
 * Waaraan de sleepmotor een uitrekbeweging herkent.
 *
 * Verslepen en uitrekken vertrekken van hetzelfde blok en eindigen allebei in
 * `handleDragEnd`; het id is het enige wat ze onderscheidt. Hier gezet en niet
 * in WeekView, omdat het blok het id maakt en de weekweergave het leest — één
 * naam op één plaats.
 */
export const RESIZE_PREFIX = 'resize:'

const DOW = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function WeekGrid({
  days,
  schedules,
  interventionsById,
  pixelsPerHour,
  selectedDate,
  onOpenIntervention,
  onTogglePin,
  onClearHour,
  renderDayColumn,
}: {
  days: Date[]
  schedules: DayScheduleResult[]
  interventionsById: Record<string, Intervention>
  pixelsPerHour: number
  selectedDate: Date
  onOpenIntervention: (id: string) => void
  /** Het speldje: of dit uur een afspraak is. Zegt niets over hoe hij sleept. */
  onTogglePin: (id: string) => void
  /** Het uur weghalen, zodat het weer berekend wordt zoals bij elke andere bon. */
  onClearHour: (id: string) => void
  /** Laat Task 3 een droppable om elke kolom hangen zonder dit bestand te wijzigen. */
  renderDayColumn?: (day: Date, index: number, column: ReactNode) => ReactNode
}) {
  const toPx = (minutes: number) => ((minutes - VIEW_START_MINUTES) * pixelsPerHour) / 60
  const totalPx = ((VIEW_END_MINUTES - VIEW_START_MINUTES) * pixelsPerHour) / 60

  const hours: number[] = []
  for (let m = Math.ceil(VIEW_START_MINUTES / 60) * 60; m <= VIEW_END_MINUTES; m += 60) hours.push(m)

  return (
    <div className="rounded-xl border border-stroke bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: `34px repeat(${days.length}, 62px)` }}
        >
          <div className="sticky left-0 top-0 z-30 bg-white border-b border-stroke px-1 py-1.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">uur</span>
          </div>

          {days.map((day, index) => {
            const rest = scheduleForDate(day) === null
            return (
              <div
                key={toKey(day)}
                className={[
                  'sticky top-0 z-20 border-b border-stroke bg-white px-1 py-1.5 text-center',
                  rest ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  {DOW[day.getDay()]}
                </div>
                <div
                  className={[
                    'text-sm font-bold tabular-nums',
                    isSameDay(day, selectedDate) ? 'text-brand-orange' : 'text-ink',
                  ].join(' ')}
                >
                  {day.getDate()}
                </div>
                <div className="text-[9px] tabular-nums text-ink-faint">
                  {schedules[index].workMinutes + schedules[index].travelMinutes > 0
                    ? formatHours(schedules[index].workMinutes + schedules[index].travelMinutes)
                    : '—'}
                </div>
              </div>
            )
          })}

          <div
            className="sticky left-0 z-10 border-r border-stroke bg-white"
            style={{ height: totalPx }}
          >
            {hours.map(m => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[9px] tabular-nums text-ink-faint"
                style={{ top: toPx(m) }}
              >
                {hhmm(m)}
              </span>
            ))}
          </div>

          {days.map((day, index) => {
            const column = (
              <DayColumn
                day={day}
                schedule={schedules[index]}
                interventionsById={interventionsById}
                toPx={toPx}
                totalPx={totalPx}
                hours={hours}
                onOpenIntervention={onOpenIntervention}
                onTogglePin={onTogglePin}
                onClearHour={onClearHour}
              />
            )
            return (
              <div key={toKey(day)}>
                {renderDayColumn ? renderDayColumn(day, index, column) : column}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day, schedule, interventionsById, toPx, totalPx, hours,
  onOpenIntervention, onTogglePin, onClearHour,
}: {
  day: Date
  schedule: DayScheduleResult
  interventionsById: Record<string, Intervention>
  toPx: (minutes: number) => number
  totalPx: number
  hours: number[]
  onOpenIntervention: (id: string) => void
  onTogglePin: (id: string) => void
  onClearHour: (id: string) => void
}) {
  const roster = scheduleForDate(day)

  return (
    <div
      className={['relative border-r border-stroke/60', roster ? '' : 'bg-surface'].join(' ')}
      style={{ height: totalPx }}
    >
      {hours.map(m => (
        <div key={m} className="absolute left-0 right-0 h-px bg-stroke/60" style={{ top: toPx(m) }} />
      ))}

      {roster && (
        <>
          <div
            className="absolute left-0 right-0 bg-surface"
            style={{ top: 0, height: Math.max(0, toPx(clockToMinutes(roster.start))) }}
          />
          <div
            className="absolute left-0 right-0 bg-surface"
            style={{
              top: toPx(clockToMinutes(roster.end)),
              height: Math.max(0, totalPx - toPx(clockToMinutes(roster.end))),
            }}
          />
        </>
      )}

      {schedule.blocks.map(block => {
        const rawTop = toPx(block.startMinutes)
        const rawBottom = toPx(block.endMinutes)
        const { top, height } = clampBlockGeometry(rawTop, rawBottom, totalPx)

        return (
          <Block
            key={block.id}
            block={block}
            intervention={block.interventionId ? interventionsById[block.interventionId] : undefined}
            top={top}
            height={height}
            clippedTop={rawTop < 0}
            clippedBottom={rawBottom > totalPx}
            onOpen={onOpenIntervention}
            onTogglePin={onTogglePin}
            onClearHour={onClearHour}
          />
        )
      })}
    </div>
  )
}

/** Onder deze hoogte is er niets meer om aan te tikken. */
const MIN_BLOCK_HEIGHT = 9

/**
 * Legt de tekenpositie van een blok binnen het venster [0, totalPx].
 *
 * Een dag die vóór 06:30 vertrekt of na 18:00 doorloopt (Task 1 laat dat toe —
 * overuren worden getekend, niet geweigerd) zou zonder deze correctie buiten de
 * kolom vallen en door de overflow-hidden buitenrand onzichtbaar en
 * onaantikbaar worden.
 *
 * Eerst wordt het blok geknipt tot wat er binnen het venster zichtbaar is, dan
 * krijgt dat een minimumhoogte. Die minimumhoogte schuift het blok vervolgens
 * terug het venster in — nooit tegen een vaste rand plakken, want een blok
 * dat net ná het venster begint (zichtbaar stuk kleiner dan de minimumhoogte,
 * maar niet volledig erbuiten) hoort dan nog steeds onderaan, niet bovenaan.
 * Eén regel dekt zo alle gevallen: volledig binnen, deels eraf, of volledig
 * erbuiten.
 */
function clampBlockGeometry(rawTop: number, rawBottom: number, totalPx: number): { top: number; height: number } {
  const visibleTop = Math.max(0, Math.min(rawTop, totalPx))
  const visibleBottom = Math.max(0, Math.min(Math.max(rawBottom, rawTop), totalPx))
  const height = Math.min(totalPx, Math.max(MIN_BLOCK_HEIGHT, visibleBottom - visibleTop))
  const top = Math.min(visibleTop, totalPx - height)

  return { top, height }
}

/**
 * Rand op de kant die buiten het venster valt — het enige teken dat een blok
 * doorloopt voorbij 06:30 of 18:00, want op 62 px is er geen ruimte voor
 * tekst. De echte uren staan al in de `title`; hier komt geen nieuwe tekst bij.
 */
function clipEdgeClasses(clippedTop: boolean, clippedBottom: boolean, tone: 'light' | 'dark'): string {
  const topClass = clippedTop
    ? (tone === 'dark' ? 'border-t-2 border-dashed border-t-white' : 'border-t-2 border-dashed border-t-ink')
    : ''
  const bottomClass = clippedBottom
    ? (tone === 'dark' ? 'border-b-2 border-dashed border-b-white' : 'border-b-2 border-dashed border-b-ink')
    : ''
  return [topClass, bottomClass].filter(Boolean).join(' ')
}

/**
 * Alleen een jobblok mag versleept worden — de ankers, de rijtijd en de pauze
 * zijn geen werkbon en hebben niets om naartoe te slepen. `useDraggable` moet
 * hier boven aan staan (React laat hooks niet overslaan), dus roep hem altijd
 * op en zet `disabled` voor de blokken die geen job zijn.
 */
function Block({
  block, intervention, top, height, clippedTop, clippedBottom, onOpen, onTogglePin, onClearHour,
}: {
  block: ScheduleBlock
  intervention?: Intervention
  top: number
  height: number
  clippedTop: boolean
  clippedBottom: boolean
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  onClearHour: (id: string) => void
}) {
  const isJob = block.kind === 'job' && Boolean(intervention)

  // Alleen een jobblok mag de werkbon-id claimen.
  //
  // Het arceringsblok draagt diezelfde `interventionId` — het ligt immers over
  // die bon heen — en registreerde zich daarmee als tweede sleepbaar ding onder
  // hetzelfde id. De laatste registratie wint bij dnd-kit, en dat was de
  // arcering: een blok dat meteen daarna `return` doet en `setNodeRef` dus
  // nooit ergens op zet. Gevolg: dnd-kit had geen element om op te meten,
  // vond geen enkele kolom onder de vinger, en een bon mét botsing liet zich
  // helemaal niet verslepen — precies de bon die je volgens de melding moet
  // verzetten. Gevonden door bij het loslaten te vragen wat dnd-kit in beeld
  // had: `activeRect: null`.
  const dragId = draggableIdFor(block)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !isJob,
  })

  // Het rekhandvat is een eigen sleepbaar ding, met een eigen id. Twee gebaren
  // op één blok die iets anders betekenen, moeten twee dingen zijn die de
  // sleepmotor uit elkaar kan houden — anders hangt het af van waar je toevallig
  // begon, en dat is precies het soort verschil dat een duim niet kan maken.
  const {
    attributes: resizeAttributes,
    listeners: resizeListeners,
    setNodeRef: setResizeRef,
    isDragging: isResizing,
  } = useDraggable({
    id: `${RESIZE_PREFIX}${dragId}`,
    disabled: !isJob,
  })

  if (block.kind === 'anchor') {
    return (
      <div
        className={[
          'absolute inset-x-0.5 rounded bg-brand-dark px-1 text-[8.5px] font-semibold text-white flex items-center',
          clipEdgeClasses(clippedTop, clippedBottom, 'dark'),
        ].join(' ')}
        style={{ top, height }}
      >
        {hhmm(block.endMinutes)}
      </div>
    )
  }

  if (block.kind === 'travel') {
    return (
      <div
        className={[
          'absolute inset-x-1.5 rounded-sm bg-stroke/70 flex items-center justify-center text-[8px] font-semibold text-ink-soft',
          clipEdgeClasses(clippedTop, clippedBottom, 'light'),
        ].join(' ')}
        style={{ top, height }}
        title={block.minutes === null ? 'Rijtijd onbekend — adres ontbreekt' : `Rijden ${block.minutes} min`}
      >
        {height >= 13 ? (block.minutes === null ? '?' : `${block.minutes}′`) : ''}
      </div>
    )
  }

  // De arcering ligt óver het blok heen en vangt geen aanraking: precies het
  // stuk dat niet kan, en verder niets. Er staat geen tekst in — op 62 px past
  // die niet — dus de woorden staan in de melding onder het rooster, en het
  // blok zelf draagt ze in zijn title en zijn aria-label.
  if (block.kind === 'clash') {
    return (
      <div
        role="presentation"
        className="pointer-events-none absolute inset-x-0.5 z-30 flex items-center justify-center overflow-hidden rounded-sm border border-brand-red"
        style={{
          top,
          height,
          background:
            'repeating-linear-gradient(135deg, rgb(214 69 69 / .55) 0 5px, rgb(214 69 69 / .16) 5px 10px)',
        }}
        title="Kan niet — deze werkbon staat vóór het moment waarop je er kunt zijn"
      >
        {/*
          Het label hoort op de arcering, niet in een tooltip: op een telefoon
          bestaat er geen tooltip, en dan draagt het rooster wel een rode vlek
          maar nergens een woord. Twee woorden van 8 px passen op 58 px; is de
          band te laag om ze te tonen, dan blijft de arcering zelf staan en
          zegt de melding onder het rooster wat er aan de hand is.
        */}
        {height >= 13 && (
          <span
            className="px-0.5 text-[8px] font-bold leading-none text-white"
            style={{ textShadow: '0 1px 2px rgb(0 0 0 / .7)' }}
          >
            kan niet
          </span>
        )}
      </div>
    )
  }

  if (block.kind === 'break') {
    return (
      <div
        className={[
          'absolute inset-x-0.5 rounded-sm bg-stroke flex items-center justify-center text-[8px] font-semibold text-ink-soft',
          clipEdgeClasses(clippedTop, clippedBottom, 'light'),
        ].join(' ')}
        style={{ top, height }}
        title="Middagpauze"
      >
        {height >= 13 ? 'pauze' : ''}
      </div>
    )
  }

  if (!intervention) return null

  // Een apart handvat, net als in de dagweergave — en om dezelfde reden.
  //
  // Dit stond eerst anders: het hele blok was de handle en `touch-none` ging
  // pas aan zodra het slepen bevestigd was, om de pagina scrollbaar te houden.
  // Op een echte telefoon werkt dat niet. De browser beslist bij de eerste
  // aanraking wat een gebaar wordt; is `touch-action` dan nog `auto`, dan
  // claimt hij het gebaar om te scrollen of te zoomen en breekt hij de sleep
  // af voordat de 250 ms van de TouchSensor voorbij zijn. Tekstselectie en de
  // callout deden de rest.
  //
  // Het handvat lost beide kanten op: het strookje staat permanent op
  // `touch-none`, dus daar weet de browser het meteen, en de rest van het blok
  // blijft gewoon aantikbaar én scrollbaar.
  const noSelect = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as const

  // Twee dingen die los van elkaar staan, en dat moeten blijven. `pinned` zegt
  // dat dit uur bewaard is — iemand heeft de bon hier neergezet. `isAppointment`
  // zegt dat dat uur met de klant afgesproken is.
  //
  // Het verschil is niet wat de app ermee doet, maar wat de volgende persoon
  // die naar deze planning kijkt moet weten. Een groen uur mag je verzetten als
  // het beter uitkomt; een rood uur heeft iemand beloofd. Slepen gedraagt zich
  // in beide gevallen hetzelfde, en dat hoort ook zo: de app beslist niet welke
  // afspraken er gemaakt worden.
  const pinned = typeof intervention.plannedStartMinutes === 'number'
  const isAppointment = pinned && Boolean(intervention.startIsAppointment)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={[
        'absolute inset-x-0.5 flex select-none overflow-hidden rounded text-white shadow-sm',
        typeBorderClass(intervention.type, intervention.isUrgent),
        // Een afspraak draagt hem zichtbaar: rode rand met een stippellijn
        // bovenaan, op het uur waarop hij vastligt.
        isAppointment ? 'outline outline-2 -outline-offset-2 outline-brand-red border-t-2 border-dashed border-t-brand-red' : '',
        clipEdgeClasses(clippedTop, clippedBottom, 'dark'),
      ].join(' ')}
      style={{
        top,
        height,
        // Alleen zijwaarts meebewegen met de vinger, nooit verticaal.
        //
        // De weekweergave rekent tijdens het slepen de hele dag mee, dus dit
        // blok staat hier al getekend op het uur waar de vinger het zet — op
        // het kwartier, zoals in het prototype. Daar nog eens de sleepafstand
        // bij optellen zou het twee keer zo ver laten bewegen als je hand.
        // Zijwaarts moet wél: dat is hoe je ziet naar welke dag je onderweg
        // bent, en de dagkolom is daar het doelwit.
        transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
        zIndex: isDragging || isResizing ? 20 : undefined,
        boxShadow: isDragging || isResizing ? '0 8px 20px -6px rgb(0 0 0 / .5)' : undefined,
        ...noSelect,
      }}
      title={`${hhmm(block.startMinutes)}–${hhmm(block.endMinutes)} · ${customerLabel(intervention.customerName)}, ${intervention.siteCity}`}
    >
      {/* Het handvat. Smal, maar over de volle hoogte, zodat een duim het raakt. */}
      <span
        {...listeners}
        aria-label={`${customerLabel(intervention.customerName)} verslepen`}
        className="flex w-3 shrink-0 touch-none cursor-grab items-center justify-center bg-black/25 active:cursor-grabbing"
        style={noSelect}
      >
        <span className="block h-4 w-0.5 rounded-full bg-white/70" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Het uurblokje, en tegelijk de knop die er een afspraak van maakt.
          Het staat op élk blok, ook bij een berekend uur — dat is wat het
          bruikbaar maakt: je leest het uur zonder je af te vragen of er wel een
          uur is. Groen: berekend, en het schuift mee als er iets vóór deze bon
          verandert. Rood: met de klant afgesproken.

          Het speldje was eerst een aparte knop van 16 px ernaast. Nagemeten op
          een echt scherm: dan blijft er van 62 px zo'n 21 px over voor de tekst,
          en "08:39" past daar niet in — het uur liep over het speldje heen en
          werd daarna afgekapt tot "0...". Het uur en zijn kleur zijn toch
          hetzelfde ding, dus is het uur nu zelf de knop. Dat leest ook directer:
          je tikt op het bolletje dat van kleur verandert.
        */}
        <button
          type="button"
          onClick={() => onTogglePin(intervention.id)}
          aria-pressed={isAppointment}
          aria-label={
            isAppointment
              ? `Afspraak weghalen bij ${intervention.customerName}`
              : `Uur van ${intervention.customerName} als afspraak markeren`
          }
          title={
            isAppointment
              ? `Afgesproken met de klant — ${hhmm(block.startMinutes)}`
              : `Markeren als afspraak — ${hhmm(block.startMinutes)}`
          }
          className={[
            'mx-0.5 mt-0.5 block truncate rounded-sm px-0.5 text-left text-[8.5px] font-bold leading-tight tabular-nums active:opacity-80',
            isAppointment ? 'bg-brand-red' : 'bg-brand-green/90',
          ].join(' ')}
          style={noSelect}
        >
          {hhmm(block.startMinutes)}
        </button>

        <button
          type="button"
          onClick={() => onOpen(intervention.id)}
          className="min-w-0 flex-1 px-1 text-left active:opacity-80"
          style={noSelect}
        >
          {height >= 26 && (
            <span className="block truncate text-[9.5px] font-semibold leading-tight">
              {customerLabel(intervention.customerName)}
            </span>
          )}
        </button>
      </div>

      {/*
        Het uur weghalen, zodat het weer berekend wordt. Een van de drie uitwegen
        uit een botsing, en de enige die anders nergens te vinden was: een bon
        die eenmaal ergens neergezet is, blijft daar tot iemand dat terugdraait.
        Alleen op bonnen die echt een bewaard uur dragen — op de andere valt er
        niets weg te halen. Rechtsboven, want de onderrand is het rekhandvat.
      */}
      {pinned && height >= 22 && (
        <button
          type="button"
          onClick={() => onClearHour(intervention.id)}
          aria-label={`Uur van ${intervention.customerName} weer laten berekenen`}
          title="Uur weghalen — weer berekenen"
          className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/35 text-[10px] leading-none text-white/80"
          style={noSelect}
        >
          ×
        </button>
      )}

      {/*
        Uitrekken. De onderrand van het blok — dezelfde plaats als in het
        prototype, en om dezelfde reden: het is de rand die je verplaatst, dus
        daar hoort het gebaar te beginnen.

        Dit wijzigt `estimatedMinutes`, hetzelfde veld als de duur op de kaart.
        Er komt dus niets bij in het model: de schatting was al aanpasbaar, dit
        is een tweede manier om hem aan te raken — met je vinger op het rooster
        in plaats van door een getal te typen.
      */}
      {height >= 24 && (
        <span
          ref={setResizeRef}
          {...resizeListeners}
          {...resizeAttributes}
          aria-label={`Duur van ${intervention.customerName} aanpassen`}
          className="absolute bottom-0 left-3 right-0.5 flex h-3 touch-none cursor-ns-resize items-end justify-center pb-0.5"
          style={noSelect}
        >
          <span className="block h-0.5 w-5 rounded-full bg-white/65" />
        </span>
      )}
    </div>
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
}
