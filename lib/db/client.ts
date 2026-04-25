import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const BUILD_TIME_DATABASE_URL = 'postgres://build:build@127.0.0.1:5432/build'

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? BUILD_TIME_DATABASE_URL
}

const globalForDb = globalThis as typeof globalThis & {
  __bossuytSql?: ReturnType<typeof postgres>
}

const connection = globalForDb.__bossuytSql ?? postgres(getDatabaseUrl(), {
  max: 1,
})

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__bossuytSql = connection
}

export const sql = connection
export const db = drizzle(connection)
