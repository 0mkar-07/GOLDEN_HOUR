/**
 * Scenario Fixtures package for GoldenHour demonstration.
 * Full fixtures and road graphs will be populated in Phase 2.
 */
export const SCENARIO_SEED_VERSION = '2026.10.24-hackathon';

export interface HospitalSeed {
  id: string;
  name: string;
  code: string;
  address: string;
  location: { x: number; y: number; lat: number; lng: number };
  capabilities: string[];
}

export const INITIAL_HOSPITALS_PLACEHOLDER: HospitalSeed[] = [
  {
    id: 'hosp-001',
    name: 'St. Jude Metropolitan Trauma Center',
    code: 'HOSP-A',
    address: '100 Central Ave, Metro City',
    location: { x: 250, y: 120, lat: 40.7128, lng: -74.006 },
    capabilities: ['TRAUMA_L1', 'NEUROSURGERY', 'CARDIAC_CATH', 'VENTILATORS', 'ICU', 'CT_SCAN'],
  },
  {
    id: 'hosp-002',
    name: 'Bayview Urgent Care & Community Hospital',
    code: 'HOSP-B',
    address: '45 Harbor Blvd, Metro City',
    location: { x: 120, y: 190, lat: 40.7088, lng: -74.015 },
    capabilities: ['STABILIZATION', 'EMERGENCY_DEPT', 'BASIC_OXYGEN', 'CT_SCAN'],
  },
  {
    id: 'hosp-003',
    name: 'Northpoint Regional Medical Center',
    code: 'HOSP-C',
    address: '880 Highland Way, Metro City',
    location: { x: 380, y: 90, lat: 40.725, lng: -73.995 },
    capabilities: ['STABILIZATION', 'VENTILATORS', 'ICU', 'EMERGENCY_DEPT'],
  },
  {
    id: 'hosp-004',
    name: 'Eastside Heart & Vascular Institute',
    code: 'HOSP-D',
    address: '310 Riverdale Rd, Metro City',
    location: { x: 420, y: 260, lat: 40.718, lng: -73.98 },
    capabilities: ['CARDIAC_CATH', 'ICU', 'VENTILATORS', 'EMERGENCY_DEPT'],
  },
  {
    id: 'hosp-005',
    name: 'Valley Children & Pediatric Pavilion',
    code: 'HOSP-E',
    address: '500 Meadow Lane, Metro City',
    location: { x: 80, y: 340, lat: 40.695, lng: -74.02 },
    capabilities: ['PEDIATRIC_ICU', 'PEDIATRIC_TRAUMA', 'VENTILATORS', 'EMERGENCY_DEPT'],
  },
];
