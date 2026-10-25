import { useState, useEffect, useCallback, useRef } from 'react';
import { HospitalDto } from '@goldenhour/contracts';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';

export interface UseHospitalDirectoryResult {
  hospitals: HospitalDto[];
  loading: boolean;
  error: string | null;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  reload: () => Promise<void>;
}

export function useHospitalDirectory(): UseHospitalDirectoryResult {
  const { user, loading: authLoading } = useAuth();
  const [hospitals, setHospitals] = useState<HospitalDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');

  // Request generation token to prevent stale responses from overwriting current state
  const generationRef = useRef<number>(0);

  const fetchHospitals = useCallback(async () => {
    // If auth is still loading, wait
    if (authLoading || !user) return;

    const currentGen = ++generationRef.current;
    setLoading(true);
    setStatus('loading');
    setError(null);

    try {
      const res = await apiClient.listHospitals();
      if (currentGen !== generationRef.current) return; // Stale request, ignore

      const list = res?.hospitals || [];
      setHospitals(list);
      setStatus(list.length > 0 ? 'ready' : 'empty');
      setError(null);
    } catch (err: any) {
      if (currentGen !== generationRef.current) return;
      const msg = err?.message || 'Failed to load regional hospital directory';
      setError(msg);
      setStatus('error');
    } finally {
      if (currentGen === generationRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, user?.id]);

  // Refetch whenever user ID or auth status changes
  useEffect(() => {
    setHospitals([]);
    if (!user) { setLoading(false); setStatus('idle'); }
    fetchHospitals();
    return () => { generationRef.current += 1; };
  }, [user?.id, authLoading, fetchHospitals]);

  return {
    hospitals,
    loading,
    error,
    status,
    reload: fetchHospitals,
  };
}
