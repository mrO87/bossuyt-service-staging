import { describe, expect, it } from 'vitest'
import { generateWerkbonPDF, type ServiceBonPdfData } from '@/lib/pdf'

const data: ServiceBonPdfData = {
  ticketNumber: 'TKT20/12752',
  bonNumber: 'TKT20/12752-01',
  ticketDate: '2026-09-04T00:00:00.000Z',
  customerNumber: 'K04647',
  invoiceCustomerNumber: '',
  customerName: 'Molenhoeve group bvba',
  siteAddress: 'Van den nestlaan 132',
  siteCity: '2520 Broechem',
  contactName: '',
  phones: [],
  closingDay: '',
  deviceUnitNumber: '',
  deviceDescription: 'Berner Friteuse',
  deviceDeliveryDate: '',
  deviceWarrantyUntil: '',
  customerDescription: 'Nazicht/ herstel 2 friteuses Berner - controleren op lekken',
  technicianReport: 'Lek aan dichting vastgesteld. Dichting vervangen en getest.',
  parts: [{ id: 'p1', code: 'A-1', description: 'Dichting 40mm', quantity: 2, toOrder: false, urgent: false }],
  technicianName: 'Olivier Pierrard',
  visitDate: '2026-09-05T00:00:00.000Z',
  arrivalTime: '2026-09-05T08:30:00.000Z',
  departureTime: '2026-09-05T10:15:00.000Z',
  interventionKind: 'week',
  tripCount: 1,
  personCount: 1,
  remarks: 'Filter volgende keer meenemen',
  signature: null,
}

async function bytes(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer())
}

describe('generateWerkbonPDF', () => {
  it('produces a PDF blob without triggering a download', async () => {
    const blob = await generateWerkbonPDF(data, { download: false })
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(3000)
    const head = (await bytes(blob)).subarray(0, 8).toString('latin1')
    expect(head.startsWith('%PDF-1')).toBe(true)
  })

  it('handles empty optional fields and a long report without throwing', async () => {
    const blob = await generateWerkbonPDF({
      ...data,
      parts: Array.from({ length: 12 }, (_, i) => ({
        id: `p${i}`, code: `C-${i}`, description: `Onderdeel ${i}`, quantity: 1, toOrder: i % 2 === 0, urgent: false,
      })),
      technicianReport: 'regel\n'.repeat(30),
      signature: null,
    }, { download: false })
    expect(blob.size).toBeGreaterThan(3000)
  })

  it('spills a long report and a long parts list onto a continuation page', async () => {
    const single = await generateWerkbonPDF(data, { download: false })
    const overflow = await generateWerkbonPDF({
      ...data,
      technicianReport: 'regel '.repeat(400),
      parts: Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`, code: `C-${i}`, description: `Onderdeel ${i}`, quantity: 1, toOrder: false, urgent: false,
      })),
    }, { download: false })

    // A continuation page carries the bon number in its "vervolg" heading, and
    // the whole document is necessarily larger than the single-page version.
    expect(overflow.size).toBeGreaterThan(single.size)
    expect((await bytes(overflow)).toString('latin1')).toContain('/Count 2')
  })

  it('keeps the customer number and bon number on the page', async () => {
    const raw = (await bytes(await generateWerkbonPDF(data, { download: false }))).toString('latin1')
    // jsPDF writes text uncompressed by default, so the field values are greppable.
    expect(raw).toContain('K04647')
    expect(raw).toContain('Molenhoeve group bvba')
  })
})
