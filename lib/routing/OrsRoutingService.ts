import { IRoutingService, RouteResult, Coordinates } from './IRoutingService'

export class OrsRoutingService implements IRoutingService {
  private readonly baseUrl = 'https://api.openrouteservice.org/v2'

  constructor(private readonly apiKey: string) {}

  async getETA(from: Coordinates, to: Coordinates): Promise<RouteResult> {
    const res = await fetch(`${this.baseUrl}/directions/driving-car`, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [
          [from.lon, from.lat], // ORS: [lon, lat]
          [to.lon, to.lat],
        ],
      }),
    })
    if (!res.ok) throw new Error(`ORS error: ${res.status}`)
    const data = await res.json()
    const summary = data.routes[0].summary
    return {
      distanceKm: Math.round(summary.distance / 100) / 10,
      travelMinutes: Math.round(summary.duration / 60),
      provider: 'ors',
    }
  }

  async getRouteMatrix(stops: Coordinates[]): Promise<RouteResult[][]> {
    const res = await fetch(`${this.baseUrl}/matrix/driving-car`, {
      method: 'POST',
      headers: { 'Authorization': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: stops.map(s => [s.lon, s.lat]),
        metrics: ['duration', 'distance'],
      }),
    })
    const data = await res.json()
    return data.durations.map((row: number[], i: number) =>
      row.map((sec: number, j: number) => ({
        distanceKm: Math.round(data.distances[i][j] / 100) / 10,
        travelMinutes: Math.round(sec / 60),
        provider: 'ors',
      }))
    )
  }
}
