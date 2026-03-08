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
      <p className="text-xs font-medium uppercase tracking-wider px-1 mb-1 text-ink-faint">
        Locaties van {customer.name}
      </p>

      {sites.map(site => (
        <button
          key={site.id}
          onClick={() => onSelect(site)}
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden bg-white border border-stroke shadow-sm"
        >
          <div className="w-1 shrink-0 bg-brand-blue" />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight text-ink">
              {site.name}
            </p>
            <p className="text-sm mt-1 text-ink-soft">
              {site.address}, {site.city}
            </p>
            {/* Show first phone, indicate if there are more */}
            <p className="text-sm mt-0.5 text-ink-soft">
              {site.phones[0]}
              {site.phones.length > 1 && (
                <span className="text-ink-faint"> +{site.phones.length - 1} nummer(s)</span>
              )}
            </p>
          </div>

          <div className="flex items-center pr-4 text-ink-faint">
            ›
          </div>
        </button>
      ))}
    </>
  )
}
