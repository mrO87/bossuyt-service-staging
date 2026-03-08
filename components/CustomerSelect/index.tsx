import type { Customer } from '@/types'

interface Props {
  customers: Customer[]
  onSelect: (customer: Customer) => void
}

export default function CustomerSelect({ customers, onSelect }: Props) {
  return (
    <>
      {customers.map(customer => (
        <button
          key={customer.id}
          onClick={() => onSelect(customer)}
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden bg-white border border-stroke shadow-sm"
        >
          {/* Orange left border — same style as DayView cards */}
          <div className="w-1 shrink-0 bg-brand-orange" />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight text-ink">
              {customer.name}
            </p>
            <p className="text-sm mt-1 text-ink-soft">
              {customer.address}, {customer.city}
            </p>
            <p className="text-sm mt-0.5 text-ink-soft">
              {customer.phone}
            </p>
          </div>

          {/* Arrow indicator */}
          <div className="flex items-center pr-4 text-ink-faint">
            ›
          </div>
        </button>
      ))}
    </>
  )
}
