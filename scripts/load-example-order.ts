/**
 * Post the Sauna Molenhoeve example bon to the ERP route.
 *
 *   BASE_URL=http://localhost:3000 ERP_API_KEY=... npm run load-example
 *   BASE_URL=https://staging.bossuyt.fixassistant.com ERP_API_KEY=... npm run load-example
 *
 * Exit code 0 on 201 (created) or 409 (already loaded), 1 otherwise.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
const erpKey = process.env.ERP_API_KEY
if (!erpKey) {
  console.error('ERP_API_KEY ontbreekt')
  process.exit(1)
}

const body = readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8')

const res = await fetch(`${baseUrl}/api/erp/work-orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
  body,
})
const json = (await res.json().catch(() => ({}))) as { id?: string }

console.log(res.status, JSON.stringify(json))
if (res.status === 201) console.log(`→ open ${baseUrl}/interventions/${json.id}`)
if (res.status === 409) console.log(`→ bestaat al: ${baseUrl}/interventions/${json.id}`)
process.exit(res.status === 201 || res.status === 409 ? 0 : 1)
