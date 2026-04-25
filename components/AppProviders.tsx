'use client'

import type { ReactNode } from 'react'
import { TaskProvider } from '@/lib/task-store'

export default function AppProviders({ children }: { children: ReactNode }) {
  return <TaskProvider>{children}</TaskProvider>
}
