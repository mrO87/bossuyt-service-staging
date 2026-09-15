/**
 * Playwright, en waar het op mag schieten.
 *
 * Hier stond `baseURL: process.env.TEST_URL ?? 'http://localhost:3000'`, met
 * erboven "Default to localhost — override with TEST_URL for staging". Dat
 * ging uit van een aanname die niet klopt: poort 3000 op deze machine ís de
 * staging-container (`bossuyt-staging  0.0.0.0:3000->3000/tcp`). Wie de tests
 * zonder omgevingsvariabele draaide, schreef dus rechtstreeks in de echte
 * planning.
 *
 * Dat is geen theorie. Een reis-test vulde een werkbon in, het formulier
 * bewaarde dat automatisch als concept op de server, en zo stond er op de bon
 * van een echte klant een verzonnen zin over onderhoud aan een afwasstraat.
 * Zie `docs/superpowers/AGY-BRIEF-TESTDATABANK.md`.
 *
 * Er zijn twee databanken in dezelfde container. `bossuyt_staging` draagt de
 * planning van de zaak; `bossuyt_test` bestaat om kapotgemaakt te worden.
 * Tests horen in de tweede, en deze config zorgt dat dat de enige uitkomst is:
 * ze start haar eigen app tegen `TEST_DATABASE_URL`, en ze weigert te draaien
 * tegen een adres waarvan we weten dat er echte gegevens achter zitten.
 */
import { defineConfig, devices } from '@playwright/test'

/** Een eigen poort, zodat we nooit per ongeluk op die van de staging-app landen. */
const TEST_PORT = 3006
const EIGEN_APP = `http://localhost:${TEST_PORT}`

/**
 * Adressen waar echte gegevens achter zitten.
 *
 * De twee hostnamen komen uit CLAUDE.md — daar staan ze als "nooit aanraken".
 * De poorten staan erbij omdat de staging-container ze op deze machine
 * publiceert: `localhost:3000` is hetzelfde als `staging.bossuyt.fixassistant.com`,
 * alleen langs de achterdeur. Een test die dat onderscheid niet maakt, maakt
 * het verschil ook niet in wat ze stukmaakt.
 */
const VERBODEN = [
  'staging.bossuyt.fixassistant.com',
  'bossuyt-service.fixassistant.com',
  'service.bossuyt.fixassistant.com',
  'localhost:3000',
  '127.0.0.1:3000',
]

function controleerDoel(url: string): string {
  const geraakt = VERBODEN.find(verboden => url.includes(verboden))
  if (!geraakt) return url

  throw new Error(
    `Playwright weigert te draaien tegen ${url}.\n` +
      `\n` +
      `Daar zit ${geraakt} achter, en dat is een app met echte gegevens. Een\n` +
      `test die een werkbon invult, bewaart die invoer als concept op de server —\n` +
      `dat is precies hoe er ooit testtekst op de bon van een echte klant belandde.\n` +
      `\n` +
      `Draai in plaats daarvan tegen de testdatabank:\n` +
      `\n` +
      `  export TEST_DATABASE_URL='postgresql://…@172.20.0.3:5432/bossuyt_test'\n` +
      `  npx playwright test\n` +
      `\n` +
      `Playwright start dan zelf een app op poort ${TEST_PORT} tegen die databank.\n` +
      `Zie docs/superpowers/AGY-BRIEF-TESTDATABANK.md.`,
  )
}

const doel = controleerDoel(process.env.TEST_URL ?? EIGEN_APP)

/**
 * De app die de tests bedienen, tenzij er al iets draait.
 *
 * Alleen wanneer we op ons eigen adres mikken: wijst `TEST_URL` ergens anders
 * heen, dan draait daar iets wat wij niet gestart hebben en waar wij dus ook
 * niet over gaan. `TEST_DATABASE_URL` staat met opzet niet in dit bestand —
 * een wachtwoord hoort niet in de repo.
 */
const eigenServer =
  doel === EIGEN_APP && process.env.TEST_DATABASE_URL
    ? {
        command: `DATABASE_URL='${process.env.TEST_DATABASE_URL}' npx next dev -p ${TEST_PORT}`,
        url: EIGEN_APP,
        // Buiten CI mag een al draaiende server hergebruikt worden: dat scheelt
        // een halve minuut opstarten bij elke poging tijdens het schrijven.
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined

if (doel === EIGEN_APP && !process.env.TEST_DATABASE_URL) {
  throw new Error(
    `TEST_DATABASE_URL ontbreekt.\n` +
      `\n` +
      `Zonder die variabele weet Playwright niet welke databank de app moet\n` +
      `gebruiken, en raden is hier de fout die we juist proberen te vermijden.\n` +
      `\n` +
      `  export TEST_DATABASE_URL='postgresql://…@172.20.0.3:5432/bossuyt_test'\n` +
      `\n` +
      `Zie docs/superpowers/AGY-BRIEF-TESTDATABANK.md.`,
  )
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',

  ...(eigenServer ? { webServer: eigenServer } : {}),

  use: {
    baseURL: doel,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Mobile viewport (app is designed mobile-first)
    viewport: { width: 390, height: 844 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
