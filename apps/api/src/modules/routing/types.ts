export interface LatLngDto {
  lat: number;
  lng: number;
}

export type RoutingSource = 'GOOGLE_ROUTES' | 'SIMULATED_GRAPH' | 'FALLBACK_GRAPH' | 'LIVE_OSRM';

export interface GeographicRouteResult {
  routeId: string;
  originLat: number;
  originLng: number;
  destHospitalId: string;
  destHospitalName: string;
  distanceMeters: number;
  durationSeconds: number;
  routingSource: RoutingSource;
  trafficMode: 'TRAFFIC_AWARE' | 'SIMULATED_NORMAL' | 'SIMULATED_CONGESTED';
  encodedPolyline?: string;
  pathCoordinates: LatLngDto[];
  calculatedAt: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  unavailabilityReason?: string;
}

export interface GeographicRoutingProvider {
  calculateGeographicRoute(
    origin: LatLngDto,
    dest: { hospitalId: string; hospitalName: string; lat: number; lng: number },
    trafficOverrides?: Record<string, number>
  ): Promise<GeographicRouteResult>;
}
