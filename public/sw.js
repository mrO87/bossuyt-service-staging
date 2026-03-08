// Service Worker for Bossuyt Service push notifications
// This file runs in the background in the browser, separate from the app.

// This event fires when a push message arrives from our server.
self.addEventListener('push', function (event) {
  // The push message contains JSON data we sent from the server.
  // event.data?.json() parses it. The ?. means: only call .json() if data exists.
  const data = event.data?.json() ?? { title: 'Bossuyt Service', body: 'Nieuw bericht' }

  // event.waitUntil() tells the browser: "keep the service worker alive
  // until this promise resolves". Without this, the browser might kill the
  // service worker before the notification is shown.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { interventionId: data.interventionId },
    })
  )
})

// This event fires when the user taps the notification.
self.addEventListener('notificationclick', function (event) {
  // Close the notification banner.
  event.notification.close()

  const interventionId = event.notification.data?.interventionId

  // clients.openWindow() opens the app (or focuses it if already open).
  // Again, waitUntil() keeps the service worker alive until this is done.
  event.waitUntil(
    clients.openWindow(
      interventionId ? `/interventions/${interventionId}` : '/'
    )
  )
})
