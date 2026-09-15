/**
 * JobTimelineCard — a sortable job on the timeline.
 *
 * Visually: small dot on the rail + rich job card to the right.
 * Draggable via its left handle only, so vertical scrolling stays free.
 */
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Intervention } from '@/types'
import { TimelineRail, RailLine } from './TimelineRail'
import AlertNoteBadge from '@/components/AlertNoteBadge'
import {
  formatClock,
  formatMinutes,
  statusClass,
  statusLabel,
  typeBorderClass,
  typeClass,
  typeLabel,
} from '@/components/planning/interventionLabels'
import { EstimateBadge } from '@/components/planning/EstimateBadge'
import { customerLabel } from '@/lib/customerLabel'
import { actualVisitSpan } from '@/lib/planning/visitSpan'

function Chip(
  { className, label, title }: { className: string; label: string; title?: string },
) {
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${className}`}
      title={title}
    >
      {label}
    </span>
  )
}

// ---------- component ----------

export function JobTimelineCard({
  id,
  intervention,
  startMinutes,
  onClick,
}: {
  id: string
  intervention: Intervention
  startMinutes?: number
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  /** Het bezoek zoals het werkelijk gelopen is, of null zolang dat niet vaststaat. */
  const gelopen = actualVisitSpan(intervention)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TimelineRail
        className="py-1"
        railContent={
          <>
            <RailLine variant="full" />
            {/* centered dot that sits on the rail line */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand-orange ring-4 ring-surface" />
          </>
        }
      >
        <div className="my-1 ml-3 flex rounded-xl overflow-hidden bg-white border border-stroke shadow-sm">
          {/* type / urgency color strip */}
          <div
            className={`w-1 shrink-0 ${typeBorderClass(
              intervention.type,
              intervention.isUrgent,
            )}`}
          />

          {/* drag handle — only this element blocks touch scrolling */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Sleep om te herschikken"
            className="w-8 shrink-0 flex items-center justify-center bg-stroke/50 active:bg-stroke cursor-grab touch-none"
          >
            <span className="text-ink-soft text-lg select-none">⋮⋮</span>
          </button>

          {/*
            Het klikbare deel van de kaart.

            `min-w-0` hoort erbij en stond er niet. Een flexitem krijgt van de
            browser `min-width: auto` en weigert dus smaller te worden dan zijn
            inhoud: bij "KAMERS VAN VOLKSVERTEGENWOORDIGERS" werd dit blok
            113 px breder dan de kaart, en omdat de kaart `overflow-hidden`
            draagt, werd alles wat erbuiten viel weggeknipt — de klantnaam
            halverwege, en het uur helemaal. Elke `truncate` en `min-w-0`
            dieper in de kaart was machteloos zolang dit blok zelf niet mocht
            krimpen.
          */}
          <div
            onClick={onClick}
            className="min-w-0 flex-1 p-3 cursor-pointer active:opacity-70"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0 flex items-start gap-2">
                {intervention.alertNote && <AlertNoteBadge note={intervention.alertNote} />}
                <div className="min-w-0">
                  {/*
                    `min-w-0` op de naam en `shrink-0` op het uur, en niet
                    andersom. Zonder dat mag de naam niet krimpen — dat is wat
                    een flexitem standaard doet — en duwt een lange klantnaam
                    het uur gewoon de kaart uit. "KAMERS VAN
                    VOLKSVERTEGENWOORDIGERS" liet zo geen enkel uur meer zien,
                    terwijl "Jan decan" er wel een had. Het uur is het enige op
                    deze kaart waar een technieker 's ochtends op vaart; dat
                    hoort niet als eerste te wijken.
                  */}
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 font-bold text-sm leading-tight text-ink truncate">
                      {customerLabel(intervention.customerName)}
                    </p>
                    {/*
                      Het uur, en of het vastligt.

                      Rood betekent hier hetzelfde als in de weekweergave: dit
                      uur is met de klant afgesproken. Oranje is het berekende
                      uur, dat meeschuift als er iets vóór deze bon verandert.
                      Zonder dit onderscheid stond in de dagplanning een uur dat
                      er precies hetzelfde uitzag of het nu een afspraak was of
                      een uitkomst — en de technieker die deze lijst 's ochtends
                      afloopt, is degene die het verschil moet kennen.
                    */}
                    {typeof startMinutes === 'number' && (
                      <p
                        className={[
                          'shrink-0 text-[11px] font-bold tabular-nums',
                          intervention.startIsAppointment
                            ? 'rounded bg-brand-red px-1 text-white'
                            : 'text-brand-orange',
                        ].join(' ')}
                        title={
                          intervention.startIsAppointment
                            ? 'Afgesproken met de klant'
                            : 'Berekend uur — schuift mee'
                        }
                      >
                        {formatClock(startMinutes)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft">{intervention.siteCity}</p>
                </div>
              </div>
              <div className="flex -space-x-2 ml-2 shrink-0">
                {intervention.technicians.map((tech, i) => (
                  <div
                    key={tech.technicianId}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white ${
                      i === 0 ? 'bg-brand-mid' : 'bg-gray-600'
                    }`}
                    title={tech.name}
                  >
                    <span className="text-white text-[11px] font-bold">
                      {tech.initials}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {intervention.deviceBrand && (
              <p className="text-xs font-medium mt-1 text-ink">
                {intervention.deviceBrand} {intervention.deviceModel}
              </p>
            )}

            {intervention.description && (
              <p className="text-xs mt-0.5 mb-2 text-ink-soft line-clamp-2">
                {intervention.description}
              </p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <Chip
                className={typeClass(intervention.type)}
                label={typeLabel(intervention.type)}
              />
              <Chip
                className={statusClass(intervention.status)}
                label={statusLabel(intervention.status)}
              />
              {/*
                Op een afgewerkte bon staat de tijd die het werkelijk kostte,
                en die is niet te bewerken. De raming is een voorspelling; zodra
                er een aankomst- en een vertrekuur op de bon staan, is er geen
                voorspelling meer nodig. Hier stond de raming ook ná afloop, dus
                las je "Afgewerkt · 1u30" bij een bezoek dat 1u15 duurde — en
                een raming aanpassen op een bon die al klaar is, verandert
                bovendien niets meer aan de planning.
              */}
              {gelopen ? (
                <Chip
                  className="bg-stroke text-ink-soft"
                  label={formatMinutes(gelopen.minutes)}
                  title="Werkelijk gewerkt, volgens het aankomst- en vertrekuur op de bon"
                />
              ) : (
                <EstimateBadge
                  interventionId={intervention.id}
                  minutes={intervention.estimatedMinutes}
                />
              )}

              {intervention.isUrgent && (
                <Chip className="bg-brand-red text-white" label="Dringend" />
              )}
            </div>
          </div>
        </div>
      </TimelineRail>
    </div>
  )
}
