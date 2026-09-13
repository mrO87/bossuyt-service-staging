/**
 * PlanningBoard — the day and the open pool under one drag context.
 *
 * The DndContext has to span both lists, because two separate contexts cannot
 * see each other's cards. And the drop handler needs the day's current order,
 * which lives in useRouteTimeline. So both live here, together, rather than the
 * context sitting one level above the state it has to change.
 *
 * The board keeps its own copy of the two lists so a drop lands instantly,
 * before anything has reached the server. A sync replaces both copies with
 * whatever the server says — it holds the truth, we hold a guess.
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'

import { DayTimeline } from '@/components/DayTimeline/DayTimeline'
import { useRouteTimeline } from '@/components/DayTimeline/useRouteTimeline'
import type { MovableItem } from '@/components/DayTimeline/types'
import { resolveDropIntent } from '@/lib/planning/dropIntent'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import { enqueuePlanningWrite, updateInterventionSequence, upsertIntervention } from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import type { Settings } from '@/lib/hooks/useSettings'
import type { Intervention, InterventionStatus, User } from '@/types'
import { OpenPool } from './OpenPool'

/** Position within the movable items (break included) → index among the jobs. */
function jobIndexForPosition(movableItems: MovableItem[], position: number): number {
  return movableItems.slice(0, position).filter(item => item.kind === 'job').length
}

export function PlanningBoard({
  planned,
  open,
  settings,
  currentUser,
  selectedDate,
  onOpenIntervention,
}: {
  planned: Intervention[]
  open: Intervention[]
  settings: Settings
  currentUser: User
  selectedDate: Date
  onOpenIntervention: (id: string) => void
}) {
  const [day, setDay] = useState(planned)
  const [pool, setPool] = useState(open)
  const [poolVisible, setPoolVisible] = useState(true)
  const [refusal, setRefusal] = useState<string | null>(null)

  // The server's answer always wins over the optimistic copy.
  useEffect(() => { setDay(planned) }, [planned])
  useEffect(() => { setPool(open) }, [open])

  const timeline = useRouteTimeline(day, settings)

  // A deliberate hold before a touch drag starts, so the page stays scrollable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const statusById = useMemo(() => {
    const map: Record<string, InterventionStatus> = {}
    for (const intervention of [...day, ...pool]) map[intervention.id] = intervention.status
    return map
  }, [day, pool])

  /**
   * Write the day, locally first and then onto the queue.
   *
   * The queued payload states the whole day rather than the change, so it can
   * replace any planning write still waiting. Twenty drags with no signal leave
   * one call behind, not twenty that each invalidate the next one's version.
   */
  const persist = useCallback(async (nextDay: Intervention[], moved?: Intervention) => {
    await Promise.all(
      nextDay.map((intervention, index) => updateInterventionSequence(intervention.id, index + 1)),
    )
    if (moved) await upsertIntervention(moved)

    // De vertrekkende bon: hij staat niet meer in `nextDay`, maar de server
    // telt hem nog wel mee wanneer die het hoogste versienummer van de dag
    // opzoekt. Stuurden we dan het nummer van wie blijft, dan was dat lager en
    // weigerde de server de schrijfactie als een conflict dat niet bestond —
    // op het scherm stond de bon in de pool, in de database op zijn dag.
    //
    // Onzichtbaar zolang elke schrijfweg een hele dag tegelijk ophoogde. Zodra
    // één bon zijn eigen nummer kan verhogen (`update_placement`, of een bon
    // die net vanuit de werkbon een datum kreeg), is het meteen raak.
    const leaving = moved && !nextDay.some(i => i.id === moved.id) ? moved : null

    // De wachtrij meteen leegmaken, niet wachten op iets anders.
    //
    // Dit stond er niet, en dat kostte echt werk: op een dag die niet vandaag
    // is leest de dagweergave rechtstreeks bij de server en raakt IndexedDB
    // niet aan — dus maakte niemand de wachtrij leeg. Je sleepte een bon naar
    // de pool, wisselde van dag, en de server stuurde de oude toestand terug.
    // De wijziging was niet weg, ze was alleen nooit verstuurd.
    const queued = buildPlanningWrite({
        day: nextDay,
        actor: currentUser,
        technicianId: currentUser.id,
        date: selectedDate,
        // Alleen wie áánkomt telt als aankomend.
        //
        // `moved` is de bon die verhuist, en dat kan twee kanten op. Komt hij
        // van de pool, dan beschrijft zijn versienummer de pool en niet deze
        // dag — dat moet er dus buiten blijven. Maar vertrékt hij, dan is zijn
        // nummer juist het enige dat de server nog van deze dag kent, en dan
        // moet het er wél in.
        //
        // Hier stond `moved` in beide gevallen, en daarmee hief deze regel de
        // `serverDay` hieronder precies op: die zette de vertrekker terug in de
        // lijst, deze haalde hem er weer uit. Gevolg: elke vrijgave stuurde
        // versie 1. Zolang de dag zelf nog op 1 stond viel dat niet op.
        arrivingIds: moved && !leaving ? [moved.id] : undefined,
        serverDay: leaving ? [...nextDay, leaving] : undefined,
    })

    await enqueuePlanningWrite(queued)

    // Offline is geen fout: dan blijft hij in de wachtrij staan en gaat hij mee
    // zodra er weer verbinding is.
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const result = await syncPendingWrites().catch(() => null)
      if (result?.notice) setRefusal(result.notice)

      // De nieuwe versienummers overnemen, en alleen die.
      //
      // Elke geslaagde schrijfactie hoogt het versienummer van de dag op. Nam
      // het scherm dat niet over, dan stuurde de vólgende sleep het oude nummer
      // en botste hij — en juist bij het plannen sleep je vaak een paar keer
      // heen en weer om rijtijden te vergelijken. Dan strandde alles na de
      // eerste.
      //
      // Alleen het nummer, niet de hele bon: wat op het scherm staat is wat je
      // net gesleept hebt, en dat mag niet terugspringen naar het antwoord van
      // een oproep die onderweg was.
      if (result?.fresh?.length) {
        const versions = new Map(result.fresh.map(i => [i.id, i.planningVersion]))
        const adopt = (list: Intervention[]) => list.map(intervention => {
          const version = versions.get(intervention.id)
          return version === undefined || version === intervention.planningVersion
            ? intervention
            : { ...intervention, planningVersion: version }
        })
        setDay(adopt)
        setPool(adopt)
      }
    }
  }, [currentUser, selectedDate])

  async function handleDragEnd(event: DragEndEvent) {
    setRefusal(null)

    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null

    const intent = resolveDropIntent({
      activeId,
      overId,
      plannedIds: timeline.state.movableItems.map(item => item.id),
      poolIds: pool.map(intervention => intervention.id),
      statusById,
    })

    switch (intent.kind) {
      case 'none': {
        // Silent for the everyday cases; spoken only when the app said no.
        if (intent.reason === 'het werk is al begonnen') {
          setRefusal('Deze werkbon is al gestart en blijft op de dag staan.')
        }
        return
      }

      case 'reorder': {
        const jobs = timeline.reorder(activeId, overId!)
        if (!jobs) return
        setDay(jobs)
        await persist(jobs)
        return
      }

      case 'schedule': {
        const moving = pool.find(intervention => intervention.id === intent.workOrderId)
        if (!moving) return

        const scheduled: Intervention = {
          ...moving,
          plannedDate: selectedDate.toISOString(),
          status: moving.status === 'aangemaakt' ? 'gepland' : moving.status,
        }

        const nextDay = [...day]
        nextDay.splice(jobIndexForPosition(timeline.state.movableItems, intent.position), 0, scheduled)

        setPool(pool.filter(intervention => intervention.id !== moving.id))
        setDay(nextDay)
        await persist(nextDay, scheduled)
        return
      }

      case 'unschedule': {
        const moving = day.find(intervention => intervention.id === intent.workOrderId)
        if (!moving) return

        // Only the date goes. The technician stays on the work order, which is
        // the whole point of being able to put it back.
        const released: Intervention = {
          ...moving,
          plannedDate: undefined,
          status: moving.status === 'gepland' || moving.status === 'onderweg'
            ? 'aangemaakt'
            : moving.status,
        }

        const nextDay = day.filter(intervention => intervention.id !== moving.id)
        setDay(nextDay)
        setPool([released, ...pool])
        setPoolVisible(true)
        await persist(nextDay, released)
        return
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold tracking-wide text-ink uppercase">Planning</h2>
        <span className="text-[11px] text-ink-soft">sleep om te verplaatsen</span>
      </div>

      {refusal && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-ink">
          {refusal}
        </div>
      )}

      <DayTimeline
        timeline={timeline}
        selectedDate={selectedDate}
        onOpenIntervention={onOpenIntervention}
      />

      <OpenPool
        interventions={pool}
        visible={poolVisible}
        onToggleVisible={() => setPoolVisible(v => !v)}
        onOpen={onOpenIntervention}
      />
    </DndContext>
  )
}
