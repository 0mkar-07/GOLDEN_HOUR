import React, { useEffect, useState } from 'react';
import { Activity, Database, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { HealthReadyResponse } from '@goldenhour/contracts';

export const ApiHealthBadge: React.FC = () => {
  const [data, setData] = useState<HealthReadyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/health/ready');
      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const json: HealthReadyResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to reach API');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = !error && data !== null;
  const isDbConnected = data?.database?.status === 'connected';

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1 text-xs">
      {/* API status */}
      <div className="flex items-center gap-1.5" title={isOnline ? 'API Server Online' : `API Offline: ${error}`}>
        <Activity className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-medium text-slate-300">API:</span>
        {isOnline ? (
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1 text-rose-400 font-semibold">
            <XCircle className="w-3 h-3 text-rose-500" />
            Offline
          </span>
        )}
      </div>

      <span className="text-slate-700">|</span>

      {/* Database status */}
      <div className="flex items-center gap-1.5" title={isDbConnected ? `DB Connected (${data?.database?.latencyMs}ms)` : `DB Status: ${data?.database?.status || 'unreachable'}`}>
        <Database className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-medium text-slate-300">DB:</span>
        {isDbConnected ? (
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Ready {data?.database?.latencyMs ? `(${data.database.latencyMs}ms)` : ''}
          </span>
        ) : isOnline ? (
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            Degraded (Standalone)
          </span>
        ) : (
          <span className="text-slate-500 font-medium">Unreachable</span>
        )}
      </div>

      <button
        onClick={fetchHealth}
        disabled={loading}
        title="Refresh health status"
        className="ml-1 text-slate-500 hover:text-slate-200 transition-colors"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
