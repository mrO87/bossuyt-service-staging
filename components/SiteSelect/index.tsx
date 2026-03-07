import type { Customer, Site } from '@/types'

interface Props {
  customer: Customer
  sites: Site[]
  onSelect: (site: Site) => void
}

export default function SiteSelect({ customer, sites, onSelect }: Props) {
  return (
    <>
      {/* Section label */}
      <p className="text-xs font-medium uppercase tracking-wider px-1 mb-1" style={{ color: '#9CA3AF' }}>
        Locaties van {customer.name}
      </p>

      {sites.map(site => (
        <button
          key={site.id}
          onClick={() => onSelect(site)}
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden"
          style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="w-1 shrink-0" style={{ backgroundColor: '#4C6A85' }} />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight" style={{ color: '#1F2933' }}>
              {site.name}
            </p>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
              {site.address}, {site.city}
            </p>
            {/* Show first phone, indicate if there are more */}
            <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
              {site.phones[0]}
              {site.phones.length > 1 && (
                <span style={{ color: '#9CA3AF' }}> +{site.phones.length - 1} nummer(s)</span>
              )}
            </p>
          </div>

          <div className="flex items-center pr-4" style={{ color: '#9CA3AF' }}>
            ›
          </div>
        </button>
      ))}
    </>
  )
}
