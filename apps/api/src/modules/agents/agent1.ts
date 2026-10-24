import { AssessmentObservationsDto, Agent1Proposal, CAPABILITY_CATALOGUE } from '@goldenhour/contracts';
import { getRequirementsInterpreter } from './interpreter.js';
import { agentTools } from './tools.js';

export { agentTools };

export const AGENT_1_VERSION = '2.0.0-gemini-hybrid';

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

  const { presentingIssue, vitals, urgencyLevel, ambulanceSupportProvided } = observations;
  const issueLower = presentingIssue.toLowerCase();

  // 1. Scenario Presentation Matching
  if (
    issueLower.includes('trauma') ||
    issueLower.includes('tbi') ||
    issueLower.includes('head') ||
    issueLower.includes('polytrauma')
  ) {
    fullCareNeeds.add('TRAUMA_L1');
    fullCareNeeds.add('NEUROSURGERY');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('CT_SCAN');
    fullCareNeeds.add('ICU');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');
    stabilizationNeeds.add('CT_SCAN');

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

    reasons.push(
      'Acute coronary syndrome / STEMI criteria require an on-call cardiac catheterization laboratory for emergency PCI.'
    );
  } else if (
    issueLower.includes('pediatric') ||
    issueLower.includes('child') ||
    issueLower.includes('infant')
  ) {
    fullCareNeeds.add('PEDIATRIC_ICU');
    fullCareNeeds.add('PEDIATRIC_TRAUMA');
    fullCareNeeds.add('VENTILATORS');
    fullCareNeeds.add('EMERGENCY_DEPT');

    stabilizationNeeds.add('STABILIZATION');
    stabilizationNeeds.add('BASIC_OXYGEN');

    reasons.push(
      'Pediatric emergency requires specialized pediatric intensive care unit (PICU) and age-calibrated mechanical ventilators.'
    );
  } else {
    // Default emergency requirements
    fullCareNeeds.add('EMERGENCY_DEPT');
    fullCareNeeds.add('ICU');
    stabilizationNeeds.add('STABILIZATION');
    reasons.push('General severe acute presentation requires emergency intake and ICU standby.');
  }

  // 2. Vital Signs & Airway Checks
  if (vitals.gcs !== null && vitals.gcs !== undefined) {
    if (vitals.gcs <= 8) {
      fullCareNeeds.add('VENTILATORS');
      reasons.push(`Severely depressed consciousness (GCS ${vitals.gcs} <= 8) mandates invasive mechanical ventilation.`);
    }
  } else {
    missingInputs.push('Glasgow Coma Scale (GCS) unknown or not recorded.');
  }

  if (vitals.oxygenSaturation !== null && vitals.oxygenSaturation !== undefined) {
    if (vitals.oxygenSaturation < 92) {
      stabilizationNeeds.add('BASIC_OXYGEN');
      fullCareNeeds.add('VENTILATORS');
      reasons.push(`Critical hypoxemia (SpO2 ${vitals.oxygenSaturation}%) requires supplemental oxygenation and respiratory support.`);
    }
  } else {
    missingInputs.push('Oxygen saturation (SpO2) not recorded.');
  }

  if (vitals.systolicBp === null || vitals.systolicBp === undefined) {
    missingInputs.push('Systolic blood pressure not recorded.');
  } else if (vitals.systolicBp < 90) {
    stabilizationNeeds.add('STABILIZATION');
    reasons.push(`Hemodynamic instability / hypotension (BP ${vitals.systolicBp}/${vitals.diastolicBp ?? '?'}) requires emergency resuscitation.`);
  }

  if (vitals.heartRate === null || vitals.heartRate === undefined) {
    missingInputs.push('Heart rate not recorded.');
  }

  if (vitals.respiratoryRate === null || vitals.respiratoryRate === undefined) {
    missingInputs.push('Respiratory rate not recorded.');
  }

  // 3. Ambulance Prehospital Support
  if (ambulanceSupportProvided.length > 0) {
    reasons.push(`Ambulance active interventions: ${ambulanceSupportProvided.join(', ')}.`);
  }

  return {
    proposedFullCareNeeds: Array.from(fullCareNeeds),
    proposedStabilizationNeeds: Array.from(stabilizationNeeds),
    reasons,
    missingInputs,
    interpreterType: 'DETERMINISTIC_RULES',
    confidence: 1.0,
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
