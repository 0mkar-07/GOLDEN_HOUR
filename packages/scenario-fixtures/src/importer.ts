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
import rawData from './data/nitk_facilities.synthetic.json' with { type: 'json' };

export interface RawFacilityCapability {
  available_now: number | null;
  total: number | null;
  is_open_now?: boolean | null;
}

export interface RawFacility {
  facility_id: string;
  name: string;
  facility_type: 'hospital' | 'medical_college_hospital' | 'nursing_home' | 'campus_health_center';
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  location: {
    latitude: number;
    longitude: number;
    distance_from_nitk_km: number;
    coordinate_source: string;
    coordinate_confidence: 'low' | 'medium' | 'high';
  };
  data_status: 'synthetic_demo' | 'verified_live';
  capabilities: Record<string, RawFacilityCapability>;
  timings?: {
    emergency_department?: string | null;
    opd?: string | null;
    elective_ot?: string | null;
  };
  surgical_services?: {
    elective_surgery_supported?: boolean | null;
    emergency_surgery_supported?: boolean | null;
    operating_theatres_total?: number | null;
    operating_theatres_available_now?: number | null;
  };
}

export interface ImportValidationReport {
  totalRecords: number;
  accepted: number;
  rejected: number;
  quarantined: number;
  maxDistanceMeters: number;
  datasetStatus: string;
  regionId: string;
  timestamp: string;
  facilities: Array<{
    id: string;
    externalId: string;
    name: string;
    distanceMeters: number;
    validCoordinates: boolean;
    within30km: boolean;
  }>;
}

// Crosswalk between demonstration IDs and synthetic facility IDs
export const DEMO_FACILITY_CROSSWALK: Record<string, string> = {
  'hosp-001': 'AJ_HOSPITAL_MANGALURU',
  'hosp-002': 'PADMAVATHI_SURATHKAL',
  'hosp-003': 'SRINIVAS_MUKKA',
  'hosp-004': 'KMC_ATTAVAR',
  'hosp-005': 'NITK_HCC',
};

export const REVERSE_CROSSWALK: Record<string, string> = {
  AJ_HOSPITAL_MANGALURU: 'hosp-001',
  PADMAVATHI_SURATHKAL: 'hosp-002',
  SRINIVAS_MUKKA: 'hosp-003',
  KMC_ATTAVAR: 'hosp-004',
  NITK_HCC: 'hosp-005',
};

/**
 * Validates and transforms the 23 raw NITK synthetic facilities.
 */
export function importNitkFacilities(): {
  hospitals: HospitalDto[];
  resourcePools: ResourcePoolDto[];
  operatingTheatres: OperatingTheatreDto[];
  serviceHours: Map<string, ServiceHoursDto[]>;
  report: ImportValidationReport;
} {
  const facilities = rawData.facilities as RawFacility[];
  const hospitals: HospitalDto[] = [];
  const resourcePools: ResourcePoolDto[] = [];
  const operatingTheatres: OperatingTheatreDto[] = [];
  const serviceHours = new Map<string, ServiceHoursDto[]>();

  let maxDistanceMeters = 0;
  const facilityReports: ImportValidationReport['facilities'] = [];

  facilities.forEach((f, index) => {
    // 1. Determine stable internal hospital ID (preserve hosp-001 to hosp-005 for demo users)
    const stableId = REVERSE_CROSSWALK[f.facility_id] ?? `hosp-${String(index + 1).padStart(3, '0')}`;
    const code = `NITK-${f.facility_id}`;

    // 2. Validate coordinates and compute Haversine distance
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

    const within30km = distanceMeters <= NITK_REGION.radiusMeters;

    facilityReports.push({
      id: stableId,
      externalId: f.facility_id,
      name: f.name,
      distanceMeters: Math.round(distanceMeters),
      validCoordinates: validCoords,
      within30km,
    });

    if (!validCoords || !within30km) {
      console.warn(`[Importer] Facility ${f.facility_id} outside region or invalid coordinates: ${distanceMeters}m`);
      return;
    }

    // 3. Project to local metric grid
    const metric = projectToNitkMetric(lat, lng);

    // 4. Transform capabilities and build structured capability detail
    const stringCapabilities: string[] = [];
    const capabilitiesDetail: Record<string, TabularCapabilityValue> = {};

    for (const [capCode, capData] of Object.entries(f.capabilities)) {
      const isSupported =
        (capData.total !== null && capData.total > 0) ||
        (capData.available_now !== null && capData.available_now > 0) ||
        capData.is_open_now === true;

      capabilitiesDetail[capCode] = {
        supported: isSupported,
        availableCount: capData.available_now,
        totalCount: capData.total,
        isOpenNow: capData.is_open_now ?? (isSupported ? true : null),
        verificationStatus: 'UNVERIFIED',
      };

      if (isSupported) {
        stringCapabilities.push(capCode);
      }
    }

    // 5. Construct HospitalDto
    const hospDto: HospitalDto = {
      id: stableId,
      code,
      name: f.name,
      address: f.address,
      location: {
        x: Math.round(metric.x / 10), // scaled for schematic 2D views
        y: Math.round(metric.y / 10),
        lat,
        lng,
      },
      capabilities: stringCapabilities,
      receivingStatus: ReceivingStatus.OPEN,
      receivingDelaySeconds: stableId === 'hosp-002' ? 90 : stableId === 'hosp-003' ? 150 : 120,
      version: 1,
      updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
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

    // 6. Generate Resource Pools for countable capabilities
    const ventCap = f.capabilities.VENTILATORS;
    if (ventCap && ventCap.total && ventCap.total > 0) {
      const avail = ventCap.available_now ?? 0;
      const total = ventCap.total;
      resourcePools.push({
        id: `pool-vent-${stableId}`,
        hospitalId: stableId,
        resourceType: ResourceType.VENTILATOR,
        totalCount: total,
        outOfServiceCount: 0,
        externalOccupancy: Math.max(0, total - avail),
        reservedCount: 0,
        inUseCount: 0,
        availableCount: avail,
        version: 1,
        updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
      });
    }

    const icuCap = f.capabilities.ICU;
    if (icuCap && icuCap.total && icuCap.total > 0) {
      const avail = icuCap.available_now ?? 0;
      const total = icuCap.total;
      resourcePools.push({
        id: `pool-icu-${stableId}`,
        hospitalId: stableId,
        resourceType: ResourceType.ICU_BED,
        totalCount: total,
        outOfServiceCount: 0,
        externalOccupancy: Math.max(0, total - avail),
        reservedCount: 0,
        inUseCount: 0,
        availableCount: avail,
        version: 1,
        updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
      });
    }

    const stabCap = f.capabilities.STABILIZATION;
    if (stabCap && stabCap.total && stabCap.total > 0) {
      const avail = stabCap.available_now ?? 0;
      const total = stabCap.total;
      resourcePools.push({
        id: `pool-stab-${stableId}`,
        hospitalId: stableId,
        resourceType: ResourceType.TRAUMA_BAY,
        totalCount: total,
        outOfServiceCount: 0,
        externalOccupancy: Math.max(0, total - avail),
        reservedCount: 0,
        inUseCount: 0,
        availableCount: avail,
        version: 1,
        updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
      });
    }

    // 7. Operating Theatres
    const otCount = f.surgical_services?.operating_theatres_total ?? 0;
    if (otCount > 0) {
      for (let otIdx = 1; otIdx <= otCount; otIdx++) {
        operatingTheatres.push({
          id: `ot-${stableId}-${otIdx}`,
          hospitalId: stableId,
          name: `${f.name} OT-${otIdx}`,
          capabilities: stringCapabilities.filter((c) =>
            ['TRAUMA_L1', 'NEUROSURGERY', 'CARDIAC_CATH', 'STABILIZATION', 'EMERGENCY_DEPT'].includes(c)
          ),
          active: true,
        });
      }
    }

    // 8. Service Hours
    serviceHours.set(stableId, [
      {
        hospitalId: stableId,
        serviceType: 'EMERGENCY_DEPT',
        is24x7: f.timings?.emergency_department?.includes('24x7') ?? true,
        timezone: 'Asia/Kolkata',
      },
      {
        hospitalId: stableId,
        serviceType: 'OPERATING_THEATRE',
        is24x7: f.surgical_services?.emergency_surgery_supported ?? false,
        timezone: 'Asia/Kolkata',
      },
      {
        hospitalId: stableId,
        serviceType: 'ICU',
        is24x7: true,
        timezone: 'Asia/Kolkata',
      },
    ]);
  });

  const report: ImportValidationReport = {
    totalRecords: facilities.length,
    accepted: hospitals.length,
    rejected: facilities.length - hospitals.length,
    quarantined: 0,
    maxDistanceMeters: Math.round(maxDistanceMeters),
    datasetStatus: 'synthetic_demo',
    regionId: NITK_REGION.regionId,
    timestamp: new Date().toISOString(),
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
