import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from '../App';

// Mock fetch for health badge, auth me, and cases
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/v1/auth/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          user: {
            id: 'user-amb-001',
            email: 'paramedic@goldenhour.test',
            name: 'Officer Alex Rivera, Paramedic Lead',
            role: 'AMBULANCE',
            ambulanceId: 'amb-104',
            active: true,
            createdAt: new Date().toISOString(),
          },
        }),
    });
  }

  if (url.includes('/api/v1/cases')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ cases: [] }),
    });
  }

  // Health endpoint
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () =>
      Promise.resolve({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'goldenhour-api',
        database: {
          status: 'connected',
          latencyMs: 5,
        },
      }),
  });
});

describe('GoldenHour Web Shell (Phase 2)', () => {
  it('renders branding, persistent demo badge, and role switcher', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('GoldenHour')).toBeInTheDocument();
    expect(screen.getByText('Demo • Synthetic')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ambulance/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hospital/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /active demo role/i })).toBeInTheDocument();
  });

  it('renders ambulance active page on initial route', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('Ambulance Mobile Terminal')).toBeInTheDocument();
    expect(screen.getByText(/Patient Telemetry & Presenting Symptoms/i)).toBeInTheDocument();
  });
});
