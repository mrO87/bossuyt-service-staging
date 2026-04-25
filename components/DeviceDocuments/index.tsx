'use client'

import { useState, useEffect } from 'react'

interface Props {
  brand: string
  model: string
}

interface Docs {
  schematic: string | null
  exploded: string | null
  manual: string | null
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-stroke bg-white p-4 aspect-square animate-pulse flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 bg-surface rounded-full" />
      <div className="w-16 h-2 bg-surface rounded" />
    </div>
  )
}

function DocCard({
  label,
  path,
  icon,
  ringColor,
}: {
  label: string
  path: string | null
  icon: React.ReactNode
  ringColor: string
}) {
  const missing = !path

  const inner = (
    <div className="flex flex-col items-center justify-center gap-3 h-full">
      {icon}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink text-center leading-tight">
          {label}
        </span>
        {missing && (
          <span className="text-[9px] font-medium text-ink-soft uppercase">Ontbreekt</span>
        )}
      </div>
    </div>
  )

  const base = 'rounded-2xl border border-stroke bg-white p-4 aspect-square transition-all duration-150'

  if (missing) {
    return <div className={`${base} opacity-40`}>{inner}</div>
  }

  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} shadow-sm hover:shadow-md ${ringColor} active:scale-95 cursor-pointer`}
    >
      {inner}
    </a>
  )
}

export default function DeviceDocuments({ brand, model }: Props) {
  const [docs, setDocs] = useState<Docs | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/devices/documents?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`)
      .then(r => r.json())
      .then(data => setDocs(data))
      .catch(() => setDocs(null))
      .finally(() => setLoading(false))
  }, [brand, model])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Electrical schematic */}
      <DocCard
        label="Elektrisch schema"
        path={docs?.schematic ?? null}
        ringColor="hover:border-brand-orange hover:ring-4 hover:ring-brand-orange/10"
        icon={
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        }
      />

      {/* Exploded view / parts list */}
      <DocCard
        label="Onderdelenlijst"
        path={docs?.exploded ?? null}
        ringColor="hover:border-brand-blue hover:ring-4 hover:ring-brand-blue/10"
        icon={
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-blue">
            <rect x="2" y="3" width="20" height="5" rx="1" />
            <rect x="4" y="10" width="16" height="4" rx="1" />
            <rect x="6" y="16" width="12" height="5" rx="1" />
          </svg>
        }
      />

      {/* Service manual */}
      <DocCard
        label="Servicehandleiding"
        path={docs?.manual ?? null}
        ringColor="hover:border-brand-green hover:ring-4 hover:ring-brand-green/10"
        icon={
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-green">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        }
      />
    </div>
  )
}
