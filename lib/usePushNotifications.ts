'use client'

import { useState } from 'react'

// This is a custom React hook. By convention, hooks always start with "use".
// A hook is just a function that can use React features like useState inside it.
// We export it so any component can call it to get push notification support.
export function usePushNotifications() {
  // subscribed: do we currently have an active subscription?
  // loading: are we in the middle of the subscribe process?
  // error: did something go wrong?
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function subscribe() {
    setLoading(true)
    setError(null)

    try {
      // Step 1: Check if the browser supports service workers.
      // Older browsers don't have 'serviceWorker' in navigator.
      if (!('serviceWorker' in navigator)) {
        throw new Error('Deze browser ondersteunt geen meldingen')
      }

      // Step 2: Register our service worker file.
      // The browser downloads /sw.js, installs it, and keeps it running.
      // If it's already registered, this just returns the existing registration.
      const registration = await navigator.serviceWorker.register('/sw.js')

      // Step 3: Ask the user for notification permission.
      // This shows the "Allow notifications?" popup in the browser.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        throw new Error('Meldingen geweigerd door de gebruiker')
      }

      // Step 4: Get the VAPID public key from the environment.
      // NEXT_PUBLIC_ prefix means Next.js makes this available in the browser.
      // Variables without that prefix only exist on the server.
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

      // Step 5: Subscribe with the push service.
      // applicationServerKey accepts the VAPID public key as a plain string.
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // required: every push must show a visible notification
        applicationServerKey: vapidKey,
      })

      // Step 6: Send the subscription to our server to save it.
      // fetch() makes an HTTP request. We POST the subscription as JSON.
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      })

      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      // finally runs whether the try succeeded or failed.
      // We always want to stop the loading spinner.
      setLoading(false)
    }
  }

  // sendTestNotification calls our /api/push/send endpoint to fire a test push.
  // This is just for demo purposes — in the real app, the server sends notifications
  // automatically when a job is assigned.
  async function sendTestNotification() {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Nieuwe job toegewezen',
        body: 'WZC Helianthus — Melle: installatie waterontharder',
        interventionId: 'i2',
      }),
    })
  }

  // We return everything the component needs:
  // the state values to show the right UI, and the functions to call on button clicks.
  return { subscribed, loading, error, subscribe, sendTestNotification }
}

