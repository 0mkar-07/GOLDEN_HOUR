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
  RecommendationDto,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  DestinationActor,
  SpecialtyType,
  SystemSettingsDto,
  AuditFilterQueryDto,
  AdminOverviewDto,
  AdminHospitalUpdateDto,
  ReceivingStatus,
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
  public recommendations: Map<string, RecommendationDto> = new Map();
  public trafficOverrides: Record<string, number> = {};
  public ambulancePosition = {
    x: 120,
    y: 150,
    lat: 40.71,
    lng: -74.02,
    speed: 0,
    heading: 85,
    serverSequence: 1,
    observedAt: new Date().toISOString(),
  };
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
  public systemSettings: SystemSettingsDto = {
    demoRefreshIntervalSeconds: 5,
    stalenessThresholdSeconds: 15,
    rankingImprovementMarginSeconds: 120,
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

  // --- Recommendation & Position Operations ---
  public setRecommendation(caseId: string, recommendation: RecommendationDto): void {
    this.recommendations.set(caseId, recommendation);
  }

  public getRecommendation(caseId: string): RecommendationDto | undefined {
    return this.recommendations.get(caseId);
  }

  public updateAmbulancePosition(x: number, y: number, lat: number, lng: number): void {
    this.ambulancePosition = {
      x,
      y,
      lat,
      lng,
      speed: 45,
      heading: this.ambulancePosition.heading,
      serverSequence: this.ambulancePosition.serverSequence + 1,
      observedAt: new Date().toISOString(),
    };
  }

  public setTrafficOverride(edgeId: string, multiplier: number): void {
    this.trafficOverrides[edgeId] = multiplier;
  }

  public clearTrafficOverrides(): void {
    this.trafficOverrides = {};
  }

  // --- Dispatch & Request Operations (Phase 6) ---
  public dispatchCase(caseId: string, actorUserId: string): {
    case: EmergencyCaseDto;
    requests: HospitalRequestDto[];
    destination: DestinationDto;
  } {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const rec = this.recommendations.get(caseId);
    if (!rec || !rec.hospitalA) {
      throw new Error(`Cannot dispatch case ${caseId}: No confirmed destination recommendation available.`);
    }

    const now = new Date().toISOString();
    const generation = emergencyCase.destinationVersion + 1;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const createdRequests: HospitalRequestDto[] = [];

    // 1. Create Main Request for Hospital A
    const mainReq: HospitalRequestDto = {
      id: `req-main-${caseId}-gen${generation}`,
      caseId,
      hospitalId: rec.hospitalA.hospitalId,
      role: RequestRole.MAIN,
      status: RequestStatus.PENDING,
      destinationGeneration: generation,
      expiresAt,
      respondedAt: null,
      createdAt: now,
    };
    this.hospitalRequests.set(mainReq.id, mainReq);
    createdRequests.push(mainReq);

    // 2. Create Standby Request for Hospital B
    if (rec.hospitalB) {
      const standbyReqB: HospitalRequestDto = {
        id: `req-sb-b-${caseId}-gen${generation}`,
        caseId,
        hospitalId: rec.hospitalB.hospitalId,
        role: RequestRole.STANDBY,
        status: RequestStatus.PENDING,
        destinationGeneration: generation,
        expiresAt,
        respondedAt: null,
        createdAt: now,
      };
      this.hospitalRequests.set(standbyReqB.id, standbyReqB);
      createdRequests.push(standbyReqB);
    }

    // 3. Create Standby Request for Hospital C
    if (rec.hospitalC) {
      const standbyReqC: HospitalRequestDto = {
        id: `req-sb-c-${caseId}-gen${generation}`,
        caseId,
        hospitalId: rec.hospitalC.hospitalId,
        role: RequestRole.STANDBY,
        status: RequestStatus.PENDING,
        destinationGeneration: generation,
        expiresAt,
        respondedAt: null,
        createdAt: now,
      };
      this.hospitalRequests.set(standbyReqC.id, standbyReqC);
      createdRequests.push(standbyReqC);
    }

    // 4. Update Destination Record
    const destination: DestinationDto = {
      caseId,
      hospitalId: rec.hospitalA.hospitalId,
      readiness: DestinationReadiness.PENDING,
      version: generation,
      selectedBy: DestinationActor.CLINICIAN,
      updatedAt: now,
    };
    this.destinations.set(caseId, destination);

    // 5. Update Case State
    emergencyCase.caseStatus = CaseStatus.DISPATCHING;
    emergencyCase.destinationVersion = generation;
    emergencyCase.selectedHospitalId = rec.hospitalA.hospitalId;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.AMBULANCE,
      action: 'CASE_DISPATCHED',
      entityType: 'EMERGENCY_CASE',
      entityId: caseId,
      details: {
        destinationGeneration: generation,
        hospitalA: rec.hospitalA.code,
        requestsCount: createdRequests.length,
      },
    });

    this.queueOutbox('case.updated', caseId, emergencyCase);
    this.queueOutbox('destination.updated', caseId, destination);
    for (const r of createdRequests) {
      this.queueOutbox('request.created', r.id, r);
    }

    return {
      case: emergencyCase,
      requests: createdRequests,
      destination,
    };
  }

  public getHospitalRequests(hospitalId?: string): HospitalRequestDto[] {
    const all = Array.from(this.hospitalRequests.values());
    if (hospitalId) {
      return all.filter((r) => r.hospitalId === hospitalId);
    }
    return all;
  }

  public getHospitalRequest(id: string): HospitalRequestDto | undefined {
    return this.hospitalRequests.get(id);
  }

  public getDestination(caseId: string): DestinationDto | undefined {
    return this.destinations.get(caseId);
  }

  public listAllocationsByCase(caseId: string): AllocationDto[] {
    return Array.from(this.allocations.values()).filter((a) => a.caseId === caseId);
  }

  public listAllocationsByHospital(hospitalId: string): AllocationDto[] {
    return Array.from(this.allocations.values()).filter((a) => a.hospitalId === hospitalId);
  }

  public getAllocation(id: string): AllocationDto | undefined {
    return this.allocations.get(id);
  }

  // --- Phase 8: Diversion, Arrival, Handover, and Resource Lifecycle ---

  /**
   * Clinician-initiated Diversion.
   * Cancels old pending/accepted main request, releases unused reservations at old hospital,
   * advances destination generation, and creates new MAIN request to target hospital.
   */
  public divertCase(
    caseId: string,
    targetHospitalId: string,
    expectedDestinationVersion: number,
    reason: string,
    actorUserId: string
  ): {
    case: EmergencyCaseDto;
    destination: DestinationDto;
    request: HospitalRequestDto;
    releasedAllocations: AllocationDto[];
  } {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    if (emergencyCase.destinationVersion !== expectedDestinationVersion) {
      throw new Error(
        `Version conflict on diversion: Expected destination generation ${expectedDestinationVersion}, but current is ${emergencyCase.destinationVersion}`
      );
    }

    const now = new Date().toISOString();
    const nextGen = emergencyCase.destinationVersion + 1;
    const oldHospitalId = emergencyCase.selectedHospitalId;

    // 1. Cancel previous pending/main requests for this case
    for (const [reqId, req] of this.hospitalRequests.entries()) {
      if (req.caseId === caseId) {
        if (req.status === RequestStatus.PENDING) {
          req.status = req.role === RequestRole.MAIN ? RequestStatus.CANCELED : RequestStatus.SUPERSEDED;
          req.respondedAt = now;
          this.hospitalRequests.set(reqId, req);
          this.queueOutbox('request.updated', reqId, req);
        } else if (req.role === RequestRole.MAIN && req.status === RequestStatus.ACCEPTED) {
          req.status = RequestStatus.CANCELED;
          this.hospitalRequests.set(reqId, req);
          this.queueOutbox('request.updated', reqId, req);
        }
      }
    }

    // 2. Release unused reservations at old hospital (In-use allocations are never released)
    const releasedAllocations: AllocationDto[] = [];
    for (const [allocId, alloc] of this.allocations.entries()) {
      if (alloc.caseId === caseId && alloc.state === AllocationState.RESERVED) {
        alloc.state = AllocationState.RELEASED;
        alloc.releasedAt = now;
        alloc.version += 1;
        this.allocations.set(allocId, alloc);
        releasedAllocations.push(alloc);

        const pool = this.resourcePools.get(alloc.resourcePoolId);
        if (pool) {
          pool.reservedCount = Math.max(0, pool.reservedCount - alloc.quantity);
          pool.availableCount =
            pool.totalCount - pool.outOfServiceCount - pool.externalOccupancy - pool.reservedCount - pool.inUseCount;
          pool.version += 1;
          pool.updatedAt = now;
          this.resourcePools.set(pool.id, pool);
          this.queueOutbox('inventory.updated', pool.hospitalId, { hospitalId: pool.hospitalId });
        }
      }
    }

    // 3. Update Destination
    const destination: DestinationDto = {
      caseId,
      hospitalId: targetHospitalId,
      readiness: DestinationReadiness.PENDING,
      version: nextGen,
      selectedBy: DestinationActor.CLINICIAN,
      updatedAt: now,
    };
    this.destinations.set(caseId, destination);

    // 4. Create new MAIN Request for targetHospitalId
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const newMainReq: HospitalRequestDto = {
      id: `req-main-${caseId}-gen${nextGen}`,
      caseId,
      hospitalId: targetHospitalId,
      role: RequestRole.MAIN,
      status: RequestStatus.PENDING,
      destinationGeneration: nextGen,
      expiresAt,
      respondedAt: null,
      createdAt: now,
    };
    this.hospitalRequests.set(newMainReq.id, newMainReq);

    // 5. Update Case State
    emergencyCase.selectedHospitalId = targetHospitalId;
    emergencyCase.destinationVersion = nextGen;
    emergencyCase.caseStatus = CaseStatus.EN_ROUTE;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.AMBULANCE,
      action: 'CASE_DIVERTED',
      entityType: 'EMERGENCY_CASE',
      entityId: caseId,
      details: {
        oldHospitalId,
        newHospitalId: targetHospitalId,
        generation: nextGen,
        reason,
        releasedAllocationsCount: releasedAllocations.length,
      },
    });

    this.queueOutbox('case.updated', caseId, emergencyCase);
    this.queueOutbox('destination.updated', caseId, destination);
    this.queueOutbox('request.created', newMainReq.id, newMainReq);

    return {
      case: emergencyCase,
      destination,
      request: newMainReq,
      releasedAllocations,
    };
  }

  /**
   * Ambulance arrival at destination.
   * Case status -> ARRIVED. Does NOT release equipment.
   */
  public arriveCase(caseId: string, actorUserId: string): EmergencyCaseDto {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const now = new Date().toISOString();
    emergencyCase.caseStatus = CaseStatus.ARRIVED;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.AMBULANCE,
      action: 'CASE_ARRIVED',
      entityType: 'EMERGENCY_CASE',
      entityId: caseId,
      details: { hospitalId: emergencyCase.selectedHospitalId },
    });

    this.queueOutbox('case.updated', caseId, emergencyCase);
    return emergencyCase;
  }

  /**
   * Clinical Handover to emergency department.
   * Case status -> HANDED_OVER. Occupied equipment remains in-use until hospital releases.
   */
  public handoverCase(caseId: string, actorUserId: string): EmergencyCaseDto {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const now = new Date().toISOString();
    emergencyCase.caseStatus = CaseStatus.HANDED_OVER;
    emergencyCase.updatedAt = now;
    this.cases.set(caseId, emergencyCase);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.AMBULANCE,
      action: 'CASE_HANDED_OVER',
      entityType: 'EMERGENCY_CASE',
      entityId: caseId,
      details: { hospitalId: emergencyCase.selectedHospitalId },
    });

    this.queueOutbox('case.updated', caseId, emergencyCase);
    return emergencyCase;
  }

  /**
   * Hospital starts active use of a reserved resource (e.g. patient placed on ventilator / in trauma bay).
   * Transitions allocation state from RESERVED to IN_USE.
   */
  public startUseAllocation(
    allocationId: string,
    expectedVersion: number,
    actorUserId: string
  ): AllocationDto {
    const alloc = this.allocations.get(allocationId);
    if (!alloc) {
      throw new Error(`Allocation not found: ${allocationId}`);
    }

    if (alloc.version !== expectedVersion) {
      throw new Error(`Version conflict: expected version ${expectedVersion}, got ${alloc.version}`);
    }

    if (alloc.state !== AllocationState.RESERVED) {
      throw new Error(`Cannot start use: allocation is currently ${alloc.state}`);
    }

    const now = new Date().toISOString();
    const pool = this.resourcePools.get(alloc.resourcePoolId);
    if (pool) {
      pool.reservedCount = Math.max(0, pool.reservedCount - alloc.quantity);
      pool.inUseCount += alloc.quantity;
      pool.availableCount =
        pool.totalCount - pool.outOfServiceCount - pool.externalOccupancy - pool.reservedCount - pool.inUseCount;
      pool.version += 1;
      pool.updatedAt = now;
      this.resourcePools.set(pool.id, pool);
      this.queueOutbox('inventory.updated', pool.hospitalId, { hospitalId: pool.hospitalId });
    }

    alloc.state = AllocationState.IN_USE;
    alloc.inUseAt = now;
    alloc.version += 1;
    this.allocations.set(alloc.id, alloc);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.HOSPITAL,
      action: 'RESOURCE_START_USE',
      entityType: 'ALLOCATION',
      entityId: alloc.id,
      details: { resourceType: alloc.resourceType, poolId: alloc.resourcePoolId },
    });

    this.queueOutbox('allocation.updated', alloc.id, alloc);
    return alloc;
  }

  /**
   * Explicit hospital release of resource (after patient stabilization/transfer/discharge).
   * Transitions allocation to RELEASED and restores available count.
   */
  public releaseAllocation(
    allocationId: string,
    expectedVersion: number,
    actorUserId: string
  ): AllocationDto {
    const alloc = this.allocations.get(allocationId);
    if (!alloc) {
      throw new Error(`Allocation not found: ${allocationId}`);
    }

    if (alloc.version !== expectedVersion) {
      throw new Error(`Version conflict: expected version ${expectedVersion}, got ${alloc.version}`);
    }

    if (alloc.state === AllocationState.RELEASED) {
      return alloc; // Idempotent
    }

    const now = new Date().toISOString();
    const pool = this.resourcePools.get(alloc.resourcePoolId);
    if (pool) {
      if (alloc.state === AllocationState.IN_USE) {
        pool.inUseCount = Math.max(0, pool.inUseCount - alloc.quantity);
      } else if (alloc.state === AllocationState.RESERVED) {
        pool.reservedCount = Math.max(0, pool.reservedCount - alloc.quantity);
      }
      pool.availableCount =
        pool.totalCount - pool.outOfServiceCount - pool.externalOccupancy - pool.reservedCount - pool.inUseCount;
      pool.version += 1;
      pool.updatedAt = now;
      this.resourcePools.set(pool.id, pool);
      this.queueOutbox('inventory.updated', pool.hospitalId, { hospitalId: pool.hospitalId });
    }

    alloc.state = AllocationState.RELEASED;
    alloc.releasedAt = now;
    alloc.version += 1;
    this.allocations.set(alloc.id, alloc);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.HOSPITAL,
      action: 'RESOURCE_RELEASED',
      entityType: 'ALLOCATION',
      entityId: alloc.id,
      details: { resourceType: alloc.resourceType, poolId: alloc.resourcePoolId },
    });

    this.queueOutbox('allocation.updated', alloc.id, alloc);
    return alloc;
  }

  /**
   * Atomic Multi-Resource Reservation Transaction.
   * On main request acceptance: locks case and pools, verifies availability,
   * allocates all needed items together, or rolls back with zero partial allocation.
   */
  public acceptHospitalRequest(
    requestId: string,
    actorUserId: string
  ): {
    request: HospitalRequestDto;
    case: EmergencyCaseDto;
    allocations: AllocationDto[];
  } {
    const request = this.hospitalRequests.get(requestId);
    if (!request) {
      throw new Error(`Hospital request not found: ${requestId}`);
    }

    const emergencyCase = this.cases.get(request.caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${request.caseId}`);
    }

    // Idempotency: If already accepted, return without re-allocating
    if (request.status === RequestStatus.ACCEPTED) {
      return {
        request,
        case: emergencyCase,
        allocations: this.listAllocationsByCase(request.caseId),
      };
    }

    // Validate generation: Old obsolete request cannot confirm destination
    if (request.destinationGeneration < emergencyCase.destinationVersion) {
      throw new Error(
        `Obsolete request rejected: Request generation is gen${request.destinationGeneration}, but case is currently on gen${emergencyCase.destinationVersion}.`
      );
    }

    const now = new Date().toISOString();
    const createdAllocations: AllocationDto[] = [];

    // Standby requests do NOT allocate scarce inventory
    if (request.role === RequestRole.STANDBY) {
      request.status = RequestStatus.ACCEPTED;
      request.respondedAt = now;
      this.hospitalRequests.set(requestId, request);

      this.queueOutbox('request.updated', requestId, request);
      return {
        request,
        case: emergencyCase,
        allocations: [],
      };
    }

    // MAIN Request: Atomic Multi-Resource Allocation
    const assessment = this.getLatestAssessment(request.caseId);
    const targetHospital = this.hospitals.get(request.hospitalId);

    // If target hospital has all full-care capabilities, allocate full-care needs;
    // otherwise if this hospital was selected for immediate stabilization (e.g. diversion to Backup B),
    // allocate confirmed stabilization needs.
    const isFullCareFacility =
      targetHospital &&
      assessment?.confirmedFullCareNeeds &&
      assessment.confirmedFullCareNeeds.length > 0 &&
      assessment.confirmedFullCareNeeds.every((need) =>
        targetHospital.capabilities.includes(need)
      );

    const activeNeeds = isFullCareFacility
      ? assessment?.confirmedFullCareNeeds || []
      : assessment?.confirmedStabilizationNeeds || [];

    // Determine required resource types and staff specialties
    const neededResourceTypes: ResourceType[] = [];
    if (activeNeeds.includes('VENTILATORS')) neededResourceTypes.push(ResourceType.VENTILATOR);
    if (
      activeNeeds.includes('TRAUMA_BAY') ||
      activeNeeds.includes('TRAUMA_L1') ||
      activeNeeds.includes('STABILIZATION')
    ) {
      neededResourceTypes.push(ResourceType.TRAUMA_BAY);
    }
    if (activeNeeds.includes('ICU')) neededResourceTypes.push(ResourceType.ICU_BED);
    if (activeNeeds.includes('CT_SCAN')) neededResourceTypes.push(ResourceType.CT_SCAN);
    if (activeNeeds.includes('CARDIAC_CATH')) neededResourceTypes.push(ResourceType.CATH_LAB);

    // Determine needed staff specialties
    const neededSpecialties: SpecialtyType[] = [];
    if (activeNeeds.includes('NEUROSURGERY')) neededSpecialties.push(SpecialtyType.NEUROSURGEON);
    if (activeNeeds.includes('TRAUMA_L1')) neededSpecialties.push(SpecialtyType.TRAUMA_SURGEON);
    if (activeNeeds.includes('CARDIAC_CATH')) neededSpecialties.push(SpecialtyType.CARDIOLOGIST);

    // 1. ATOMIC CHECK: Verify ALL required pools have availableCount >= 1
    const hospitalPools = this.listResourcePoolsByHospital(request.hospitalId);
    const poolsToAllocate: { pool: ResourcePoolDto; type: ResourceType }[] = [];

    for (const resType of neededResourceTypes) {
      const pool = hospitalPools.find((p) => p.resourceType === resType);
      if (!pool || pool.availableCount < 1) {
        throw new Error(
          `RESOURCE_UNAVAILABLE: Cannot accept case. Resource pool ${resType} has 0 available units (Total: ${pool?.totalCount ?? 0}, Committed: ${(pool?.outOfServiceCount ?? 0) + (pool?.externalOccupancy ?? 0) + (pool?.reservedCount ?? 0) + (pool?.inUseCount ?? 0)}).`
        );
      }
      poolsToAllocate.push({ pool, type: resType });
    }

    // 2. ATOMIC CHECK: Verify ALL required specialist teams have availableTeamSlots >= 1
    const hospitalStaff = this.listStaffByHospital(request.hospitalId);
    const staffToAllocate: StaffAvailabilityDto[] = [];

    for (const spec of neededSpecialties) {
      const staffMember = hospitalStaff.find((s) => s.specialty === spec);
      if (!staffMember || staffMember.availableTeamSlots < 1) {
        throw new Error(
          `RESOURCE_UNAVAILABLE: Cannot accept case. Specialist team ${spec} has 0 available team slots.`
        );
      }
      staffToAllocate.push(staffMember);
    }

    // 3. ATOMIC COMMIT: Reserve each resource pool and decrement staff team slots
    for (const { pool, type } of poolsToAllocate) {
      // Re-read pool in case of concurrent changes
      const latestPool = this.resourcePools.get(pool.id)!;
      latestPool.reservedCount += 1;
      latestPool.availableCount -= 1;
      latestPool.version += 1;
      latestPool.updatedAt = now;
      this.resourcePools.set(latestPool.id, latestPool);

      const allocation: AllocationDto = {
        id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        caseId: request.caseId,
        resourcePoolId: latestPool.id,
        hospitalId: request.hospitalId,
        resourceType: type,
        quantity: 1,
        state: AllocationState.RESERVED,
        reservedAt: now,
        inUseAt: null,
        releasedAt: null,
        version: 1,
      };
      this.allocations.set(allocation.id, allocation);
      createdAllocations.push(allocation);
    }

    for (const staffMember of staffToAllocate) {
      const latestStaff = this.staffAvailability.get(staffMember.id)!;
      latestStaff.availableTeamSlots -= 1;
      latestStaff.version += 1;
      latestStaff.updatedAt = now;
      this.staffAvailability.set(latestStaff.id, latestStaff);
    }

    // 4. Mark request accepted and confirm destination
    request.status = RequestStatus.ACCEPTED;
    request.respondedAt = now;
    this.hospitalRequests.set(requestId, request);

    const destination = this.destinations.get(request.caseId);
    if (destination) {
      destination.readiness = DestinationReadiness.CONFIRMED;
      destination.updatedAt = now;
      this.destinations.set(request.caseId, destination);
    }

    // 5. Transition Case Status to EN_ROUTE
    emergencyCase.caseStatus = CaseStatus.EN_ROUTE;
    emergencyCase.selectedHospitalId = request.hospitalId;
    emergencyCase.updatedAt = now;
    this.cases.set(request.caseId, emergencyCase);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.HOSPITAL,
      action: 'REQUEST_ACCEPTED',
      entityType: 'HOSPITAL_REQUEST',
      entityId: requestId,
      details: {
        hospitalId: request.hospitalId,
        role: request.role,
        allocationsCount: createdAllocations.length,
      },
    });

    this.queueOutbox('request.updated', requestId, request);
    this.queueOutbox('case.updated', request.caseId, emergencyCase);
    if (destination) {
      this.queueOutbox('destination.updated', request.caseId, destination);
    }
    this.queueOutbox('inventory.updated', request.hospitalId, { hospitalId: request.hospitalId });

    return {
      request,
      case: emergencyCase,
      allocations: createdAllocations,
    };
  }

  public declineHospitalRequest(requestId: string, actorUserId: string): HospitalRequestDto {
    const request = this.hospitalRequests.get(requestId);
    if (!request) {
      throw new Error(`Hospital request not found: ${requestId}`);
    }

    const now = new Date().toISOString();
    request.status = RequestStatus.DECLINED;
    request.respondedAt = now;
    this.hospitalRequests.set(requestId, request);

    if (request.role === RequestRole.MAIN) {
      const destination = this.destinations.get(request.caseId);
      if (destination) {
        destination.readiness = DestinationReadiness.UNAVAILABLE;
        destination.updatedAt = now;
        this.destinations.set(request.caseId, destination);
        this.queueOutbox('destination.updated', request.caseId, destination);
      }
    }

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.HOSPITAL,
      action: 'REQUEST_DECLINED',
      entityType: 'HOSPITAL_REQUEST',
      entityId: requestId,
      details: { hospitalId: request.hospitalId, role: request.role },
    });

    this.queueOutbox('request.updated', requestId, request);
    return request;
  }

  public queueOutbox(authorizedEventType: string, entityId: string, payload: any): OutboxEventDto {
    const event: OutboxEventDto = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entityId,
      entityVersion: payload?.version ?? 1,
      authorizedEventType,
      occurredAt: new Date().toISOString(),
      payload,
      deliveryState: 'PENDING',
    };
    this.outboxEvents.push(event);
    return event;
  }

  public getOutboxEvents(): OutboxEventDto[] {
    return [...this.outboxEvents];
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

  // --- Admin Operations (Phase 9) ---
  public getAdminOverview(): AdminOverviewDto {
    // 1. Cases summary
    const allCases = Array.from(this.cases.values());
    const casesByStatus: Record<string, number> = {
      [CaseStatus.DRAFT]: 0,
      [CaseStatus.ASSESSED]: 0,
      [CaseStatus.DISPATCHING]: 0,
      [CaseStatus.EN_ROUTE]: 0,
      [CaseStatus.ARRIVED]: 0,
      [CaseStatus.HANDED_OVER]: 0,
      [CaseStatus.CLOSED]: 0,
      [CaseStatus.CANCELED]: 0,
    };

    let activeCasesCount = 0;
    for (const c of allCases) {
      casesByStatus[c.caseStatus] = (casesByStatus[c.caseStatus] || 0) + 1;
      if (c.caseStatus !== CaseStatus.CLOSED && c.caseStatus !== CaseStatus.CANCELED) {
        activeCasesCount++;
      }
    }

    // 2. Hospital readiness & aggregate resource metrics
    let totalAll = 0;
    let availableAll = 0;
    let reservedAll = 0;
    let inUseAll = 0;
    let outOfServiceAll = 0;

    const hospitalReadiness = Array.from(this.hospitals.values()).map((hosp) => {
      const pools = this.listResourcePoolsByHospital(hosp.id);
      let hospTotal = 0;
      let hospAvail = 0;
      let hospRes = 0;
      let hospInUse = 0;
      let hospOos = 0;

      for (const p of pools) {
        hospTotal += p.totalCount;
        hospAvail += p.availableCount;
        hospRes += p.reservedCount;
        hospInUse += p.inUseCount;
        hospOos += p.outOfServiceCount;
      }

      totalAll += hospTotal;
      availableAll += hospAvail;
      reservedAll += hospRes;
      inUseAll += hospInUse;
      outOfServiceAll += hospOos;

      const util = hospTotal > 0 ? Math.round(((hospRes + hospInUse) / hospTotal) * 100) : 0;

      return {
        id: hosp.id,
        name: hosp.name,
        code: hosp.code,
        receivingStatus: hosp.receivingStatus,
        receivingDelaySeconds: hosp.receivingDelaySeconds,
        resourceUtilizationPercent: util,
        availableCount: hospAvail,
        reservedCount: hospRes,
        inUseCount: hospInUse,
        outOfServiceCount: hospOos,
        totalResources: hospTotal,
        capabilities: hosp.capabilities,
      };
    });

    // 3. Pending requests
    const pendingRequestsCount = Array.from(this.hospitalRequests.values()).filter(
      (r) => r.status === RequestStatus.PENDING
    ).length;

    // 4. Ambulance Telemetry & Staleness
    const nowMs = Date.now();
    const observedMs = new Date(this.ambulancePosition.observedAt).getTime();
    const stalenessSeconds = Math.max(0, Math.round((nowMs - observedMs) / 1000));
    const isStale = stalenessSeconds > this.systemSettings.stalenessThresholdSeconds;

    return {
      activeCasesCount,
      casesByStatus,
      hospitalReadiness,
      totalResources: {
        total: totalAll,
        available: availableAll,
        reserved: reservedAll,
        inUse: inUseAll,
        outOfService: outOfServiceAll,
      },
      pendingRequestsCount,
      ambulanceTelemetry: {
        position: {
          x: this.ambulancePosition.x,
          y: this.ambulancePosition.y,
          lat: this.ambulancePosition.lat,
          lng: this.ambulancePosition.lng,
        },
        speed: this.ambulancePosition.speed,
        heading: this.ambulancePosition.heading,
        serverSequence: this.ambulancePosition.serverSequence,
        observedAt: this.ambulancePosition.observedAt,
        isStale,
        stalenessSeconds,
      },
      systemSettings: this.systemSettings,
    };
  }

  public getFilteredAuditLogs(query: AuditFilterQueryDto): AuditEventDto[] {
    let logs = [...this.auditEvents];

    if (query.caseId) {
      logs = logs.filter((e) => {
        if (e.entityId === query.caseId) return true;
        if (e.details?.caseId === query.caseId) return true;
        if (e.details?.case?.id === query.caseId) return true;
        if (e.entityType === 'ALLOCATION') {
          const alloc = this.allocations.get(e.entityId);
          if (alloc && alloc.caseId === query.caseId) return true;
        }
        if (e.entityType === 'HOSPITAL_REQUEST') {
          const req = this.hospitalRequests.get(e.entityId);
          if (req && req.caseId === query.caseId) return true;
        }
        if (e.entityType === 'ASSESSMENT') {
          const assess = this.assessments.get(e.entityId);
          if (assess && assess.caseId === query.caseId) return true;
        }
        return false;
      });
    }

    if (query.hospitalId) {
      logs = logs.filter((e) => {
        if (e.entityId === query.hospitalId) return true;
        if (e.details?.hospitalId === query.hospitalId) return true;
        if (e.details?.oldHospitalId === query.hospitalId || e.details?.newHospitalId === query.hospitalId) return true;
        if (e.entityType === 'ALLOCATION') {
          const alloc = this.allocations.get(e.entityId);
          if (alloc && alloc.hospitalId === query.hospitalId) return true;
        }
        if (e.entityType === 'HOSPITAL_REQUEST') {
          const req = this.hospitalRequests.get(e.entityId);
          if (req && req.hospitalId === query.hospitalId) return true;
        }
        return false;
      });
    }

    if (query.action) {
      const actLower = query.action.toLowerCase();
      logs = logs.filter((e) => e.action.toLowerCase().includes(actLower));
    }

    if (query.since) {
      const sinceDate = new Date(query.since).getTime();
      logs = logs.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
    }

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return logs.slice(0, query.limit || 50);
  }

  public updateSystemSettings(
    newSettings: Partial<SystemSettingsDto>,
    actorUserId: string
  ): SystemSettingsDto {
    const previous = { ...this.systemSettings };
    this.systemSettings = {
      ...this.systemSettings,
      ...newSettings,
    };

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'SYSTEM_SETTINGS_UPDATED',
      entityType: 'SYSTEM_SETTINGS',
      entityId: 'global',
      details: {
        previous,
        current: this.systemSettings,
      },
    });

    this.queueOutbox('settings.updated', 'global', this.systemSettings);
    return this.systemSettings;
  }

  public adminUpdateHospital(
    hospitalId: string,
    updates: AdminHospitalUpdateDto,
    actorUserId: string
  ): HospitalDto {
    const hosp = this.hospitals.get(hospitalId);
    if (!hosp) {
      throw new Error(`Hospital not found: ${hospitalId}`);
    }

    const previous = {
      receivingStatus: hosp.receivingStatus,
      receivingDelaySeconds: hosp.receivingDelaySeconds,
      capabilities: [...hosp.capabilities],
    };

    if (updates.receivingStatus !== undefined) {
      hosp.receivingStatus = updates.receivingStatus;
    }
    if (updates.receivingDelaySeconds !== undefined) {
      hosp.receivingDelaySeconds = updates.receivingDelaySeconds;
    }
    if (updates.capabilities !== undefined) {
      hosp.capabilities = updates.capabilities;
    }

    hosp.version += 1;
    hosp.updatedAt = new Date().toISOString();
    this.hospitals.set(hospitalId, hosp);

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'ADMIN_HOSPITAL_STATUS_OVERRIDE',
      entityType: 'HOSPITAL',
      entityId: hospitalId,
      details: {
        previous,
        updates,
        newVersion: hosp.version,
      },
    });

    this.queueOutbox('hospital.updated', hospitalId, hosp);
    return hosp;
  }

  public resetDemoScenario(actorUserId: string): void {
    // Confirmation-gated reset restricted to synthetic demo dataset
    this.cases.clear();
    this.assessments.clear();
    this.destinations.clear();
    this.hospitalRequests.clear();
    this.allocations.clear();
    this.recommendations.clear();
    this.clearTrafficOverrides();

    // Reset hospital inventories to baseline
    this.resourcePools.clear();
    for (const pool of SEEDED_RESOURCE_POOLS) {
      this.resourcePools.set(pool.id, { ...pool });
    }

    // Reset ambulance position
    this.ambulancePosition = {
      x: 120,
      y: 150,
      lat: 40.71,
      lng: -74.02,
      speed: 0,
      heading: 85,
      serverSequence: 1,
      observedAt: new Date().toISOString(),
    };

    this.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'DEMO_SCENARIO_RESET',
      entityType: 'SYSTEM',
      entityId: 'global',
      details: { timestamp: new Date().toISOString() },
    });

    this.queueOutbox('simulation.reset', 'global', { timestamp: new Date().toISOString() });
  }
}

export const store = new GoldenHourDatabaseStore();
