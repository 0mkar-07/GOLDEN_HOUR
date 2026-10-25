import {
  AssessmentObservationsDto,
  ClinicalStability,
  ConditionTrend,
  TransportAssessment,
  SelectedPathway,
  RequiredIntervention,
} from '@goldenhour/contracts';

export interface ScenarioRoleBindings {
  roleA: string; // Comprehensive definitive care facility
  roleB: string; // Nearer acute care / stabilisation facility
  roleC: string; // Another nearby facility lacking required service
}

export interface ScenarioExpectedOutcome {
  expectedWinnerRole: 'PRIMARY_A' | 'BACKUP_B' | 'BACKUP_C' | 'NONE';
  expectedWinnerHospitalId: string;
  expectedReasonCodes: string[];
  expectedCareObjective: 'FULL_CARE' | 'STABILIZATION';
  explanationSnippet: string;
}

export interface ScenarioSpecification {
  scenarioId: string;
  caseNumber: number;
  title: string;
  description: string;
  seed: string;
  evaluationTime: string;
  ambulanceOrigin: { lat: number; lng: number; x: number; y: number };
  roleBindings: ScenarioRoleBindings;
  observations: AssessmentObservationsDto;
  priorObservations?: AssessmentObservationsDto[];
  confirmedState: {
    clinicalStability: ClinicalStability;
    conditionTrend: ConditionTrend;
    transportAssessment: TransportAssessment;
    selectedPathway: SelectedPathway;
    requiredIntervention: RequiredIntervention;
    confirmedFullCareNeeds: string[];
    confirmedStabilizationNeeds: string[];
  };
  syntheticTravelSeconds: Record<string, number>;
  operationalOverlayRevision: string;
  theatreOccupiedHospitalB?: boolean;
  expectedOutcome: ScenarioExpectedOutcome;
}

export const CANONICAL_DEMO_ROLE_BINDINGS: ScenarioRoleBindings = {
  roleA: 'nitk:AJ_HOSPITAL_MANGALURU', // Tertiary Medical College Hospital with Neurosurgery & Level 1 Trauma
  roleB: 'nitk:PADMAVATHI_SURATHKAL', // Nearer Surathkal hospital with stabilization & emergency surgery
  roleC: 'nitk:CHIRASHREE_SURATHKAL', // Nearer nursing home lacking acute surgical/trauma resuscitation
};

export const SYNTHETIC_TEACHING_TRAVEL_SECONDS: Record<string, number> = {
  'nitk:AJ_HOSPITAL_MANGALURU': 18 * 60, // 18 min = 1080s
  'nitk:PADMAVATHI_SURATHKAL': 7 * 60, // 7 min = 420s
  'nitk:CHIRASHREE_SURATHKAL': 5 * 60, // 5 min = 300s
};

/**
 * 6 Reproducible Synthetic Demonstration Scenarios as specified in Section 1 and Section 4.1
 */
export const DEMONSTRATION_SCENARIOS: Record<string, ScenarioSpecification> = {
  // Case 1: Stable patient needing specialist neurosurgery; direct transport permitted -> A wins
  SCENARIO_1_STABLE_SPECIALIST: {
    scenarioId: 'SCENARIO_1_STABLE_SPECIALIST',
    caseNumber: 1,
    title: 'Stable Patient Needing Specialist Service (A wins over nearer B)',
    description:
      'A is selected even though B is closer, because B lacks a required specialist service (Neurosurgery) and the assessed transport plan permits proceeding directly to A.',
    seed: 'scenario-1-stable-specialist',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Motor vehicle accident with focal neurological deficit and suspected intracranial hemorrhage.',
      urgencyLevel: 'STABLE',
      vitals: {
        heartRate: 78,
        systolicBp: 124,
        diastolicBp: 78,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        gcs: 14,
      },
      ambulanceSupportProvided: ['C-collar applied', 'IV line established'],
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
    },
    confirmedState: {
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
      transportAssessment: 'DIRECT_TRANSPORT_PERMITTED',
      selectedPathway: 'DIRECT_DEFINITIVE',
      requiredIntervention: 'NEUROSURGERY',
      confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'CT_SCAN', 'ICU', 'VENTILATORS'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN', 'CT_SCAN'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-baseline',
    expectedOutcome: {
      expectedWinnerRole: 'PRIMARY_A',
      expectedWinnerHospitalId: CANONICAL_DEMO_ROLE_BINDINGS.roleA,
      expectedReasonCodes: [
        'DEFINITIVE_SERVICE_REQUIRED',
        'NEARER_FACILITY_MISSING_REQUIRED_SERVICE',
        'DIRECT_TRANSPORT_CONFIRMED',
      ],
      expectedCareObjective: 'FULL_CARE',
      explanationSnippet:
        'Padmavathi Community Hospital is nearer but lacks the confirmed specialist service (NEUROSURGERY); direct transport to A.J. Hospital is the confirmed pathway.',
    },
  },

  // Case 2: Urgent patient needing emergency intervention B can provide -> B wins at 11m vs A at 22m
  SCENARIO_2_URGENT_GENERAL: {
    scenarioId: 'SCENARIO_2_URGENT_GENERAL',
    caseNumber: 2,
    title: 'Urgent Patient Needing General Emergency Intervention (B wins sooner)',
    description:
      'B is selected because its relevant emergency theatre and surgical team can start the needed care sooner (11 min) than A (22 min). B need not have every capability A possesses.',
    seed: 'scenario-2-urgent-general',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Blunt abdominal trauma with acute surgical abdomen and peritoneal signs; hemodynamically compensated.',
      urgencyLevel: 'URGENT',
      vitals: {
        heartRate: 98,
        systolicBp: 110,
        diastolicBp: 70,
        respiratoryRate: 20,
        oxygenSaturation: 96,
        gcs: 15,
      },
      ambulanceSupportProvided: ['Normal saline infusing', 'Oxygen via nasal cannula'],
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
    },
    confirmedState: {
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
      transportAssessment: 'DIRECT_TRANSPORT_PERMITTED',
      selectedPathway: 'DIRECT_DEFINITIVE',
      requiredIntervention: 'GENERAL_SURGERY',
      confirmedFullCareNeeds: ['OPERATING_THEATRE', 'EMERGENCY_DEPT', 'BASIC_OXYGEN'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-baseline',
    expectedOutcome: {
      expectedWinnerRole: 'BACKUP_B',
      expectedWinnerHospitalId: 'nitk:PADMAVATHI_SURATHKAL',
      expectedReasonCodes: [
        'EARLIER_REQUIRED_INTERVENTION',
        'DIRECT_TRANSPORT_CONFIRMED',
      ],
      expectedCareObjective: 'FULL_CARE',
      explanationSnippet:
        'Padmavathi Community Hospital meets the required intervention needs and can start at 11 min; A.J. Hospital can start at 22 min.',
    },
  },

  // Case 3: Critical patient needing capabilities only A provides -> A wins; critical != nearest
  SCENARIO_3_CRITICAL_SPECIALIST: {
    scenarioId: 'SCENARIO_3_CRITICAL_SPECIALIST',
    caseNumber: 3,
    title: 'Critical Patient Needing Specialist Capabilities (A wins; severity != nearest)',
    description:
      'A is selected when the professionally confirmed plan supports direct transport, because critical condition does not erase required specialist capabilities (Neurosurgery).',
    seed: 'scenario-3-critical-specialist',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Severe traumatic brain injury with uncal herniation signs, blown pupil, and posturing.',
      urgencyLevel: 'CRITICAL',
      vitals: {
        heartRate: 52,
        systolicBp: 178,
        diastolicBp: 104,
        respiratoryRate: 10,
        oxygenSaturation: 91,
        gcs: 6,
      },
      ambulanceSupportProvided: ['Bag-valve-mask with 100% O2', 'Hypertonic saline given'],
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
    },
    confirmedState: {
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
      transportAssessment: 'DIRECT_TRANSPORT_PERMITTED',
      selectedPathway: 'DIRECT_DEFINITIVE',
      requiredIntervention: 'NEUROSURGERY',
      confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN', 'VENTILATORS'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-baseline',
    expectedOutcome: {
      expectedWinnerRole: 'PRIMARY_A',
      expectedWinnerHospitalId: CANONICAL_DEMO_ROLE_BINDINGS.roleA,
      expectedReasonCodes: [
        'DEFINITIVE_SERVICE_REQUIRED',
        'NEARER_FACILITY_MISSING_REQUIRED_SERVICE',
        'DIRECT_TRANSPORT_CONFIRMED',
      ],
      expectedCareObjective: 'FULL_CARE',
      explanationSnippet:
        'A.J. Hospital selected because critical specialist requirement (Neurosurgery) is confirmed and direct transport permitted; severity alone does not erase required capabilities.',
    },
  },

  // Case 4: Patient deteriorating and requiring stabilisation before transfer -> B wins immediate
  SCENARIO_4_DETERIORATING_STABILIZE_FIRST: {
    scenarioId: 'SCENARIO_4_DETERIORATING_STABILIZE_FIRST',
    caseNumber: 4,
    title: 'Deteriorating Patient Requiring Stabilisation First (B wins immediate care)',
    description:
      'B becomes the immediate destination when B can deliver the required stabilisation sooner (8 min vs 20 min) and the confirmed plan requires stabilisation before transfer, even if definitive care remains at A.',
    seed: 'scenario-4-deteriorating-stabilize-first',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Acute respiratory collapse and worsening refractory shock in transit.',
      urgencyLevel: 'CRITICAL',
      vitals: {
        heartRate: 136,
        systolicBp: 72,
        diastolicBp: 44,
        respiratoryRate: 34,
        oxygenSaturation: 82,
        gcs: 9,
      },
      ambulanceSupportProvided: ['High-flow O2 non-rebreather', 'Push-dose epinephrine'],
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
    },
    confirmedState: {
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
      transportAssessment: 'STABILIZE_BEFORE_TRANSFER',
      selectedPathway: 'STABILIZE_THEN_TRANSFER',
      requiredIntervention: 'RESUSCITATION',
      confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'ICU'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN', 'TRAUMA_BAY'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-baseline',
    expectedOutcome: {
      expectedWinnerRole: 'BACKUP_B',
      expectedWinnerHospitalId: 'nitk:PADMAVATHI_SURATHKAL',
      expectedReasonCodes: [
        'STABILIZATION_FIRST_CONFIRMED',
        'EARLIER_REQUIRED_INTERVENTION',
      ],
      expectedCareObjective: 'STABILIZATION',
      explanationSnippet:
        'Immediate stabilisation at Padmavathi Community Hospital is recommended under the confirmed plan; definitive treatment remains a separate next step.',
    },
  },

  // Case 5: Nearest facility C unsuitable -> C excluded despite 5 min proximity
  SCENARIO_5_NEAREST_UNSUITABLE: {
    scenarioId: 'SCENARIO_5_NEAREST_UNSUITABLE',
    caseNumber: 5,
    title: 'Nearest Facility Unsuitable (C excluded despite being closest)',
    description:
      'C is excluded despite being closest (5 min) because it cannot deliver the patient immediate required intervention (lacks resuscitation bay / emergency surgery).',
    seed: 'scenario-5-nearest-unsuitable',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Severe penetrating trauma with active thoracic hemorrhage requiring immediate surgical chest tube / bay.',
      urgencyLevel: 'CRITICAL',
      vitals: {
        heartRate: 128,
        systolicBp: 84,
        diastolicBp: 52,
        respiratoryRate: 28,
        oxygenSaturation: 89,
        gcs: 13,
      },
      ambulanceSupportProvided: ['Occlusive dressing', 'Large-bore IV'],
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
    },
    confirmedState: {
      clinicalStability: 'UNSTABLE',
      conditionTrend: 'DETERIORATING',
      transportAssessment: 'STABILIZE_BEFORE_TRANSFER',
      selectedPathway: 'STABILIZE_THEN_TRANSFER',
      requiredIntervention: 'RESUSCITATION',
      confirmedFullCareNeeds: ['TRAUMA_L1', 'OPERATING_THEATRE'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'TRAUMA_BAY'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-baseline',
    expectedOutcome: {
      expectedWinnerRole: 'BACKUP_B',
      expectedWinnerHospitalId: 'nitk:PADMAVATHI_SURATHKAL',
      expectedReasonCodes: [
        'NEARER_FACILITY_MISSING_REQUIRED_SERVICE',
        'STABILIZATION_FIRST_CONFIRMED',
      ],
      expectedCareObjective: 'STABILIZATION',
      explanationSnippet:
        'Chirashree Hospital is excluded despite being closest (5 min) because it lacks required resuscitation/trauma bay capabilities.',
    },
  },

  // Case 6: B near but its theatre is occupied -> A wins on earlier care start (22m vs 35m)
  SCENARIO_6_THEATRE_UNAVAILABLE: {
    scenarioId: 'SCENARIO_6_THEATRE_UNAVAILABLE',
    caseNumber: 6,
    title: 'Nearer Facility Theatre Unavailable (A wins on earlier service start)',
    description:
      'Urgent general surgical case where B is near (7 min travel) but its compatible theatre is occupied and turnover is delayed to 35 min. A can start care at 22 min, so A wins on earlier feasible care start.',
    seed: 'scenario-6-theatre-unavailable',
    evaluationTime: '2026-10-25T08:00:00.000Z',
    ambulanceOrigin: { lat: 13.011, lng: 74.7943, x: 120, y: 150 },
    roleBindings: CANONICAL_DEMO_ROLE_BINDINGS,
    observations: {
      presentingIssue: 'Acute surgical abdomen requiring emergency operating room access.',
      urgencyLevel: 'URGENT',
      vitals: {
        heartRate: 94,
        systolicBp: 114,
        diastolicBp: 74,
        respiratoryRate: 18,
        oxygenSaturation: 97,
        gcs: 15,
      },
      ambulanceSupportProvided: ['Analgesia administered', 'IV maintenance'],
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
    },
    confirmedState: {
      clinicalStability: 'STABLE',
      conditionTrend: 'UNCHANGED',
      transportAssessment: 'DIRECT_TRANSPORT_PERMITTED',
      selectedPathway: 'DIRECT_DEFINITIVE',
      requiredIntervention: 'GENERAL_SURGERY',
      confirmedFullCareNeeds: ['OPERATING_THEATRE', 'EMERGENCY_DEPT'],
      confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
    },
    syntheticTravelSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS,
    operationalOverlayRevision: 'rev-theatre-busy',
    theatreOccupiedHospitalB: true,
    expectedOutcome: {
      expectedWinnerRole: 'PRIMARY_A',
      expectedWinnerHospitalId: CANONICAL_DEMO_ROLE_BINDINGS.roleA,
      expectedReasonCodes: [
        'THEATRE_NOT_READY_AT_ARRIVAL',
        'EARLIER_REQUIRED_INTERVENTION',
      ],
      expectedCareObjective: 'FULL_CARE',
      explanationSnippet:
        'A.J. Hospital can start surgical care at 22 min; Padmavathi Community Hospital is delayed to 35 min due to theatre turnover.',
    },
  },
};
