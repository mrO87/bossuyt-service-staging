/**
 * Van een geordende dag naar kloktijden.
 *
 * De regel, zoals de technieker hem gaf: het ingestelde vertrekuur plus de
 * rijtijd naar de eerste klant is de aankomst, en de aankomst is de start van
 * de eerste job. Daarna telkens hetzelfde — einde job, rijden, volgende job.
 * De dag loopt van de ingestelde startlocatie tot diezelfde locatie terug.
 *
 * Daarnaast mag een job zijn eigen uur meebrengen: het uur waarop de gebruiker
 * hem heeft neergezet. Dan geldt dát, en de rest van de dag rekent eromheen.
 * Deze functie schuift nooit iets uit zichzelf op — kan een uur niet, dan zegt
 * ze waar en waarom, en laat ze het oplossen aan wie het neerzette.
 *
 * Apart van de weergave gehouden omdat de Gantt-weergave er straks op draait —
 * techniekers als rijen is deze functie, één keer per technieker.
 */
import type { Coordinates } from '@/lib/routing/IRoutingService'

export interface ScheduleBlock {
  /**
   * 'clash' is geen stuk van de dag maar een aanwijzing erover: het ligt óver
   * een job heen en tekent precies het stuk dat niet kan. Het staat in dezelfde
   * lijst omdat het in dezelfde tijdas leeft — de weergave die de andere
   * blokken plaatst, plaatst dit zonder iets nieuws te moeten leren.
   */
  kind: 'anchor' | 'travel' | 'job' | 'break' | 'clash'
  /** Uniek binnen de dag, bruikbaar als React-key en als sleep-id. */
  id: string
  startMinutes: number
  endMinutes: number
  /** Op job-blokken, en op het clash-blok dat erover ligt. */
  interventionId?: string
  /** Alleen op travel-blokken. Null wanneer de rit niet te meten was. */
  minutes?: number | null
}

/**
 * Een uur dat niet kan: de bon begint vóór het moment waarop je er ten vroegste
 * kunt zijn. `fromMinutes`–`toMinutes` is het stuk dat gearceerd wordt;
 * `earliestMinutes` is dat vroegste haalbare begin, het getal waarmee een
 * melding kan uitleggen hoeveel er tekortkomt.
 */
export interface ScheduleConflict {
  interventionId: string
  fromMinutes: number
  toMinutes: number
  earliestMinutes: number
}

export interface DayScheduleResult {
  blocks: ScheduleBlock[]
  /** Wanneer je terug bent op de startlocatie, of null bij een lege dag. */
  backAtOriginMinutes: number | null
  workMinutes: number
  travelMinutes: number
  /** Ritten die niemand kon meten, meestal een adres dat nooit geocodeerd is. */
  unknownLegs: number
  /**
   * Wanneer je van de startlocatie weg moet, of null bij een lege dag.
   *
   * Normaal is dat het ingestelde vertrekuur. Staat de eerste job op een vast
   * uur, dan wordt er teruggerekend: dat uur min de rit ernaartoe. Dat kan vóór
   * het rooster uitkomen — de weergave waarschuwt daarvoor, deze functie
   * weigert het niet.
   */
  departFromOriginMinutes: number | null
  /** Leeg zolang elk vastgezet uur haalbaar is. */
  conflicts: ScheduleConflict[]
}

/**
 * Het id waaronder een blok bij de sleepmotor bekend staat.
 *
 * Alleen een jobblok mag de werkbon-id dragen. Dat klinkt vanzelfsprekend, maar
 * het arceringsblok draagt diezelfde `interventionId` — het ligt immers over die
 * bon heen — en claimde daarmee hetzelfde id. Bij dnd-kit wint de laatste
 * registratie, en dat was de arcering: een blok dat geen sleepelement heeft.
 * Gevolg: een bon met een botsing liet zich helemaal niet meer verslepen,
 * precies de bon die de melding je vraagt te verzetten.
 *
 * Twee dingen met één naam is het soort fout dat geen enkele test ziet zolang
 * beide kanten op zich kloppen — zoals de splitsing op `source` versus
 * `plannedDate` in v1.59. Daarom staat de regel hier, als functie, en niet als
 * uitdrukking ergens in een component.
 */
export function draggableIdFor(block: ScheduleBlock): string {
  return block.kind === 'job' && block.interventionId ? block.interventionId : block.id
}

/** Minuten tussen twee punten, of null wanneer dat niet te bepalen is. */
export type TravelLookup = (
  from: Coordinates | undefined,
  to: Coordinates | undefined,
) => number | null

export interface ScheduleJob {
  id: string
  estimatedMinutes?: number
  at?: Coordinates
  /**
   * Het uur waarop de gebruiker deze bon heeft neergezet, in minuten sinds
   * middernacht. Ontbreekt het, dan wordt het uur berekend zoals altijd.
   *
   * Of het uur afgesproken is staat in `isAppointment` hieronder, en dat
   * maakt hier wél uit: een afspraak houdt haar uur ook als het niet haalbaar
   * is, een voorkeur schuift op. Hier stond het omgekeerde — dat het speldje
   * niets veranderde aan de berekening — en daardoor kon een uur dat niemand
   * had afgesproken een dag dichtarceren.
   */
  startMinutes?: number | null
  /**
   * Of dat uur met de klant afgesproken is.
   *
   * Hier stond dat het speldje niets uitmaakte voor de berekening. Dat hield
   * geen stand. Een afgesproken uur is een claim: kan het niet gehaald worden,
   * dan hoort daar een waarschuwing te staan en mag de bon niet stilletjes
   * verschuiven — iemand moet de klant bellen. Een onthouden uur zónder
   * afspraak is een voorkeur: het is het uur waar de planner de bon neerzette,
   * en het geldt zolang het kan. Botst het met de bon ervoor, dan schuift het
   * op naar het eerste haalbare moment en is er niets aan de hand.
   *
   * Zonder dit veld werd élk onthouden uur een claim, en arceerde een bon die
   * niemand had afgesproken een hele kolom dicht.
   *
   * Ontbreekt het veld, dan geldt het oude gedrag — waarschuwen. Dat is de
   * veilige kant om op te vallen: liever een melding te veel dan een bon die
   * ongemerkt een half uur opschuift.
   */
  isAppointment?: boolean
}

export function computeDaySchedule(input: {
  departureMinutes: number
  origin: Coordinates | undefined
  jobs: ScheduleJob[]
  travelBetween: TravelLookup
  breakMinutes: number
  /**
   * Vóór welke job de pauze valt, of -1 voor geen pauze.
   *
   * Laat je dit weg, dan valt de pauze in het midden van de lijst. Dat was
   * jarenlang de enige regel, en het was de verkeerde: een middagpauze hoort
   * rond de middag en niet op de helft van een rij, dus verschoof ze zodra er
   * een job bij kwam. `orderDayByClock` rekent de juiste plaats uit en geeft
   * hem hier door; het oude gedrag blijft staan voor wie alleen een dag wil
   * doorrekenen zonder zich om de pauze te bekommeren.
   */
  breakBefore?: number
}): DayScheduleResult {
  const { departureMinutes, origin, jobs, travelBetween, breakMinutes } = input

  const blocks: ScheduleBlock[] = []
  const conflicts: ScheduleConflict[] = []
  let workMinutes = 0
  let travelMinutes = 0
  let unknownLegs = 0

  if (jobs.length === 0) {
    return {
      blocks,
      backAtOriginMinutes: null,
      workMinutes,
      travelMinutes,
      unknownLegs,
      departFromOriginMinutes: null,
      conflicts,
    }
  }

  // Eén pauze. Wie hem uitgerekend heeft, geeft de plaats mee; wie dat niet
  // deed, krijgt het oude midden. Er staat nog maar één regel die hierover
  // beslist, en dat was het hele punt: vroeger stond dezelfde berekening ook
  // in de dagweergave, met een commentaar erbij dat ze elkaar nooit mochten
  // tegenspreken. Twee plaatsen die hetzelfde moeten weten, spreken elkaar
  // vroeg of laat tegen.
  const breakBefore = input.breakBefore ?? (jobs.length >= 2 ? Math.floor(jobs.length / 2) : -1)

  let cursor = departureMinutes
  let departFromOrigin = departureMinutes
  let previous: Coordinates | undefined = origin

  /**
   * Zet één rit neer die eindigt op `endsAt`.
   *
   * Een rit wordt achterwaarts getekend vanaf het moment waarop je aankomt, niet
   * voorwaarts vanaf het moment waarop je klaar bent. Zolang alles aan elkaar
   * ligt is dat hetzelfde; zodra er een vast uur in de dag staat, is het het
   * verschil tussen "rijden en dan wachten" en "wachten en dan rijden". Het
   * tweede is wat er gebeurt.
   */
  function pushTravelLeg(id: string, legMinutes: number | null, endsAt: number) {
    if (legMinutes === null) {
      // Onbekend duurt nul. Een verzonnen duur zou de hele dag erachter
      // verschuiven, en dat is erger dan een gat dat zichzelf aanwijst.
      unknownLegs++
      blocks.push({ kind: 'travel', id, startMinutes: endsAt, endMinutes: endsAt, minutes: null })
    } else if (legMinutes > 0) {
      blocks.push({
        kind: 'travel',
        id,
        startMinutes: endsAt - legMinutes,
        endMinutes: endsAt,
        minutes: legMinutes,
      })
      travelMinutes += legMinutes
    }
  }

  jobs.forEach((job, index) => {
    const legMinutes = travelBetween(previous, job.at)
    const leg = legMinutes ?? 0
    const pause = index === breakBefore ? breakMinutes : 0

    // Het vroegste moment waarop deze job kan beginnen: klaar met de vorige, de
    // pauze gehad, en er naartoe gereden.
    const earliest = cursor + leg + pause
    const uur = job.startMinutes ?? null

    // Een afspraak eist haar plaats op, haalbaar of niet. Een voorkeur geldt
    // zolang ze kan en schuift anders op. Zie `isAppointment` hierboven.
    const eist = uur !== null && job.isAppointment !== false
    const pinned = eist ? uur : null
    const start = uur === null ? earliest : eist ? uur : Math.max(uur, earliest)

    pushTravelLeg(`travel-${index}`, legMinutes, start - pause)

    if (pause > 0) {
      blocks.push({ kind: 'break', id: 'break', startMinutes: start - pause, endMinutes: start })
    }

    const length = job.estimatedMinutes ?? 0
    blocks.push({
      kind: 'job',
      id: `job-${job.id}`,
      interventionId: job.id,
      startMinutes: start,
      endMinutes: start + length,
    })
    workMinutes += length

    if (index === 0) {
      // De eerste job heeft niets om mee te botsen: staat hij op een vast uur,
      // dan vertrekt de dag gewoon vroeger (of later). Of dat vertrekuur nog
      // binnen het rooster valt, is een vraag voor de weergave.
      departFromOrigin = start - leg
    } else if (pinned !== null && pinned < earliest) {
      // Precies het onmogelijke stuk: vanaf het einde van de vorige job — of
      // vanaf het vastgezette uur zelf, als de bon daar nog overheen ligt — tot
      // het vroegste moment waarop hij kan beginnen.
      const from = Math.min(pinned, cursor)
      conflicts.push({
        interventionId: job.id,
        fromMinutes: from,
        toMinutes: earliest,
        earliestMinutes: earliest,
      })
      blocks.push({
        kind: 'clash',
        id: `clash-${job.id}`,
        interventionId: job.id,
        startMinutes: from,
        endMinutes: earliest,
      })
    }

    cursor = start + length
    previous = job.at
  })

  // Het vertrekpunt krijgt een klein blok, zodat de kolom laat zien waar de dag
  // begint in plaats van in het niets te openen. Het komt er pas achteraf voor:
  // met een vastgezette eerste job is het vertrekuur pas bekend als die job
  // berekend is.
  blocks.unshift({
    kind: 'anchor',
    id: 'origin-start',
    startMinutes: departFromOrigin - 10,
    endMinutes: departFromOrigin,
  })

  // Een pauze ná de laatste job.
  //
  // Dat is geen rare uitzondering maar de gewone gang van zaken op een dag die
  // niet vol gepland staat: de middagpauze telt altijd mee, ook als het werk
  // om elf uur op is. Je bent dus pas thuis na de pauze én de rit. Zonder dit
  // gaf een halfvolle dag een te vroege thuiskomst, en daar hangt de
  // overurenberekening aan.
  if (breakBefore === jobs.length) {
    blocks.push({ kind: 'break', id: 'break', startMinutes: cursor, endMinutes: cursor + breakMinutes })
    cursor += breakMinutes
  }

  const homeLeg = travelBetween(previous, origin)
  const backAtOrigin = cursor + (homeLeg ?? 0)
  pushTravelLeg('travel-home', homeLeg, backAtOrigin)

  blocks.push({
    kind: 'anchor',
    id: 'origin-end',
    startMinutes: backAtOrigin,
    endMinutes: backAtOrigin + 10,
  })

  return {
    blocks,
    backAtOriginMinutes: backAtOrigin,
    workMinutes,
    travelMinutes,
    unknownLegs,
    departFromOriginMinutes: departFromOrigin,
    conflicts,
  }
}
