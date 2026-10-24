import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from '../App';

// Mock fetch for health badge
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
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
  })
);

describe('GoldenHour Web Shell', () => {
  it('renders branding and navigation routes', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('GoldenHour')).toBeInTheDocument();
    expect(screen.getByText('Demo • Synthetic')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ambulance/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hospital/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
  });

  it('renders ambulance active page on initial route', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('Ambulance Mobile Terminal')).toBeInTheDocument();
    expect(screen.getByText('Primary Destination (Hospital A)')).toBeInTheDocument();
  });
});
