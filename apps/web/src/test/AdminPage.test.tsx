import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminPage } from '../pages/AdminPage';
import { AuthProvider } from '../context/AuthContext';
import { ReceivingStatus, UserRole } from '@goldenhour/contracts';

const mockOverview = {
  activeCasesCount: 2,
  casesByStatus: {
    DRAFT: 0,
    ASSESSED: 0,
    DISPATCHING: 0,
    EN_ROUTE: 1,
    ARRIVED: 1,
    HANDED_OVER: 0,
    CLOSED: 0,
    CANCELED: 0,
  },
  hospitalReadiness: [
    {
      id: 'hosp-001',
      name: 'St. Jude Metropolitan Trauma Center',
      code: 'HOSP-A',
      receivingStatus: ReceivingStatus.OPEN,
      receivingDelaySeconds: 120,
      resourceUtilizationPercent: 45,
      availableCount: 12,
      reservedCount: 3,
      inUseCount: 2,
      outOfServiceCount: 1,
      totalResources: 18,
      capabilities: ['TRAUMA_L1', 'VENTILATORS', 'NEUROSURGERY'],
    },
    {
      id: 'hosp-002',
      name: 'Bayview Community Emergency Center',
      code: 'HOSP-B',
      receivingStatus: ReceivingStatus.RESTRICTED,
      receivingDelaySeconds: 300,
      resourceUtilizationPercent: 20,
      availableCount: 8,
      reservedCount: 1,
      inUseCount: 1,
      outOfServiceCount: 0,
      totalResources: 10,
      capabilities: ['STABILIZATION', 'BASIC_OXYGEN', 'TRAUMA_BAY'],
    },
  ],
  totalResources: {
    total: 28,
    available: 20,
    reserved: 4,
    inUse: 3,
    outOfService: 1,
  },
  pendingRequestsCount: 1,
  ambulanceTelemetry: {
    position: { x: 140, y: 160, lat: 40.71, lng: -74.02 },
    speed: 45,
    heading: 90,
    serverSequence: 14,
    observedAt: new Date().toISOString(),
    isStale: false,
    stalenessSeconds: 2,
  },
  systemSettings: {
    demoRefreshIntervalSeconds: 5,
    stalenessThresholdSeconds: 15,
    rankingImprovementMarginSeconds: 120,
  },
};

const mockCases = [
  {
    id: 'case-901',
    patientLabel: 'John Doe Head Injury',
    caseStatus: 'EN_ROUTE',
    assignedAmbulanceId: 'amb-101',
    destination: { hospitalId: 'hosp-001', readiness: 'CONFIRMED' },
  },
];

const mockAuditLogs = [
  {
    id: 'audit-001',
    actorId: 'usr-paramedic',
    actorRole: UserRole.AMBULANCE,
    action: 'CASE_DISPATCHED',
    entityType: 'EMERGENCY_CASE',
    entityId: 'case-901',
    details: { hospitalA: 'HOSP-A' },
    timestamp: new Date().toISOString(),
  },
  {
    id: 'audit-002',
    actorId: 'usr-admin',
    actorRole: UserRole.ADMIN,
    action: 'SYSTEM_SETTINGS_UPDATED',
    entityType: 'SYSTEM_SETTINGS',
    entityId: 'global',
    details: { current: { demoRefreshIntervalSeconds: 5 } },
    timestamp: new Date().toISOString(),
  },
];

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/v1/auth/me')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          user: {
            id: 'usr-admin',
            email: 'admin@goldenhour.test',
            role: UserRole.ADMIN,
            name: 'System Dispatcher',
            active: true,
          },
        }),
    });
  }

  if (url.includes('/api/v1/admin/overview')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockOverview),
    });
  }

  if (url.includes('/api/v1/admin/cases')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ cases: mockCases }),
    });
  }

  if (url.includes('/api/v1/admin/audit-logs')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ total: mockAuditLogs.length, logs: mockAuditLogs }),
    });
  }

  if (url.includes('/api/v1/simulation/state')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          simulationRun: { running: false, speedMultiplier: 1.0, simulatedSeconds: 0 },
          ambulancePosition: { x: 120, y: 150, heading: 0, speed: 0, serverSequence: 1 },
          roadGraph: { nodes: [], edges: [] },
          trafficOverrides: {},
        }),
    });
  }

  if (url.includes('/api/v1/admin/settings')) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ settings: mockOverview.systemSettings }),
    });
  }

  return Promise.resolve({
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({}),
  });
});

describe('Phase 9 — Admin Command Dashboard UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    );

  it('renders top summary metrics, hospital readiness fleet, and live telemetry indicators', async () => {
    renderComponent();

    // Verify title and banner
    expect(await screen.findByText(/Admin Command & System Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Global Oversight/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Sync/i)).toBeInTheDocument();

    // Verify real-time metrics
    expect(screen.getByText('Active Cases')).toBeInTheDocument();
    expect(screen.getByText('Fleet Equipment')).toBeInTheDocument();
    expect(screen.getByText('Ambulance Telemetry')).toBeInTheDocument();

    // Verify hospital readiness cards rendered
    expect(screen.getByText('St. Jude Metropolitan Trauma Center')).toBeInTheDocument();
    expect(screen.getByText('Bayview Community Emergency Center')).toBeInTheDocument();
    expect(screen.getByText(/Admin Integrity Invariant/i)).toBeInTheDocument();
  });

  it('navigates to Active Cases tab and allows tracing in audit timeline', async () => {
    renderComponent();

    await screen.findByText('St. Jude Metropolitan Trauma Center');

    // Click Active Cases Tab
    const casesTabBtn = screen.getByRole('button', { name: /Active Cases/i });
    fireEvent.click(casesTabBtn);

    // Verify case rendered
    expect(await screen.findByText('John Doe Head Injury')).toBeInTheDocument();
    expect(screen.getByText(/EN_ROUTE/i)).toBeInTheDocument();

    // Click "Trace Audit" button
    const traceBtn = screen.getByRole('button', { name: /Trace Audit/i });
    fireEvent.click(traceBtn);

    // Automatically switches to Audit tab and shows tracing badge
    expect(await screen.findByText(/Tracing Case: case-901/i)).toBeInTheDocument();
  });

  it('renders audit logs and operational settings form with units', async () => {
    renderComponent();

    await screen.findByText('St. Jude Metropolitan Trauma Center');

    // Click Settings Tab
    const settingsTabBtn = screen.getByRole('button', { name: /Operational Settings/i });
    fireEvent.click(settingsTabBtn);

    // Verify settings inputs and units
    expect(await screen.findByText(/Demo Refresh Interval/i)).toBeInTheDocument();
    expect(screen.getByText(/Telemetry Staleness Threshold/i)).toBeInTheDocument();
    expect(screen.getByText(/Ranking Improvement Margin/i)).toBeInTheDocument();
    expect(screen.getAllByText('seconds').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: /Apply System Settings/i })).toBeInTheDocument();
  });
});
