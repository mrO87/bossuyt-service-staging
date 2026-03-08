import type { Site, Device } from '@/types'

interface Props {
  site: Site
  devices: Device[]
  onSelect: (device: Device) => void
}

// Each device brand gets a different accent colour on the left border
function getBorderClass(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'rational':     return 'bg-brand-green'
    case 'electrolux':   return 'bg-brand-blue'
    case 'meiko':        return 'bg-brand-purple'
    case 'mkn':          return 'bg-brand-orange'
    case 'winterhalter': return 'bg-brand-blue'
    default:             return 'bg-brand-orange'
  }
}

export default function DeviceSelect({ site, devices, onSelect }: Props) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wider px-1 mb-1 text-ink-faint">
        Toestellen op {site.name}
      </p>

      {devices.map(device => (
        <button
          key={device.id}
          onClick={() => onSelect(device)}
          className="w-full text-left rounded-xl cursor-pointer transition-opacity active:opacity-70 flex overflow-hidden bg-white border border-stroke shadow-sm"
        >
          <div className={`w-1 shrink-0 ${getBorderClass(device.brand)}`} />

          <div className="flex-1 p-4">
            <p className="font-bold text-base leading-tight text-ink">
              {device.brand} {device.model}
            </p>
            {device.serialNumber && (
              <p className="text-sm mt-1 text-ink-soft">
                S/N: {device.serialNumber}
              </p>
            )}
            {device.installDate && (
              <p className="text-sm mt-0.5 text-ink-soft">
                Geïnstalleerd: {new Date(device.installDate).toLocaleDateString('nl-BE')}
              </p>
            )}
            {/* Notes in orange — important info the technician should see */}
            {device.notes && (
              <p className="text-xs mt-2 font-medium text-brand-orange">
                ⚠ {device.notes}
              </p>
            )}
          </div>

          <div className="flex items-center pr-4 text-ink-faint">
            ›
          </div>
        </button>
      ))}
    </>
  )
}
