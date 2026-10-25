import { CAPABILITY_CATALOGUE, CapabilityCode } from '@goldenhour/contracts';
import { store } from '../../db/store.js';

export interface HospitalReadinessSummary {
  hospitalId: string;
  name: string;
  receivingStatus: string;
  receivingDelaySeconds: number;
  capabilities: string[];
  resources: Array<{
    type: string;
    available: number;
    total: number;
  }>;
  staff: Array<{
    specialty: string;
    availableTeamSlots: number;
    readyAt?: string;
  }>;
  surgicalServices: {
    theatresActive: number;
    electiveSupported: boolean | null;
    emergencySupported: boolean | null;
    turnoverWaitSeconds?: number;
  };
  serviceReadyAtSeconds?: Record<string, number>;
  limitingReason?: string;
  roadAccessPoint?: { lat: number; lng: number };
}

/**
 * Stage 8 Read-only Agent Tools
 */
export const agentTools = {
  /**
   * Retrieves all verified capability codes, descriptions, and categories.
   */
  getCapabilityDefinitions(): Record<string, any> {
    return CAPABILITY_CATALOGUE;
  },

  /**
   * Retrieves live resource counts, receiving status, and specialist readiness for a facility.
   */
  getHospitalReadiness(hospitalId: string): HospitalReadinessSummary | null {
    const hosp = store.getHospital(hospitalId);
    if (!hosp) return null;

    const pools = store.listResourcePools(hosp.id);
    const staff = store.listStaffAvailability(hosp.id);
    const theatres = store.listOperatingTheatres(hosp.id);

    return {
      hospitalId: hosp.id,
      name: hosp.name,
      receivingStatus: hosp.receivingStatus,
      receivingDelaySeconds: hosp.receivingDelaySeconds,
      capabilities: hosp.capabilities,
      resources: pools.map((p) => ({
        type: p.resourceType,
        available: p.availableCount,
        total: p.totalCount,
      })),
      staff: staff.map((s) => ({
        specialty: s.specialty,
        availableTeamSlots: s.availableTeamSlots,
        readyAt: s.readyAt,
      })),
      surgicalServices: {
        theatresActive: theatres.filter((t) => t.active).length,
        electiveSupported: hosp.surgicalSummary?.electiveSupported ?? null,
        emergencySupported: hosp.surgicalSummary?.emergencySupported ?? null,
        turnoverWaitSeconds: (hosp as any).serviceReadyAtSeconds?.OPERATING_THEATRE ?? 0,
      },
      serviceReadyAtSeconds: (hosp as any).serviceReadyAtSeconds,
      limitingReason: (hosp as any).limitingReason,
      roadAccessPoint: (hosp as any).roadAccessPoint,
    };
  },

  /**
   * Checks whether essential services (Emergency Dept, Operating Theatres) are active at expected arrival.
   */
  getServiceHoursAtArrival(
    hospitalId: string,
    estimatedArrivalSeconds: number
  ): {
    hospitalId: string;
    estimatedArrivalIso: string;
    emergencyDeptOpen: boolean;
    operatingTheatreOpen: boolean;
    services: any[];
  } {
    const hosp = store.getHospital(hospitalId);
    const arrivalTime = new Date(Date.now() + estimatedArrivalSeconds * 1000);
    const services = hosp ? store.getHospitalServices(hosp.id) : [];

    const edService = services.find((s) => s.serviceType === 'EMERGENCY_DEPT');
    const otService = services.find((s) => s.serviceType === 'OPERATING_THEATRE');

    return {
      hospitalId: hosp?.id || hospitalId,
      estimatedArrivalIso: arrivalTime.toISOString(),
      emergencyDeptOpen: edService ? edService.is24x7 : true,
      operatingTheatreOpen: otService ? otService.is24x7 : true,
      services,
    };
  },
};
