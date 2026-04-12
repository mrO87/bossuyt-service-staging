/**
 * Applies audit triggers to the database.
 * Run with: npm run db:triggers
 */
import { readFileSync } from 'fs'
import { join }         from 'path'
import postgres         from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL_HOST ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL_HOST or DATABASE_URL must be set')

  const sql  = postgres(url)
  const file = join(process.cwd(), 'lib/db/audit-triggers.sql')
  const ddl  = readFileSync(file, 'utf8')

  await sql.unsafe(ddl)
  await sql.end()

  console.log('✓ Audit triggers applied')
}

main().catch(err => { console.error(err); process.exit(1) })
