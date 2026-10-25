import { HospitalDto } from '@goldenhour/contracts';
import { GeographicRouteResult, GeographicRoutingProvider, geographicRoutingProvider } from './index.js';
import { store } from '../../db/store.js';

export interface CaseRouteSnapshot {
  snapshotId: string;
  caseId: string;
  origin: { lat: number; lng: number };
  positionSequence: number;
  sourceGeneration: number;
  routes: Record<string, GeographicRouteResult>;
  evaluatedAt: string;
}

/**
 * Concurrency runner for bounded parallel asynchronous route requests (Stage 2)
 */
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Centralised route-evaluation service for all candidate facilities (Stage 2 / Finding 31).
 * Both recommendation generation and map polyline retrieval query this shared route snapshot.
 */
export async function evaluateCaseCandidateRoutes(options: {
  caseId: string;
  origin: { lat: number; lng: number };
  candidates: HospitalDto[];
  trafficOverrides?: Record<string, number>;
  positionSequence?: number;
  sourceGeneration?: number;
  provider?: GeographicRoutingProvider;
}): Promise<CaseRouteSnapshot> {
  const {
    caseId,
    origin,
    candidates,
    trafficOverrides = {},
    positionSequence = store.ambulancePosition.serverSequence,
    sourceGeneration = store.ambulancePosition.sourceGeneration,
    provider = geographicRoutingProvider,
  } = options;

  const snapshotId = `snap-${caseId}-${positionSequence}-${Date.now()}`;

  // Evaluate candidate routes with bounded concurrency (concurrency = 4)
  const routeResults = await mapConcurrent(candidates, 4, async (hosp) => {
    const targetPoint = hosp.roadAccessPoint || hosp.location;
    try {
      const route = await provider.calculateGeographicRoute(
        origin,
        {
          hospitalId: hosp.id,
          hospitalName: hosp.name,
          lat: targetPoint.lat,
          lng: targetPoint.lng,
        },
        trafficOverrides
      );
      return { hospitalId: hosp.id, route: { ...route, routeSnapshotId: snapshotId } };
    } catch (err: any) {
      return {
        hospitalId: hosp.id,
        route: {
          routeId: `route-${hosp.id}-${Date.now()}`,
          routeSnapshotId: snapshotId,
          originLat: origin.lat,
          originLng: origin.lng,
          destHospitalId: hosp.id,
          destHospitalName: hosp.name,
          distanceMeters: 0,
          durationSeconds: 0,
          routingSource: 'FALLBACK_GRAPH' as const,
          trafficMode: 'SIMULATED_NORMAL' as const,
          pathCoordinates: [origin, { lat: targetPoint.lat, lng: targetPoint.lng }],
          calculatedAt: new Date().toISOString(),
          status: 'UNAVAILABLE' as const,
          unavailabilityReason: err.message || 'ROUTE_CALCULATION_FAILED',
        },
      };
    }
  });

  const routesMap: Record<string, GeographicRouteResult> = {};
  for (const item of routeResults) {
    routesMap[item.hospitalId] = item.route;
  }

  const snapshot: CaseRouteSnapshot = {
    snapshotId,
    caseId,
    origin: { lat: origin.lat, lng: origin.lng },
    positionSequence,
    sourceGeneration,
    routes: routesMap,
    evaluatedAt: new Date().toISOString(),
  };

  store.setCaseRouteSnapshot(snapshot);
  return snapshot;
}
