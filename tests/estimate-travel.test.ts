/**
 * estimateTravel — the fallback used when the routing service cannot answer.
 *
 * It replaces mockTravel, which hashed the two work order ids and returned
 * `10 + (h % 35)` minutes. That knew nothing about where anything was, so two
 * work orders at the same address were given ten to forty-four minutes of
 * imaginary driving — the reported "Ennea naar Ennea, 12 min". Zero was not
 * even reachable by construction.
 *
 * This one measures. Same place means no drive.
 */
import { describe, expect, it } from 'vitest'
import { estimateTravel, haversineKm } from '@/lib/routing/estimateTravel'

const KUURNE = { lat: 50.8582720, lon: 3.2584752 }   // het atelier
const KONTICH = { lat: 51.1307205, lon: 4.4779880 }  // ~110 km over de weg
const GENT = { lat: 51.0543, lon: 3.7174 }           // ~50 km over de weg
const KORTRIJK = { lat: 50.8279, lon: 3.2646 }       // ~4 km, echt een korte rit
const NEXT_DOOR = { lat: 50.8585, lon: 3.2590 }      // een paar honderd meter

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(KUURNE, KUURNE)).toBe(0)
  })

  it('matches a known distance within a few percent', () => {
    // Kuurne → Kontich is about 90 km as the crow flies.
    expect(haversineKm(KUURNE, KONTICH)).toBeGreaterThan(85)
    expect(haversineKm(KUURNE, KONTICH)).toBeLessThan(95)
  })

  it('is symmetric', () => {
    expect(haversineKm(KUURNE, GENT)).toBeCloseTo(haversineKm(GENT, KUURNE), 6)
  })
})

describe('estimateTravel', () => {
  it('gives no drive at all between two jobs at the same address', () => {
    // The whole point. Two work orders on one site is normal — a second fault
    // at the same customer — and the day should not be charged for driving.
    const result = estimateTravel(KUURNE, KUURNE)
    expect(result).toEqual({ minutes: 0, km: 0, provider: 'estimate' })
  })

  it('treats a few hundred metres as effectively no drive', () => {
    const result = estimateTravel(KUURNE, NEXT_DOOR)
    expect(result!.minutes).toBeLessThanOrEqual(2)
  })

  it('says it does not know when a location is missing', () => {
    // Better an admitted gap than a number nobody can check. A work order whose
    // address never geocoded should show that, not average out.
    expect(estimateTravel(KUURNE, undefined)).toBeNull()
    expect(estimateTravel(undefined, KUURNE)).toBeNull()
    expect(estimateTravel(undefined, undefined)).toBeNull()
  })

  it('lands in the right ballpark for a real trip', () => {
    // Kuurne → Kontich is roughly 1u15 in practice.
    const result = estimateTravel(KUURNE, KONTICH)!
    expect(result.minutes).toBeGreaterThan(75)
    expect(result.minutes).toBeLessThan(140)
    expect(result.km).toBeGreaterThan(100)
    expect(result.km).toBeLessThan(135)
  })

  it('lands in the right ballpark for a middling trip', () => {
    // Kuurne → Gent is roughly 40 minutes.
    const result = estimateTravel(KUURNE, GENT)!
    expect(result.minutes).toBeGreaterThan(25)
    expect(result.minutes).toBeLessThan(70)
  })

  it('drives slower per kilometre on short hops than long ones', () => {
    // Town driving against motorway. A flat average would overstate exactly the
    // short trips a technician makes most of. Gent is no use as the short one —
    // at 50 km by road it already sits in the motorway band; Kortrijk does.
    const short = estimateTravel(KUURNE, KORTRIJK)!
    const long = estimateTravel(KUURNE, KONTICH)!

    const shortPace = short.minutes / short.km   // minuten per kilometer
    const longPace = long.minutes / long.km
    expect(shortPace).toBeGreaterThan(longPace * 1.3)
  })

  it('is symmetric and stable', () => {
    const there = estimateTravel(KUURNE, GENT)!
    const back = estimateTravel(GENT, KUURNE)!
    expect(there).toEqual(back)
    expect(estimateTravel(KUURNE, GENT)).toEqual(there)
  })

  it('never reports a trip that takes no time but covers ground', () => {
    const result = estimateTravel(KUURNE, GENT)!
    expect(result.minutes).toBeGreaterThan(0)
  })
})
