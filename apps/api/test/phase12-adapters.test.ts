import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeterministicRequirementsInterpreter,
  GeminiRequirementsInterpreter,
} from '../src/modules/agents/interpreter.js';
import {
  SimulatedRoutingProvider,
  LiveRoutingAdapter,
} from '../src/modules/routing/index.js';
import { AssessmentObservationsDto } from '@goldenhour/contracts';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';

describe('Phase 12 — Optional Live Maps & LLM Assistance Adapters', () => {
  const sampleObservations: AssessmentObservationsDto = {
    presentingIssue: 'Polytrauma following high-speed motor vehicle collision with loss of consciousness',
    urgencyLevel: 'CRITICAL',
    vitals: {
      gcs: 7,
      systolicBp: 84,
      diastolicBp: 52,
      heartRate: 128,
      respiratoryRate: 26,
      oxygenSaturation: 89,
    },
    ambulanceSupportProvided: ['C-spine collar', 'BVM oxygenation'],
    notes: 'Severe trauma. Decreased consciousness.',
  };

  const incompleteObservations: AssessmentObservationsDto = {
    presentingIssue: 'Unresponsive patient found on sidewalk',
    urgencyLevel: 'URGENT',
    vitals: {
      gcs: null,
      systolicBp: null,
      diastolicBp: null,
      heartRate: null,
      respiratoryRate: null,
      oxygenSaturation: null,
    },
    ambulanceSupportProvided: [],
    notes: 'Vitals not yet recorded by field crew.',
  };

  describe('1. Deterministic Requirements Interpreter', () => {
    it('generates schema-valid proposal and labels interpreterType as DETERMINISTIC_RULES', async () => {
      const interpreter = new DeterministicRequirementsInterpreter();
      const result = await interpreter.interpret(sampleObservations);

      expect(result.interpreterType).toBe('DETERMINISTIC_RULES');
      expect(result.confidence).toBe(1.0);
      expect(result.proposedFullCareNeeds).toContain('TRAUMA_L1');
      expect(result.proposedFullCareNeeds).toContain('VENTILATORS');
      expect(result.proposedStabilizationNeeds).toContain('STABILIZATION');
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('explicitly identifies missing telemetry without assuming normal values', async () => {
      const interpreter = new DeterministicRequirementsInterpreter();
      const result = await interpreter.interpret(incompleteObservations);

      expect(result.missingInputs.length).toBeGreaterThanOrEqual(4);
      expect(result.missingInputs.some((m) => m.toLowerCase().includes('glasgow coma scale') || m.toLowerCase().includes('gcs'))).toBe(true);
      expect(result.missingInputs.some((m) => m.toLowerCase().includes('blood pressure'))).toBe(true);
    });
  });

  describe('2. Gemini LLM Requirements Interpreter with Graceful Fallback', () => {
    it('gracefully falls back to deterministic rules if Gemini call times out or fails', async () => {
      const interpreter = new GeminiRequirementsInterpreter();
      const result = await interpreter.interpret(sampleObservations);

      // In test environment, it either succeeds via Gemini or seamlessly falls back
      expect(result.proposedFullCareNeeds.length).toBeGreaterThan(0);
      expect(result.proposedStabilizationNeeds.length).toBeGreaterThan(0);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(['GEMINI_LLM', 'DETERMINISTIC_RULES']).toContain(result.interpreterType);
    });

    it('safely handles missing inputs and unknown vitals in fallback without throwing', async () => {
      const interpreter = new GeminiRequirementsInterpreter();
      const result = await interpreter.interpret(incompleteObservations);

      expect(result).toBeDefined();
      expect(result.missingInputs.length).toBeGreaterThan(0);
      expect(result.proposedStabilizationNeeds).toContain('STABILIZATION');
    });
  });

  describe('3. Routing Provider & Live Map Adapter', () => {
    it('SimulatedRoutingProvider computes shortest paths and explicitly marks isLive: false', () => {
      const router = new SimulatedRoutingProvider(SEEDED_ROAD_GRAPH);
      const route = router.calculateRoute('node-amb-start', 'node-hosp-a');

      expect(route.fromNodeId).toBe('node-amb-start');
      expect(route.toNodeId).toBe('node-hosp-a');
      expect(route.travelSeconds).toBeGreaterThan(0);
      expect(route.totalDistanceMeters).toBeGreaterThan(0);
      expect(route.isLive).toBe(false);
      expect(route.routingSource).toBe('SIMULATED_GRAPH');
    });

    it('LiveRoutingAdapter without serviceUrl falls back to simulated graph and never claims to be live', () => {
      const adapter = new LiveRoutingAdapter(undefined, SEEDED_ROAD_GRAPH);
      const route = adapter.calculateRoute('node-amb-start', 'node-hosp-b');

      expect(route.isLive).toBe(false);
      expect(route.routingSource).toBe('FALLBACK_GRAPH');
      expect(route.travelSeconds).toBeGreaterThan(0);
    });

    it('LiveRoutingAdapter with unreachable URL gracefully falls back and marks FALLBACK_GRAPH', () => {
      const adapter = new LiveRoutingAdapter('http://mock-unreachable.test:9999', SEEDED_ROAD_GRAPH);
      const route = adapter.calculateRoute('node-amb-start', 'node-hosp-c');

      expect(route.isLive).toBe(false);
      expect(route.routingSource).toBe('FALLBACK_GRAPH');
      expect(route.travelSeconds).toBeGreaterThan(0);
    });

    it('LiveRoutingAdapter with live service marks isLive: true and LIVE_OSRM', () => {
      const adapter = new LiveRoutingAdapter('https://router.project-osrm.org', SEEDED_ROAD_GRAPH);
      const route = adapter.calculateRoute('node-amb-start', 'node-hosp-a');

      expect(route.isLive).toBe(true);
      expect(route.routingSource).toBe('LIVE_OSRM');
      expect(route.travelSeconds).toBeGreaterThan(0);
    });
  });
});
