import {
  AssessmentObservationsDto,
  Agent1Proposal,
  CAPABILITY_CATALOGUE,
  ClinicalStability,
  ConditionTrend,
  TransportAssessment,
  SelectedPathway,
  RequiredIntervention,
  CareRequirementItem,
  MissingEvidenceItem,
} from '@goldenhour/contracts';
import { getRequirementsInterpreter } from './interpreter.js';
import { agentTools } from './tools.js';

export { agentTools };

export const AGENT_1_VERSION = '2.1.0-patient-state-aware';

/**
 * Agent 1 — Requirements Interpretation Module
 * Deterministically analyzes patient telemetry, presenting issue, and vitals.
 * Proposes full-care needs vs immediate stabilization needs.
 * Explicitly surfaces missing inputs and never assumes missing information is normal.
 */
export function runAgent1(observations: AssessmentObservationsDto): Agent1Proposal {
  const fullCareNeeds: Set<string> = new Set();
  const stabilizationNeeds: Set<string> = new Set();
  const reasons: string[] = [];
  const missingInputs: string[] = [];
  const missingEvidence: MissingEvidenceItem[] = [];
  const policyReasonCodes: string[] = [];
  const immediateRequirements: CareRequirementItem[] = [];
  const definitiveRequirements: CareRequirementItem[] = [];

  const { presentingIssue, vitals, urgencyLevel, ambulanceSupportProvided } = observations;
  const issueLower = presentingIssue.toLowerCase();

  // 1. Evaluate Required Intervention Category
  let requiredIntervention: RequiredIntervention = 'UNKNOWN';
  if (
    issueLower.includes('neurosurg') ||
    issueLower.includes('tbi') ||
    issueLower.includes('head') ||
    issueLower.includes('intracranial') ||
    issueLower.includes('skull fracture') ||
    issueLower.includes('neurolog') ||
    issueLower.includes('pupil') ||
    issueLower.includes('brain')
  ) {
    requiredIntervention = 'NEUROSURGERY';
  } else if (
    issueLower.includes('cardiac') ||
    issueLower.includes('stemi') ||
    issueLower.includes('infarction') ||
    issueLower.includes('cath')
  ) {
    requiredIntervention = 'CARDIAC_CATH';
  } else if (
    issueLower.includes('surgical') ||
    issueLower.includes('abdomen') ||
    issueLower.includes('peritoneal') ||
    issueLower.includes('laparotomy') ||
    issueLower.includes('penetrating') ||
    issueLower.includes('thoracic') ||
    issueLower.includes('or access')
  ) {
    requiredIntervention = 'GENERAL_SURGERY';
  } else if (
    issueLower.includes('respiratory collapse') ||
    issueLower.includes('shock') ||
    issueLower.includes('decompensation') ||
    issueLower.includes('arrest')
  ) {
    requiredIntervention = 'RESUSCITATION';
  }

  // 2. Scenario Presentation Matching & Capability Assignment
  if (
    issueLower.includes('neurosurg') ||
    issueLower.includes('intracranial') ||
    issueLower.includes('neurolog') ||
    issueLower.includes('tbi') ||
    issueLower.includes('head') ||
    issueLower.includes('pupil') ||
    issueLower.includes('brain')
  ) {
    fullCareNeeds.add('TRAUMA_L1');
    fullCareNeeds.add('NEUROSURGERY');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('CT_SCAN');
    fullCareNeeds.add('ICU');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');
    stabilizationNeeds.add('CT_SCAN');

    definitiveRequirements.push({
      capability: 'NEUROSURGERY',
      priority: 'DEFINITIVE',
      reason: 'Suspected intracranial pathology mandates neurosurgical suite and specialist coverage.',
      dependencies: ['OPERATING_THEATRE', 'NEUROSURGEON'],
    });
    definitiveRequirements.push({
      capability: 'TRAUMA_L1',
      priority: 'DEFINITIVE',
      reason: 'Polytrauma resuscitation protocol Level 1 activation.',
      dependencies: ['TRAUMA_SURGEON'],
    });

    immediateRequirements.push({
      capability: 'STABILIZATION',
      priority: 'IMMEDIATE',
      reason: 'Emergency airway and hemodynamic stabilization bay.',
      dependencies: ['TRAUMA_BAY'],
    });
    immediateRequirements.push({
      capability: 'BASIC_OXYGEN',
      priority: 'IMMEDIATE',
      reason: 'Supplemental oxygenation.',
      dependencies: [],
    });

    reasons.push(
      'Polytrauma with suspected intracranial pathology indicates Level 1 Trauma Center with 24/7 Neurosurgery and immediate CT diagnostic suite.'
    );
    reasons.push(
      'Immediate stabilization requires advanced airway support and rapid diagnostic imaging.'
    );
  } else if (
    issueLower.includes('cardiac') ||
    issueLower.includes('stemi') ||
    issueLower.includes('infarction') ||
    issueLower.includes('chest pain')
  ) {
    fullCareNeeds.add('CARDIAC_CATH');
    fullCareNeeds.add('ICU');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('EMERGENCY_DEPT');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');
    stabilizationNeeds.add('EMERGENCY_DEPT');

    definitiveRequirements.push({
      capability: 'CARDIAC_CATH',
      priority: 'DEFINITIVE',
      reason: 'Percutaneous coronary intervention suite on-call.',
      dependencies: ['CARDIOLOGIST', 'CATH_LAB'],
    });

    immediateRequirements.push({
      capability: 'STABILIZATION',
      priority: 'IMMEDIATE',
      reason: 'Emergency department triage and telemetry stabilization.',
      dependencies: ['EMERGENCY_DEPT'],
    });

    reasons.push(
      'Acute coronary syndrome / STEMI criteria require an on-call cardiac catheterization laboratory for emergency PCI.'
    );
  } else if (
    issueLower.includes('surgical') ||
    issueLower.includes('abdomen') ||
    issueLower.includes('peritoneal') ||
    issueLower.includes('laparotomy') ||
    issueLower.includes('penetrating')
  ) {
    fullCareNeeds.add('OPERATING_THEATRE');
    fullCareNeeds.add('EMERGENCY_DEPT');
    fullCareNeeds.add('BASIC_OXYGEN');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');

    definitiveRequirements.push({
      capability: 'OPERATING_THEATRE',
      priority: 'DEFINITIVE',
      reason: 'Urgent emergency surgical intervention required.',
      dependencies: ['OPERATING_THEATRE'],
    });

    immediateRequirements.push({
      capability: 'STABILIZATION',
      priority: 'IMMEDIATE',
      reason: 'Immediate hemodynamic resuscitation before surgical access.',
      dependencies: ['TRAUMA_BAY'],
    });

    reasons.push(
      'Acute surgical presentation requires emergency operating room access and rapid surgical prep.'
    );
  } else if (
    issueLower.includes('trauma') ||
    issueLower.includes('polytrauma')
  ) {
    fullCareNeeds.add('TRAUMA_L1');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('CT_SCAN');
    fullCareNeeds.add('ICU');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');
    stabilizationNeeds.add('CT_SCAN');

    definitiveRequirements.push({
      capability: 'TRAUMA_L1',
      priority: 'DEFINITIVE',
      reason: 'Polytrauma resuscitation protocol Level 1 activation.',
      dependencies: ['TRAUMA_SURGEON'],
    });

    immediateRequirements.push({
      capability: 'STABILIZATION',
      priority: 'IMMEDIATE',
      reason: 'Emergency airway and hemodynamic stabilization bay.',
      dependencies: ['TRAUMA_BAY'],
    });

    reasons.push(
      'Severe trauma requires trauma center resuscitation and ICU monitoring.'
    );
  } else if (
    issueLower.includes('pediatric') ||
    issueLower.includes('child') ||
    issueLower.includes('infant')
  ) {
    // Validated against CAPABILITY_CATALOGUE: replace PEDIATRIC_TRAUMA with TRAUMA_L1 / PEDIATRIC_ICU
    fullCareNeeds.add('PEDIATRIC_ICU');
    fullCareNeeds.add('TRAUMA_L1');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('EMERGENCY_DEPT');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');

    reasons.push(
      'Pediatric emergency requires specialized pediatric intensive care unit (PICU) and age-calibrated mechanical ventilators.'
    );
  } else {
    // Default acute emergency requirements
    fullCareNeeds.add('EMERGENCY_DEPT');
    fullCareNeeds.add('ICU');
    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');
    reasons.push('General severe acute presentation requires emergency intake and ICU standby.');
  }

  // 3. Vital Signs, Telemetry Checks & Missing Evidence Tracking
  let gcsVal: number | null | undefined = vitals.gcs;
  let spo2Val: number | null | undefined = vitals.oxygenSaturation;
  let sbpVal: number | null | undefined = vitals.systolicBp;
  let hrVal: number | null | undefined = vitals.heartRate;
  let rrVal: number | null | undefined = vitals.respiratoryRate;

  if (gcsVal !== null && gcsVal !== undefined) {
    if (gcsVal <= 8) {
      fullCareNeeds.add('VENTILATORS');
      reasons.push(`Severely depressed consciousness (GCS ${gcsVal} <= 8) mandates invasive mechanical ventilation.`);
    }
  } else {
    const reasonType = gcsVal === null ? 'NULL' : 'ABSENT';
    missingInputs.push('Glasgow Coma Scale (GCS) unknown or not recorded.');
    missingEvidence.push({
      field: 'gcs',
      reason: reasonType,
      description: 'Glasgow Coma Scale (GCS) unknown or not recorded.',
    });
  }

  if (spo2Val !== null && spo2Val !== undefined) {
    if (spo2Val < 92) {
      stabilizationNeeds.add('BASIC_OXYGEN');
      fullCareNeeds.add('VENTILATORS');
      reasons.push(`Critical hypoxemia (SpO2 ${spo2Val}%) requires supplemental oxygenation and respiratory support.`);
    }
  } else {
    const reasonType = spo2Val === null ? 'NULL' : 'ABSENT';
    missingInputs.push('Oxygen saturation (SpO2) not recorded.');
    missingEvidence.push({
      field: 'oxygenSaturation',
      reason: reasonType,
      description: 'Oxygen saturation (SpO2) not recorded.',
    });
  }

  if (sbpVal === null || sbpVal === undefined) {
    const reasonType = sbpVal === null ? 'NULL' : 'ABSENT';
    missingInputs.push('Systolic blood pressure not recorded.');
    missingEvidence.push({
      field: 'systolicBp',
      reason: reasonType,
      description: 'Systolic blood pressure not recorded.',
    });
  } else if (sbpVal < 90) {
    stabilizationNeeds.add('STABILIZATION');
    reasons.push(`Hemodynamic instability / hypotension (BP ${sbpVal}/${vitals.diastolicBp ?? '?'}) requires emergency resuscitation.`);
  }

  if (hrVal === null || hrVal === undefined) {
    const reasonType = hrVal === null ? 'NULL' : 'ABSENT';
    missingInputs.push('Heart rate not recorded.');
    missingEvidence.push({
      field: 'heartRate',
      reason: reasonType,
      description: 'Heart rate not recorded.',
    });
  }

  if (rrVal === null || rrVal === undefined) {
    const reasonType = rrVal === null ? 'NULL' : 'ABSENT';
    missingInputs.push('Respiratory rate not recorded.');
    missingEvidence.push({
      field: 'respiratoryRate',
      reason: reasonType,
      description: 'Respiratory rate not recorded.',
    });
  }

  // 4. Determine Clinical Stability & Condition Trend
  let proposedClinicalStability: ClinicalStability = observations.clinicalStability || 'UNKNOWN';
  if (proposedClinicalStability === 'UNKNOWN') {
    if (
      (gcsVal !== undefined && gcsVal !== null && gcsVal <= 8) ||
      (spo2Val !== undefined && spo2Val !== null && spo2Val < 90) ||
      (sbpVal !== undefined && sbpVal !== null && sbpVal < 90) ||
      (hrVal !== undefined && hrVal !== null && (hrVal > 130 || hrVal < 45)) ||
      urgencyLevel === 'CRITICAL'
    ) {
      proposedClinicalStability = 'UNSTABLE';
    } else if (
      gcsVal !== undefined && gcsVal !== null && gcsVal >= 13 &&
      spo2Val !== undefined && spo2Val !== null && spo2Val >= 95 &&
      sbpVal !== undefined && sbpVal !== null && sbpVal >= 90
    ) {
      proposedClinicalStability = 'STABLE';
    }
  }

  let proposedConditionTrend: ConditionTrend = observations.conditionTrend || 'UNKNOWN';
  if (proposedConditionTrend === 'UNKNOWN') {
    if (issueLower.includes('deteriorat') || issueLower.includes('worsen') || issueLower.includes('collapse')) {
      proposedConditionTrend = 'DETERIORATING';
    } else if (proposedClinicalStability === 'STABLE') {
      proposedConditionTrend = 'UNCHANGED';
    }
  }

  // 5. Prehospital Ambulance Support Integration
  if (ambulanceSupportProvided.length > 0) {
    reasons.push(`Ambulance active interventions: ${ambulanceSupportProvided.join(', ')}.`);
  }

  // 6. Propose Transport Assessment & Pathway
  let proposedTransportAssessment: TransportAssessment = 'REVIEW_REQUIRED';
  let proposedPathway: SelectedPathway = 'REVIEW_REQUIRED';

  const isDeterioratingOrRefractory =
    proposedClinicalStability === 'UNSTABLE' &&
    (proposedConditionTrend === 'DETERIORATING' ||
      (spo2Val !== null && spo2Val !== undefined && spo2Val < 85) ||
      (sbpVal !== null && sbpVal !== undefined && sbpVal < 80) ||
      issueLower.includes('stabilisation before') ||
      issueLower.includes('stabilization before') ||
      issueLower.includes('collapse') ||
      issueLower.includes('refractory'));

  if (missingInputs.length >= 3 && proposedClinicalStability === 'UNKNOWN') {
    proposedTransportAssessment = 'REVIEW_REQUIRED';
    proposedPathway = 'REVIEW_REQUIRED';
    policyReasonCodes.push('TRANSPORT_ASSESSMENT_REQUIRED');
    reasons.push('Multiple critical physiological inputs missing; clinician transport assessment review required.');
  } else if (isDeterioratingOrRefractory) {
    proposedTransportAssessment = 'STABILIZE_BEFORE_TRANSFER';
    proposedPathway = 'STABILIZE_THEN_TRANSFER';
    policyReasonCodes.push('STABILIZATION_FIRST_CONFIRMED');
    reasons.push(
      'Acute physiological deterioration or refractory decompensation mandates immediate nearest stabilisation before onward transfer.'
    );
  } else if (proposedClinicalStability === 'STABLE' || urgencyLevel === 'STABLE' || urgencyLevel === 'URGENT') {
    proposedTransportAssessment = 'DIRECT_TRANSPORT_PERMITTED';
    proposedPathway = 'DIRECT_DEFINITIVE';
    policyReasonCodes.push('DIRECT_TRANSPORT_CONFIRMED');
    reasons.push('Patient physiologically compensated; direct transport to definitive care facility is permitted.');
  } else if (urgencyLevel === 'CRITICAL' && (requiredIntervention === 'NEUROSURGERY' || requiredIntervention === 'CARDIAC_CATH')) {
    // Critical patient needing specialist capability where direct transport is supported
    proposedTransportAssessment = 'DIRECT_TRANSPORT_PERMITTED';
    proposedPathway = 'DIRECT_DEFINITIVE';
    policyReasonCodes.push('DEFINITIVE_SERVICE_REQUIRED', 'DIRECT_TRANSPORT_CONFIRMED');
    reasons.push(
      'Critical patient requiring specialist definitive capability; direct transport permitted by prehospital protocol.'
    );
  } else {
    proposedTransportAssessment = 'REVIEW_REQUIRED';
    proposedPathway = 'REVIEW_REQUIRED';
    policyReasonCodes.push('TRANSPORT_ASSESSMENT_REQUIRED');
  }

  // Validate all emitted capabilities against CAPABILITY_CATALOGUE
  const validFullCare = Array.from(fullCareNeeds).filter((c) => c in CAPABILITY_CATALOGUE);
  const validStab = Array.from(stabilizationNeeds).filter((c) => c in CAPABILITY_CATALOGUE);

  return {
    proposedFullCareNeeds: validFullCare,
    proposedStabilizationNeeds: validStab,
    reasons,
    missingInputs,
    interpreterType: 'DETERMINISTIC_RULES',
    confidence: 1.0,
    proposedClinicalStability,
    proposedConditionTrend,
    proposedTransportAssessment,
    proposedPathway,
    requiredIntervention,
    immediateRequirements,
    definitiveRequirements,
    missingEvidence,
    policyReasonCodes,
  };
}

/**
 * Asynchronous Agent 1 Runner
 * Uses the configured RequirementsInterpreter (Gemini LLM with graceful deterministic fallback).
 */
export async function runAgent1Async(observations: AssessmentObservationsDto): Promise<Agent1Proposal> {
  const interpreter = getRequirementsInterpreter();
  return interpreter.interpret(observations);
}
