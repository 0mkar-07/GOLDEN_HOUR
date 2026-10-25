import { z } from 'zod';
import { ReceivingStatus } from './enums.js';

export const LocationSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type LocationDto = z.infer<typeof LocationSchema>;

/**
 * Stage 2: Capability Catalogue Definition
 */
export const CapabilityCodeEnum = z.enum([
  'TRAUMA_L1',
  'NEUROSURGERY',
  'CARDIAC_CATH',
  'VENTILATORS',
  'ICU',
  'CT_SCAN',
  'STABILIZATION',
  'BASIC_OXYGEN',
  'EMERGENCY_DEPT',
  'OPERATING_THEATRE',
  'BLOOD_BANK',
  'DIALYSIS',
  'STROKE_CARE',
  'PEDIATRIC_ICU',
  'NEONATAL_ICU',
  'BURNS_CARE',
  'MRI',
  'LABORATORY',
]);
export type CapabilityCode = z.infer<typeof CapabilityCodeEnum>;

export interface CapabilityCatalogueItem {
  code: CapabilityCode;
  label: string;
  category: 'TRAUMA' | 'CRITICAL_CARE' | 'SURGICAL' | 'DIAGNOSTIC' | 'EMERGENCY' | 'SPECIALTY';
  unit: string | null;
  isCountable: boolean;
  description: string;
}

export const CAPABILITY_CATALOGUE: Record<CapabilityCode, CapabilityCatalogueItem> = {
  TRAUMA_L1: {
    code: 'TRAUMA_L1',
    label: 'Level 1 Trauma Service',
    category: 'TRAUMA',
    unit: null,
    isCountable: false,
    description: 'Comprehensive trauma resuscitation, 24x7 trauma surgeon & neurotrauma capability',
  },
  NEUROSURGERY: {
    code: 'NEUROSURGERY',
    label: 'Neurosurgery Service',
    category: 'SURGICAL',
    unit: null,
    isCountable: false,
    description: 'Dedicated neurosurgical OR, ICP monitoring, and cranial intervention suite',
  },
  CARDIAC_CATH: {
    code: 'CARDIAC_CATH',
    label: 'Cardiac Cath Lab',
    category: 'DIAGNOSTIC',
    unit: 'labs',
    isCountable: true,
    description: 'Emergency percutaneous coronary intervention (PCI) & catheterization suites',
  },
  VENTILATORS: {
    code: 'VENTILATORS',
    label: 'Mechanical Ventilators',
    category: 'CRITICAL_CARE',
    unit: 'units',
    isCountable: true,
    description: 'Invasive critical care mechanical ventilators for respiratory support',
  },
  ICU: {
    code: 'ICU',
    label: 'Intensive Care Unit (ICU)',
    category: 'CRITICAL_CARE',
    unit: 'beds',
    isCountable: true,
    description: 'Fully equipped multi-disciplinary critical care beds with invasive monitoring',
  },
  CT_SCAN: {
    code: 'CT_SCAN',
    label: 'Computed Tomography (CT)',
    category: 'DIAGNOSTIC',
    unit: 'scanners',
    isCountable: true,
    description: 'High-speed multi-slice CT scanner for rapid polytrauma & head injury diagnostics',
  },
  STABILIZATION: {
    code: 'STABILIZATION',
    label: 'Resuscitation / Stabilization Bay',
    category: 'EMERGENCY',
    unit: 'bays',
    isCountable: true,
    description: 'Dedicated resuscitation bay for initial airway, breathing, and circulation control',
  },
  BASIC_OXYGEN: {
    code: 'BASIC_OXYGEN',
    label: 'Oxygen-Supported Beds',
    category: 'CRITICAL_CARE',
    unit: 'beds',
    isCountable: true,
    description: 'Piped high-flow or cylinder oxygen support beds for intermediate care',
  },
  EMERGENCY_DEPT: {
    code: 'EMERGENCY_DEPT',
    label: 'Emergency Department',
    category: 'EMERGENCY',
    unit: null,
    isCountable: false,
    description: '24x7 emergency medical triage, acute trauma receiving, and nursing coverage',
  },
  OPERATING_THEATRE: {
    code: 'OPERATING_THEATRE',
    label: 'Operating Theatres',
    category: 'SURGICAL',
    unit: 'theatres',
    isCountable: true,
    description: 'Aseptic operating rooms for emergency and scheduled surgical procedures',
  },
  BLOOD_BANK: {
    code: 'BLOOD_BANK',
    label: 'Blood Bank / Transfusion',
    category: 'SPECIALTY',
    unit: null,
    isCountable: false,
    description: 'On-site licensed blood storage, cross-matching, and component availability',
  },
  DIALYSIS: {
    code: 'DIALYSIS',
    label: 'Hemodialysis Unit',
    category: 'SPECIALTY',
    unit: 'machines',
    isCountable: true,
    description: 'Acute hemodialysis units for renal failure and toxicological emergencies',
  },
  STROKE_CARE: {
    code: 'STROKE_CARE',
    label: 'Comprehensive Stroke Unit',
    category: 'SPECIALTY',
    unit: null,
    isCountable: false,
    description: 'Acute thrombolysis and endovascular thrombectomy stroke care capability',
  },
  PEDIATRIC_ICU: {
    code: 'PEDIATRIC_ICU',
    label: 'Pediatric ICU (PICU)',
    category: 'CRITICAL_CARE',
    unit: 'beds',
    isCountable: true,
    description: 'Specialized intensive care for pediatric emergency patients',
  },
  NEONATAL_ICU: {
    code: 'NEONATAL_ICU',
    label: 'Neonatal ICU (NICU)',
    category: 'CRITICAL_CARE',
    unit: 'beds',
    isCountable: true,
    description: 'Advanced incubator and respiratory support for neonates',
  },
  BURNS_CARE: {
    code: 'BURNS_CARE',
    label: 'Burns Management Unit',
    category: 'SPECIALTY',
    unit: 'beds',
    isCountable: true,
    description: 'Sterile isolation and fluid resuscitation unit for severe thermal injuries',
  },
  MRI: {
    code: 'MRI',
    label: 'Magnetic Resonance Imaging',
    category: 'DIAGNOSTIC',
    unit: 'scanners',
    isCountable: true,
    description: 'High-field MRI diagnostic imaging for spinal cord and neurovascular evaluation',
  },
  LABORATORY: {
    code: 'LABORATORY',
    label: '24x7 Clinical Laboratory',
    category: 'DIAGNOSTIC',
    unit: null,
    isCountable: false,
    description: 'Stat arterial blood gas, troponin, coagulation, and biochemistry diagnostics',
  },
};

/**
 * Structured tabular capability value with strict NIL semantics
 */
export const TabularCapabilityValueSchema = z.object({
  supported: z.boolean().nullable(),
  availableCount: z.number().int().nonnegative().nullable(),
  totalCount: z.number().int().nonnegative().nullable(),
  isOpenNow: z.boolean().nullable(),
  verificationStatus: z.enum(['UNKNOWN', 'UNVERIFIED', 'VERIFIED', 'STALE']).default('UNVERIFIED'),
});
export type TabularCapabilityValue = z.infer<typeof TabularCapabilityValueSchema>;

export const FacilityProvenanceSchema = z.object({
  source: z.string(),
  datasetStatus: z.enum(['synthetic_demo', 'verified_live']),
  coordinateSource: z.string(),
  coordinateConfidence: z.enum(['low', 'medium', 'high']),
  importedAt: z.string(),
  lastVerifiedAt: z.string().nullable().optional(),
});
export type FacilityProvenance = z.infer<typeof FacilityProvenanceSchema>;

export const HospitalSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string(),
  location: LocationSchema,
  capabilities: z.array(z.string()),
  receivingStatus: z.nativeEnum(ReceivingStatus),
  receivingDelaySeconds: z.number().nonnegative().default(120),
  version: z.number().int().positive(),
  updatedAt: z.string(),

  // Extended fields for Stage 2 & 5 Tabular Directory & Stage 3 Operational Overlays
  operationalProfile: z
    .enum([
      'LOW_LOAD_STABILIZATION',
      'BUSY_EMERGENCY_INTAKE',
      'SPECIALIST_ON_CALL',
      'EQUIPMENT_MAINTENANCE',
      'THEATRE_OCCUPIED',
      'SERVICE_CLOSED',
      'STANDARD_BASELINE',
    ])
    .default('STANDARD_BASELINE')
    .optional(),
  intakeServiceSeconds: z.number().nonnegative().optional(),
  queueEstimatedWaitSeconds: z.number().nonnegative().optional(),
  roadAccessPoint: LocationSchema.optional(),
  facilityType: z
    .enum(['hospital', 'medical_college_hospital', 'nursing_home', 'campus_health_center'])
    .default('hospital')
    .optional(),
  city: z.string().default('Mangaluru').optional(),
  pincode: z.string().default('575025').optional(),
  distanceFromNitkKm: z.number().nonnegative().default(0).optional(),
  capabilitiesDetail: z.record(TabularCapabilityValueSchema).optional(),
  provenance: FacilityProvenanceSchema.optional(),
  timingsSummary: z
    .object({
      emergency: z.string().nullable().optional(),
      opd: z.string().nullable().optional(),
      electiveOt: z.string().nullable().optional(),
    })
    .optional(),
  surgicalSummary: z
    .object({
      electiveSupported: z.boolean().nullable().optional(),
      emergencySupported: z.boolean().nullable().optional(),
      operatingTheatresTotal: z.number().int().nonnegative().nullable().optional(),
      operatingTheatresAvailable: z.number().int().nonnegative().nullable().optional(),
    })
    .optional(),
});

export type HospitalDto = z.infer<typeof HospitalSchema>;

export const UpdateHospitalRequestSchema = z.object({
  name: z.string().optional(),
  receivingStatus: z.nativeEnum(ReceivingStatus).optional(),
  receivingDelaySeconds: z.number().nonnegative().optional(),
  capabilities: z.array(z.string()).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export type UpdateHospitalRequest = z.infer<typeof UpdateHospitalRequestSchema>;
