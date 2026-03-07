import type { Site, Device } from '@/types'

interface Props {
  site: Site
  devices: Device[]
  onSelect: (device: Device) => void
}

// Each device type gets a different accent colour on the left border
function getBorderColor(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'rational':     return '#2E9E5B'
    case 'electrolux':   return '#4C6A85'
    case 'meiko':        return '#7B5EA7'
    case 'mkn':          return '#F28C28'
    case 'winterhalter': return '#4C6A85'
    default:             return '#F28C28'
  }
}

export default function DeviceSelect({ site, devices, onSelect }: Props) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wider px-1 mb-1" style={{ color: '#9CA3AF' }}>
        Toestellen op {site.name}
      </p>

      {devices.map(device => (
        <button
          key={device.id}
          onClick={() => onSelect(device)}
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden"
          style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="w-1 shrink-0" style={{ backgroundColor: getBorderColor(device.brand) }} />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight" style={{ color: '#1F2933' }}>
              {device.brand} {device.model}
            </p>
            {device.serialNumber && (
              <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                S/N: {device.serialNumber}
              </p>
            )}
            {device.installDate && (
              <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
                Geïnstalleerd: {new Date(device.installDate).toLocaleDateString('nl-BE')}
              </p>
            )}
            {/* Notes in orange — important info the technician should see */}
            {device.notes && (
              <p className="text-xs mt-2 font-medium" style={{ color: '#F28C28' }}>
                ⚠ {device.notes}
              </p>
            )}
          </div>

          <div className="flex items-center pr-4" style={{ color: '#9CA3AF' }}>
            ›
          </div>
        </button>
      ))}
    </>
  )
}
