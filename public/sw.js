/**
 * De service worker van Bossuyt Service.
 *
 * Dit bestand deed alleen pushmeldingen, en werd bovendien pas geregistreerd
 * als een technieker meldingen aanzette. Wie dat niet deed had helemaal geen
 * service worker — en dus geen enkele pagina zonder bereik. Gemeten: de app
 * koud openen in vliegtuigmodus gaf de foutpagina van de browser, op elke
 * route, ook de dagplanning.
 *
 * Nu vangt hij ook verzoeken op. De verdeling volgt wat een verzoek ís:
 *
 *   /_next/static/**   cache eerst   de bestandsnaam draagt een hash, dus de
 *                                    inhoud achter die naam verandert nooit
 *   documenten         netwerk eerst vers wint altijd als er bereik is
 *   RSC-payloads       netwerk eerst dit is wat het wisselen tussen dag- en
 *                                    weekplanning nodig heeft
 *   /api/**            nooit         de gegevens wonen in IndexedDB; een
 *                                    gecachet antwoord zou daar een tweede
 *                                    waarheid naast zetten
 *
 * Netwerk-eerst voor alles wat een pagina oplevert is met opzet: het maakt een
 * slechte versie van dit bestand zelfherstellend. Zodra er bereik is, wint de
 * server, en niemand blijft op een kapotte cache hangen — wat op de telefoon
 * van een technieker in het veld anders bijna niet te repareren is.
 */

// Hoog dit op als de indeling van de caches verandert. Bij 'activate' wordt
// alles opgeruimd wat met 'bossuyt-' begint en niet in deze lijst staat.
const VERSIE = 'v1'
const SCHIL = `bossuyt-schil-${VERSIE}`
const STATISCH = `bossuyt-statisch-${VERSIE}`
const ONZE_CACHES = [SCHIL, STATISCH]

/** De twee pagina's die een technieker de hele dag in de hand heeft. */
const KERNPAGINAS = ['/', '/planning/week']

// ---------- levenscyclus ----------

self.addEventListener('install', function (event) {
  event.waitUntil((async () => {
    const cache = await caches.open(SCHIL)
    // Eén voor één, en elk met een eigen vangnet: faalt er één pagina, dan
    // hoort de hele installatie niet af te ketsen. `cache.addAll` doet precies
    // dat wel.
    await Promise.all(KERNPAGINAS.map(pad => cache.add(pad).catch(() => undefined)))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', function (event) {
  event.waitUntil((async () => {
    const namen = await caches.keys()
    await Promise.all(
      namen
        .filter(naam => naam.startsWith('bossuyt-') && !ONZE_CACHES.includes(naam))
        .map(naam => caches.delete(naam)),
    )
    // Meteen de baas over de al open tabbladen, zodat een nieuwe versie niet
    // pas geldt nadat de technieker de app helemaal afsluit.
    await self.clients.claim()
  })())
})

// ---------- strategieën ----------

/** Uit de cache, en alleen naar het net als er niets ligt. */
async function cacheEerst(request, cacheNaam) {
  const cache = await caches.open(cacheNaam)
  const bewaard = await cache.match(request)
  if (bewaard) return bewaard

  const antwoord = await fetch(request)
  if (antwoord && antwoord.status === 200) {
    cache.put(request, antwoord.clone())
  }
  return antwoord
}

/**
 * Naar het net, en alleen naar de cache als dat niet lukt.
 *
 * De terugval kent drie stappen, van precies naar bruikbaar. Eerst het
 * verzoek zelf. Dan hetzelfde pad zonder zoekreeks — een RSC-payload draagt
 * een `_rsc=`-code die bij elke build verandert, dus na een nieuwe versie
 * mist de exacte treffer terwijl het antwoord van gisteren prima bruikbaar
 * is. En voor een documentverzoek als laatste de dagplanning: liever de app
 * op de verkeerde pagina dan de foutmelding van de browser.
 */
async function netwerkEerst(request, isDocument) {
  const cache = await caches.open(SCHIL)

  try {
    const antwoord = await fetch(request)
    if (antwoord && antwoord.status === 200) {
      cache.put(request, antwoord.clone())
    }
    return antwoord
  } catch (fout) {
    const precies = await cache.match(request)
    if (precies) return precies

    const zelfdePad = await cache.match(request, { ignoreSearch: true })
    if (zelfdePad) return zelfdePad

    if (isDocument) {
      const schil = await cache.match('/')
      if (schil) return schil
    }
    throw fout
  }
}

// ---------- verzoeken ----------

self.addEventListener('fetch', function (event) {
  const request = event.request

  // Alleen leesverzoeken. Een POST naar de server hoort nooit langs een cache;
  // wat offline bewaard moet worden, staat al in de wachtrij in IndexedDB.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // De API's blijven met rust. Ook /api/uploads: foto's en werkbonnen cachen
  // is een aparte keuze met een prijs in opslag, en die is niet gemaakt.
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheEerst(request, STATISCH))
    return
  }

  const isDocument = request.mode === 'navigate'
  const isRsc = request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')

  if (isDocument || isRsc) {
    event.respondWith(netwerkEerst(request, isDocument))
  }
})

// ---------- pushmeldingen ----------
// Ongewijzigd. Dit was de enige reden dat dit bestand bestond.

self.addEventListener('push', function (event) {
  const data = event.data?.json() ?? { title: 'Bossuyt Service', body: 'Nieuw bericht' }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { interventionId: data.interventionId },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const interventionId = event.notification.data?.interventionId

  event.waitUntil(
    clients.openWindow(
      interventionId ? `/interventions/${interventionId}` : '/'
    )
  )
})
