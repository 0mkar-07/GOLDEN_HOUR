import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMap } from '../components/LiveMap';
import { apiClient } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({ apiClient: {
  previewSimulationOrigin: vi.fn(), setSimulationOrigin: vi.fn(),
} }));
let listeners: Record<string, (event: any) => void>;
let circleOptions: any;
const point = (lat = 13.01) => ({ latLng: { lat: () => lat, lng: () => 74.795 } });
const accepted = (id = 'preview', lat = 13.01) => ({
  validationId: id, requested: { lat, lng: 74.795 }, resolved: { lat, lng: 74.795 },
  validationStatus: 'ACCEPTED', runVersion: 1, snapDistanceMeters: 0, distanceFromNitkKm: 1, graphVersion: 'DEMO_GRAPH',
});
beforeEach(() => {
  vi.clearAllMocks(); listeners = {};
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  class MapMock {
    addListener(name: string, callback: (event: any) => void) { listeners[name] = callback; return { remove: vi.fn() }; }
    panTo() {} setMapTypeId() {}
  }
  class MarkerMock { setMap() {} setPosition() {} setIcon() {} addListener() { return { remove() {} }; } }
  (window as any).google = { maps: {
    Map: MapMock, Marker: MarkerMock, Circle: class { constructor(options: any) { circleOptions = options; } },
    TrafficLayer: class { setMap() {} }, Size: class {}, Point: class {},
  } };
});
afterEach(() => { cleanup(); delete (window as any).google; vi.unstubAllEnvs(); });

describe('Map origin interaction', () => {
  it('lets clicks pass through the region circle and commits only on confirmation', async () => {
    vi.mocked(apiClient.previewSimulationOrigin).mockResolvedValue(accepted() as any);
    vi.mocked(apiClient.setSimulationOrigin).mockResolvedValue({ snapped: accepted().resolved, distanceFromNitkKm: 1, snapDistanceMeters: 0 } as any);
    render(<LiveMap />);
    await waitFor(() => expect(listeners.click).toBeDefined());
    expect(circleOptions.clickable).toBe(false);
    act(() => listeners.click(point()));
    expect(apiClient.previewSimulationOrigin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Set Pin' }));
    act(() => listeners.click(point()));
    await screen.findByRole('button', { name: 'Confirm Origin Pin' });
    expect(apiClient.setSimulationOrigin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Origin Pin' }));
    await waitFor(() => expect(apiClient.setSimulationOrigin).toHaveBeenCalledWith(13.01, 74.795, {
      validationId: 'preview', expectedRunVersion: 1, idempotencyKey: 'preview',
    }));
    await screen.findByText(/Start pin confirmed/);
  });

  it('ignores validation arriving after cancel, and accepts the newest click during validation', async () => {
    let first: (value: any) => void = () => {};
    vi.mocked(apiClient.previewSimulationOrigin).mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }));
    vi.mocked(apiClient.previewSimulationOrigin).mockResolvedValueOnce(accepted('newest', 13.02) as any);
    render(<LiveMap />);
    await waitFor(() => expect(listeners.click).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Set Pin' }));
    act(() => listeners.click(point()));
    act(() => listeners.click(point(13.02)));
    await screen.findByRole('button', { name: 'Confirm Origin Pin' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pin' }));
    await act(async () => first(accepted('old')));
    expect(screen.queryByRole('button', { name: 'Confirm Origin Pin' })).not.toBeInTheDocument();
    expect(apiClient.setSimulationOrigin).not.toHaveBeenCalled();
  });
});
