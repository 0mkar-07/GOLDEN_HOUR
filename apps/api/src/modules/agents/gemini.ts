import { GoogleGenAI } from '@google/genai';
import { AssessmentObservationsDto, Agent1Proposal } from '@goldenhour/contracts';
import { config } from '../../config.js';

let genAIClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  return genAIClient;
}

export function isGeminiAvailable(): boolean {
  return getGeminiClient() !== null;
}

/**
 * Agent 1 via Google Gemini LLM API
 * Interprets unstructured clinical notes, patient telemetry, and vital signs
 * to propose schema-validated full-care and stabilization criteria.
 */
export async function callGeminiAgent1(
  observations: AssessmentObservationsDto
): Promise<Agent1Proposal> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_UNAVAILABLE: No Gemini API Key configured in .env');
  }

  const systemInstruction = `
You are GoldenHour Agent 1: Emergency Triage and Clinical Telemetry Interpretation Specialist.
Your task is to analyze patient emergency observations, vitals, and presenting complaints.

You must return a valid JSON object matching this schema:
{
  "proposedFullCareNeeds": string[],
  "proposedStabilizationNeeds": string[],
  "reasons": string[],
  "missingInputs": string[]
}

Available standard capability tags:
- Definitive Full-Care tags: "TRAUMA_L1", "NEUROSURGERY", "CARDIAC_CATH", "VENTILATORS", "ICU", "CT_SCAN", "PEDIATRIC_ICU", "PEDIATRIC_TRAUMA", "EMERGENCY_DEPT"
- Proximity Stabilization tags: "STABILIZATION", "BASIC_OXYGEN", "EMERGENCY_DEPT", "CT_SCAN"

Critical Rules:
1. EXPLICIT UNKNOWNS: Examine the vitals object. If any vital sign (heartRate, systolicBp, diastolicBp, respiratoryRate, oxygenSaturation, gcs) is null, undefined, or missing, YOU MUST add an explicit message to "missingInputs" (e.g. "Glasgow Coma Scale (GCS) unknown or not recorded."). NEVER assume missing values are normal!
2. AIRWAY & VENTILATION: If GCS <= 8 or SpO2 < 92%, you MUST include "VENTILATORS" in proposedFullCareNeeds and explain the rationale in "reasons".
3. POLYTRAMA / TBI: If symptoms suggest traumatic brain injury, skull fracture, or major vehicular collision, mandate "TRAUMA_L1", "NEUROSURGERY", "CT_SCAN", "ICU", and "VENTILATORS".
4. STEMI / CARDIAC: If symptoms suggest acute STEMI or severe myocardial infarction, mandate "CARDIAC_CATH", "ICU", and "VENTILATORS".
5. Do NOT include markdown blocks or backticks. Return raw JSON.
`;

  const prompt = `
Analyze this patient assessment:
Presenting Issue: "${observations.presentingIssue}"
Urgency Level: "${observations.urgencyLevel}"
Vitals: ${JSON.stringify(observations.vitals)}
Ambulance Support Already Provided: ${JSON.stringify(observations.ambulanceSupportProvided)}
Clinical Notes: "${observations.notes || 'None'}"

Generate the required JSON output:
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const responseText = response.text?.trim() || '{}';
  const parsed = JSON.parse(responseText);

  return {
    proposedFullCareNeeds: Array.isArray(parsed.proposedFullCareNeeds) ? parsed.proposedFullCareNeeds : [],
    proposedStabilizationNeeds: Array.isArray(parsed.proposedStabilizationNeeds)
      ? parsed.proposedStabilizationNeeds
      : ['STABILIZATION', 'BASIC_OXYGEN'],
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ['Agent 1 Gemini Analysis Complete.'],
    missingInputs: Array.isArray(parsed.missingInputs) ? parsed.missingInputs : [],
  };
}

/**
 * AI Clinical Coordinator Briefing Agent
 * Generates an operational executive summary for the paramedic and receiving hospital
 * explaining the route, destination ranking, and contingency stabilization triggers.
 */
export async function callGeminiCoordinatorBriefing(
  patientLabel: string,
  presentingIssue: string,
  hospitalA: any,
  hospitalB: any,
  hospitalC: any
): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    return `Coordinated dispatch for ${patientLabel}: Primary definitive destination is ${hospitalA?.name || 'Assigned Center'}. Dynamic stabilization backup is ${hospitalB?.name || 'Nearest ED'} in event of acute in-transit decompensation.`;
  }

  const prompt = `
You are the GoldenHour AI Dispatch Coordinator.
Generate a concise, professional 2-3 sentence emergency operational briefing for the ambulance crew and hospital teams.

Patient: ${patientLabel}
Clinical Issue: ${presentingIssue}
Hospital A (Definitive Full-Care): ${hospitalA?.name} (ETA: ~${Math.round((hospitalA?.travelSeconds || 0) / 60)}m, Care Start: ~${Math.round((hospitalA?.timeToCareSeconds || 0) / 60)}m)
Hospital B (Immediate Stabilization Backup): ${hospitalB?.name} (ETA: ~${Math.round((hospitalB?.travelSeconds || 0) / 60)}m)
Hospital C (Secondary Backup): ${hospitalC?.name || 'None'}

Include recommended in-transit monitoring and when the crew should consider diversion to Backup B. Keep it under 75 words.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    return response.text?.trim() || 'Coordinated dispatch briefing generated by AI Agent.';
  } catch (err: any) {
    return `Coordinated dispatch for ${patientLabel}: Primary definitive destination is ${hospitalA?.name}. Dynamic stabilization backup is ${hospitalB?.name}.`;
  }
}
