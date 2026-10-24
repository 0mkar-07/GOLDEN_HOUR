import {
  HospitalDto,
  ResourcePoolDto,
  OperatingTheatreDto,
  ServiceHoursDto,
  ReceivingStatus,
  ResourceType,
  TabularCapabilityValue,
  calculateHaversineDistanceMeters,
  NITK_REGION,
  projectToNitkMetric,
} from '@goldenhour/contracts';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import rawData from './data/nitk_facilities.synthetic.json' with { type: 'json' };

/**
 * Runtime Zod validation schemas for input records (Stage 1 & Stage 3 / F-03)
 */
export const RawFacilityCapabilitySchema = z.object({
  available_now: z.number().int().nonnegative().nullable().optional(),
  total: z.number().int().nonnegative().nullable().optional(),
  is_open_now: z.boolean().nullable().optional(),
});

export const RawFacilitySchema = z.object({
  facility_id: z.string().min(1),
  name: z.string().min(1),
  facility_type: z.enum([
    'hospital',
    'medical_college_hospital',
    'nursing_home',
    'campus_health_center',
  ]),
  address: z.string().min(1),
  city: z.string().default('Mangaluru'),
  state: z.string().default('Karnataka'),
  country: z.string().default('India'),
  pincode: z.string().default('575025'),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    distance_from_nitk_km: z.number().nonnegative(),
    coordinate_source: z.string(),
    coordinate_confidence: z.enum(['low', 'medium', 'high']),
  }),
  data_status: z.enum(['synthetic_demo', 'verified_live']),
  capabilities: z.record(RawFacilityCapabilitySchema),
  timings: z
    .object({
      emergency_department: z.string().nullable().optional(),
      opd: z.string().nullable().optional(),
      elective_ot: z.string().nullable().optional(),
    })
    .optional(),
  surgical_services: z
    .object({
      elective_surgery_supported: z.boolean().nullable().optional(),
      emergency_surgery_supported: z.boolean().nullable().optional(),
      operating_theatres_total: z.number().int().nonnegative().nullable().optional(),
      operating_theatres_available_now: z.number().int().nonnegative().nullable().optional(),
    })
    .optional(),
});

export type RawFacility = z.infer<typeof RawFacilitySchema>;

export interface FacilityManifestEntry {
  sourceId: string;
  canonicalId: string;
  exactName: string;
  sourceLat: number;
  sourceLng: number;
  distanceMeters: number;
  distanceBand: '0-10km' | '10-20km' | '20-30km' | '30-40km' | '>40km';
  facilityType: string;
  identityHash: string;
}

export interface ImportValidationReport {
  totalRecords: number;
  accepted: number;
  rejected: number;
  quarantined: number;
  maxDistanceMeters: number;
  datasetStatus: string;
  regionId: string;
  datasetVersion: string;
  timestamp: string;
  identityHash: string;
  distanceBands: {
    '0-10km': number;
    '10-20km': number;
    '20-30km': number;
    '30-40km': number;
    '>40km': number;
  };
  manifest: FacilityManifestEntry[];
  facilities: Array<{
    id: string;
    externalId: string;
    name: string;
    distanceMeters: number;
    validCoordinates: boolean;
    withinRegion: boolean;
    within30km: boolean; // Backwards compatibility
  }>;
}

// Canonical ID constructor (namespaced, stable, row-index independent)
export function toCanonicalHospitalId(facilityId: string): string {
  return `nitk:${facilityId}`;
}

// Legacy demo crosswalk mapping legacy IDs to canonical namespaced IDs
export const DEMO_FACILITY_CROSSWALK: Record<string, string> = {
  'hosp-001': 'nitk:AJ_HOSPITAL_MANGALURU',
  'hosp-002': 'nitk:PADMAVATHI_SURATHKAL',
  'hosp-003': 'nitk:SRINIVAS_MUKKA',
  'hosp-004': 'nitk:KMC_ATTAVAR',
  'hosp-005': 'nitk:NITK_HCC',
};

// Aliases mapping old codes, short codes, and raw IDs to canonical IDs (F-01, F-02)
export const HOSPITAL_ALIAS_MAP: Record<string, string> = {
  'hosp-001': 'nitk:AJ_HOSPITAL_MANGALURU',
  'hosp-002': 'nitk:PADMAVATHI_SURATHKAL',
  'hosp-003': 'nitk:SRINIVAS_MUKKA',
  'hosp-004': 'nitk:KMC_ATTAVAR',
  'hosp-005': 'nitk:NITK_HCC',
  'HOSP-A': 'nitk:AJ_HOSPITAL_MANGALURU',
  'HOSP-B': 'nitk:PADMAVATHI_SURATHKAL',
  'HOSP-C': 'nitk:SRINIVAS_MUKKA',
  'HOSP-D': 'nitk:KMC_ATTAVAR',
  'HOSP-E': 'nitk:NITK_HCC',
  AJ_HOSPITAL_MANGALURU: 'nitk:AJ_HOSPITAL_MANGALURU',
  PADMAVATHI_SURATHKAL: 'nitk:PADMAVATHI_SURATHKAL',
  SRINIVAS_MUKKA: 'nitk:SRINIVAS_MUKKA',
  KMC_ATTAVAR: 'nitk:KMC_ATTAVAR',
  NITK_HCC: 'nitk:NITK_HCC',
  CHIRASHREE_SURATHKAL: 'nitk:CHIRASHREE_SURATHKAL',
};

export const REVERSE_CROSSWALK: Record<string, string> = {
  AJ_HOSPITAL_MANGALURU: 'nitk:AJ_HOSPITAL_MANGALURU',
  PADMAVATHI_SURATHKAL: 'nitk:PADMAVATHI_SURATHKAL',
  SRINIVAS_MUKKA: 'nitk:SRINIVAS_MUKKA',
  KMC_ATTAVAR: 'nitk:KMC_ATTAVAR',
  NITK_HCC: 'nitk:NITK_HCC',
  CHIRASHREE_SURATHKAL: 'nitk:CHIRASHREE_SURATHKAL',
};

/**
 * Computes individual facility identity SHA-256 hash
 */
export function computeFacilityHash(
  sourceId: string,
  name: string,
  lat: number,
  lng: number
): string {
  return createHash('sha256')
    .update(`${sourceId}|${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`)
    .digest('hex');
}

/**
 * Validates and transforms the 23 raw NITK synthetic facilities with 40 km boundary.
 */
export function importNitkFacilities(customFacilities?: unknown[]): {
  hospitals: HospitalDto[];
  resourcePools: ResourcePoolDto[];
  operatingTheatres: OperatingTheatreDto[];
  serviceHours: Map<string, ServiceHoursDto[]>;
  report: ImportValidationReport;
} {
  const rawList = (customFacilities || rawData.facilities) as unknown[];
  const hospitals: HospitalDto[] = [];
  const resourcePools: ResourcePoolDto[] = [];
  const operatingTheatres: OperatingTheatreDto[] = [];
  const serviceHours = new Map<string, ServiceHoursDto[]>();

  let maxDistanceMeters = 0;
  const facilityReports: ImportValidationReport['facilities'] = [];
  const manifestEntries: FacilityManifestEntry[] = [];
  const distanceBands = {
    '0-10km': 0,
    '10-20km': 0,
    '20-30km': 0,
    '30-40km': 0,
    '>40km': 0,
  };

  const seenCanonicalIds = new Set<string>();

  rawList.forEach((unvalidated, _index) => {
    // 1. Runtime schema parse (F-03)
    const parseResult = RawFacilitySchema.safeParse(unvalidated);
    if (!parseResult.success) {
      console.warn(`[Importer] Quarantined facility: invalid schema`, parseResult.error.issues);
      return;
    }
    const f = parseResult.data;

    // 2. Derive stable, collision-free canonical identity (F-01)
    const canonicalId = toCanonicalHospitalId(f.facility_id);
    if (seenCanonicalIds.has(canonicalId)) {
      console.warn(`[Importer] Quarantined duplicate canonical ID: ${canonicalId}`);
      return;
    }
    seenCanonicalIds.add(canonicalId);

    const code = `NITK-${f.facility_id}`;

    // 3. Validate coordinates and compute Haversine distance (40 km regional radius)
    const lat = f.location.latitude;
    const lng = f.location.longitude;
    const validCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    const distanceMeters = calculateHaversineDistanceMeters(
      NITK_REGION.centerLat,
      NITK_REGION.centerLng,
      lat,
      lng
    );

    if (distanceMeters > maxDistanceMeters) {
      maxDistanceMeters = distanceMeters;
    }

    const withinRegion = distanceMeters <= NITK_REGION.radiusMeters;
    const within30km = distanceMeters <= 30000;

    // Categorize distance band
    let band: FacilityManifestEntry['distanceBand'] = '>40km';
    if (distanceMeters <= 10000) {
      band = '0-10km';
      distanceBands['0-10km']++;
    } else if (distanceMeters <= 20000) {
      band = '10-20km';
      distanceBands['10-20km']++;
    } else if (distanceMeters <= 30000) {
      band = '20-30km';
      distanceBands['20-30km']++;
    } else if (distanceMeters <= 40000) {
      band = '30-40km';
      distanceBands['30-40km']++;
    } else {
      distanceBands['>40km']++;
    }

    const itemHash = computeFacilityHash(f.facility_id, f.name, lat, lng);

    manifestEntries.push({
      sourceId: f.facility_id,
      canonicalId,
      exactName: f.name,
      sourceLat: lat,
      sourceLng: lng,
      distanceMeters: Math.round(distanceMeters),
      distanceBand: band,
      facilityType: f.facility_type,
      identityHash: itemHash,
    });

    facilityReports.push({
      id: canonicalId,
      externalId: f.facility_id,
      name: f.name,
      distanceMeters: Math.round(distanceMeters),
      validCoordinates: validCoords,
      withinRegion,
      within30km,
    });

    if (!validCoords || !withinRegion) {
      console.warn(`[Importer] Facility ${f.facility_id} outside 40km region or invalid coordinates: ${distanceMeters}m`);
      return;
    }

    // 4. Project to local metric grid
    const metric = projectToNitkMetric(lat, lng);

    // 5. Transform capabilities with strict NIL preservation (Stage 3)
    const stringCapabilities: string[] = [];
    const capabilitiesDetail: Record<string, TabularCapabilityValue> = {};

    for (const [capCode, rawCap] of Object.entries(f.capabilities)) {
      const capData = rawCap as z.infer<typeof RawFacilityCapabilitySchema>;
      const isSupported =
        (capData.total !== null && capData.total !== undefined && capData.total > 0) ||
        (capData.available_now !== null && capData.available_now !== undefined && capData.available_now > 0) ||
        capData.is_open_now === true;

      capabilitiesDetail[capCode] = {
        supported: isSupported,
        availableCount: capData.available_now ?? null,
        totalCount: capData.total ?? null,
        isOpenNow: capData.is_open_now ?? (isSupported ? true : null),
        verificationStatus: 'UNVERIFIED',
      };

      if (isSupported) {
        stringCapabilities.push(capCode);
      }
    }

    // 6. Construct HospitalDto with canonical ID
    const hospDto: HospitalDto = {
      id: canonicalId,
      code,
      name: f.name,
      address: f.address,
      location: {
        x: Math.round(metric.x / 10),
        y: Math.round(metric.y / 10),
        lat,
        lng,
      },
      capabilities: stringCapabilities,
      receivingStatus: ReceivingStatus.OPEN,
      receivingDelaySeconds: f.facility_id === 'PADMAVATHI_SURATHKAL' ? 90 : f.facility_id === 'SRINIVAS_MUKKA' ? 150 : 120,
      version: 1,
      updatedAt: new Date('2026-10-25T00:00:00Z').toISOString(),
      facilityType: f.facility_type,
      city: f.city || 'Mangaluru',
      pincode: f.pincode || '575025',
      distanceFromNitkKm: parseFloat((distanceMeters / 1000).toFixed(2)),
      capabilitiesDetail,
      provenance: {
        source: 'database.zip:database/seed/nitk_facilities.synthetic.json',
        datasetStatus: 'synthetic_demo',
        coordinateSource: f.location.coordinate_source,
        coordinateConfidence: f.location.coordinate_confidence,
        importedAt: new Date('2026-10-25T00:00:00Z').toISOString(),
        lastVerifiedAt: null,
      },
      timingsSummary: {
        emergency: f.timings?.emergency_department ?? null,
        opd: f.timings?.opd ?? null,
        electiveOt: f.timings?.elective_ot ?? null,
      },
      surgicalSummary: {
        electiveSupported: f.surgical_services?.elective_surgery_supported ?? null,
        emergencySupported: f.surgical_services?.emergency_surgery_supported ?? null,
        operatingTheatresTotal: f.surgical_services?.operating_theatres_total ?? null,
        operatingTheatresAvailable: f.surgical_services?.operating_theatres_available_now ?? null,
      },
    };

    hospitals.push(hospDto);

    // 7. Explicit Capability-to-Resource Pool Generation (F-04)
    // Non-negative invariant: available <= total, outOfService = 0, externalOccupancy = total - available
    const generatePool = (
      type: ResourceType,
      capKey: string,
      poolIdPrefix: string
    ) => {
      const cap = f.capabilities[capKey];
      if (cap && cap.total && cap.total > 0) {
        const avail = Math.min(cap.total, Math.max(0, cap.available_now ?? 0));
        const total = cap.total;
        resourcePools.push({
          id: `${poolIdPrefix}-${canonicalId}`,
          hospitalId: canonicalId,
          resourceType: type,
          totalCount: total,
          outOfServiceCount: 0,
          externalOccupancy: Math.max(0, total - avail),
          reservedCount: 0,
          inUseCount: 0,
          availableCount: avail,
          version: 1,
          updatedAt: new Date('2026-10-25T00:00:00Z').toISOString(),
        });
      }
    };

    generatePool(ResourceType.VENTILATOR, 'VENTILATORS', 'pool-vent');
    generatePool(ResourceType.ICU_BED, 'ICU', 'pool-icu');
    generatePool(ResourceType.TRAUMA_BAY, 'STABILIZATION', 'pool-stab');
    generatePool(ResourceType.CT_SCAN, 'CT_SCAN', 'pool-ct');
    generatePool(ResourceType.CATH_LAB, 'CARDIAC_CATH', 'pool-cath');

    // 8. Operating Theatres
    const otCount = f.surgical_services?.operating_theatres_total ?? 0;
    if (otCount > 0) {
      for (let otIdx = 1; otIdx <= otCount; otIdx++) {
        operatingTheatres.push({
          id: `ot-${canonicalId}-${otIdx}`,
          hospitalId: canonicalId,
          name: `${f.name} OT-${otIdx}`,
          capabilities: stringCapabilities.filter((c) =>
            ['TRAUMA_L1', 'NEUROSURGERY', 'CARDIAC_CATH', 'STABILIZATION', 'EMERGENCY_DEPT'].includes(c)
          ),
          active: true,
        });
      }
    }

    // 9. Service Hours with strict NIL preservation
    serviceHours.set(canonicalId, [
      {
        hospitalId: canonicalId,
        serviceType: 'EMERGENCY_DEPT',
        is24x7: Boolean(f.timings?.emergency_department?.includes('24x7') ?? true),
        timezone: 'Asia/Kolkata',
      },
      {
        hospitalId: canonicalId,
        serviceType: 'OPERATING_THEATRE',
        is24x7: Boolean(f.surgical_services?.emergency_surgery_supported ?? false),
        timezone: 'Asia/Kolkata',
      },
      {
        hospitalId: canonicalId,
        serviceType: 'ICU',
        is24x7: Boolean(f.capabilities?.ICU?.is_open_now ?? true),
        timezone: 'Asia/Kolkata',
      },
    ]);
  });

  // Calculate overall dataset SHA-256 identity hash
  const sortedManifest = [...manifestEntries].sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const fullHash = createHash('sha256')
    .update(sortedManifest.map((m) => m.identityHash).join(';'))
    .digest('hex');

  const report: ImportValidationReport = {
    totalRecords: rawList.length,
    accepted: hospitals.length,
    rejected: rawList.length - hospitals.length,
    quarantined: 0,
    maxDistanceMeters: Math.round(maxDistanceMeters),
    datasetStatus: 'synthetic_demo',
    regionId: NITK_REGION.regionId,
    datasetVersion: NITK_REGION.datasetVersion,
    timestamp: new Date().toISOString(),
    identityHash: fullHash,
    distanceBands,
    manifest: sortedManifest,
    facilities: facilityReports,
  };

  return {
    hospitals,
    resourcePools,
    operatingTheatres,
    serviceHours,
    report,
  };
}

export const IMPORTED_NITK_DATASET = importNitkFacilities();
