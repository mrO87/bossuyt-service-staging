'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { TaskProvider } from '@/lib/task-store'
import { migrateLocalStorageTasks } from '@/lib/tasks/migrate'
import { registerSyncListeners } from '@/lib/tasks/sync'

export default function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Register offline sync listeners once on mount
    registerSyncListeners()

    // Run localStorage → PostgreSQL migration once (idempotent)
    void migrateLocalStorageTasks().then(result => {
      if (result.migrated > 0) {
        console.info(`${result.migrated} taken gesynchroniseerd naar server`)
        // TODO: replace with your toast component when available
      }
    })
  }, [])

  return <TaskProvider>{children}</TaskProvider>
}
