import {
  UserRole,
  ReceivingStatus,
  ResourceType,
  SpecialtyType,
  CaseStatus,
  HospitalDto,
  StaffAvailabilityDto,
  ResourcePoolDto,
  RoadGraphDto,
  UserDto,
} from '@goldenhour/contracts';

export const SCENARIO_SEED_VERSION = '2026.10.24-hackathon';

/**
 * 5 Synthetic Demonstration Hospitals
 */
export const SEEDED_HOSPITALS: HospitalDto[] = [
  {
    id: 'hosp-001',
    code: 'HOSP-A',
    name: 'St. Jude Metropolitan Trauma Center',
    address: '100 Central Ave, Metro City',
    location: { x: 350, y: 150, lat: 40.7128, lng: -74.006 },
    capabilities: [
      'TRAUMA_L1',
      'NEUROSURGERY',
      'CARDIAC_CATH',
      'VENTILATORS',
      'ICU',
      'CT_SCAN',
      'STABILIZATION',
      'EMERGENCY_DEPT',
    ],
    receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 120,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'hosp-002',
    code: 'HOSP-B',
    name: 'Bayview Urgent Care & Community Hospital',
    address: '45 Harbor Blvd, Metro City',
    location: { x: 150, y: 220, lat: 40.7088, lng: -74.015 },
    capabilities: [
      'STABILIZATION',
      'EMERGENCY_DEPT',
      'BASIC_OXYGEN',
      'CT_SCAN',
    ],
    receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 90,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'hosp-003',
    code: 'HOSP-C',
    name: 'Northpoint Regional Medical Center',
    address: '880 Highland Way, Metro City',
    location: { x: 420, y: 80, lat: 40.725, lng: -73.995 },
    capabilities: [
      'STABILIZATION',
      'VENTILATORS',
      'ICU',
      'EMERGENCY_DEPT',
      'CT_SCAN',
    ],
    receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 150,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'hosp-004',
    code: 'HOSP-D',
    name: 'Eastside Heart & Vascular Institute',
    address: '310 Riverdale Rd, Metro City',
    location: { x: 480, y: 280, lat: 40.718, lng: -73.98 },
    capabilities: [
      'CARDIAC_CATH',
      'ICU',
      'VENTILATORS',
      'EMERGENCY_DEPT',
      'STABILIZATION',
    ],
    receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 120,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'hosp-005',
    code: 'HOSP-E',
    name: 'Valley Children & Pediatric Pavilion',
    address: '500 Meadow Lane, Metro City',
    location: { x: 90, y: 380, lat: 40.695, lng: -74.02 },
    capabilities: [
      'PEDIATRIC_ICU',
      'PEDIATRIC_TRAUMA',
      'VENTILATORS',
      'EMERGENCY_DEPT',
      'STABILIZATION',
    ],
    receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 120,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
];

/**
 * Seeded Resource Pools for all 5 Hospitals
 */
export const SEEDED_RESOURCE_POOLS: ResourcePoolDto[] = [
  // Hospital A (St. Jude)
  {
    id: 'pool-001',
    hospitalId: 'hosp-001',
    resourceType: ResourceType.VENTILATOR,
    totalCount: 8,
    outOfServiceCount: 1,
    externalOccupancy: 4,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 3,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'pool-002',
    hospitalId: 'hosp-001',
    resourceType: ResourceType.TRAUMA_BAY,
    totalCount: 3,
    outOfServiceCount: 0,
    externalOccupancy: 2,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 1,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'pool-003',
    hospitalId: 'hosp-001',
    resourceType: ResourceType.ICU_BED,
    totalCount: 12,
    outOfServiceCount: 2,
    externalOccupancy: 8,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 2,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'pool-004',
    hospitalId: 'hosp-001',
    resourceType: ResourceType.CT_SCAN,
    totalCount: 2,
    outOfServiceCount: 0,
    externalOccupancy: 1,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 1,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },

  // Hospital B (Bayview) - Urgent stabilization focus
  {
    id: 'pool-005',
    hospitalId: 'hosp-002',
    resourceType: ResourceType.TRAUMA_BAY,
    totalCount: 2,
    outOfServiceCount: 0,
    externalOccupancy: 1,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 1,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'pool-006',
    hospitalId: 'hosp-002',
    resourceType: ResourceType.CT_SCAN,
    totalCount: 1,
    outOfServiceCount: 0,
    externalOccupancy: 0,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 1,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },

  // Hospital C (Northpoint)
  {
    id: 'pool-007',
    hospitalId: 'hosp-003',
    resourceType: ResourceType.VENTILATOR,
    totalCount: 5,
    outOfServiceCount: 0,
    externalOccupancy: 3,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 2,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'pool-008',
    hospitalId: 'hosp-003',
    resourceType: ResourceType.ICU_BED,
    totalCount: 6,
    outOfServiceCount: 1,
    externalOccupancy: 3,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 2,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },

  // Hospital D (Eastside)
  {
    id: 'pool-009',
    hospitalId: 'hosp-004',
    resourceType: ResourceType.CATH_LAB,
    totalCount: 2,
    outOfServiceCount: 0,
    externalOccupancy: 1,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 1,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },

  // Hospital E (Valley Children)
  {
    id: 'pool-010',
    hospitalId: 'hosp-005',
    resourceType: ResourceType.VENTILATOR,
    totalCount: 4,
    outOfServiceCount: 0,
    externalOccupancy: 2,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 2,
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
];

/**
 * Seeded Staff Availability
 */
export const SEEDED_STAFF_AVAILABILITY: StaffAvailabilityDto[] = [
  {
    id: 'staff-001',
    hospitalId: 'hosp-001',
    specialty: SpecialtyType.TRAUMA_SURGEON,
    availableTeamSlots: 2,
    readyAt: new Date('2026-10-24T08:00:00Z').toISOString(),
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'staff-002',
    hospitalId: 'hosp-001',
    specialty: SpecialtyType.NEUROSURGEON,
    availableTeamSlots: 1,
    readyAt: new Date('2026-10-24T08:00:00Z').toISOString(),
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'staff-003',
    hospitalId: 'hosp-002',
    specialty: SpecialtyType.INTENSIVIST,
    availableTeamSlots: 1,
    readyAt: new Date('2026-10-24T08:00:00Z').toISOString(),
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'staff-004',
    hospitalId: 'hosp-004',
    specialty: SpecialtyType.CARDIOLOGIST,
    availableTeamSlots: 2,
    readyAt: new Date('2026-10-24T08:00:00Z').toISOString(),
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'staff-005',
    hospitalId: 'hosp-005',
    specialty: SpecialtyType.PEDIATRICIAN,
    availableTeamSlots: 2,
    readyAt: new Date('2026-10-24T08:00:00Z').toISOString(),
    version: 1,
    updatedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
];

/**
 * Connected Road Graph for City Network
 */
export const SEEDED_ROAD_GRAPH: RoadGraphDto = {
  nodes: [
    { id: 'node-amb-start', label: 'Highway Mile 4 Incident Scene', x: 120, y: 150, lat: 40.71, lng: -74.02 },
    { id: 'node-jct-1', label: 'Westside Expressway Junction', x: 200, y: 160, lat: 40.711, lng: -74.012 },
    { id: 'node-jct-2', label: 'Central Midtown Crossroads', x: 300, y: 160, lat: 40.713, lng: -74.005 },
    { id: 'node-hosp-a', label: 'St. Jude Trauma Bay Access', x: 350, y: 150, lat: 40.7128, lng: -74.006 },
    { id: 'node-hosp-b', label: 'Bayview Harbor Slip Access', x: 150, y: 220, lat: 40.7088, lng: -74.015 },
    { id: 'node-jct-3', label: 'North Uptown Cloverleaf', x: 320, y: 90, lat: 40.722, lng: -74.0 },
    { id: 'node-hosp-c', label: 'Northpoint Medical Way', x: 420, y: 80, lat: 40.725, lng: -73.995 },
    { id: 'node-jct-4', label: 'Eastside River Connector', x: 400, y: 240, lat: 40.715, lng: -73.985 },
    { id: 'node-hosp-d', label: 'Eastside Vascular Pavilion', x: 480, y: 280, lat: 40.718, lng: -73.98 },
    { id: 'node-hosp-e', label: 'Valley Children Entrance', x: 90, y: 380, lat: 40.695, lng: -74.02 },
  ],
  edges: [
    // Ambulance start to Junction 1
    {
      id: 'edge-1',
      from: 'node-amb-start',
      to: 'node-jct-1',
      distanceMeters: 2400,
      speedKmh: 60,
      baseTravelSeconds: 144,
      trafficMultiplier: 1.0,
    },
    // Junction 1 to Bayview (Hospital B) - FAST stabilization route
    {
      id: 'edge-2',
      from: 'node-jct-1',
      to: 'node-hosp-b',
      distanceMeters: 1800,
      speedKmh: 50,
      baseTravelSeconds: 130,
      trafficMultiplier: 1.0,
    },
    // Junction 1 to Junction 2 (towards Hospital A)
    {
      id: 'edge-3',
      from: 'node-jct-1',
      to: 'node-jct-2',
      distanceMeters: 3200,
      speedKmh: 55,
      baseTravelSeconds: 210,
      trafficMultiplier: 1.0,
    },
    // Junction 2 to Hospital A (St. Jude)
    {
      id: 'edge-4',
      from: 'node-jct-2',
      to: 'node-hosp-a',
      distanceMeters: 1200,
      speedKmh: 45,
      baseTravelSeconds: 96,
      trafficMultiplier: 1.0,
    },
    // Junction 2 to North Uptown Junction 3
    {
      id: 'edge-5',
      from: 'node-jct-2',
      to: 'node-jct-3',
      distanceMeters: 2800,
      speedKmh: 50,
      baseTravelSeconds: 201,
      trafficMultiplier: 1.0,
    },
    // Junction 3 to Hospital C (Northpoint)
    {
      id: 'edge-6',
      from: 'node-jct-3',
      to: 'node-hosp-c',
      distanceMeters: 1600,
      speedKmh: 50,
      baseTravelSeconds: 115,
      trafficMultiplier: 1.0,
    },
    // Junction 2 to Eastside Connector Junction 4
    {
      id: 'edge-7',
      from: 'node-jct-2',
      to: 'node-jct-4',
      distanceMeters: 3500,
      speedKmh: 50,
      baseTravelSeconds: 252,
      trafficMultiplier: 1.0,
    },
    // Junction 4 to Hospital D (Eastside)
    {
      id: 'edge-8',
      from: 'node-jct-4',
      to: 'node-hosp-d',
      distanceMeters: 1800,
      speedKmh: 45,
      baseTravelSeconds: 144,
      trafficMultiplier: 1.0,
    },
    // Hospital B to Hospital E
    {
      id: 'edge-9',
      from: 'node-hosp-b',
      to: 'node-hosp-e',
      distanceMeters: 4500,
      speedKmh: 50,
      baseTravelSeconds: 324,
      trafficMultiplier: 1.0,
    },
  ],
};

/**
 * Demo Users with documented credentials for each role
 */
export interface SeedUserWithSecret extends UserDto {
  passwordCleartext: string;
}

export const SEEDED_USERS: SeedUserWithSecret[] = [
  {
    id: 'user-amb-001',
    email: 'paramedic@goldenhour.test',
    passwordCleartext: 'demo123',
    name: 'Officer Alex Rivera, Paramedic Lead',
    role: UserRole.AMBULANCE,
    ambulanceId: 'amb-104',
    active: true,
    createdAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'user-hosp-a-001',
    email: 'stjude_admin@goldenhour.test',
    passwordCleartext: 'demo123',
    name: 'Dr. Sarah Vance, St. Jude ED Coordinator',
    role: UserRole.HOSPITAL,
    hospitalId: 'hosp-001',
    active: true,
    createdAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'user-hosp-b-001',
    email: 'bayview_admin@goldenhour.test',
    passwordCleartext: 'demo123',
    name: 'Nurse Manager Marcus Reed, Bayview Urgent',
    role: UserRole.HOSPITAL,
    hospitalId: 'hosp-002',
    active: true,
    createdAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
  {
    id: 'user-admin-001',
    email: 'admin@goldenhour.test',
    passwordCleartext: 'demo123',
    name: 'System Dispatch Admin',
    role: UserRole.ADMIN,
    active: true,
    createdAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
];

/**
 * Initial Ambulance State
 */
export const SEEDED_AMBULANCE = {
  id: 'amb-104',
  label: 'Metro Paramedic Unit 104',
  initialPosition: {
    x: 120,
    y: 150,
    lat: 40.71,
    lng: -74.02,
    speed: 0,
    heading: 85,
    serverSequence: 1,
    observedAt: new Date('2026-10-24T08:00:00Z').toISOString(),
  },
};
