import Field from '@/components/NewWorkOrder/Field'

export type FieldSource = 'zone' | 'label' | 'empty' | 'corrected' | 'suggested'

interface Props {
  label: string
  source?: FieldSource
  required?: boolean
  error?: string
  children: React.ReactNode
}

/**
 * How confident the extraction was about this field, in plain Dutch.
 *
 * OCR reads a 0 as an O without ever hesitating, and on a customer number like
 * K04647 that mistake is silent and expensive. Showing where each value came
 * from tells the person checking the form which three fields deserve their
 * attention instead of asking them to re-read all sixteen.
 */
const BADGES: Record<FieldSource, { text: string; className: string } | null> = {
  zone: null,
  label: {
    text: 'nakijken',
    className: 'bg-brand-orange/15 text-brand-orange border-brand-orange/40',
  },
  empty: {
    text: 'niet gevonden',
    className: 'bg-brand-red/10 text-brand-red border-brand-red/40',
  },
  // The street was read as something that does not exist and swapped for the
  // one OpenStreetMap knows at this postal code. Almost always right, and never
  // to be taken on trust: a street is where a technician drives.
  corrected: {
    text: 'aangepast',
    className: 'bg-brand-orange/15 text-brand-orange border-brand-orange/40',
  },
  // Nothing on the bon said this. It is the business OpenStreetMap has at that
  // address, which is usually the customer and occasionally the shop next door
  // — so it arrives as a proposal and says so.
  suggested: {
    text: 'voorstel',
    className: 'bg-brand-orange/15 text-brand-orange border-brand-orange/40',
  },
}

/** A wizard Field with a marker showing how the value got there. */
export default function SourceField({ label, source = 'zone', required, error, children }: Props) {
  const badge = BADGES[source]

  return (
    <div className="relative">
      <Field label={label} required={required} error={error}>
        {children}
      </Field>
      {badge && (
        <span
          className={`absolute right-0 top-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
        >
          {badge.text}
        </span>
      )}
    </div>
  )
}
