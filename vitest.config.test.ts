import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Load .env.test (and .env.test.local if it exists) into process.env.
// Vitest 4 node-environment tests don't get Vite's env loading automatically.
for (const file of ['.env.test', '.env.test.local']) {
  try {
    const lines = readFileSync(resolve(process.cwd(), file), 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch {
    // file doesn't exist — fine
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(process.cwd()),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 15000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
})
