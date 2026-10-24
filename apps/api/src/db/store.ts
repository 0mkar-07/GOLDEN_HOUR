import {
  UserDto,
  HospitalDto,
  StaffAvailabilityDto,
  ResourcePoolDto,
  AllocationDto,
  EmergencyCaseDto,
  AssessmentDto,
  DestinationDto,
  HospitalRequestDto,
  AuditEventDto,
  OutboxEventDto,
  SimulationRunDto,
  AllocationState,
  UserRole,
  ResourceType,
  CaseStatus,
} from '@goldenhour/contracts';
import {
  SEEDED_HOSPITALS,
  SEEDED_RESOURCE_POOLS,
  SEEDED_STAFF_AVAILABILITY,
  SEEDED_USERS,
  SEEDED_ROAD_GRAPH,
} from '@goldenhour/scenario-fixtures';
import { hashPassword } from '../modules/auth/password.js';

export interface UserRecord extends UserDto {
  passwordHash: string;
}

/**
 * Authoritative in-memory / unified database repository.
 * Enforces PostgreSQL-compatible constraints, foreign keys, version increments, and non-negative counts.
 */
class GoldenHourDatabaseStore {
  public users: Map<string, UserRecord> = new Map();
  public hospitals: Map<string, HospitalDto> = new Map();
  public staffAvailability: Map<string, StaffAvailabilityDto> = new Map();
  public resourcePools: Map<string, ResourcePoolDto> = new Map();
  public allocations: Map<string, AllocationDto> = new Map();
  public cases: Map<string, EmergencyCaseDto> = new Map();
  public assessments: Map<string, AssessmentDto> = new Map();
  public destinations: Map<string, DestinationDto> = new Map();
  public hospitalRequests: Map<string, HospitalRequestDto> = new Map();
  public auditEvents: AuditEventDto[] = [];
  public outboxEvents: OutboxEventDto[] = [];
  public simulationRun: SimulationRunDto = {
    id: 'sim-default',
    seed: 'goldenhour-2026',
    running: false,
    speedMultiplier: 1.0,
    simulatedSeconds: 0,
    scenarioStep: 'INITIAL',
    updatedAt: new Date().toISOString(),
  };

  private seeded = false;

  /**
   * Idempotent seeding mechanism
   */
  public async seed(): Promise<void> {
    // 1. Seed Hospitals
    for (const hosp of SEEDED_HOSPITALS) {
      if (!this.hospitals.has(hosp.id)) {
        this.hospitals.set(hosp.id, { ...hosp });
      }
    }

    // 2. Seed Resource Pools
    for (const pool of SEEDED_RESOURCE_POOLS) {
      if (!this.resourcePools.has(pool.id)) {
        this.resourcePools.set(pool.id, { ...pool });
      }
    }

    // 3. Seed Staff Availability
    for (const staff of SEEDED_STAFF_AVAILABILITY) {
      if (!this.staffAvailability.has(staff.id)) {
        this.staffAvailability.set(staff.id, { ...staff });
      }
    }

    // 4. Seed Users with Scrypt Hashed Passwords
    for (const u of SEEDED_USERS) {
      const existing = Array.from(this.users.values()).find((user) => user.email === u.email);
      if (!existing) {
        const passwordHash = await hashPassword(u.passwordCleartext);
        const userRecord: UserRecord = {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          hospitalId: u.hospitalId ?? null,
          ambulanceId: u.ambulanceId ?? null,
          active: u.active,
          createdAt: u.createdAt,
          passwordHash,
        };
        this.users.set(u.id, userRecord);
      }
    }

    this.seeded = true;
    console.log(`[Store] Seeded ${this.hospitals.size} hospitals and ${this.users.size} demo users.`);
  }

  // --- User Operations ---
  public getUserByEmail(email: string): UserRecord | undefined {
    return Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  // --- Hospital Operations ---
  public getHospital(id: string): HospitalDto | undefined {
    return this.hospitals.get(id);
  }

  public listHospitals(): HospitalDto[] {
    return Array.from(this.hospitals.values());
  }

  public updateHospital(id: string, updates: Partial<HospitalDto>, expectedVersion?: number): HospitalDto {
    const hospital = this.hospitals.get(id);
    if (!hospital) {
      throw new Error(`Hospital not found: ${id}`);
    }
    if (expectedVersion !== undefined && hospital.version !== expectedVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, got ${hospital.version}`);
    }

    const updated: HospitalDto = {
      ...hospital,
      ...updates,
      version: hospital.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.hospitals.set(id, updated);
    return updated;
  }

  // --- Resource Pool Operations ---
  public listResourcePoolsByHospital(hospitalId: string): ResourcePoolDto[] {
    return Array.from(this.resourcePools.values()).filter((p) => p.hospitalId === hospitalId);
  }

  public getResourcePool(id: string): ResourcePoolDto | undefined {
    return this.resourcePools.get(id);
  }

  public updateResourcePool(
    id: string,
    updates: {
      totalCount?: number;
      outOfServiceCount?: number;
      externalOccupancy?: number;
      expectedVersion: number;
    }
  ): ResourcePoolDto {
    const pool = this.resourcePools.get(id);
    if (!pool) {
      throw new Error(`Resource pool not found: ${id}`);
    }

    if (pool.version !== updates.expectedVersion) {
      throw new Error(`Version conflict on resource pool: expected ${updates.expectedVersion}, got ${pool.version}`);
    }

    const totalCount = updates.totalCount ?? pool.totalCount;
    const outOfServiceCount = updates.outOfServiceCount ?? pool.outOfServiceCount;
    const externalOccupancy = updates.externalOccupancy ?? pool.externalOccupancy;

    if (totalCount < 0 || outOfServiceCount < 0 || externalOccupancy < 0) {
      throw new Error('Resource counts cannot be negative');
    }

    // Invariant check: outOfService + external + reserved + inUse <= total
    const committed = outOfServiceCount + externalOccupancy + pool.reservedCount + pool.inUseCount;
    if (committed > totalCount) {
      throw new Error(
        `Cannot reduce total capacity to ${totalCount}; committed resources (${committed}) would exceed capacity.`
      );
    }

    // Calculated available
    const availableCount = totalCount - committed;

    const updated: ResourcePoolDto = {
      ...pool,
      totalCount,
      outOfServiceCount,
      externalOccupancy,
      availableCount,
      version: pool.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.resourcePools.set(id, updated);
    return updated;
  }

  // --- Staff Availability Operations ---
  public listStaffByHospital(hospitalId: string): StaffAvailabilityDto[] {
    return Array.from(this.staffAvailability.values()).filter((s) => s.hospitalId === hospitalId);
  }

  public getStaff(id: string): StaffAvailabilityDto | undefined {
    return this.staffAvailability.get(id);
  }

  public updateStaffAvailability(
    id: string,
    updates: {
      availableTeamSlots?: number;
      readyAt?: string;
      expectedVersion: number;
    }
  ): StaffAvailabilityDto {
    const staff = this.staffAvailability.get(id);
    if (!staff) {
      throw new Error(`Staff availability record not found: ${id}`);
    }

    if (staff.version !== updates.expectedVersion) {
      throw new Error(`Version conflict on staff availability: expected ${updates.expectedVersion}, got ${staff.version}`);
    }

    const availableTeamSlots = updates.availableTeamSlots ?? staff.availableTeamSlots;
    if (availableTeamSlots < 0) {
      throw new Error('Available team slots cannot be negative');
    }

    const readyAt = updates.readyAt ?? staff.readyAt;

    const updated: StaffAvailabilityDto = {
      ...staff,
      availableTeamSlots,
      readyAt,
      version: staff.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.staffAvailability.set(id, updated);
    return updated;
  }

  // --- Case & Assessment Operations ---
  public createCase(patientLabel: string, assignedAmbulanceId = 'amb-104'): EmergencyCaseDto {
    const id = `case-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newCase: EmergencyCaseDto = {
      id,
      assignedAmbulanceId,
      caseStatus: CaseStatus.DRAFT,
      patientLabel,
      assessmentVersion: 0,
      destinationVersion: 0,
      selectedHospitalId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(id, newCase);
    return newCase;
  }

  public getCase(id: string): EmergencyCaseDto | undefined {
    return this.cases.get(id);
  }

  public listCases(ambulanceId?: string): EmergencyCaseDto[] {
    const all = Array.from(this.cases.values());
    if (ambulanceId) {
      return all.filter((c) => c.assignedAmbulanceId === ambulanceId);
    }
    return all;
  }

  public createAssessment(
    caseId: string,
    observations: any,
    proposedFullCareNeeds: string[],
    proposedStabilizationNeeds: string[]
  ): AssessmentDto {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const nextVersion = emergencyCase.assessmentVersion + 1;
    const assessmentId = `assess-${caseId}-v${nextVersion}`;
    const now = new Date().toISOString();

    const assessment: AssessmentDto = {
      id: assessmentId,
      caseId,
      version: nextVersion,
      observations,
      proposedFullCareNeeds,
      proposedStabilizationNeeds,
      confirmedFullCareNeeds: [],
      confirmedStabilizationNeeds: [],
      clinicianConfirmed: false,
      confirmedAt: null,
      confirmedBy: null,
      createdAt: now,
    };

    this.assessments.set(assessmentId, assessment);

    // Update case assessment version and invalidate previous recommendations
    emergencyCase.assessmentVersion = nextVersion;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    return assessment;
  }

  public getLatestAssessment(caseId: string): AssessmentDto | undefined {
    const caseAssessments = Array.from(this.assessments.values())
      .filter((a) => a.caseId === caseId)
      .sort((a, b) => b.version - a.version);
    return caseAssessments[0];
  }

  public confirmRequirements(
    caseId: string,
    assessmentVersion: number,
    confirmedFullCareNeeds: string[],
    confirmedStabilizationNeeds: string[],
    confirmedByUserId: string
  ): AssessmentDto {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    if (emergencyCase.assessmentVersion !== assessmentVersion) {
      throw new Error(
        `Version conflict: Current assessment version is v${emergencyCase.assessmentVersion}, cannot confirm stale version v${assessmentVersion}`
      );
    }

    const assessment = this.getLatestAssessment(caseId);
    if (!assessment || assessment.version !== assessmentVersion) {
      throw new Error(`Assessment not found for case ${caseId} at version ${assessmentVersion}`);
    }

    const now = new Date().toISOString();
    const updatedAssessment: AssessmentDto = {
      ...assessment,
      confirmedFullCareNeeds,
      confirmedStabilizationNeeds,
      clinicianConfirmed: true,
      confirmedAt: now,
      confirmedBy: confirmedByUserId,
    };

    this.assessments.set(assessment.id, updatedAssessment);

    // Update case status to ASSESSED
    emergencyCase.caseStatus = CaseStatus.ASSESSED;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    return updatedAssessment;
  }

  // --- Audit Events ---
  public recordAudit(event: Omit<AuditEventDto, 'id' | 'timestamp'>): AuditEventDto {
    const audit: AuditEventDto = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditEvents.push(audit);
    return audit;
  }
}

export const store = new GoldenHourDatabaseStore();
