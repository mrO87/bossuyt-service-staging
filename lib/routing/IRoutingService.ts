export interface Coordinates {
  lat: number
  lon: number
}

export interface RouteResult {
  distanceKm: number
  travelMinutes: number
  provider: string
}

export interface IRoutingService {
  getETA(from: Coordinates, to: Coordinates): Promise<RouteResult>
  getRouteMatrix(stops: Coordinates[]): Promise<RouteResult[][]>
}
