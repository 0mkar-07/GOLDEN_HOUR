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
  CareObjective,
  OperatingTheatreDto,
  ScheduledProcedureDto,
  ServiceHoursDto,
  EmergencyPriorityTicketDto,
  TicketStatus,
  RequestedAction,
} from '@goldenhour/contracts';
import {
  SEEDED_HOSPITALS,
  SEEDED_RESOURCE_POOLS,
  SEEDED_STAFF_AVAILABILITY,
  SEEDED_USERS,
  SEEDED_ROAD_GRAPH,
  IMPORTED_NITK_DATASET,
  DEMO_FACILITY_CROSSWALK,
  REVERSE_CROSSWALK,
  HOSPITAL_ALIAS_MAP,
} from '@goldenhour/scenario-fixtures';
import {
  NITK_REGION,
  isWithinNitkRegion,
  calculateHaversineDistanceMeters,
  projectToNitkMetric,
  OriginPreviewResponse,
} from '@goldenhour/contracts';
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
  public aliases: Map<string, string> = new Map(); // Canonical ID resolution (F-01, F-02)
  public originPreviews: Map<string, OriginPreviewResponse> = new Map();
  public idempotencyRecords: Map<string, any> = new Map();
  public staffAvailability: Map<string, StaffAvailabilityDto> = new Map();
  public resourcePools: Map<string, ResourcePoolDto> = new Map();
  public allocations: Map<string, AllocationDto> = new Map();
  public cases: Map<string, EmergencyCaseDto> = new Map();
  public assessments: Map<string, AssessmentDto> = new Map();
  public destinations: Map<string, DestinationDto> = new Map();
  public hospitalRequests: Map<string, HospitalRequestDto> = new Map();
  public recommendations: Map<string, RecommendationDto> = new Map();
  public operatingTheatres: Map<string, OperatingTheatreDto> = new Map();
  public scheduledProcedures: Map<string, ScheduledProcedureDto> = new Map();
  public serviceHours: Map<string, ServiceHoursDto[]> = new Map();
  public emergencyPriorityTickets: Map<string, EmergencyPriorityTicketDto> = new Map();
  public trafficOverrides: Record<string, number> = {};
  public ambulancePosition: {
    ambulanceId: string;
    x: number;
    y: number;
    lat: number;
    lng: number;
    speed: number;
    speedMps?: number | null;
    heading: number;
    headingDegrees?: number | null;
    accuracyMeters?: number;
    source: 'SIMULATED' | 'DEVICE_GPS' | 'REPLAY';
    sourceGeneration: number;
    serverSequence: number;
    observedAt: string;
    receivedAt?: string;
  } = {
    ambulanceId: 'amb-104',
    x: 120,
    y: 150,
    lat: 13.0110,
    lng: 74.7943,
    speed: 0,
    speedMps: 0,
    heading: 85,
    headingDegrees: 85,
    accuracyMeters: 5,
    source: 'SIMULATED',
    sourceGeneration: 1,
    serverSequence: 1,
    observedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
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
    runVersion: 1,
    assignedAmbulanceId: 'amb-104',
    completed: false,
    checkpointCount: 0,
    updatedAt: new Date().toISOString(),
  };
  public systemSettings: SystemSettingsDto = {
    demoRefreshIntervalSeconds: 5,
    stalenessThresholdSeconds: 15,
    rankingImprovementMarginSeconds: 120,
  };

  private seeded = false;

  /**
   * Idempotent seeding mechanism with canonical 23 NITK facilities (Stage 1-4)
   */
  public async seed(): Promise<void> {
    // 1. Initialize Aliases Map (F-01, F-02)
    this.aliases.clear();
    for (const [alias, canonicalId] of Object.entries(HOSPITAL_ALIAS_MAP)) {
      this.aliases.set(alias, canonicalId);
    }

    // 2. Seed Canonical NITK 23 facilities (Preserves source name, coordinates & unique IDs)
    this.hospitals.clear();
    for (const hosp of IMPORTED_NITK_DATASET.hospitals) {
      this.hospitals.set(hosp.id, { ...hosp });
      this.aliases.set(hosp.code, hosp.id);
      this.aliases.set(hosp.code.replace('NITK-', ''), hosp.id);
      this.aliases.set(hosp.id, hosp.id);
    }

    // 3. Seed Resource Pools (F-04)
    this.resourcePools.clear();
    for (const pool of IMPORTED_NITK_DATASET.resourcePools) {
      this.resourcePools.set(pool.id, { ...pool });
    }
    for (const pool of SEEDED_RESOURCE_POOLS) {
      const canonicalHospId = this.resolveHospitalId(pool.hospitalId);
      const mappedId = `pool-legacy-${pool.id}-${canonicalHospId}`;
      if (!this.resourcePools.has(mappedId)) {
        this.resourcePools.set(mappedId, {
          ...pool,
          id: mappedId,
          hospitalId: canonicalHospId,
        });
      }
    }

    // 4. Seed Staff Availability
    this.staffAvailability.clear();
    for (const staff of SEEDED_STAFF_AVAILABILITY) {
      const canonicalHospId = this.resolveHospitalId(staff.hospitalId);
      this.staffAvailability.set(staff.id, {
        ...staff,
        hospitalId: canonicalHospId,
      });
    }

    // Seed staff for major NITK hospitals so specialists exist across the 23 facilities
    for (const hosp of IMPORTED_NITK_DATASET.hospitals) {
      if (hosp.capabilities.includes('TRAUMA_L1') || hosp.facilityType === 'medical_college_hospital') {
        const staffId = `staff-trauma-${hosp.id}`;
        if (!this.staffAvailability.has(staffId)) {
          this.staffAvailability.set(staffId, {
            id: staffId,
            hospitalId: hosp.id,
            specialty: SpecialtyType.TRAUMA_SURGEON,
            availableTeamSlots: 1,
            readyAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            version: 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (hosp.capabilities.includes('NEUROSURGERY')) {
        const staffId = `staff-neuro-${hosp.id}`;
        if (!this.staffAvailability.has(staffId)) {
          this.staffAvailability.set(staffId, {
            id: staffId,
            hospitalId: hosp.id,
            specialty: SpecialtyType.NEUROSURGEON,
            availableTeamSlots: 1,
            readyAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            version: 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    // 5. Seed Users with Scrypt Hashed Passwords
    for (const u of SEEDED_USERS) {
      const existing = Array.from(this.users.values()).find((user) => user.email === u.email);
      if (!existing) {
        const passwordHash = await hashPassword(u.passwordCleartext);
        const userRecord: UserRecord = {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          hospitalId: u.hospitalId ? this.resolveHospitalId(u.hospitalId) : null,
          ambulanceId: u.ambulanceId ?? null,
          active: u.active,
          createdAt: u.createdAt,
          passwordHash,
        };
        this.users.set(u.id, userRecord);
      }
    }

    // 6. Seed Operating Theatres (F-05)
    this.operatingTheatres.clear();
    for (const ot of IMPORTED_NITK_DATASET.operatingTheatres) {
      this.operatingTheatres.set(ot.id, { ...ot });
    }
    // Also include default demo theatres mapped to canonical IDs
    const demoTheatres: OperatingTheatreDto[] = [
      {
        id: 'ot-001-1',
        hospitalId: this.resolveHospitalId('hosp-001'),
        name: 'OR-1 Major Trauma & Neurosurgery Suite',
        capabilities: ['TRAUMA_L1', 'NEUROSURGERY', 'ICU'],
        active: true,
      },
      {
        id: 'ot-001-2',
        hospitalId: this.resolveHospitalId('hosp-001'),
        name: 'OR-2 General Emergency & Laparoscopic Theatre',
        capabilities: ['STABILIZATION', 'EMERGENCY_DEPT'],
        active: true,
      },
      {
        id: 'ot-001-3',
        hospitalId: this.resolveHospitalId('hosp-001'),
        name: 'OR-3 Cardiac Cath & Vascular Intervention Suite',
        capabilities: ['CARDIAC_CATH', 'ICU'],
        active: true,
      },
      {
        id: 'ot-002-1',
        hospitalId: this.resolveHospitalId('hosp-002'),
        name: 'Surathkal Resuscitation & Urgent Surgical Room',
        capabilities: ['STABILIZATION', 'EMERGENCY_DEPT'],
        active: true,
      },
      {
        id: 'ot-003-1',
        hospitalId: this.resolveHospitalId('hosp-003'),
        name: 'Mukka Multi-Specialty Surgical Theatre',
        capabilities: ['STABILIZATION', 'VENTILATORS', 'ICU'],
        active: true,
      },
    ];
    for (const ot of demoTheatres) {
      if (!this.operatingTheatres.has(ot.id)) {
        this.operatingTheatres.set(ot.id, ot);
      }
    }

    // 7. Seed Service Hours (F-05)
    this.serviceHours.clear();
    for (const [hospId, hours] of IMPORTED_NITK_DATASET.serviceHours.entries()) {
      this.serviceHours.set(hospId, [...hours]);
    }

    // 8. Seed Scheduled Procedures with realistic elective and in-progress cases
    if (this.scheduledProcedures.size === 0) {
      const now = Date.now();
      const procedures: ScheduledProcedureDto[] = [
        {
          id: 'proc-101',
          hospitalId: this.resolveHospitalId('hosp-001'),
          theatreId: 'ot-001-1',
          caseType: 'ELECTIVE',
          procedureName: 'Elective Laparoscopic Inguinal Hernia Repair',
          status: 'SCHEDULED',
          plannedStart: new Date(now + 15 * 60 * 1000).toISOString(),
          plannedEnd: new Date(now + 75 * 60 * 1000).toISOString(),
          turnoverMinutes: 20,
          deferralEligibility: 'ELIGIBLE_FOR_REVIEW',
          clinicianInCharge: 'Dr. Ramesh Shenoy (General Surgery)',
          version: 1,
        },
        {
          id: 'proc-102',
          hospitalId: this.resolveHospitalId('hosp-001'),
          theatreId: 'ot-001-2',
          caseType: 'URGENT',
          procedureName: 'Acute Appendectomy with Peritonitis',
          status: 'IN_PROGRESS',
          plannedStart: new Date(now - 40 * 60 * 1000).toISOString(),
          plannedEnd: new Date(now + 20 * 60 * 1000).toISOString(),
          actualStart: new Date(now - 38 * 60 * 1000).toISOString(),
          turnoverMinutes: 20,
          deferralEligibility: 'PROTECTED_IN_PROGRESS',
          clinicianInCharge: 'Dr. Preethi Rao (Emergency Surgery)',
          version: 1,
        },
        {
          id: 'proc-103',
          hospitalId: this.resolveHospitalId('hosp-002'),
          theatreId: 'ot-002-1',
          caseType: 'ELECTIVE',
          procedureName: 'Minor Soft Tissue Excision',
          status: 'SCHEDULED',
          plannedStart: new Date(now + 30 * 60 * 1000).toISOString(),
          plannedEnd: new Date(now + 60 * 60 * 1000).toISOString(),
          turnoverMinutes: 15,
          deferralEligibility: 'ELIGIBLE_FOR_REVIEW',
          clinicianInCharge: 'Dr. Sandeep Kumar (Urgent Care)',
          version: 1,
        },
      ];
      for (const p of procedures) {
        this.scheduledProcedures.set(p.id, p);
      }
    }

    this.seeded = true;
    console.log(`[Store] Seeded ${this.hospitals.size} canonical facilities and ${this.users.size} demo users.`);
  }

  // --- User Operations ---
  public getUserByEmail(email: string): UserRecord | undefined {
    return Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  // --- Hospital Operations ---
  public resolveHospitalId(id: string): string {
    return this.aliases.get(id) || id;
  }

  public getHospital(id: string): HospitalDto | undefined {
    const canonicalId = this.resolveHospitalId(id);
    let hosp = this.hospitals.get(canonicalId);
    if (!hosp) {
      hosp = this.hospitals.get(id);
    }
    if (!hosp && REVERSE_CROSSWALK[id]) {
      hosp = this.hospitals.get(REVERSE_CROSSWALK[id]);
    }
    if (!hosp) {
      hosp = Array.from(this.hospitals.values()).find(
        (h) => h.code === id || h.code === `NITK-${id}` || h.name.toLowerCase().includes(id.toLowerCase())
      );
    }
    return hosp;
  }

  public useImportedDataset = false;

  public enableImportedDataset(enable: boolean = true) {
    this.useImportedDataset = enable;
  }

  public listHospitals(options?: { dataset?: 'demo' | 'nitk23' | 'all' }): HospitalDto[] {
    const mode = options?.dataset || (this.useImportedDataset ? 'nitk23' : 'demo');
    if (mode === 'demo') {
      const demoCanonicalIds = [
        this.resolveHospitalId('hosp-001'),
        this.resolveHospitalId('hosp-002'),
        this.resolveHospitalId('hosp-003'),
        this.resolveHospitalId('hosp-004'),
        this.resolveHospitalId('hosp-005'),
      ];
      return demoCanonicalIds.map((id) => this.getHospital(id)!).filter(Boolean);
    }
    // Return all 23 distinct canonical facilities from imported dataset
    return Array.from(this.hospitals.values());
  }

  public getImportReport() {
    return IMPORTED_NITK_DATASET.report;
  }

  public getTabularHospitals(filters?: {
    facilityType?: string;
    service?: string;
    maxDistanceKm?: number;
  }): HospitalDto[] {
    let list = this.listHospitals({ dataset: 'nitk23' });
    if (filters?.facilityType && filters.facilityType !== 'ALL') {
      list = list.filter((h) => h.facilityType === filters.facilityType);
    }
    if (filters?.service) {
      list = list.filter((h) => h.capabilities.includes(filters.service!));
    }
    if (typeof filters?.maxDistanceKm === 'number') {
      list = list.filter((h) => (h.distanceFromNitkKm ?? 0) <= filters.maxDistanceKm!);
    }
    return list;
  }

  // --- Ambulance Origin Operations (Stage 6 & 7) ---
  public ambulanceOrigin: { lat: number; lng: number } = {
    lat: NITK_REGION.centerLat,
    lng: NITK_REGION.centerLng,
  };

  public previewAmbulanceOrigin(
    lat: number,
    lng: number,
    expectedRunVersion?: number,
    clientRequestId?: string
  ): OriginPreviewResponse {
    const distFromNitk = calculateHaversineDistanceMeters(
      NITK_REGION.centerLat,
      NITK_REGION.centerLng,
      lat,
      lng
    );

    const withinRegion = isWithinNitkRegion(lat, lng);

    let nearestNode = SEEDED_ROAD_GRAPH.nodes[0];
    let minDistance = Infinity;
    for (const node of SEEDED_ROAD_GRAPH.nodes) {
      const d = calculateHaversineDistanceMeters(lat, lng, node.lat, node.lng);
      if (d < minDistance) {
        minDistance = d;
        nearestNode = node;
      }
    }

    const validationId = `val-${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    if (!withinRegion) {
      const preview: OriginPreviewResponse = {
        clientRequestId,
        validationId,
        expiresAt,
        runId: this.simulationRun.id,
        runVersion: this.simulationRun.runVersion,
        regionVersion: NITK_REGION.datasetVersion,
        graphVersion: '2026.10-nitk-graph',
        requested: { lat, lng },
        resolved: null,
        snapDistanceMeters: Math.round(minDistance),
        distanceFromNitkKm: parseFloat((distFromNitk / 1000).toFixed(2)),
        validationStatus: 'REJECTED',
        rejectionCode: 'OUT_OF_REGION',
        rejectionReason: `Coordinates are ${(distFromNitk / 1000).toFixed(1)}km from NITK, exceeding the 40 km regional boundary.`,
      };
      this.originPreviews.set(validationId, preview);
      return preview;
    }

    if (minDistance > 150) {
      const preview: OriginPreviewResponse = {
        clientRequestId,
        validationId,
        expiresAt,
        runId: this.simulationRun.id,
        runVersion: this.simulationRun.runVersion,
        regionVersion: NITK_REGION.datasetVersion,
        graphVersion: '2026.10-nitk-graph',
        requested: { lat, lng },
        resolved: null,
        snapDistanceMeters: Math.round(minDistance),
        distanceFromNitkKm: parseFloat((distFromNitk / 1000).toFixed(2)),
        validationStatus: 'REJECTED',
        rejectionCode: 'NO_ROAD_ACCESS',
        rejectionReason: `Selected point is ${Math.round(minDistance)}m from nearest drivable road (tolerance: 150m).`,
      };
      this.originPreviews.set(validationId, preview);
      return preview;
    }

    const preview: OriginPreviewResponse = {
      clientRequestId,
      validationId,
      expiresAt,
      runId: this.simulationRun.id,
      runVersion: this.simulationRun.runVersion,
      regionVersion: NITK_REGION.datasetVersion,
      graphVersion: '2026.10-nitk-graph',
      requested: { lat, lng },
      resolved: { lat: nearestNode.lat, lng: nearestNode.lng },
      roadSegmentId: 'seg-1',
      segmentFraction: 0,
      snapDistanceMeters: Math.round(minDistance),
      distanceFromNitkKm: parseFloat((distFromNitk / 1000).toFixed(2)),
      validationStatus: 'ACCEPTED',
      rejectionCode: null,
      rejectionReason: null,
    };
    this.originPreviews.set(validationId, preview);
    return preview;
  }

  public setAmbulanceOrigin(
    lat: number,
    lng: number,
    expectedRunVersion?: number,
    validationId?: string,
    idempotencyKey?: string
  ): {
    requested: { lat: number; lng: number };
    snapped: { lat: number; lng: number };
    snapDistanceMeters: number;
    distanceFromNitkKm: number;
    runVersion: number;
  } {
    if (validationId) {
      const preview = this.originPreviews.get(validationId);
      if (!preview || preview.validationStatus !== 'ACCEPTED' || !preview.resolved) {
        const err: any = new Error('Invalid or expired validation ID for origin commit');
        err.statusCode = 409;
        err.code = 'EXPIRED_PREVIEW';
        throw err;
      }
      lat = preview.resolved.lat;
      lng = preview.resolved.lng;
    }

    if (idempotencyKey && this.idempotencyRecords.has(idempotencyKey)) {
      const record = this.idempotencyRecords.get(idempotencyKey);
      if (record.lat === lat && record.lng === lng) {
        return record.result;
      } else {
        const err: any = new Error('Idempotency key reused with different request payload');
        err.statusCode = 409;
        err.code = 'IDEMPOTENCY_CONFLICT';
        throw err;
      }
    }

    if (expectedRunVersion !== undefined && this.simulationRun.runVersion !== expectedRunVersion) {
      const err: any = new Error(
        `Version conflict: expected runVersion ${expectedRunVersion}, got ${this.simulationRun.runVersion}`
      );
      err.statusCode = 409;
      err.code = 'VERSION_CONFLICT';
      throw err;
    }

    const distFromNitk = calculateHaversineDistanceMeters(
      NITK_REGION.centerLat,
      NITK_REGION.centerLng,
      lat,
      lng
    );

    if (distFromNitk > NITK_REGION.radiusMeters) {
      const err: any = new Error(
        `OUT_OF_REGION: Ambulance origin must be within 40 km of NITK Surathkal (${(distFromNitk / 1000).toFixed(1)} km from center)`
      );
      err.statusCode = 400;
      err.code = 'OUT_OF_REGION';
      throw err;
    }

    let nearestNode = SEEDED_ROAD_GRAPH.nodes[0];
    let minDistance = Infinity;
    for (const node of SEEDED_ROAD_GRAPH.nodes) {
      const d = calculateHaversineDistanceMeters(lat, lng, node.lat, node.lng);
      if (d < minDistance) {
        minDistance = d;
        nearestNode = node;
      }
    }

    if (minDistance > 150 && !validationId) {
      const err: any = new Error(`NO_ROAD_ACCESS: Selected coordinate is ${Math.round(minDistance)}m from drivable road (max 150m)`);
      err.statusCode = 422;
      err.code = 'NO_ROAD_ACCESS';
      throw err;
    }

    const snappedLat = nearestNode.lat;
    const snappedLng = nearestNode.lng;

    const metric = projectToNitkMetric(snappedLat, snappedLng);
    const projectedX = Math.round(metric.x / 10);
    const projectedY = Math.round(metric.y / 10);

    this.ambulanceOrigin = { lat: snappedLat, lng: snappedLng };
    this.updateAmbulancePosition(
      projectedX,
      projectedY,
      snappedLat,
      snappedLng
    );

    this.simulationRun.runVersion += 1;

    const result = {
      requested: { lat, lng },
      snapped: { lat: snappedLat, lng: snappedLng },
      snapDistanceMeters: Math.round(minDistance),
      distanceFromNitkKm: parseFloat((distFromNitk / 1000).toFixed(2)),
      runVersion: this.simulationRun.runVersion,
    };

    if (idempotencyKey) {
      this.idempotencyRecords.set(idempotencyKey, { lat, lng, result });
    }

    return result;
  }

  public resetAmbulanceOriginToDefault(): { lat: number; lng: number } {
    this.ambulanceOrigin = { lat: NITK_REGION.centerLat, lng: NITK_REGION.centerLng };
    const metric = projectToNitkMetric(NITK_REGION.centerLat, NITK_REGION.centerLng);
    this.updateAmbulancePosition(
      Math.round(metric.x / 10),
      Math.round(metric.y / 10),
      NITK_REGION.centerLat,
      NITK_REGION.centerLng
    );
    this.simulationRun.runVersion += 1;
    return this.ambulanceOrigin;
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
    const resolved = this.resolveHospitalId(hospitalId);
    return Array.from(this.resourcePools.values()).filter(
      (p) => p.hospitalId === resolved || p.hospitalId === hospitalId
    );
  }

  public listResourcePools(hospitalId: string): ResourcePoolDto[] {
    return this.listResourcePoolsByHospital(hospitalId);
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
    const resolved = this.resolveHospitalId(hospitalId);
    return Array.from(this.staffAvailability.values()).filter(
      (s) => s.hospitalId === resolved || s.hospitalId === hospitalId
    );
  }

  public listStaffAvailability(hospitalId: string): StaffAvailabilityDto[] {
    return this.listStaffByHospital(hospitalId);
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

  public updateAmbulancePosition(
    x: number,
    y: number,
    lat: number,
    lng: number,
    speedKmh: number = 45,
    headingDeg: number = 85
  ): void {
    const normalizedHeading = ((headingDeg % 360) + 360) % 360;
    const nowIso = new Date().toISOString();
    const currentGen = this.ambulancePosition.source === 'SIMULATED'
      ? this.ambulancePosition.sourceGeneration
      : this.ambulancePosition.sourceGeneration + 1;

    this.ambulancePosition = {
      ambulanceId: 'amb-104',
      x,
      y,
      lat,
      lng,
      speed: Math.round(speedKmh),
      speedMps: Number((speedKmh / 3.6).toFixed(2)),
      heading: Math.round(normalizedHeading),
      headingDegrees: normalizedHeading,
      accuracyMeters: 5,
      source: 'SIMULATED',
      sourceGeneration: currentGen,
      serverSequence: this.ambulancePosition.serverSequence + 1,
      observedAt: nowIso,
      receivedAt: nowIso,
    };
  }

  public submitDevicePosition(
    lat: number,
    lng: number,
    speedKmh: number = 0,
    headingDeg: number = 0,
    accuracyMeters?: number,
    observedAt?: string
  ) {
    const normalizedHeading = ((headingDeg % 360) + 360) % 360;
    const nowIso = new Date().toISOString();
    const currentGen = this.ambulancePosition.source === 'DEVICE_GPS'
      ? this.ambulancePosition.sourceGeneration
      : this.ambulancePosition.sourceGeneration + 1;

    this.ambulancePosition = {
      ambulanceId: 'amb-104',
      x: 0,
      y: 0,
      lat,
      lng,
      speed: Math.round(speedKmh),
      speedMps: Number((speedKmh / 3.6).toFixed(2)),
      heading: Math.round(normalizedHeading),
      headingDegrees: normalizedHeading,
      accuracyMeters: accuracyMeters ?? 5,
      source: 'DEVICE_GPS',
      sourceGeneration: currentGen,
      serverSequence: this.ambulancePosition.serverSequence + 1,
      observedAt: observedAt || nowIso,
      receivedAt: nowIso,
    };
    return this.ambulancePosition;
  }

  public setTrafficOverride(edgeId: string, multiplier: number): void {
    this.trafficOverrides[edgeId] = multiplier;
  }

  public clearTrafficOverrides(): void {
    this.trafficOverrides = {};
  }

  // --- Dispatch & Request Operations (Phase 6 & Stabilization Priority) ---
  public dispatchCase(
    caseId: string,
    actorUserId: string,
    options?: {
      targetHospitalId?: string;
      careObjective?: CareObjective;
      selectionReason?: string;
    }
  ): {
    case: EmergencyCaseDto;
    requests: HospitalRequestDto[];
    destination: DestinationDto;
  } {
    const emergencyCase = this.cases.get(caseId);
    if (!emergencyCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const rec = this.recommendations.get(caseId);
    if (!rec) {
      throw new Error(`Cannot dispatch case ${caseId}: No recommendation generated.`);
    }

    // Determine target hospital ID
    let targetHospitalId = options?.targetHospitalId;
    if (!targetHospitalId) {
      targetHospitalId = rec.hospitalA?.hospitalId || rec.hospitalB?.hospitalId;
    }
    if (!targetHospitalId) {
      throw new Error(`Cannot dispatch case ${caseId}: No eligible destination recommendation available.`);
    }

    const targetHosp = this.hospitals.get(targetHospitalId);
    if (!targetHosp) {
      throw new Error(`Target hospital not found: ${targetHospitalId}`);
    }

    // Determine Care Objective
    const careObjective: CareObjective =
      options?.careObjective ||
      (targetHospitalId === rec.hospitalA?.hospitalId ? 'FULL_CARE' : 'STABILIZATION');

    const now = new Date().toISOString();
    const generation = emergencyCase.destinationVersion + 1;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const createdRequests: HospitalRequestDto[] = [];

    // 1. Create Main Request for Target Hospital
    const mainReq: HospitalRequestDto = {
      id: `req-main-${caseId}-gen${generation}`,
      caseId,
      hospitalId: targetHospitalId,
      role: RequestRole.MAIN,
      careObjective,
      status: RequestStatus.PENDING,
      destinationGeneration: generation,
      expiresAt,
      respondedAt: null,
      createdAt: now,
    };
    this.hospitalRequests.set(mainReq.id, mainReq);
    createdRequests.push(mainReq);

    // 2. Create Standby Requests ONLY for distinct eligible alternatives
    const standbyCandidates: { hospitalId: string }[] = [];
    if (rec.hospitalA && rec.hospitalA.hospitalId !== targetHospitalId) {
      standbyCandidates.push({ hospitalId: rec.hospitalA.hospitalId });
    }
    if (
      rec.hospitalB &&
      rec.hospitalB.hospitalId !== targetHospitalId &&
      !standbyCandidates.some((s) => s.hospitalId === rec.hospitalB!.hospitalId)
    ) {
      standbyCandidates.push({ hospitalId: rec.hospitalB.hospitalId });
    }
    if (
      rec.hospitalC &&
      rec.hospitalC.hospitalId !== targetHospitalId &&
      !standbyCandidates.some((s) => s.hospitalId === rec.hospitalC!.hospitalId)
    ) {
      standbyCandidates.push({ hospitalId: rec.hospitalC.hospitalId });
    }

    for (let i = 0; i < standbyCandidates.length; i++) {
      const sbCandidate = standbyCandidates[i];
      const standbyReq: HospitalRequestDto = {
        id: `req-sb-${i === 0 ? 'b' : 'c'}-${caseId}-gen${generation}`,
        caseId,
        hospitalId: sbCandidate.hospitalId,
        role: RequestRole.STANDBY,
        careObjective: 'STABILIZATION',
        status: RequestStatus.PENDING,
        destinationGeneration: generation,
        expiresAt,
        respondedAt: null,
        createdAt: now,
      };
      this.hospitalRequests.set(standbyReq.id, standbyReq);
      createdRequests.push(standbyReq);
    }

    // 3. Update Destination Record
    const destination: DestinationDto = {
      caseId,
      hospitalId: targetHospitalId,
      careObjective,
      readiness: DestinationReadiness.PENDING,
      version: generation,
      selectedBy: DestinationActor.CLINICIAN,
      updatedAt: now,
    };
    this.destinations.set(caseId, destination);

    // 4. Update Case State
    emergencyCase.caseStatus = CaseStatus.DISPATCHING;
    emergencyCase.destinationVersion = generation;
    emergencyCase.selectedHospitalId = targetHospitalId;
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
        targetHospital: targetHosp.code,
        careObjective,
        selectionReason:
          options?.selectionReason ||
          (careObjective === 'FULL_CARE' ? 'INITIAL_FULL_CARE' : 'NO_FULL_CARE_AVAILABLE'),
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

    if (
      emergencyCase.caseStatus === CaseStatus.ARRIVED ||
      emergencyCase.caseStatus === CaseStatus.HANDED_OVER ||
      emergencyCase.caseStatus === CaseStatus.CLOSED
    ) {
      throw new Error(`Cannot divert case ${caseId} in terminal/arrived state (${emergencyCase.caseStatus}).`);
    }

    if (emergencyCase.selectedHospitalId === targetHospitalId) {
      throw new Error(`Cannot divert to current destination: target hospital is already ${targetHospitalId}.`);
    }

    if (emergencyCase.destinationVersion !== expectedDestinationVersion) {
      throw new Error(
        `Version conflict on diversion: Expected destination generation ${expectedDestinationVersion}, but current is ${emergencyCase.destinationVersion}`
      );
    }

    const now = new Date().toISOString();
    const nextGen = emergencyCase.destinationVersion + 1;
    const oldHospitalId = emergencyCase.selectedHospitalId;
    const oldHospital = oldHospitalId ? this.hospitals.get(oldHospitalId) : null;
    const newHospital = this.hospitals.get(targetHospitalId);

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
      careObjective: 'STABILIZATION',
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
      careObjective: 'STABILIZATION',
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
        oldHospitalName: oldHospital?.name || 'Previous Destination',
        newHospitalId: targetHospitalId,
        newHospitalName: newHospital?.name || targetHospitalId,
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

    // Allocate based on the explicit careObjective persisted on the request!
    const isFullCareFacility =
      targetHospital &&
      assessment?.confirmedFullCareNeeds &&
      assessment.confirmedFullCareNeeds.length > 0 &&
      assessment.confirmedFullCareNeeds.every((need) =>
        targetHospital.capabilities.includes(need)
      );

    const activeNeeds =
      request.careObjective === 'STABILIZATION'
        ? assessment?.confirmedStabilizationNeeds || []
        : request.careObjective === 'FULL_CARE'
        ? assessment?.confirmedFullCareNeeds || []
        : isFullCareFacility
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

    const hospitalReadiness = this.listHospitals().map((hosp) => {
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
      actorId: actorUserId || 'admin-system',
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
      actorId: actorUserId || 'admin-system',
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

  public resetDemoScenario(actorUserId?: string): void {
    // Confirmation-gated reset restricted to synthetic demo dataset
    this.cases.clear();
    this.assessments.clear();
    this.destinations.clear();
    this.hospitalRequests.clear();
    this.allocations.clear();
    this.recommendations.clear();
    this.emergencyPriorityTickets.clear();
    this.originPreviews.clear();
    this.idempotencyRecords.clear();
    this.clearTrafficOverrides();

    // Reset hospital inventories to baseline (both demo and imported canonical pools)
    this.resourcePools.clear();
    for (const pool of SEEDED_RESOURCE_POOLS) {
      this.resourcePools.set(pool.id, { ...pool });
    }
    for (const pool of IMPORTED_NITK_DATASET.resourcePools) {
      this.resourcePools.set(pool.id, { ...pool });
    }

    // Reset ambulance position
    const metric = projectToNitkMetric(NITK_REGION.centerLat, NITK_REGION.centerLng);
    this.ambulanceOrigin = { lat: NITK_REGION.centerLat, lng: NITK_REGION.centerLng };
    this.ambulancePosition = {
      ambulanceId: 'amb-104',
      x: Math.round(metric.x / 10),
      y: Math.round(metric.y / 10),
      lat: NITK_REGION.centerLat,
      lng: NITK_REGION.centerLng,
      speed: 0,
      speedMps: 0,
      heading: 85,
      headingDegrees: 85,
      accuracyMeters: 5,
      source: 'SIMULATED',
      sourceGeneration: 1,
      serverSequence: 1,
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    this.recordAudit({
      actorId: actorUserId || 'admin-system',
      actorRole: UserRole.ADMIN,
      action: 'DEMO_SCENARIO_RESET',
      entityType: 'SYSTEM',
      entityId: 'global',
      details: { timestamp: new Date().toISOString() },
    });

    this.queueOutbox('simulation.reset', 'global', { timestamp: new Date().toISOString() });
  }

  // --- Operating Theatres & Procedure Scheduling ---
  public listOperatingTheatres(hospitalId: string): OperatingTheatreDto[] {
    const resolved = this.resolveHospitalId(hospitalId);
    return Array.from(this.operatingTheatres.values()).filter(
      (ot) => ot.hospitalId === resolved || ot.hospitalId === hospitalId
    );
  }

  public listScheduledProcedures(hospitalId: string): ScheduledProcedureDto[] {
    const resolved = this.resolveHospitalId(hospitalId);
    return Array.from(this.scheduledProcedures.values()).filter(
      (p) => p.hospitalId === resolved || p.hospitalId === hospitalId
    );
  }

  public getHospitalServices(hospitalId: string): ServiceHoursDto[] {
    const resolved = this.resolveHospitalId(hospitalId);
    return this.serviceHours.get(resolved) || this.serviceHours.get(hospitalId) || [];
  }

  public createPriorityReview(
    caseId: string,
    hospitalId: string,
    estimatedArrivalSeconds: number,
    urgencyLevel?: string,
    clinicalRationale?: string
  ): EmergencyPriorityTicketDto | null {
    const now = Date.now();
    const arrivalTime = new Date(now + estimatedArrivalSeconds * 1000);
    const windowStart = new Date(arrivalTime.getTime() - 2 * 60 * 1000).toISOString();
    const windowEnd = new Date(arrivalTime.getTime() + 10 * 60 * 1000).toISOString();

    // Resolve target hospital (supports ID or crosswalk alias)
    const targetHospital = this.getHospital(hospitalId);
    const targetHospId = targetHospital ? targetHospital.id : hospitalId;

    // Check for existing pending ticket for this case (F-23: supersede if destination changed)
    for (const ticket of this.emergencyPriorityTickets.values()) {
      if (ticket.caseId === caseId && ticket.status === 'PENDING_REVIEW') {
        if (this.resolveHospitalId(ticket.hospitalId) === this.resolveHospitalId(targetHospId)) {
          return ticket;
        } else {
          ticket.status = 'SUPERSEDED';
          ticket.version += 1;
        }
      }
    }

    // Detect actual resource-specific overlap:
    // emergencyStart < procedureEndWithTurnover && emergencyEnd > procedureStartWithPrep
    const hospitalProcedures = this.listScheduledProcedures(targetHospId);
    const emergencyStartMs = arrivalTime.getTime() - 2 * 60 * 1000;
    const emergencyEndMs = arrivalTime.getTime() + 45 * 60 * 1000; // emergency surgical prep and theatre window

    // F-21: Only consider active competing ELECTIVE procedures, ignore completed/cancelled/urgent/emergency
    const conflictingProc = hospitalProcedures.find((p) => {
      if (p.caseType !== 'ELECTIVE') return false;
      if (p.status !== 'SCHEDULED' && p.status !== 'PREPARING') return false;
      if (p.deferralEligibility === 'NOT_DEFERRABLE') return false;

      const procStartMs = new Date(p.plannedStart).getTime() - 10 * 60 * 1000;
      const turnoverMs = (p.turnoverMinutes !== null && p.turnoverMinutes !== undefined ? p.turnoverMinutes : 20) * 60 * 1000;
      const procEndMs = new Date(p.plannedEnd).getTime() + turnoverMs;
      return emergencyStartMs < procEndMs && emergencyEndMs > procStartMs;
    });

    if (!conflictingProc) {
      // Stage 9: No overlap exists -> return null (no fake conflict)
      return null;
    }

    const isProtected =
      conflictingProc.status === 'IN_PROGRESS' ||
      conflictingProc.deferralEligibility === 'PROTECTED_IN_PROGRESS';

    const ticketId = 'ticket-' + Math.random().toString(36).substring(2, 9);
    const ticket: EmergencyPriorityTicketDto = {
      id: ticketId,
      caseId,
      hospitalId: targetHospId,
      targetTheatreId: conflictingProc.theatreId,
      conflictingProcedureId: conflictingProc.id,
      conflictingProcedureName: conflictingProc.procedureName,
      caseType: conflictingProc.caseType,
      emergencyArrivalWindow: {
        start: windowStart,
        end: windowEnd,
        estimatedSeconds: estimatedArrivalSeconds,
      },
      status: 'PENDING_REVIEW',
      requestedAction: isProtected ? 'REVIEW_RESOURCE_ALTERNATIVE' : 'REVIEW_ELECTIVE_DEFERRAL',
      clinicalRationale:
        clinicalRationale ||
        `Incoming ${urgencyLevel || 'CRITICAL'} emergency ETA ${Math.round(
          estimatedArrivalSeconds / 60
        )}m overlaps with scheduled ${conflictingProc.caseType} procedure '${conflictingProc.procedureName}' in ${conflictingProc.theatreId}.`,
      reviewerNotes: isProtected
        ? 'Conflicting procedure is currently active or protected. Recommend alternate operating suite.'
        : null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      version: 1,
    };

    this.emergencyPriorityTickets.set(ticket.id, ticket);
    this.queueOutbox('priority_ticket.created', ticket.id, ticket);
    return ticket;
  }

  public listHospitalPriorityTickets(hospitalId: string): EmergencyPriorityTicketDto[] {
    const resolved = this.resolveHospitalId(hospitalId);
    return Array.from(this.emergencyPriorityTickets.values()).filter(
      (t) => t.hospitalId === resolved || t.hospitalId === hospitalId
    );
  }

  public getCasePriorityReview(caseId: string): EmergencyPriorityTicketDto | null {
    for (const ticket of this.emergencyPriorityTickets.values()) {
      if (ticket.caseId === caseId) {
        return ticket;
      }
    }
    return null;
  }

  public decidePriorityTicket(
    ticketId: string,
    decision: 'APPROVED' | 'DECLINED' | 'ALTERNATIVE_RESOURCE',
    reviewerNotes: string,
    reviewerId?: string,
    alternateTheatreId?: string
  ): { ticket: EmergencyPriorityTicketDto; deferredProcedure?: ScheduledProcedureDto } {
    const ticket = this.emergencyPriorityTickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Priority ticket not found: ${ticketId}`);
    }

    if (ticket.status !== 'PENDING_REVIEW' && ticket.status !== 'ACKNOWLEDGED') {
      throw new Error(`Priority ticket is already resolved (${ticket.status})`);
    }

    let deferredProc: ScheduledProcedureDto | undefined;

    // Stage 9: Atomic validation before any mutation
    if (decision === 'APPROVED') {
      const proc = this.scheduledProcedures.get(ticket.conflictingProcedureId);
      if (!proc) {
        throw new Error(`Conflicting procedure not found: ${ticket.conflictingProcedureId}`);
      }
      if (proc.status === 'IN_PROGRESS' || proc.deferralEligibility === 'PROTECTED_IN_PROGRESS') {
        throw new Error('Cannot defer procedure: already in progress or protected.');
      }
      // Commit procedure update
      proc.status = 'DEFERRED';
      proc.version += 1;
      deferredProc = proc;
      this.queueOutbox('procedure.updated', proc.id, proc);
    } else if (decision === 'ALTERNATIVE_RESOURCE') {
      if (!alternateTheatreId) {
        throw new Error('alternateTheatreId is required when selecting ALTERNATIVE_RESOURCE');
      }
      const theatre = this.operatingTheatres.get(alternateTheatreId);
      if (!theatre || this.resolveHospitalId(theatre.hospitalId) !== this.resolveHospitalId(ticket.hospitalId)) {
        throw new Error(`Invalid alternative theatre: ${alternateTheatreId} does not belong to hospital`);
      }
      ticket.targetTheatreId = alternateTheatreId;
      ticket.requestedAction = 'REVIEW_RESOURCE_ALTERNATIVE';
    }

    ticket.status = decision === 'DECLINED' ? 'DECLINED' : 'APPROVED';
    ticket.reviewedBy = reviewerId || 'Chief Medical Officer / Surgical Scheduler';
    ticket.reviewedAt = new Date().toISOString();
    ticket.reviewerNotes = reviewerNotes;
    ticket.version += 1;

    this.queueOutbox('priority_ticket.updated', ticket.id, ticket);
    return { ticket, deferredProcedure: deferredProc };
  }
}

export const store = new GoldenHourDatabaseStore();
