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

  it('ships an example staging env file with the required database keys', () => {
    const example = readRepoFile('.env.staging.local.example')

    expect(example).toContain('POSTGRES_PASSWORD=')
    expect(example).toContain('DATABASE_URL=')
    expect(example).toContain('NEXTAUTH_SECRET=')
  })
})
