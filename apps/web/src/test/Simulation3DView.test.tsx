import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Simulation3DView } from '../components/Simulation3DView';

const mockSimState = {
  simulationRun: {
    id: 'sim-default',
    seed: 'goldenhour-2026',
    running: false,
    speedMultiplier: 1.0,
    simulatedSeconds: 15,
    scenarioStep: 'STANDARD_TRANSIT',
    updatedAt: new Date().toISOString(),
  },
  ambulancePosition: {
    x: 180,
    y: 158,
    lat: 40.711,
    lng: -74.014,
    speed: 55,
    heading: 90,
    serverSequence: 24,
    observedAt: new Date().toISOString(),
  },
  roadGraph: {
    nodes: [
      { id: 'node-amb-start', label: 'Scene', x: 120, y: 150, lat: 40.71, lng: -74.02 },
      { id: 'node-jct-1', label: 'Junction 1', x: 200, y: 160, lat: 40.711, lng: -74.012 },
      { id: 'node-hosp-a', label: 'St. Jude Trauma Center', x: 350, y: 150, lat: 40.7128, lng: -74.006 },
      { id: 'node-hosp-b', label: 'Bayview Harbor ED', x: 150, y: 220, lat: 40.7088, lng: -74.015 },
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'node-amb-start',
        to: 'node-jct-1',
        distanceMeters: 2400,
        speedKmh: 60,
        baseTravelSeconds: 144,
        trafficMultiplier: 1.0,
      },
    ],
  },
  trafficOverrides: {},
};

global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
  if (url.includes('/api/v1/simulation/state')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockSimState),
    });
  }

  if (url.includes('/api/v1/simulation/play')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ simulationRun: { ...mockSimState.simulationRun, running: true } }),
    });
  }

  if (url.includes('/api/v1/simulation/pause')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ simulationRun: { ...mockSimState.simulationRun, running: false } }),
    });
  }

  if (url.includes('/api/v1/simulation/step')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ simulationRun: { ...mockSimState.simulationRun, simulatedSeconds: 20 } }),
    });
  }

  if (url.includes('/api/v1/simulation/scenarios/traffic')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ message: 'Traffic congestion applied' }),
    });
  }

  if (url.includes('/api/v1/simulation/scenarios/hospital-surge')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ message: 'Hospital surge applied' }),
    });
  }

  if (url.includes('/api/v1/simulation/scenarios/decompensation')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ message: 'Patient decompensation applied' }),
    });
  }

  return Promise.resolve({
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({}),
  });
});

describe('Phase 10 — Simulation 3D Digital Twin Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders simulation viewport, HUD overlay, and telemetry stats', async () => {
    render(<Simulation3DView activeCaseId="case-101" />);

    expect(await screen.findByText(/Connected 3D Digital Twin & Live Network Simulation/i)).toBeInTheDocument();
    expect(screen.getByText('AMBULANCE TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText(/Coord: \(180, 158\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Speed: 55 km\/h/i)).toBeInTheDocument();
    expect(screen.getByText(/15s elapsed/i)).toBeInTheDocument();

    // Verify hospital nodes rendered
    expect(screen.getByText('A.J. Hospital')).toBeInTheDocument();
    expect(screen.getByText('Padmavathi Hospital')).toBeInTheDocument();
  });

  it('executes simulation play, pause, and step controls', async () => {
    render(<Simulation3DView activeCaseId="case-101" />);

    await screen.findByText('AMBULANCE TELEMETRY');

    // Click Play
    const playBtn = screen.getByRole('button', { name: /Play/i });
    fireEvent.click(playBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulation started/i)).toBeInTheDocument();
    });

    // Click Step
    const stepBtn = screen.getByRole('button', { name: /\+5s Step/i });
    fireEvent.click(stepBtn);

    await waitFor(() => {
      expect(screen.getByText(/Stepped forward \+5s/i)).toBeInTheDocument();
    });
  });

  it('triggers dynamic scenario injections for traffic, hospital surge, and patient decompensation', async () => {
    render(<Simulation3DView activeCaseId="case-101" />);

    await screen.findByText('AMBULANCE TELEMETRY');

    // Traffic injection button
    const trafficBtn = screen.getByRole('button', { name: /Inject Highway Congestion/i });
    fireEvent.click(trafficBtn);

    await waitFor(() => {
      expect(screen.getByText(/Traffic congestion \(\+350%\) injected/i)).toBeInTheDocument();
    });

    // Surge injection button
    const surgeBtn = screen.getByRole('button', { name: /Inject A\.J\. Hospital ED Surge/i });
    fireEvent.click(surgeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hospital intake surge \(\+15m delay\) injected/i)).toBeInTheDocument();
    });

    // Decompensation injection button
    const decompBtn = screen.getByRole('button', { name: /Inject Patient Decompensation/i });
    fireEvent.click(decompBtn);

    await waitFor(() => {
      expect(screen.getByText(/Patient acute decompensation \(SpO2 82%\) injected!/i)).toBeInTheDocument();
    });
  });
});
