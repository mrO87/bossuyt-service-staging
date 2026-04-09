/**
 * VersionBadge — fixed corner badge showing the current app version.
 *
 * We use `position: fixed` so it stays anchored to the viewport even while
 * the user scrolls. On staging we add the word "STAGING" so it's immediately
 * obvious you are NOT looking at production.
 */
'use client'

import Link from 'next/link'

export const APP_VERSION = 'v1.5'

export default function VersionBadge() {
  // process.env.NEXT_PUBLIC_STAGING is injected at build time.
  // When present we're running on staging.bossuyt.fixassistant.com.
  const isStaging = process.env.NEXT_PUBLIC_STAGING === '1'

  return (
    <Link
      href="/changenotes"
      className={
        'fixed bottom-3 right-3 z-50 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-lg ' +
        'backdrop-blur border transition active:scale-95 ' +
        (isStaging
          ? 'bg-brand-orange/90 text-white border-white/30'
          : 'bg-white/90 text-ink border-stroke')
      }
      aria-label="Toon changelog"
    >
      {isStaging ? `STAGING · ${APP_VERSION}` : APP_VERSION}
    </Link>
  )
}
