import { NextResponse } from 'next/server'
import { CURRENT_VERSION } from '@/lib/releases'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    version:  CURRENT_VERSION,
    sha:      process.env.NEXT_PUBLIC_GIT_SHA ?? 'unknown',
    built_at: new Date().toISOString(),
  })
}
