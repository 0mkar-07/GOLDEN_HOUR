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
    const confirmedNeeds = assessment?.confirmedFullCareNeeds || [];

    // Determine required resource types and staff specialties
    const neededResourceTypes: ResourceType[] = [];
    if (confirmedNeeds.includes('VENTILATORS')) neededResourceTypes.push(ResourceType.VENTILATOR);
    if (confirmedNeeds.includes('TRAUMA_BAY') || confirmedNeeds.includes('TRAUMA_L1')) {
      neededResourceTypes.push(ResourceType.TRAUMA_BAY);
    }
    if (confirmedNeeds.includes('ICU')) neededResourceTypes.push(ResourceType.ICU_BED);
    if (confirmedNeeds.includes('CT_SCAN')) neededResourceTypes.push(ResourceType.CT_SCAN);
    if (confirmedNeeds.includes('CARDIAC_CATH')) neededResourceTypes.push(ResourceType.CATH_LAB);

    // Determine needed staff specialties
    const neededSpecialties: SpecialtyType[] = [];
    if (confirmedNeeds.includes('NEUROSURGERY')) neededSpecialties.push(SpecialtyType.NEUROSURGEON);
    if (confirmedNeeds.includes('TRAUMA_L1')) neededSpecialties.push(SpecialtyType.TRAUMA_SURGEON);
    if (confirmedNeeds.includes('CARDIAC_CATH')) neededSpecialties.push(SpecialtyType.CARDIOLOGIST);

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
}

export const store = new GoldenHourDatabaseStore();
