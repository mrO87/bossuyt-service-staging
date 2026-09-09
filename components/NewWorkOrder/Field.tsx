interface Props {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

/** Label + input + optional error, styled for gloves: big text, tall rows. */
export default function Field({ label, required, error, children }: Props) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
        {label}{required && <span className="text-brand-orange"> *</span>}
      </span>
      {children}
      {error && <span className="block mt-1 text-xs font-semibold text-brand-red">{error}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl px-3 py-3 text-base bg-surface border border-stroke text-ink outline-none focus:border-brand-orange'
