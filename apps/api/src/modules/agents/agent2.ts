import {
  HospitalDto,
  ResourcePoolDto,
  StaffAvailabilityDto,
  ReceivingStatus,
  ResourceType,
  SpecialtyType,
} from '@goldenhour/contracts';

export interface HospitalEvaluation {
  hospital: HospitalDto;
  isFullCareEligible: boolean;
  isStabilizationEligible: boolean;
  fullCareReasons: string[];
  stabilizationReasons: string[];
  missingFullCareCapabilities: string[];
  missingStabilizationCapabilities: string[];
}

/**
 * Agent 2 — Hospital Suitability Filtering Module
 * Evaluates candidate facilities against confirmed clinical requirements,
 * verified equipment capacity, and on-duty specialist teams.
 */
export function runAgent2(
  confirmedFullCareNeeds: string[],
  confirmedStabilizationNeeds: string[],
  hospitals: HospitalDto[],
  getResourcePools: (hospId: string) => ResourcePoolDto[],
  getStaff: (hospId: string) => StaffAvailabilityDto[]
): HospitalEvaluation[] {
  return hospitals.map((hosp) => {
    const fullCareReasons: string[] = [];
    const stabilizationReasons: string[] = [];
    const missingFullCareCapabilities: string[] = [];
    const missingStabilizationCapabilities: string[] = [];

    const pools = getResourcePools(hosp.id);
    const staff = getStaff(hosp.id);

    // 1. Check Receiving Status
    if (hosp.receivingStatus === ReceivingStatus.DIVERT_ALL) {
      const reason = `${hosp.name} is currently on complete intake divert (DIVERT_ALL).`;
      return {
        hospital: hosp,
        isFullCareEligible: false,
        isStabilizationEligible: false,
        fullCareReasons: [reason],
        stabilizationReasons: [reason],
        missingFullCareCapabilities: ['RECEIVING_STATUS_DIVERT'],
        missingStabilizationCapabilities: ['RECEIVING_STATUS_DIVERT'],
      };
    }

    // 2. Full-Care Capability Matching
    let fullCareMatches = true;
    for (const need of confirmedFullCareNeeds) {
      if (!hosp.capabilities.includes(need)) {
        fullCareMatches = false;
        missingFullCareCapabilities.push(need);
      }
    }

    // 3. Equipment Inventory Check for Full-Care
    if (confirmedFullCareNeeds.includes('VENTILATORS')) {
      const ventPool = pools.find((p) => p.resourceType === ResourceType.VENTILATOR);
      if (!ventPool || ventPool.availableCount <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('VENTILATOR_CAPACITY_ZERO');
        fullCareReasons.push('Zero allocatable mechanical ventilators currently available in pool.');
      } else {
        fullCareReasons.push(`${ventPool.availableCount} allocatable ventilator(s) confirmed available.`);
      }
    }

    if (confirmedFullCareNeeds.includes('CT_SCAN')) {
      const ctPool = pools.find((p) => p.resourceType === ResourceType.CT_SCAN);
      if (!ctPool || ctPool.availableCount <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('CT_SCAN_UNAVAILABLE');
      }
    }

    if (confirmedFullCareNeeds.includes('ICU')) {
      const icuPool = pools.find((p) => p.resourceType === ResourceType.ICU_BED);
      if (!icuPool || icuPool.availableCount <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('ICU_CAPACITY_ZERO');
        fullCareReasons.push('Zero allocatable ICU beds currently available.');
      } else {
        fullCareReasons.push(`${icuPool.availableCount} allocatable ICU bed(s) confirmed available.`);
      }
    }

    if (confirmedFullCareNeeds.includes('CARDIAC_CATH')) {
      const cathPool = pools.find((p) => p.resourceType === ResourceType.CATH_LAB);
      if (!cathPool || cathPool.availableCount <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('CATH_LAB_UNAVAILABLE');
        fullCareReasons.push('Cardiac catheterization lab not currently available.');
      }
    }

    // 4. Specialist Staff Readiness for Full-Care
    if (confirmedFullCareNeeds.includes('NEUROSURGERY')) {
      const neuroStaff = staff.find((s) => s.specialty === SpecialtyType.NEUROSURGEON);
      if (!neuroStaff || neuroStaff.availableTeamSlots <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('NEUROSURGERY_TEAM_UNAVAILABLE');
        fullCareReasons.push('Neurosurgical specialty team slots fully committed or unavailable.');
      } else {
        fullCareReasons.push(`${neuroStaff.availableTeamSlots} on-call neurosurgical surgical team ready.`);
      }
    }

    if (confirmedFullCareNeeds.includes('TRAUMA_L1')) {
      const traumaStaff = staff.find((s) => s.specialty === SpecialtyType.TRAUMA_SURGEON);
      if (!traumaStaff || traumaStaff.availableTeamSlots <= 0) {
        fullCareMatches = false;
        missingFullCareCapabilities.push('TRAUMA_SURGEON_UNAVAILABLE');
      } else {
        fullCareReasons.push(`${traumaStaff.availableTeamSlots} trauma surgical team slot(s) verified.`);
      }
    }

    if (fullCareMatches) {
      fullCareReasons.push(`All ${confirmedFullCareNeeds.length} definitive care clinical requirements verified.`);
    } else {
      fullCareReasons.push(`Lacks required definitive capabilities: ${missingFullCareCapabilities.join(', ')}.`);
    }

    // 5. Stabilization Capability Matching
    let stabilizationMatches = true;
    for (const need of confirmedStabilizationNeeds) {
      if (!hosp.capabilities.includes(need) && need !== 'TRAUMA_BAY') {
        stabilizationMatches = false;
        missingStabilizationCapabilities.push(need);
      }
    }

    if (confirmedStabilizationNeeds.includes('STABILIZATION') || confirmedStabilizationNeeds.includes('TRAUMA_BAY')) {
      const stabPool = pools.find((p) => p.resourceType === ResourceType.TRAUMA_BAY);
      if (stabPool && stabPool.availableCount <= 0) {
        stabilizationMatches = false;
        missingStabilizationCapabilities.push('TRAUMA_BAY_CAPACITY_ZERO');
        stabilizationReasons.push('All resuscitation / stabilization trauma bays currently occupied.');
      }
    }

    if (stabilizationMatches) {
      stabilizationReasons.push(`Capable of immediate emergency stabilization (${confirmedStabilizationNeeds.join(', ')}).`);
    } else {
      stabilizationReasons.push(`Missing immediate stabilization capabilities: ${missingStabilizationCapabilities.join(', ')}.`);
    }

    return {
      hospital: hosp,
      isFullCareEligible: fullCareMatches,
      isStabilizationEligible: stabilizationMatches,
      fullCareReasons,
      stabilizationReasons,
      missingFullCareCapabilities,
      missingStabilizationCapabilities,
    };
  });
}
