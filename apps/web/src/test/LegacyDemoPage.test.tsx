import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LegacyDemoPage } from '../pages/LegacyDemoPage';
import { rankLegacyDemo } from '../lib/legacy-demo';

const auth = vi.hoisted(() => ({ user: { role: 'ADMIN' }, loading: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.useRealTimers(); auth.user.role = 'ADMIN'; });

describe('Isolated New York admin demo', () => {
  it('rejects non-admin access', () => {
    auth.user.role = 'AMBULANCE';
    render(<MemoryRouter><LegacyDemoPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in with the admin');
    expect(screen.queryByRole('button', { name: 'Start demo' })).not.toBeInTheDocument();
  });

  it('ranks by required service and readiness, rather than fixed A/B priority', () => {
    expect(rankLegacyDemo('SPECIALIST', 1, 0)[0].role).toBe('A');
    expect(rankLegacyDemo('STABILIZATION', 1, 34)[0].role).toBe('B');
    expect(rankLegacyDemo('GENERAL', 1, 0)[0].role).toBe('B');
    expect(rankLegacyDemo('GENERAL', 1, 34)[0].role).toBe('C');
  });

  it('moves the ambulance on start, pauses it, and resets on scenario changes', () => {
    vi.useFakeTimers();
    render(<MemoryRouter><LegacyDemoPage /></MemoryRouter>);
    const ambulance = screen.getByTestId('demo-ambulance');
    const start = ambulance.getAttribute('transform');
    fireEvent.click(screen.getByRole('button', { name: 'Start demo' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(ambulance.getAttribute('transform')).not.toBe(start);
    fireEvent.click(screen.getByRole('button', { name: 'Pause demo' }));
    const paused = ambulance.getAttribute('transform');
    act(() => vi.advanceTimersByTime(1000));
    expect(ambulance.getAttribute('transform')).toBe(paused);
    fireEvent.change(screen.getByLabelText('Demo patient pathway'), { target: { value: 'STABILIZATION' } });
    expect(ambulance.getAttribute('transform')).toBe(start);
    expect(screen.getByRole('heading', { name: /Recommended: Bayview/ })).toBeInTheDocument();
  });
});
