import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('staging docker environment setup', () => {
  it('loads optional local env files for staging secrets', () => {
    const compose = readRepoFile('docker-compose.staging.yml')

    expect(compose).toContain('env_file:')
    expect(compose).toContain('path: .env')
    expect(compose).toContain('path: .env.staging.local')
    expect(compose).toContain('required: false')
    expect(compose).not.toContain('DATABASE_URL: ${DATABASE_URL_STAGING_DOCKER')
    expect(compose).not.toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}')
  })

  it('points the app at docling over the network they share', () => {
    // The docling container publishes 5001 on the host loopback only, so the
    // app cannot reach it via the host. It works because both containers sit on
    // the external `traefik` network — which is easy to break by accident when
    // the networks list is edited, hence this test.
    const compose = readRepoFile('docker-compose.staging.yml')

    expect(compose).toContain('DOCLING_URL:')
    expect(compose).toContain('http://docling:5001')

    const appService = compose.slice(compose.indexOf('app-staging:'), compose.indexOf('db-staging:'))
    expect(appService).toMatch(/networks:[\s\S]*- traefik/)
  })

  it('ships an example staging env file with the required database keys', () => {
    const example = readRepoFile('.env.staging.local.example')

    expect(example).toContain('POSTGRES_PASSWORD=')
    expect(example).toContain('DATABASE_URL=')
    expect(example).toContain('NEXTAUTH_SECRET=')
  })
})
