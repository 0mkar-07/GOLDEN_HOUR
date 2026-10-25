import { z } from 'zod';

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLngDto = z.infer<typeof LatLngSchema>;

export const RoutingSourceEnum = z.enum([
  'SIMULATED_GRAPH',
  'GOOGLE_ROUTES',
  'LIVE_OSRM',
  'FALLBACK_GRAPH',
]);
export type RoutingSource = z.infer<typeof RoutingSourceEnum>;

export const SharedRouteSchema = z.object({
  routeId: z.string(),
  routeSnapshotId: z.string().optional(),
  originLat: z.number(),
  originLng: z.number(),
  destHospitalId: z.string(),
  destHospitalName: z.string(),
  distanceMeters: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  roadDistanceMeters: z.number().int().nonnegative().optional(),
  travelSeconds: z.number().int().nonnegative().optional(),
  straightLineDistanceMeters: z.number().int().nonnegative().optional(),
  routingSource: RoutingSourceEnum,
  trafficMode: z.enum(['TRAFFIC_AWARE', 'SIMULATED_NORMAL', 'SIMULATED_CONGESTED']),
  encodedPolyline: z.string().optional(),
  pathCoordinates: z.array(LatLngSchema).default([]),
  calculatedAt: z.string(),
  status: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  unavailabilityReason: z.string().optional(),
});
export type SharedRouteDto = z.infer<typeof SharedRouteSchema>;

export const CaseRoutesResponseSchema = z.object({
  caseId: z.string(),
  routeSnapshotId: z.string().optional(),
  positionSequence: z.number().int().nonnegative(),
  routes: z.record(z.string(), SharedRouteSchema),
  generatedAt: z.string(),
});
export type CaseRoutesResponseDto = z.infer<typeof CaseRoutesResponseSchema>;
