/**
 * WeekEdges — de stroken links en rechts van het rooster.
 *
 * Sleep een bon erheen en hij schuift zeven dagen op. Dat kon tot nu toe niet:
 * de weekweergave toont één week, en buiten die zeven kolommen was er geen
 * enkel doelwit.
 *
 * Ze bestaan alleen terwijl er gesleept wordt. Permanent zouden ze aan beide
 * kanten ruimte kosten voor iets wat je zelden doet — en op een kolom van 62 px
 * is die ruimte er niet. Ze zijn 20 px breed: smal genoeg om een kolom niet te
 * verbergen, breed genoeg om met een duim te raken. De prijs is dat ze pas
 * ontdekt worden als je toevallig naar de rand sleept; dat is bewust
 * aanvaard en staat in het ontwerp.
 */
'use client'

import { useDroppable } from '@dnd-kit/core'
import { weekEdgeDroppableId } from '@/lib/planning/weekDropIntent'

export function WeekEdges({ visible }: { visible: boolean }) {
  return (
    <>
      <Edge edge="prev" visible={visible} label="vorige week" />
      <Edge edge="next" visible={visible} label="volgende week" />
    </>
  )
}

function Edge({
  edge,
  visible,
  label,
}: {
  edge: 'prev' | 'next'
  visible: boolean
  label: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: weekEdgeDroppableId(edge) })

  return (
    <div
      ref={setNodeRef}
      aria-hidden={!visible}
      className={[
        'pointer-events-none absolute inset-y-0 z-30 flex w-5 items-center justify-center transition-opacity',
        edge === 'prev' ? 'left-0' : 'right-0',
        visible ? 'opacity-100' : 'opacity-0',
        // Doorschijnend zolang je er niet boven zit, zodat de uurkolom eronder
        // leesbaar blijft — je mikt op een uur, niet alleen op een dag. Zodra de
        // strook het doelwit is, wordt hij wel vol: dan moet er geen twijfel zijn.
        isOver ? 'bg-brand-orange' : 'bg-brand-orange/20',
      ].join(' ')}
    >
      <span
        className={[
          'whitespace-nowrap font-mono text-[9px] uppercase tracking-widest',
          // Wit op een lichte tint is onleesbaar; het opschrift kleurt mee.
          isOver ? 'text-white' : 'text-brand-orange',
        ].join(' ')}
        style={{ writingMode: 'vertical-rl', transform: edge === 'prev' ? 'rotate(180deg)' : undefined }}
      >
        {label}
      </span>
    </div>
  )
}
