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
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden"
          style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          {/* Orange left border — same style as DayView cards */}
          <div className="w-1 shrink-0" style={{ backgroundColor: '#F28C28' }} />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight" style={{ color: '#1F2933' }}>
              {customer.name}
            </p>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
              {customer.address}, {customer.city}
            </p>
            <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
              {customer.phone}
            </p>
          </div>

          {/* Arrow indicator */}
          <div className="flex items-center pr-4" style={{ color: '#9CA3AF' }}>
            ›
          </div>
        </button>
      ))}
    </>
  )
}
