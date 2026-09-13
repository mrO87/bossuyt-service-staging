/**
 * Een klant zonder naam op de bon.
 *
 * Het naamvak op een papieren servicebon blijft soms leeg. De bon moet dan toch
 * bruikbaar zijn, maar een lege naam mag nooit als een lege plek op het scherm
 * belanden: een blok zonder opschrift ziet eruit als een fout in de app.
 */
import { describe, expect, it } from 'vitest'
import { customerLabel, hasCustomerName, MISSING_CUSTOMER_NAME } from '@/lib/customerLabel'

describe('customerLabel', () => {
  it('geeft de naam terug wanneer die er is', () => {
    expect(customerLabel('Chef Jan Decan')).toBe('Chef Jan Decan')
  })

  it('zegt dat de naam ontbreekt in plaats van niets te tonen', () => {
    expect(customerLabel('')).toBe(MISSING_CUSTOMER_NAME)
    expect(customerLabel(null)).toBe(MISSING_CUSTOMER_NAME)
    expect(customerLabel(undefined)).toBe(MISSING_CUSTOMER_NAME)
  })

  it('behandelt een naam van enkel spaties als ontbrekend', () => {
    // Zo komt hij uit een leeg formulierveld: niet leeg, wel niets.
    expect(customerLabel('   ')).toBe(MISSING_CUSTOMER_NAME)
  })

  it('haalt spaties rond de naam weg', () => {
    expect(customerLabel('  Villa Lorraine  ')).toBe('Villa Lorraine')
  })
})

describe('hasCustomerName', () => {
  it('scheidt een echte naam van een lege', () => {
    expect(hasCustomerName('Upton Gianfranco')).toBe(true)
    expect(hasCustomerName('')).toBe(false)
    expect(hasCustomerName('  ')).toBe(false)
    expect(hasCustomerName(null)).toBe(false)
  })
})
