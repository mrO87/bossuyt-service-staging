'use client'

/**
 * De service worker aanmelden bij de browser.
 *
 * Dit gebeurde tot nu toe in `usePushNotifications`, als stap twee van het
 * aanzetten van meldingen. Wie meldingen niet aanzette — en dat is de helft —
 * had daardoor helemaal geen service worker, en dus geen enkele pagina zonder
 * bereik. De registratie hoort niet bij meldingen; ze hoort bij de app.
 *
 * Het component tekent niets en geeft `null` terug. Het bestaat alleen om dit
 * ene neveneffect op één vaste plek te hebben, in plaats van verstopt in een
 * hook die over iets anders gaat.
 */

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    /**
     * Pas na 'load', niet meteen.
     *
     * De browser geeft een registratie dezelfde bandbreedte als het scherm dat
     * hij aan het opbouwen is. Meteen registreren vertraagt dus precies het
     * moment waarop de technieker zijn planning wil zien, voor iets waar hij
     * pas de volgende keer wat aan heeft.
     */
    function registreer() {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Een browser die weigert (privémodus, uitgeschakelde opslag) is geen
        // reden om iets te melden: de app werkt dan gewoon zoals vroeger,
        // alleen zonder de offline-terugval.
      })
    }

    if (document.readyState === 'complete') {
      registreer()
      return
    }

    window.addEventListener('load', registreer)
    return () => window.removeEventListener('load', registreer)
  }, [])

  return null
}
