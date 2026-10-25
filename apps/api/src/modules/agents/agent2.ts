import {
  HospitalDto,
  ResourcePoolDto,
  StaffAvailabilityDto,
  ReceivingStatus,
  ResourceType,
  SpecialtyType,
  RequiredIntervention,
} from '@goldenhour/contracts';

export type EvaluationStatus = 'ELIGIBLE_NOW' | 'ELIGIBLE_AT_TIME' | 'INELIGIBLE' | 'UNKNOWN';

export interface HospitalEvaluation {
  hospital: HospitalDto;
  isFullCareEligible: boolean;
  isStabilizationEligible: boolean;
  fullCareStatus: EvaluationStatus;
  stabilizationStatus: EvaluationStatus;
  fullCareReasons: string[];
  stabilizationReasons: string[];
  missingFullCareCapabilities: string[];
  missingStabilizationCapabilities: string[];
  theatreReady: boolean;
  theatreWaitSeconds: number;
  specialistTeamReady: boolean;
  specialistWaitSeconds: number;
  immediateCareReadyAtSeconds: number;
  definitiveCareReadyAtSeconds: number;
  policyReasonCodes: string[];
}

/**
 * Agent 2 — Hospital Suitability Filtering Module (Stage 5)
 * Evaluates candidate facilities against confirmed clinical requirements,
 * verified equipment capacity, compatible operating theatre readiness,
 * and on-duty specialist teams per care objective.
 */
export function runAgent2(
  confirmedFullCareNeeds: string[],
  confirmedStabilizationNeeds: string[],
  hospitals: HospitalDto[],
  getResourcePools: (hospId: string) => ResourcePoolDto[],
  getStaff: (hospId: string) => StaffAvailabilityDto[],
  options?: {
    requiredIntervention?: RequiredIntervention;
    evaluationTime?: string;
  }
): HospitalEvaluation[] {
  const reqIntervention = options?.requiredIntervention || 'UNKNOWN';

  return hospitals.map((hosp) => {
    const fullCareReasons: string[] = [];
    const stabilizationReasons: string[] = [];
    const missingFullCareCapabilities: string[] = [];
    const missingStabilizationCapabilities: string[] = [];
    const policyReasonCodes: string[] = [];

    const pools = getResourcePools(hosp.id);
    const staff = getStaff(hosp.id);

    let fullCareStatus: EvaluationStatus = 'ELIGIBLE_NOW';
    let stabilizationStatus: EvaluationStatus = 'ELIGIBLE_NOW';

    let theatreReady = true;
    let theatreWaitSeconds = 0;
    let specialistTeamReady = true;
    let specialistWaitSeconds = 0;

    // 1. Check Receiving Status
    if (hosp.receivingStatus === ReceivingStatus.DIVERT_ALL) {
      const reason = `${hosp.name} is currently on complete intake divert (DIVERT_ALL).`;
      return {
        hospital: hosp,
        isFullCareEligible: false,
        isStabilizationEligible: false,
        fullCareStatus: 'INELIGIBLE',
        stabilizationStatus: 'INELIGIBLE',
        fullCareReasons: [reason],
        stabilizationReasons: [reason],
        missingFullCareCapabilities: ['RECEIVING_STATUS_DIVERT'],
        missingStabilizationCapabilities: ['RECEIVING_STATUS_DIVERT'],
        theatreReady: false,
        theatreWaitSeconds: 0,
        specialistTeamReady: false,
        specialistWaitSeconds: 0,
        immediateCareReadyAtSeconds: 0,
        definitiveCareReadyAtSeconds: 0,
        policyReasonCodes: ['HOSPITAL_DIVERT_ALL'],
      };
    }

    // 2. Full-Care Capability Matching
    let fullCareMatches = true;
    for (const need of confirmedFullCareNeeds) {
      const hasCap =
        hosp.capabilities.includes(need) ||
        (need === 'OPERATING_THEATRE' &&
          ((hosp.surgicalSummary?.operatingTheatresTotal ?? 0) > 0 ||
            hosp.surgicalSummary?.emergencySupported === true ||
            (hosp as any).serviceReadyAtSeconds?.OPERATING_THEATRE !== undefined));
      if (!hasCap) {
        fullCareMatches = false;
        missingFullCareCapabilities.push(need);
      }
    }

    // 3. Equipment Inventory Check for Full-Care
    if (confirmedFullCareNeeds.includes('VENTILATORS')) {
      const ventPool = pools.find((p) => p.resourceType === ResourceType.VENTILATOR);
      if (!ventPool) {
        fullCareStatus = 'UNKNOWN';
        fullCareMatches = false;
        missingFullCareCapabilities.push('VENTILATOR_POOL_UNKNOWN');
        fullCareReasons.push('Ventilator resource pool data unknown.');
      } else if (ventPool.availableCount <= 0) {
        fullCareMatches = false;
        fullCareStatus = 'INELIGIBLE';
        missingFullCareCapabilities.push('VENTILATOR_CAPACITY_ZERO');
        fullCareReasons.push('Zero allocatable mechanical ventilators currently available in pool.');
      } else {
        fullCareReasons.push(`${ventPool.availableCount} allocatable ventilator(s) confirmed available.`);
      }
    }

    if (confirmedFullCareNeeds.includes('CT_SCAN')) {
      const ctPool = pools.find((p) => p.resourceType === ResourceType.CT_SCAN);
      if (!ctPool && hosp.capabilities.includes('CT_SCAN')) {
        // Pool not tracked but facility has capability
      } else if (ctPool && ctPool.availableCount <= 0) {
        fullCareMatches = false;
        fullCareStatus = 'INELIGIBLE';
        missingFullCareCapabilities.push('CT_SCAN_UNAVAILABLE');
      }
    }

    if (confirmedFullCareNeeds.includes('ICU')) {
      const icuPool = pools.find((p) => p.resourceType === ResourceType.ICU_BED);
      if (!icuPool && hosp.capabilities.includes('ICU')) {
        // Pool not tracked
      } else if (icuPool && icuPool.availableCount <= 0) {
        fullCareMatches = false;
        fullCareStatus = 'INELIGIBLE';
        missingFullCareCapabilities.push('ICU_CAPACITY_ZERO');
        fullCareReasons.push('Zero allocatable ICU beds currently available.');
      } else if (icuPool) {
        fullCareReasons.push(`${icuPool.availableCount} allocatable ICU bed(s) confirmed available.`);
      }
    }

    if (confirmedFullCareNeeds.includes('CARDIAC_CATH')) {
      const cathPool = pools.find((p) => p.resourceType === ResourceType.CATH_LAB);
      if (cathPool && cathPool.availableCount <= 0) {
        fullCareMatches = false;
        fullCareStatus = 'INELIGIBLE';
        missingFullCareCapabilities.push('CATH_LAB_UNAVAILABLE');
        fullCareReasons.push('Cardiac catheterization lab not currently available.');
      }
    }

    // 4. Operating Theatre & Specialist Staff Readiness for Full-Care
    const dynamicReady = (hosp as any).serviceReadyAtSeconds;
    if (dynamicReady && typeof dynamicReady === 'object') {
      if (typeof dynamicReady.OPERATING_THEATRE === 'number') {
        theatreWaitSeconds = dynamicReady.OPERATING_THEATRE;
        if (theatreWaitSeconds > 600) {
          theatreReady = false;
          policyReasonCodes.push('THEATRE_NOT_READY_AT_ARRIVAL');
          fullCareReasons.push(`Operating theatre turnover delayed (+${Math.round(theatreWaitSeconds / 60)}m wait).`);
        }
      }
      if (typeof dynamicReady.GENERAL_SURGERY === 'number') {
        const surgeryWait = dynamicReady.GENERAL_SURGERY;
        if (surgeryWait > theatreWaitSeconds) {
          theatreWaitSeconds = surgeryWait;
          theatreReady = false;
        }
      }
    } else if (hosp.operationalProfile === 'THEATRE_OCCUPIED') {
      theatreWaitSeconds = 900;
      theatreReady = false;
      policyReasonCodes.push('THEATRE_NOT_READY_AT_ARRIVAL');
      fullCareReasons.push('Emergency operating theatre occupied; turnover in progress.');
    }

    if (confirmedFullCareNeeds.includes('NEUROSURGERY') || reqIntervention === 'NEUROSURGERY') {
      if (!hosp.capabilities.includes('NEUROSURGERY')) {
        fullCareMatches = false;
        policyReasonCodes.push('NEARER_FACILITY_MISSING_REQUIRED_SERVICE');
      } else {
        const neuroStaff = staff.find((s) => s.specialty === SpecialtyType.NEUROSURGEON);
        if (neuroStaff && neuroStaff.availableTeamSlots <= 0) {
          fullCareMatches = false;
          fullCareStatus = 'INELIGIBLE';
          specialistTeamReady = false;
          missingFullCareCapabilities.push('NEUROSURGERY_TEAM_UNAVAILABLE');
          policyReasonCodes.push('SPECIALIST_TEAM_UNAVAILABLE');
          fullCareReasons.push('Neurosurgical specialty team slots fully committed or unavailable.');
        } else if (neuroStaff) {
          fullCareReasons.push(`${neuroStaff.availableTeamSlots} on-call neurosurgical surgical team ready.`);
        }
      }
    }

    if (confirmedFullCareNeeds.includes('TRAUMA_L1')) {
      const traumaStaff = staff.find((s) => s.specialty === SpecialtyType.TRAUMA_SURGEON);
      if (traumaStaff && traumaStaff.availableTeamSlots <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('TRAUMA_SURGEON_UNAVAILABLE');
      } else if (traumaStaff) {
        fullCareReasons.push(`${traumaStaff.availableTeamSlots} trauma surgical team slot(s) verified.`);
      }
    }

    // 5. Operating Theatre requirement check for general surgery
    if (confirmedFullCareNeeds.includes('OPERATING_THEATRE') || reqIntervention === 'GENERAL_SURGERY') {
      const hasOT =
        hosp.capabilities.includes('OPERATING_THEATRE') ||
        ((hosp.surgicalSummary?.operatingTheatresTotal ?? 0) > 0 ||
          hosp.surgicalSummary?.emergencySupported === true ||
          (hosp as any).serviceReadyAtSeconds?.OPERATING_THEATRE !== undefined);
      if (!hasOT) {
        fullCareMatches = false;
        if (!missingFullCareCapabilities.includes('OPERATING_THEATRE')) {
          missingFullCareCapabilities.push('OPERATING_THEATRE');
        }
      }
    }

    if (fullCareMatches && fullCareStatus !== 'INELIGIBLE') {
      fullCareStatus = theatreReady && specialistTeamReady ? 'ELIGIBLE_NOW' : 'ELIGIBLE_AT_TIME';
      fullCareReasons.push(`All ${confirmedFullCareNeeds.length} definitive care clinical requirements verified.`);
    } else {
      fullCareStatus = 'INELIGIBLE';
      fullCareReasons.push(`Lacks required definitive capabilities: ${missingFullCareCapabilities.join(', ')}.`);
    }

    // 6. Stabilization Capability Matching
    let stabilizationMatches = true;
    for (const need of confirmedStabilizationNeeds) {
      if (!hosp.capabilities.includes(need) && need !== 'TRAUMA_BAY') {
        stabilizationMatches = false;
        missingStabilizationCapabilities.push(need);
      }
    }

    // Bugfix for Table 38: Check resuscitation pool strictly.
    // If stabilization requires TRAUMA_BAY or STABILIZATION:
    if (confirmedStabilizationNeeds.includes('STABILIZATION') || confirmedStabilizationNeeds.includes('TRAUMA_BAY')) {
      const stabPool = pools.find((p) => p.resourceType === ResourceType.TRAUMA_BAY);
      if (!hosp.capabilities.includes('STABILIZATION')) {
        stabilizationMatches = false;
        stabilizationStatus = 'INELIGIBLE';
        missingStabilizationCapabilities.push('STABILIZATION');
        stabilizationReasons.push('Facility lacks certified resuscitation/stabilization bay capability.');
      } else if (!stabPool) {
        stabilizationMatches = false;
        stabilizationStatus = 'UNKNOWN';
        missingStabilizationCapabilities.push('TRAUMA_BAY_POOL_UNAVAILABLE');
        stabilizationReasons.push('No trauma bay resource pool telemetry recorded; availability cannot be verified.');
      } else if (stabPool.availableCount <= 0) {
        stabilizationMatches = false;
        stabilizationStatus = 'INELIGIBLE';
        missingStabilizationCapabilities.push('TRAUMA_BAY_CAPACITY_ZERO');
        stabilizationReasons.push('All resuscitation / stabilization trauma bays currently occupied.');
      }
    }

    if (hosp.capabilitiesDetail?.['EMERGENCY_DEPT']?.isOpenNow === false) {
      stabilizationMatches = false;
      stabilizationStatus = 'INELIGIBLE';
      missingStabilizationCapabilities.push('EMERGENCY_DEPT_CLOSED');
      stabilizationReasons.push('Emergency department is currently closed.');
      fullCareMatches = false;
      fullCareStatus = 'INELIGIBLE';
      missingFullCareCapabilities.push('EMERGENCY_DEPT_CLOSED');
      fullCareReasons.push('Emergency department is currently closed.');
    }

    // 7. Ready-at Offsets per objective
    let immediateCareReadyAtSeconds = 0;
    if (dynamicReady && typeof dynamicReady.STABILIZATION === 'number') {
      immediateCareReadyAtSeconds = dynamicReady.STABILIZATION;
    }

    let definitiveCareReadyAtSeconds = 0;
    if (reqIntervention === 'NEUROSURGERY') {
      definitiveCareReadyAtSeconds = dynamicReady?.NEUROSURGERY ?? (hosp.operationalProfile === 'SPECIALIST_ON_CALL' ? 480 : 0);
    } else if (reqIntervention === 'GENERAL_SURGERY') {
      definitiveCareReadyAtSeconds = theatreWaitSeconds;
    } else if (reqIntervention === 'CARDIAC_CATH') {
      definitiveCareReadyAtSeconds = dynamicReady?.CARDIAC_CATH ?? (hosp.operationalProfile === 'THEATRE_OCCUPIED' ? 600 : 0);
    }

    if (stabilizationMatches && stabilizationStatus !== 'INELIGIBLE' && stabilizationStatus !== 'UNKNOWN') {
      stabilizationStatus = immediateCareReadyAtSeconds > 0 ? 'ELIGIBLE_AT_TIME' : 'ELIGIBLE_NOW';
      stabilizationReasons.push(`Capable of immediate emergency stabilization (${confirmedStabilizationNeeds.join(', ')}).`);
    } else if (stabilizationStatus !== 'UNKNOWN') {
      stabilizationStatus = 'INELIGIBLE';
      stabilizationReasons.push(`Missing immediate stabilization capabilities: ${missingStabilizationCapabilities.join(', ')}.`);
    }

    const isFullCareEligible = fullCareMatches && (fullCareStatus === 'ELIGIBLE_NOW' || fullCareStatus === 'ELIGIBLE_AT_TIME');
    const isStabilizationEligible = stabilizationMatches && (stabilizationStatus === 'ELIGIBLE_NOW' || stabilizationStatus === 'ELIGIBLE_AT_TIME');

    return {
      hospital: hosp,
      isFullCareEligible,
      isStabilizationEligible,
      fullCareStatus,
      stabilizationStatus,
      fullCareReasons,
      stabilizationReasons,
      missingFullCareCapabilities,
      missingStabilizationCapabilities,
      theatreReady,
      theatreWaitSeconds,
      specialistTeamReady,
      specialistWaitSeconds,
      immediateCareReadyAtSeconds,
      definitiveCareReadyAtSeconds,
      policyReasonCodes,
    };
  });
}
