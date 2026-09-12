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
import { CSS } from '@dnd-kit/utilities'
import type { DayScheduleResult, ScheduleBlock } from '@/lib/planning/daySchedule'
import { scheduleForDate, clockToMinutes } from '@/lib/planning/workSchedule'
import { formatHours, typeBorderClass } from '@/components/planning/interventionLabels'
import type { Intervention } from '@/types'

export const VIEW_START_MINUTES = 6 * 60 + 30
export const VIEW_END_MINUTES = 18 * 60

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
  renderDayColumn,
}: {
  days: Date[]
  schedules: DayScheduleResult[]
  interventionsById: Record<string, Intervention>
  pixelsPerHour: number
  selectedDate: Date
  onOpenIntervention: (id: string) => void
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
            className="sticky left-0 z-10 relative border-r border-stroke bg-white"
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
  day, schedule, interventionsById, toPx, totalPx, hours, onOpenIntervention,
}: {
  day: Date
  schedule: DayScheduleResult
  interventionsById: Record<string, Intervention>
  toPx: (minutes: number) => number
  totalPx: number
  hours: number[]
  onOpenIntervention: (id: string) => void
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
  block, intervention, top, height, clippedTop, clippedBottom, onOpen,
}: {
  block: ScheduleBlock
  intervention?: Intervention
  top: number
  height: number
  clippedTop: boolean
  clippedBottom: boolean
  onOpen: (id: string) => void
}) {
  const isJob = block.kind === 'job' && Boolean(intervention)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.interventionId ?? block.id,
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

  // Op 62 px is er geen ruimte voor een aparte handle naast de kaart, zoals de
  // dagweergave die heeft. Het blok is hier zelf de handle: touch-none maakt
  // dat een sleepbeweging niet ook de pagina scrollt, en de 250 ms vertraging
  // van de TouchSensor is wat een tik (openen) onderscheidt van slepen.
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onOpen(intervention.id)}
      className={[
        'absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-white shadow-sm active:opacity-80 touch-none',
        typeBorderClass(intervention.type, intervention.isUrgent),
        clipEdgeClasses(clippedTop, clippedBottom, 'dark'),
      ].join(' ')}
      style={{
        top,
        height,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      title={`${hhmm(block.startMinutes)}–${hhmm(block.endMinutes)} · ${intervention.customerName}, ${intervention.siteCity}`}
    >
      <span className="block text-[9px] font-bold leading-tight tabular-nums">
        {hhmm(block.startMinutes)}
      </span>
      {height >= 24 && (
        <span className="block truncate text-[9.5px] font-semibold leading-tight">
          {intervention.customerName}
        </span>
      )}
    </button>
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
}
