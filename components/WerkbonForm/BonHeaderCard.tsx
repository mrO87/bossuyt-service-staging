import type { Intervention } from '@/types'
import Section from './Section'
import { BonHeaderButtons } from './BonHeaderButtons'
import { canLeaveTheDay } from '@/lib/planning/dropIntent'
import { useRouter } from 'next/navigation'
import { customerLabel } from '@/lib/customerLabel'

interface Props {
  intervention: Intervention
  /** Preview of the number the server will assign: `${ticket}-NN` */
  bonNumberPreview: string
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-stroke last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value || '—'}</span>
    </div>
  )
}

/** Read-only top half of the paper bon: ticket, bon number and customer block. */
export default function BonHeaderCard({ intervention, bonNumberPreview }: Props) {
  const router = useRouter()

  const klantNr = intervention.invoiceCustomerNumber && intervention.invoiceCustomerNumber !== intervention.customerNumber
    ? `L ${intervention.customerNumber ?? '—'} · F ${intervention.invoiceCustomerNumber}`
    : intervention.customerNumber ?? '—'

  const phones = [intervention.contactPhone, ...(intervention.sitePhones ?? [])]
    .filter(Boolean)
    .join(' · ')

  return (
    <Section
      // Ingekort van "SERVICE BON | BON DE SERVICE". Nagemeten op 400 px: de
      // tweetalige titel vraagt 241 px en krijgt er met drie knopjes 190; deze
      // vraagt er 101. De Franse helft staat nog altijd op de PDF zelf.
      title="SERVICE BON"
      headerExtra={
        <BonHeaderButtons
          workOrderId={intervention.id}
          scanPath={intervention.scanPath}
          editable={canLeaveTheDay(intervention.status)}
          onEdit={() => router.push(`/interventions/${intervention.id}/aanpassen`)}
        />
      }
    >
      <div className="grid grid-cols-2 gap-x-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Ticket n°</p>
          <p className="font-mono font-bold text-ink">{intervention.ticketNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Service bon n°</p>
          <p className="font-mono font-bold text-brand-orange">{bonNumberPreview}</p>
        </div>
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Datum ticket</p>
          <p className="text-sm text-ink">{fmtDate(intervention.ticketDate ?? intervention.createdAt)}</p>
        </div>
      </div>
      <Row label="Klant n°" value={klantNr} />
      <Row label="Naam" value={customerLabel(intervention.customerName)} />
      <Row label="Adres" value={`${intervention.siteAddress}, ${intervention.siteCity}`} />
      <Row label="Contact" value={intervention.contactName} />
      <Row label="Tel & GSM" value={phones} />
      <Row label="Sluitingsdag" value={intervention.closingDay} />
    </Section>
  )
}
