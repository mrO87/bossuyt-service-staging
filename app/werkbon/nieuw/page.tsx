'use client'

import { useState } from 'react'
import { customers, getSitesByCustomer, getDevicesBySite } from '@/lib/mock-data'
import type { Customer, Site, Device } from '@/types'
import CustomerSelect from '@/components/CustomerSelect'
import SiteSelect from '@/components/SiteSelect'
import DeviceSelect from '@/components/DeviceSelect'

// Intent: future workflow scaffolding for a new werkbon flow; it stays
// intentionally unlinked from the active staging UI for now.
type Screen = 'customer' | 'site' | 'device' | 'werkbon'

const STEPS: Record<Screen, number> = {
  customer: 1,
  site:     2,
  device:   3,
  werkbon:  4,
}

const STEP_LABELS: Record<Screen, string> = {
  customer: 'Selecteer klant',
  site:     'Selecteer locatie',
  device:   'Selecteer toestel',
  werkbon:  'Werkbon',
}

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1"  y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1"  y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

export default function NieuwWerkbon() {
  const [screen, setScreen]               = useState<Screen>('customer')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedSite, setSelectedSite]         = useState<Site | null>(null)
  const [selectedDevice, setSelectedDevice]     = useState<Device | null>(null)

  function handleCustomerSelect(customer: Customer) {
    setSelectedCustomer(customer)
    setScreen('site')
  }

  function handleSiteSelect(site: Site) {
    setSelectedSite(site)
    setScreen('device')
  }

  function handleDeviceSelect(device: Device) {
    setSelectedDevice(device)
    setScreen('werkbon')
  }

  function handleBack() {
    if (screen === 'site')    { setSelectedCustomer(null); setScreen('customer') }
    if (screen === 'device')  { setSelectedSite(null);     setScreen('site') }
    if (screen === 'werkbon') { setSelectedDevice(null);   setScreen('device') }
  }

  const currentStep = STEPS[screen]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>

      {/* Header — matches DayView */}
      <header style={{ backgroundColor: '#2F343A' }} className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide" style={{ color: '#fff' }}>bossuyt</p>
            <p className="text-xs leading-tight" style={{ color: '#6B7280' }}>nieuwe werkbon</p>
          </div>
        </div>
        {/* Back button on the right — hidden on first screen */}
        {screen !== 'customer' && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#3A3F45', color: '#fff' }}
          >
            ← Terug
          </button>
        )}
      </header>

      {/* Step indicator */}
      <div style={{ backgroundColor: '#2F343A', borderBottomColor: '#3A3F45' }} className="px-4 pb-3 border-b">
        {/* Step dots */}
        <div className="flex items-center gap-2 mb-1">
          {([1, 2, 3, 4] as const).map(step => (
            <div
              key={step}
              className="h-1 rounded-full flex-1 transition-all"
              style={{
                backgroundColor: step <= currentStep ? '#F28C28' : '#3A3F45',
              }}
            />
          ))}
        </div>
        <p className="text-xs" style={{ color: '#6B7280' }}>
          Stap {currentStep} van 4 — <span style={{ color: '#fff' }}>{STEP_LABELS[screen]}</span>
        </p>
      </div>

      {/* Breadcrumb — shows the selections made so far */}
      {(selectedCustomer || selectedSite) && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs flex-wrap" style={{ backgroundColor: '#EAECEF' }}>
          {selectedCustomer && (
            <span style={{ color: '#1F2933' }} className="font-medium">{selectedCustomer.name}</span>
          )}
          {selectedSite && (
            <>
              <span style={{ color: '#9CA3AF' }}>›</span>
              <span style={{ color: '#1F2933' }} className="font-medium">{selectedSite.name}</span>
            </>
          )}
          {selectedDevice && (
            <>
              <span style={{ color: '#9CA3AF' }}>›</span>
              <span style={{ color: '#1F2933' }} className="font-medium">{selectedDevice.brand} {selectedDevice.model}</span>
            </>
          )}
        </div>
      )}

      {/* Screens */}
      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {screen === 'customer' && (
          <CustomerSelect customers={customers} onSelect={handleCustomerSelect} />
        )}
        {screen === 'site' && selectedCustomer && (
          <SiteSelect
            customer={selectedCustomer}
            sites={getSitesByCustomer(selectedCustomer.id)}
            onSelect={handleSiteSelect}
          />
        )}
        {screen === 'device' && selectedSite && (
          <DeviceSelect
            site={selectedSite}
            devices={getDevicesBySite(selectedSite.id)}
            onSelect={handleDeviceSelect}
          />
        )}
        {screen === 'werkbon' && selectedCustomer && selectedSite && selectedDevice && (
          <div
            className="rounded-xl overflow-hidden flex"
            style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <div className="w-1 shrink-0" style={{ backgroundColor: '#F28C28' }} />
            <div className="flex-1 p-4">
              <p className="font-bold text-base" style={{ color: '#1F2933' }}>
                {selectedDevice.brand} {selectedDevice.model}
              </p>
              <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>{selectedSite.name}</p>
              <p className="text-sm" style={{ color: '#6B7280' }}>{selectedCustomer.name}</p>
              <p className="mt-4 text-sm italic" style={{ color: '#9CA3AF' }}>Werkbon form volgt hier</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
