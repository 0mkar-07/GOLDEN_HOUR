import { beforeAll, describe, expect, it } from 'vitest';
import { IMPORTED_NITK_DATASET } from '@goldenhour/scenario-fixtures';
import { store } from '../src/db/store.js';
import { runAgent2 } from '../src/modules/agents/agent2.js';
import { runAgent3 } from '../src/modules/agents/agent3.js';
import { evaluateCaseCandidateRoutes, SimulatedGeographicRoutingProvider, routingProvider } from '../src/modules/routing/index.js';

describe('Current NITK directory routing and ranking', () => {
  beforeAll(async () => { await store.seed(); });

  it('evaluates the complete map directory, with canonical names and coordinate-derived times', async () => {
    const hospitals = store.listHospitals();
    expect(hospitals.map((h) => h.id).sort()).toEqual(IMPORTED_NITK_DATASET.hospitals.map((h) => h.id).sort());
    const origin = { lat: 13.0108, lng: 74.7936, x: 0, y: 0 };
    const provider = new SimulatedGeographicRoutingProvider();
    const snapshot = await evaluateCaseCandidateRoutes({ caseId: 'nitk-directory-regression', origin, candidates: hospitals, provider });
    expect(Object.keys(snapshot.routes)).toHaveLength(hospitals.length);
    expect(new Set(Object.values(snapshot.routes).map((r) => r.durationSeconds)).size).toBeGreaterThan(3);
    const evaluations = runAgent2(['STABILIZATION', 'BASIC_OXYGEN'], ['STABILIZATION', 'BASIC_OXYGEN'], hospitals,
      (id) => store.listResourcePoolsByHospital(id), (id) => store.listStaffByHospital(id));
    const result = runAgent3('nitk-directory-regression', 1, origin, evaluations, routingProvider, {}, snapshot);
    const selected = [result.hospitalA, result.hospitalB, result.hospitalC].filter((candidate) => candidate !== null);
    expect(selected.length).toBeGreaterThan(0);
    for (const candidate of selected) {
      const hospital = hospitals.find((h) => h.id === candidate.hospitalId);
      expect(hospital).toBeDefined();
      expect(candidate.name).toBe(hospital!.name);
      expect(candidate.hospitalId.startsWith('nitk:')).toBe(true);
    }
    const moved = await evaluateCaseCandidateRoutes({ caseId: 'nitk-directory-moved', origin: { lat: 12.8988, lng: 74.8512 }, candidates: hospitals, provider });
    expect(hospitals.some((h) => moved.routes[h.id].durationSeconds !== snapshot.routes[h.id].durationSeconds)).toBe(true);
    expect(hospitals.some((h) => moved.routes[h.id].distanceMeters !== snapshot.routes[h.id].distanceMeters)).toBe(true);
  });
});
