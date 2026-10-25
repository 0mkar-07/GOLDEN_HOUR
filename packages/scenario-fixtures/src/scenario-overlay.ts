import { createHash } from 'node:crypto';
import { HospitalDto } from '@goldenhour/contracts';

export const DEFAULT_SCENARIO_SEED = '2026.10-nitk-canonical-seed';

export type OperationalProfile =
  | 'LOW_LOAD_STABILIZATION'
  | 'BUSY_EMERGENCY_INTAKE'
  | 'SPECIALIST_ON_CALL'
  | 'EQUIPMENT_MAINTENANCE'
  | 'THEATRE_OCCUPIED'
  | 'SERVICE_CLOSED'
  | 'STANDARD_BASELINE';

export interface HospitalOperationalOverlay {
  hospitalId: string;
  profile: OperationalProfile;
  intakeServiceSeconds: number;
  queueEstimatedWaitSeconds: number;
  serviceReadyAtSeconds: Record<string, number>;
  limitingReason: string;
  roadAccessPoint: { lat: number; lng: number };
  provenance: string;
}

/**
 * Deterministic hash-to-float helper for reproducible pseudo-random values.
 */
function hashToFraction(key: string): number {
  const hash = createHash('sha256').update(key).digest('hex');
  const integer = parseInt(hash.substring(0, 8), 16);
  return integer / 0xffffffff;
}

/**
 * Returns deterministic operational overlay for a facility under a specific scenario seed.
 */
export function getHospitalOperationalOverlay(
  hospitalId: string,
  facilityType: string,
  capabilities: string[],
  baseLocation: { lat: number; lng: number },
  seed: string = DEFAULT_SCENARIO_SEED
): HospitalOperationalOverlay {
  const cleanId = hospitalId.replace('nitk:', '');
  const r = hashToFraction(`${seed}:${cleanId}`);

  // Known anchor demonstration facilities
  if (cleanId === 'NITK_HCC') {
    return {
      hospitalId,
      profile: 'LOW_LOAD_STABILIZATION',
      intakeServiceSeconds: 60,
      queueEstimatedWaitSeconds: 0,
      serviceReadyAtSeconds: { STABILIZATION: 0, BASIC_OXYGEN: 0, EMERGENCY_DEPT: 0 },
      limitingReason: 'Immediate campus triage and oxygen stabilization available',
      roadAccessPoint: { lat: 13.0078, lng: 74.7955 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'PADMAVATHI_SURATHKAL') {
    return {
      hospitalId,
      profile: 'LOW_LOAD_STABILIZATION',
      intakeServiceSeconds: 75,
      queueEstimatedWaitSeconds: 0,
      serviceReadyAtSeconds: { STABILIZATION: 0, BASIC_OXYGEN: 0, CT_SCAN: 0, EMERGENCY_DEPT: 0 },
      limitingReason: 'Urgent stabilization bay ready now; low emergency load',
      roadAccessPoint: { lat: 13.0045, lng: 74.7962 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'CHIRASHREE_SURATHKAL') {
    return {
      hospitalId,
      profile: 'LOW_LOAD_STABILIZATION',
      intakeServiceSeconds: 90,
      queueEstimatedWaitSeconds: 0,
      serviceReadyAtSeconds: { STABILIZATION: 0, BASIC_OXYGEN: 0 },
      limitingReason: 'Nursing home stabilization bay available; no surgical suite',
      roadAccessPoint: { lat: 13.0012, lng: 74.7978 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'SURATHKAL_GOVERNMENT_HOSPITAL') {
    return {
      hospitalId,
      profile: 'LOW_LOAD_STABILIZATION',
      intakeServiceSeconds: 85,
      queueEstimatedWaitSeconds: 30,
      serviceReadyAtSeconds: { STABILIZATION: 0, BASIC_OXYGEN: 0 },
      limitingReason: 'Govt hospital general stabilization unit; moderate intake flow',
      roadAccessPoint: { lat: 12.9985, lng: 74.7995 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'AJ_HOSPITAL' || cleanId === 'AJ_HOSPITAL_MANGALURU') {
    return {
      hospitalId,
      profile: 'SPECIALIST_ON_CALL',
      intakeServiceSeconds: 150,
      queueEstimatedWaitSeconds: 120,
      serviceReadyAtSeconds: {
        NEUROSURGERY: 480, // 8 minutes on-call neurotrauma team arrival
        TRAUMA_L1: 300,    // 5 minutes trauma suite prep
        ICU: 0,
        CARDIAC_CATH: 0,
        CT_SCAN: 0,
        STABILIZATION: 0,
      },
      limitingReason: 'Neurotrauma surgeon on call (ETA +8m); Trauma OR preparing',
      roadAccessPoint: { lat: 12.8992, lng: 74.8510 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'SRINIVAS_MUKKA') {
    return {
      hospitalId,
      profile: 'BUSY_EMERGENCY_INTAKE',
      intakeServiceSeconds: 210,
      queueEstimatedWaitSeconds: 240,
      serviceReadyAtSeconds: {
        TRAUMA_L1: 0,
        NEUROSURGERY: 0,
        ICU: 0,
        VENTILATORS: 0,
        CARDIAC_CATH: 180,
      },
      limitingReason: 'High emergency volume: 3 cases in triage, intake queue ~4 mins',
      roadAccessPoint: { lat: 13.0330, lng: 74.7870 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (cleanId === 'KMC_ATTAVAR') {
    return {
      hospitalId,
      profile: 'THEATRE_OCCUPIED',
      intakeServiceSeconds: 120,
      queueEstimatedWaitSeconds: 60,
      serviceReadyAtSeconds: {
        CARDIAC_CATH: 600, // 10 minutes current angiography turnover
        ICU: 0,
        VENTILATORS: 0,
        STABILIZATION: 0,
      },
      limitingReason: 'Cath lab 1 active; turnover completed in ~10 mins',
      roadAccessPoint: { lat: 12.8710, lng: 74.8435 },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  // General profile assignment for all other facilities based on seed & facility type
  if (facilityType === 'nursing_home' || facilityType === 'campus_health_center') {
    const intake = 60 + Math.floor(r * 60); // 60 - 120s
    return {
      hospitalId,
      profile: 'LOW_LOAD_STABILIZATION',
      intakeServiceSeconds: intake,
      queueEstimatedWaitSeconds: 0,
      serviceReadyAtSeconds: { STABILIZATION: 0, BASIC_OXYGEN: 0 },
      limitingReason: 'Stabilization bay available; elective services not supported',
      roadAccessPoint: { lat: baseLocation.lat, lng: baseLocation.lng },
      provenance: `synthetic_scenario_overlay:seed=${seed}`,
    };
  }

  if (facilityType === 'medical_college_hospital') {
    if (r < 0.4) {
      // Busy intake profile
      return {
        hospitalId,
        profile: 'BUSY_EMERGENCY_INTAKE',
        intakeServiceSeconds: 240,
        queueEstimatedWaitSeconds: 300,
        serviceReadyAtSeconds: { TRAUMA_L1: 0, ICU: 0, NEUROSURGERY: 180 },
        limitingReason: 'Tertiary intake congestion; triage queue ~5m',
        roadAccessPoint: { lat: baseLocation.lat, lng: baseLocation.lng },
        provenance: `synthetic_scenario_overlay:seed=${seed}`,
      };
    } else if (r < 0.7) {
      // Specialist on call
      return {
        hospitalId,
        profile: 'SPECIALIST_ON_CALL',
        intakeServiceSeconds: 150,
        queueEstimatedWaitSeconds: 60,
        serviceReadyAtSeconds: { NEUROSURGERY: 540, CARDIAC_CATH: 360, TRAUMA_L1: 180 },
        limitingReason: 'On-call specialist team responding (ETA 6-9m)',
        roadAccessPoint: { lat: baseLocation.lat, lng: baseLocation.lng },
        provenance: `synthetic_scenario_overlay:seed=${seed}`,
      };
    } else {
      // Theatre occupied
      return {
        hospitalId,
        profile: 'THEATRE_OCCUPIED',
        intakeServiceSeconds: 140,
        queueEstimatedWaitSeconds: 90,
        serviceReadyAtSeconds: { TRAUMA_L1: 720, NEUROSURGERY: 900 },
        limitingReason: 'Emergency surgery in progress; OR clearing in ~12-15m',
        roadAccessPoint: { lat: baseLocation.lat, lng: baseLocation.lng },
        provenance: `synthetic_scenario_overlay:seed=${seed}`,
      };
    }
  }

  // General hospital
  const intake = 100 + Math.floor(r * 100); // 100 - 200s
  return {
    hospitalId,
    profile: 'STANDARD_BASELINE',
    intakeServiceSeconds: intake,
    queueEstimatedWaitSeconds: Math.floor(r * 120),
    serviceReadyAtSeconds: { STABILIZATION: 0, ICU: 0 },
    limitingReason: 'General emergency department receiving; normal operational baseline',
    roadAccessPoint: { lat: baseLocation.lat, lng: baseLocation.lng },
    provenance: `synthetic_scenario_overlay:seed=${seed}`,
  };
}

/**
 * Applies deterministic scenario overlay to a HospitalDto without mutating immutable source identity.
 */
export function applyHospitalOperationalOverlay(
  hospital: HospitalDto,
  seed: string = DEFAULT_SCENARIO_SEED
): HospitalDto {
  const overlay = getHospitalOperationalOverlay(
    hospital.id,
    hospital.facilityType || 'hospital',
    hospital.capabilities,
    hospital.location,
    seed
  );

  return {
    ...hospital,
    operationalProfile: overlay.profile,
    intakeServiceSeconds: overlay.intakeServiceSeconds,
    receivingDelaySeconds: overlay.intakeServiceSeconds, // Backwards compatible with existing consumers
    queueEstimatedWaitSeconds: overlay.queueEstimatedWaitSeconds,
    roadAccessPoint: {
      ...hospital.location,
      lat: overlay.roadAccessPoint.lat,
      lng: overlay.roadAccessPoint.lng,
    },
  };
}
