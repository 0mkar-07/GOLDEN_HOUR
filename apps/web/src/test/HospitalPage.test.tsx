import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HospitalPage } from '../pages/HospitalPage';
import { AuthProvider } from '../context/AuthContext';

const mockHospitals = [
  {
    id: 'hosp-001',
    code: 'HOSP-A',
    name: 'St. Jude Metropolitan Trauma Center',
    address: '100 Central Ave, Metro City',
    location: { x: 350, y: 150, lat: 40.7128, lng: -74.006 },
    capabilities: ['TRAUMA_L1', 'VENTILATORS'],
    receivingStatus: 'OPEN',
    receivingDelaySeconds: 120,
    version: 1,
    updatedAt: new Date().toISOString(),
  },
];

const mockResources = [
  {
    id: 'pool-001',
    hospitalId: 'hosp-001',
    resourceType: 'VENTILATOR',
    totalCount: 8,
    outOfServiceCount: 1,
    externalOccupancy: 4,
    reservedCount: 0,
    inUseCount: 0,
    availableCount: 3,
    version: 1,
    updatedAt: new Date().toISOString(),
  },
];

const mockStaff = [
  {
    id: 'staff-001',
    hospitalId: 'hosp-001',
    specialty: 'TRAUMA_SURGEON',
    availableTeamSlots: 2,
    readyAt: new Date().toISOString(),
    version: 1,
    updatedAt: new Date().toISOString(),
  },
];

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/v1/auth/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          user: {
            id: 'user-hosp-a-001',
            email: 'stjude_admin@goldenhour.test',
            name: 'Dr. Sarah Vance, St. Jude ED Coordinator',
            role: 'HOSPITAL',
            hospitalId: 'hosp-001',
            active: true,
            createdAt: new Date().toISOString(),
          },
        }),
    });
  }

  if (url.includes('/api/v1/hospitals/hosp-001/resources')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ resourcePools: mockResources }),
    });
  }

  if (url.includes('/api/v1/hospitals/hosp-001/staff')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ staffAvailability: mockStaff }),
    });
  }

  if (url.includes('/api/v1/hospitals/hosp-001')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ hospital: mockHospitals[0] }),
    });
  }

  if (url.includes('/api/v1/hospitals')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ hospitals: mockHospitals }),
    });
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({}),
  });
});

describe('Phase 3 — HospitalPage UI Vertical Slice', () => {
  it('renders hospital facility details, resources, and calculated availability', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <HospitalPage />
        </AuthProvider>
      );
    });

    expect(screen.getAllByText('St. Jude Metropolitan Trauma Center')[0]).toBeInTheDocument();
    expect(screen.getAllByText('HOSP-A')[0]).toBeInTheDocument();
    expect(screen.getByText('VENTILATOR')).toBeInTheDocument();
    expect(screen.getByText('3 Available')).toBeInTheDocument();
    expect(screen.getByText(/TRAUMA_SURGEON/)).toBeInTheDocument();
    expect(screen.getByText(/2 Team\(s\) Ready/)).toBeInTheDocument();
  });

  it('opens pool edit modal on edit button click', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <HospitalPage />
        </AuthProvider>
      );
    });

    const editBtn = screen.getByTitle('Edit capacity numbers');
    await act(async () => {
      fireEvent.click(editBtn);
    });

    expect(screen.getByText(/Edit VENTILATOR Capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/Projected Available:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
  });
});
