import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import { IMPORTED_NITK_DATASET, SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';
import { projectToNitkMetric } from '@goldenhour/contracts';
import { simulationService } from '../src/modules/simulation/service.js';

vi.mock('../src/modules/routing/google-routes.js', async (original) => ({
  ...await original<any>(), callGoogleComputeRoutes: vi.fn().mockRejectedValue(new Error('offline test')),
}));

describe('Canonical hospital accounts and origin placement', () => {
  let app: Awaited<ReturnType<typeof initApp>>;
  let cookie: string;
  beforeAll(async () => {
    app = await initApp();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'paramedic@goldenhour.test', password: 'demo123' } });
    cookie = login.headers['set-cookie']!.toString().split(';')[0];
  });
  afterAll(async () => { simulationService.pause(); await app.close(); });

  it('lists all preserved facilities by default with no duplicated legacy resource pools', async () => {
    const response = await app.inject({ url: '/api/v1/hospitals', headers: { cookie } });
    const hospitals = response.json().hospitals;
    expect(hospitals).toHaveLength(23);
    expect(new Set(hospitals.map((h: any) => h.id)).size).toBe(23);
    for (const source of IMPORTED_NITK_DATASET.hospitals) {
      expect(hospitals.find((h: any) => h.id === source.id)).toMatchObject({ name: source.name, location: source.location });
    }
    expect(store.resourcePools.size).toBe(IMPORTED_NITK_DATASET.resourcePools.length);
  });

  it('offers a working account for every current hospital and retires old identities', async () => {
    const response = await app.inject({ url: '/api/v1/auth/demo-accounts' });
    const accounts = response.json().accounts.filter((a: any) => a.hospitalId);
    expect(accounts).toHaveLength(23);
    expect(accounts.some((a: any) => /stjude|bayview/.test(a.email))).toBe(false);
    const selected = accounts.find((a: any) => a.hospitalId === 'nitk:SRINIVAS_MUKKA');
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: selected.email, password: 'demo123' } });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.hospitalId).toBe(selected.hospitalId);
    const hospitalCookie = login.headers['set-cookie']!.toString().split(';')[0];
    const denied = await app.inject({ method: 'PATCH', url: '/api/v1/hospitals/nitk:NITK_HCC', headers: { cookie: hospitalCookie }, payload: { receivingDelaySeconds: 42 } });
    expect(denied.statusCode).toBe(403);
    const retired = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'stjude_admin@goldenhour.test', password: 'demo123' } });
    expect(retired.statusCode).toBe(401);
  });

  it('accepts a segment midpoint, preserves it on commit, and rejects expired previews', () => {
    store.cases.clear(); simulationService.pause();
    const edge = SEEDED_ROAD_GRAPH.edges.find((e) => e.id === 'edge-4')!;
    const a = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === edge.from)!;
    const b = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === edge.to)!;
    const lat = (a.lat + b.lat) / 2, lng = (a.lng + b.lng) / 2;
    const preview = store.previewAmbulanceOrigin(lat, lng);
    expect(preview.validationStatus).toBe('ACCEPTED');
    expect(preview.resolved!.lat).toBeCloseTo(lat, 7);
    store.caseRouteSnapshots.set('stale-case', { origin: { lat: 0, lng: 0 } });
    const result = store.setAmbulanceOrigin(lat, lng, preview.runVersion, preview.validationId, 'midpoint');
    expect(store.caseRouteSnapshots.size).toBe(0);
    simulationService.reset(false);
    expect(store.ambulancePosition.lat).toBeCloseTo(lat, 7);
    expect(store.ambulancePosition.x).toBeCloseTo(projectToNitkMetric(lat, lng).x / 10, 0);
    expect(store.setAmbulanceOrigin(lat, lng, preview.runVersion, preview.validationId, 'midpoint')).toEqual(result);
    const expired = store.previewAmbulanceOrigin(lat, lng);
    expired.expiresAt = new Date(0).toISOString();
    expect(() => store.setAmbulanceOrigin(lat, lng, expired.runVersion, expired.validationId)).toThrow('expired');
  });

  it('commits once through HTTP and refuses invalid input without moving the ambulance', async () => {
    const node = SEEDED_ROAD_GRAPH.nodes[0];
    const previewResponse = await app.inject({ method: 'POST', url: '/api/v1/simulation/origin/preview', headers: { cookie }, payload: { requested: { lat: node.lat, lng: node.lng } } });
    const preview = previewResponse.json();
    const payload = { validationId: preview.validationId, expectedRunVersion: preview.runVersion, idempotencyKey: 'http-origin' };
    const first = await app.inject({ method: 'POST', url: '/api/v1/simulation/origin', headers: { cookie }, payload });
    expect(first.statusCode).toBe(200);
    const version = store.simulationRun.runVersion;
    const second = await app.inject({ method: 'POST', url: '/api/v1/simulation/origin', headers: { cookie }, payload });
    expect(second.json()).toEqual(first.json());
    expect(store.simulationRun.runVersion).toBe(version);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/simulation/origin', headers: { cookie }, payload: {} });
    expect(invalid.statusCode).toBe(400);
    expect(store.simulationRun.runVersion).toBe(version);
  });
});
