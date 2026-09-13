/**
 * De twee regels die moeten voorkomen dat een werkbon verloren gaat: een
 * vergeten bon keert terug naar de pool, en niets mag in het verleden landen.
 *
 * De grens is een datum, en een datum is precies het soort ding dat stilletjes
 * een dag verschuift door een tijdzone. Daarom staat hij hier vast.
 */
import { describe, expect, it } from 'vitest'
import {
  isPastDay,
  pastDayMessage,
  returnsToPool,
  todayInBelgium,
} from '@/lib/planning/pastDays'

describe('isPastDay', () => {
  const today = '2026-09-13'

  it('noemt gisteren verleden', () => {
    expect(isPastDay('2026-09-12', today)).toBe(true)
  })

  it('noemt vandaag géén verleden', () => {
    // Een dag die nog bezig is blijft bruikbaar: om twee uur nog iets op
    // vanmorgen zetten mag, want het uur volgt toch uit de rit.
    expect(isPastDay('2026-09-13', today)).toBe(false)
  })

  it('noemt morgen géén verleden', () => {
    expect(isPastDay('2026-09-14', today)).toBe(false)
  })

  it('vergelijkt over een maand- en jaargrens heen', () => {
    // Tekstvergelijking op YYYY-MM-DD sorteert zoals de kalender, ook hier.
    expect(isPastDay('2025-12-31', '2026-01-01')).toBe(true)
    expect(isPastDay('2026-01-01', '2025-12-31')).toBe(false)
    expect(isPastDay('2026-08-31', '2026-09-01')).toBe(true)
  })
})

describe('todayInBelgium', () => {
  it('geeft de Belgische dag, niet de dag van een server op UTC', () => {
    // 22:30 UTC op 12 september is in België al half één 's nachts op de 13de.
    // Zou de server zijn eigen klok gebruiken, dan gold een bon van de 13de
    // 's nachts als verleden en verdween hij uit de planning.
    expect(todayInBelgium(new Date('2026-09-12T22:30:00Z'))).toBe('2026-09-13')
  })

  it('geeft YYYY-MM-DD met voorloopnullen', () => {
    expect(todayInBelgium(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })

  it('klopt ook in de winter, wanneer België één uur voorloopt', () => {
    expect(todayInBelgium(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-06')
  })
})

describe('returnsToPool', () => {
  const today = '2026-09-13'

  it('haalt een geplande bon van gisteren terug', () => {
    expect(returnsToPool('gepland', '2026-09-12', today)).toBe(true)
  })

  it('haalt ook een bon terug die onderweg was maar nooit afgewerkt is', () => {
    // Onderweg zijn is nog geen begonnen werk — dezelfde grens als de regel
    // die bepaalt of een bon een dag mag verlaten.
    expect(returnsToPool('onderweg', '2026-09-12', today)).toBe(true)
  })

  it('haalt een aangemaakte bon terug', () => {
    expect(returnsToPool('aangemaakt', '2026-09-12', today)).toBe(true)
  })

  it('laat een afgewerkte bon staan waar hij staat', () => {
    // Die is gedaan. Hem naar de pool halen zou werk uitvinden dat niet bestaat.
    expect(returnsToPool('afgewerkt', '2026-09-12', today)).toBe(false)
  })

  it('laat een geannuleerde bon staan', () => {
    expect(returnsToPool('geannuleerd', '2026-09-12', today)).toBe(false)
  })

  it('laat een bon die op onderdelen wacht staan', () => {
    // Daar ís aan gewerkt; de dag is geschiedenis, niet een vergeten plan.
    expect(returnsToPool('wacht_onderdelen', '2026-09-12', today)).toBe(false)
  })

  it('raakt de dag van vandaag niet aan', () => {
    // De belangrijkste: anders veegt de opkuis de lopende dag leeg.
    expect(returnsToPool('gepland', '2026-09-13', today)).toBe(false)
  })

  it('raakt een toekomstige dag niet aan', () => {
    expect(returnsToPool('gepland', '2026-09-20', today)).toBe(false)
  })

  it('doet niets met een bon die al in de pool staat', () => {
    expect(returnsToPool('gepland', null, today)).toBe(false)
    expect(returnsToPool('gepland', undefined, today)).toBe(false)
  })

  it('doet niets zonder status', () => {
    expect(returnsToPool(undefined, '2026-09-12', today)).toBe(false)
  })
})

describe('pastDayMessage', () => {
  it('noemt de dag waar het over gaat', () => {
    expect(pastDayMessage('2026-09-12')).toContain('12 september')
    expect(pastDayMessage('2026-09-12')).toContain('voorbij')
  })
})
