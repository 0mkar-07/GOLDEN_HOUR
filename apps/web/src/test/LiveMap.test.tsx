import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveMap } from '../components/LiveMap';
import { MapPanel } from '../components/MapPanel';
import { HospitalDto, AmbulancePositionDto } from '@goldenhour/contracts';

describe('Stage 2 & 3 — Live Geographic Map & MapPanel', () => {
  const mockHospitals: HospitalDto[] = [
    {
      id: 'hosp-001',
      code: 'STJUDE',
      name: 'St. Jude Trauma Center',
      address: '777 Recovery Way',
      location: { x: 350, y: 150, lat: 40.7128, lng: -74.006 },
      capabilities: ['TRAUMA_L1', 'NEUROSURGERY', 'CT_SCAN', 'VENTILATORS'],
      receivingStatus: 'OPEN' as any,
      receivingDelaySeconds: 120,
      version: 1,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'hosp-002',
      code: 'BAYVIEW',
      name: 'Bayview Community Hospital',
      address: '101 Shoreline Dr',
      location: { x: 150, y: 220, lat: 40.7088, lng: -74.015 },
      capabilities: ['STABILIZATION', 'BASIC_OXYGEN', 'EMERGENCY_DEPT'],
      receivingStatus: 'OPEN' as any,
      receivingDelaySeconds: 180,
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockAmbulancePos: AmbulancePositionDto = {
    ambulanceId: 'amb-104',
    x: 120,
    y: 150,
    lat: 40.71,
    lng: -74.02,
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
    expect(screen.getByText('St. Jude Trauma Center')).toBeInTheDocument();
    expect(screen.getByText('Bayview Community Hospital')).toBeInTheDocument();
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

    const hospitalLabel = screen.getByText('St. Jude Trauma Center');
    fireEvent.click(hospitalLabel);

    expect(onSelect).toHaveBeenCalledWith('hosp-001');
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
});
