import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { nitkHospitals } from './nitk-fixtures';
import { apiClient } from '../lib/api-client';
import { LiveMap } from '../components/LiveMap';
import { MapPanel } from '../components/MapPanel';
import { HospitalDto, AmbulancePositionDto } from '@goldenhour/contracts';

describe('Stage 2 & 3 — Live Geographic Map & MapPanel', () => {
  const mockHospitals = nitkHospitals;

  const mockAmbulancePos: AmbulancePositionDto = {
    ambulanceId: 'amb-104',
    x: 120,
    y: 150,
    lat: 13.0108,
    lng: 74.7936,
    speed: 35,
    heading: 90,
    source: 'SIMULATED',
    sourceGeneration: 1,
    serverSequence: 5,
    observedAt: new Date().toISOString(),
  };

  it('renders LiveMap with hospital markers and ambulance unit indicator', () => {
    render(
      <LiveMap
        hospitals={mockHospitals}
        ambulancePosition={mockAmbulancePos}
      />
    );

    expect(screen.getByText('Simulated Vehicle Position')).toBeInTheDocument();
    expect(screen.getByText('A.J. Hospital and Research Centre')).toBeInTheDocument();
    expect(screen.getByText('Padmavathi Hospital')).toBeInTheDocument();
    expect(screen.getByText('Medic 4')).toBeInTheDocument();
  });

  it('opens hospital inspection drawer when a hospital marker is clicked without mutating case', () => {
    const onSelect = vi.fn();
    render(
      <LiveMap
        hospitals={mockHospitals}
        ambulancePosition={mockAmbulancePos}
        onSelectHospital={onSelect}
      />
    );

    const hospitalLabel = screen.getByText('A.J. Hospital and Research Centre');
    fireEvent.click(hospitalLabel);

    expect(onSelect).toHaveBeenCalledWith('nitk:AJ_HOSPITAL_MANGALURU');
    expect(screen.getByText(/Clicking a facility inspects hospital clinical readiness/i)).toBeInTheDocument();
  });

  it('allows toggling between Live Geographic Map and Simulated Graph in MapPanel', () => {
    render(
      <MapPanel
        hospitals={mockHospitals}
        ambulancePosition={mockAmbulancePos}
      />
    );

    expect(screen.getByText('Live Geographic Map')).toBeInTheDocument();
    const simButton = screen.getByText('Simulated Graph');
    fireEvent.click(simButton);

    expect(simButton).toHaveClass('bg-[#174C49]');
  });
  it('keeps pin inputs outside the map viewport', () => {
    render(<LiveMap ambulancePosition={mockAmbulancePos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set Pin' }));
    const form = screen.getByRole('form', { name: 'Choose origin coordinates' });
    expect(screen.getByTestId('map-viewport')).not.toContainElement(form);
  });

  it('notifies the page after resetting the committed origin', async () => {
    const origin = { lat: 13.0108, lng: 74.7936 };
    const reset = vi.spyOn(apiClient, 'resetSimulationOriginToDefault').mockResolvedValue({ origin, message: 'Reset' });
    const onOriginChanged = vi.fn();
    render(<LiveMap ambulancePosition={mockAmbulancePos} onOriginChanged={onOriginChanged} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'NITK Default' })); });
    await vi.waitFor(() => expect(onOriginChanged).toHaveBeenCalledWith(origin));
    reset.mockRestore();
  });

  it('updates A/B/C marker roles using current directory IDs when ranking changes', () => {
    const [a, b, c] = nitkHospitals;
    const recommendation = { hospitalA: { hospitalId: a.id }, hospitalB: { hospitalId: b.id }, hospitalC: { hospitalId: c.id } } as any;
    const view = render(<LiveMap hospitals={nitkHospitals} ambulancePosition={mockAmbulancePos} recommendation={recommendation} />);
    expect(screen.getByTestId(`hospital-marker-${a.id}`)).toHaveAttribute('aria-label', `A: ${a.name}`);
    expect(screen.getByTestId(`hospital-marker-${b.id}`)).toHaveAttribute('aria-label', `B: ${b.name}`);
    view.rerender(<LiveMap hospitals={nitkHospitals} ambulancePosition={mockAmbulancePos} recommendation={{ ...recommendation, hospitalA: { hospitalId: b.id }, hospitalB: { hospitalId: a.id } }} />);
    expect(screen.getByTestId(`hospital-marker-${b.id}`)).toHaveAttribute('aria-label', `A: ${b.name}`);
    expect(screen.getAllByTestId(/hospital-marker-/)).toHaveLength(nitkHospitals.length);
  });

});
