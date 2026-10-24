import { LatLngDto, GeographicRouteResult } from './types.js';

/**
 * Decodes Google Encoded Polyline format into an array of { lat, lng } points.
 */
export function decodePolyline(encoded: string): LatLngDto[] {
  const points: LatLngDto[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: Number((lat / 1e5).toFixed(6)),
      lng: Number((lng / 1e5).toFixed(6)),
    });
  }

  return points;
}

export interface GoogleComputeRoutesRequest {
  origin: LatLngDto;
  destination: LatLngDto;
  apiKey: string;
  timeoutMs?: number;
}

export interface GoogleComputeRoutesResponse {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline?: string;
  pathCoordinates: LatLngDto[];
}

/**
 * Calls Google Maps Compute Routes API (Routes API v2)
 * Doc: https://developers.google.com/maps/documentation/routes/compute_route_directions
 */
export async function callGoogleComputeRoutes(
  params: GoogleComputeRoutesRequest
): Promise<GoogleComputeRoutesResponse> {
  const { origin, destination, apiKey, timeoutMs = 5000 } = params;

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('mock-')) {
    throw new Error('NO_API_KEY: Google Routes API Key is not configured');
  }

  const endpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.lat,
          longitude: destination.lng,
        },
      },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: true,
    },
    languageCode: 'en-US',
    units: 'METRIC',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey.trim(),
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Routes HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data: any = await res.json();
    const primaryRoute = data?.routes?.[0];

    if (!primaryRoute) {
      throw new Error('NO_ROUTE_FOUND: Google Routes returned empty route collection');
    }

    // duration format is "450s"
    const durationStr = primaryRoute.duration || '0s';
    const durationSeconds = parseInt(durationStr.replace('s', ''), 10) || 0;
    const distanceMeters = primaryRoute.distanceMeters || 0;
    const encodedPolyline = primaryRoute.polyline?.encodedPolyline || '';

    const pathCoordinates = encodedPolyline
      ? decodePolyline(encodedPolyline)
      : [origin, destination];

    return {
      distanceMeters,
      durationSeconds,
      encodedPolyline,
      pathCoordinates,
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`ROUTING_TIMEOUT: Google Routes request exceeded ${timeoutMs}ms`);
    }
    throw err;
  }
}
