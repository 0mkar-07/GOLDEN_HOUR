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
    <div className="flex items-center gap-2 bg-[#F6F8F8] border border-[#DCE5E3] rounded-lg px-2.5 py-1 text-xs">
      {/* API status */}
      <div className="flex items-center gap-1.5" title={isOnline ? 'API Server Online' : `API Offline: ${error}`}>
        <Activity className="w-3.5 h-3.5 text-[#596B69]" />
        <span className="font-medium text-[#596B69]">API:</span>
        {isOnline ? (
          <span className="flex items-center gap-1 text-[#237048] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#237048]"></span>
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[#B42318] font-semibold">
            <XCircle className="w-3 h-3 text-[#B42318]" />
            Offline
          </span>
        )}
      </div>

      <span className="text-[#DCE5E3]">|</span>

      {/* Database status */}
      <div className="flex items-center gap-1.5" title={isDbConnected ? `DB Connected (${data?.database?.latencyMs}ms)` : `DB Status: ${data?.database?.status || 'unreachable'}`}>
        <Database className="w-3.5 h-3.5 text-[#596B69]" />
        <span className="font-medium text-[#596B69]">DB:</span>
        {isDbConnected ? (
          <span className="flex items-center gap-1 text-[#237048] font-semibold">
            <CheckCircle2 className="w-3 h-3 text-[#237048]" />
            Ready
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[#8A5800] font-semibold">
            <AlertTriangle className="w-3 h-3 text-[#8A5800]" />
            Degraded
          </span>
        )}
      </div>

      <button
        onClick={fetchHealth}
        disabled={loading}
        title="Check status now"
        className="text-[#596B69] hover:text-[#176B68] transition-colors p-0.5 rounded ml-0.5"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
