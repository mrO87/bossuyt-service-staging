import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { subscriptions } from '../subscribe/route'

// This function handles POST requests to /api/push/send.
export async function POST(request: Request) {
  // We configure web-push here, inside the function, not at module level.
  // Why? Because Next.js runs module-level code during the build to pre-render pages.
  // At build time, VAPID_PRIVATE_KEY doesn't exist yet — only at runtime.
  // By moving this inside the function, it only runs when a real request arrives.
  webpush.setVapidDetails(
    'mailto:info@fixassistant.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  const { title, body, interventionId } = await request.json()

  if (subscriptions.size === 0) {
    return NextResponse.json({ error: 'No subscribers' }, { status: 400 })
  }

  // Build the payload — this is what the service worker receives on the other end.
  // JSON.stringify() turns the object into a string, because push payloads must be text.
  const payload = JSON.stringify({ title, body, interventionId })

  // We need to send to every subscriber. We use Promise.all() here —
  // that means: start all the sends at the same time, wait for all of them to finish.
  // This is faster than sending one by one.
  const results = await Promise.all(
    Array.from(subscriptions).map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription as unknown as webpush.PushSubscription, payload)
        return { ok: true }
      } catch (err: unknown) {
        // If a subscription is expired or invalid, the push service returns 410 Gone.
        // That means the user unsubscribed, so we remove them from our list.
        if (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
          subscriptions.delete(subscription)
        }
        return { ok: false }
      }
    })
  )

  const sent = results.filter(r => r.ok).length
  console.log(`[push] Sent to ${sent}/${results.length} subscribers`)

  return NextResponse.json({ sent, total: results.length })
}
