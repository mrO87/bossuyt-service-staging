import { NextResponse } from 'next/server'

// This is our temporary in-memory store.
// It's a module-level variable — it lives as long as the server process runs.
// When we add a database later, this gets replaced by a DB insert.
// We export it so the /send route can read from the same list.
// We store subscriptions as `unknown` because the browser's PushSubscription type
// and the web-push library's PushSubscription type have different shapes in TypeScript.
// In reality they're the same JSON object — we just avoid the type conflict this way.
export const subscriptions: Set<unknown> = new Set()

// This function handles POST requests to /api/push/subscribe.
// Next.js automatically calls this when a POST request hits this URL.
export async function POST(request: Request) {
  // request.json() reads the body of the request and parses it as JSON.
  // The body will be the subscription object the browser generated.
  const subscription = await request.json()

  if (!subscription) {
    // NextResponse.json() creates a JSON response. The second argument sets
    // the HTTP status code. 400 means "Bad Request" — the caller did something wrong.
    return NextResponse.json({ error: 'No subscription provided' }, { status: 400 })
  }

  // Add the subscription to our in-memory set.
  subscriptions.add(subscription)

  console.log(`[push] Subscription saved. Total: ${subscriptions.size}`)

  // 201 means "Created" — the standard HTTP status for successfully creating something.
  return NextResponse.json({ ok: true }, { status: 201 })
}
