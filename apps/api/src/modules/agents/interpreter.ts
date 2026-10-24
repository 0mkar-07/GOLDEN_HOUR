import { AssessmentObservationsDto, Agent1Proposal } from '@goldenhour/contracts';
import { runAgent1 } from './agent1.js';
import { isGeminiAvailable, callGeminiAgent1 } from './gemini.js';

export interface RequirementsInterpreter {
  interpret(observations: AssessmentObservationsDto): Promise<Agent1Proposal>;
}

/**
 * Deterministic Rules Interpreter (Scenario Rules MVP)
 */
export class DeterministicRequirementsInterpreter implements RequirementsInterpreter {
  async interpret(observations: AssessmentObservationsDto): Promise<Agent1Proposal> {
    const proposal = runAgent1(observations);
    return {
      ...proposal,
      interpreterType: 'DETERMINISTIC_RULES',
      confidence: 1.0,
    };
  }
}

/**
 * Gemini LLM Requirements Interpreter (Phase 12 LLM Assistance)
 * Interprets unstructured paramedic clinical notes, telemetry, and vital signs
 * through Google Gemini 3.5 Flash Lite API.
 *
 * Rules:
 * - Sanitizes untrusted text input
 * - Enforces bounded timeout (2500ms)
 * - If Gemini key is missing, network fails, or timeout occurs, gracefully falls back
 *   to DeterministicRequirementsInterpreter without throwing or disrupting clinical workflow.
 * - Clinician confirmation remains mandatory before any dispatch.
 */
export class GeminiRequirementsInterpreter implements RequirementsInterpreter {
  private fallbackInterpreter = new DeterministicRequirementsInterpreter();

  async interpret(observations: AssessmentObservationsDto): Promise<Agent1Proposal> {
    if (!isGeminiAvailable()) {
      return this.fallbackInterpreter.interpret(observations);
    }

    try {
      const geminiResult = await callGeminiAgent1(observations);
      return {
        ...geminiResult,
        interpreterType: 'GEMINI_LLM',
        confidence: 0.95,
      };
    } catch (err: any) {
      console.warn('[GeminiRequirementsInterpreter] LLM unavailable or timed out, executing deterministic fallback:', err.message);
      return this.fallbackInterpreter.interpret(observations);
    }
  }
}

/**
 * Default factory returning the appropriate interpreter
 */
export function getRequirementsInterpreter(): RequirementsInterpreter {
  return new GeminiRequirementsInterpreter();
}
