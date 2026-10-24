import { z } from 'zod';

export const RegionConfigSchema = z.object({
  regionId: z.string(),
  regionName: z.string(),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMeters: z.number().positive(),
  timezone: z.string(),
  datasetVersion: z.string(),
});

export type RegionConfigDto = z.infer<typeof RegionConfigSchema>;

export const NITK_REGION: RegionConfigDto = {
  regionId: 'nitk-surathkal-40km',
  regionName: 'NITK Surathkal Healthcare Emergency Region',
  centerLat: 13.0108,
  centerLng: 74.7936,
  radiusMeters: 40000, // 40 km regional boundary
  timezone: 'Asia/Kolkata',
  datasetVersion: '2026.10-nitk40km-canonical',
};

/**
 * Calculates Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks whether a given coordinate falls within the NITK regional boundary (30 km).
 */
export function isWithinNitkRegion(lat: number, lng: number): boolean {
  return (
    calculateHaversineDistanceMeters(
      NITK_REGION.centerLat,
      NITK_REGION.centerLng,
      lat,
      lng
    ) <= NITK_REGION.radiusMeters
  );
}

/**
 * Converts WGS84 coordinates to local metric x/y offsets (meters) relative to NITK Surathkal.
 * Zone: UTM 43N approximation around latitude 13 deg N.
 * 1 degree latitude ~= 110,900 meters.
 * 1 degree longitude at 13 deg N ~= cos(13 deg) * 111,320 ~= 108,460 meters.
 */
export function projectToNitkMetric(
  lat: number,
  lng: number
): { x: number; y: number } {
  const METERS_PER_DEG_LAT = 110900;
  const METERS_PER_DEG_LNG = 108460;
  const x = (lng - NITK_REGION.centerLng) * METERS_PER_DEG_LNG;
  const y = (lat - NITK_REGION.centerLat) * METERS_PER_DEG_LAT;
  return { x, y };
}
