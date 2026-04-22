import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    sha: process.env.NEXT_PUBLIC_GIT_SHA ?? 'unknown',
    built_at: new Date().toISOString(),
  })
}
