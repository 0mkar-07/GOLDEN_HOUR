import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Activity,
  Radio,
  Clock,
  RotateCcw,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ListFilter,
  FileText,
  Hospital as HospitalIcon,
  ChevronRight,
  RefreshCw,
  Search,
  Layers,
  Compass,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { subscribeToRealtimeEvent } from '../lib/socket';
import { AdminOverviewDto, AuditEventDto, ReceivingStatus } from '@goldenhour/contracts';
import { Simulation3DView } from '../components/Simulation3DView';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'simulation' | 'cases' | 'audit' | 'settings'>('fleet');

  // Overview & cases state
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEventDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Audit filter state
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    demoRefreshIntervalSeconds: 5,
    stalenessThresholdSeconds: 15,
    rankingImprovementMarginSeconds: 120,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);

  // Reset confirmation modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Fetch overview
  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiClient.getAdminOverview();
      setOverview(data);
      if (data.systemSettings) {
        setSettingsForm(data.systemSettings);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch admin overview');
    }
  }, []);

  // Fetch cases
  const fetchCases = useCallback(async () => {
    try {
      const data = await apiClient.getAdminCases();
      setCases(data.cases || []);
    } catch (err: any) {
      console.warn('Failed to fetch admin cases:', err);
    }
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      const data = await apiClient.getAdminAuditLogs({
        caseId: selectedCaseId || undefined,
        hospitalId: selectedHospitalId || undefined,
        action: selectedAction || undefined,
        limit: 100,
      });
      setAuditLogs(data.logs || []);
    } catch (err: any) {
      console.warn('Failed to fetch audit logs:', err);
    }
  }, [selectedCaseId, selectedHospitalId, selectedAction]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([fetchOverview(), fetchCases(), fetchAuditLogs()]).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchOverview, fetchCases, fetchAuditLogs]);

  // Polling interval based on setting
  useEffect(() => {
    const intervalSec = overview?.systemSettings?.demoRefreshIntervalSeconds || 5;
    const timer = setInterval(() => {
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [overview?.systemSettings?.demoRefreshIntervalSeconds, fetchOverview, fetchCases, fetchAuditLogs]);

  // Real-time socket event subscriptions
  useEffect(() => {
    const unsubCase = subscribeToRealtimeEvent('case.updated', () => {
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    });
    const unsubDest = subscribeToRealtimeEvent('destination.updated', () => {
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    });
    const unsubHosp = subscribeToRealtimeEvent('hospital.updated', () => {
      fetchOverview();
      fetchAuditLogs();
    });
    const unsubInv = subscribeToRealtimeEvent('inventory.updated', () => {
      fetchOverview();
      fetchAuditLogs();
    });
    const unsubSettings = subscribeToRealtimeEvent('settings.updated', () => {
      fetchOverview();
    });
    const unsubReset = subscribeToRealtimeEvent('simulation.reset', () => {
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    });

    return () => {
      unsubCase();
      unsubDest();
      unsubHosp();
      unsubInv();
      unsubSettings();
      unsubReset();
    };
  }, [fetchOverview, fetchCases, fetchAuditLogs]);

  // Action: Save Settings
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await apiClient.updateAdminSettings(settingsForm);
      setSettingsSavedMessage('System settings successfully saved and applied.');
      setOverview((prev) => (prev ? { ...prev, systemSettings: res.settings } : prev));
      setTimeout(() => setSettingsSavedMessage(null), 4000);
    } catch (err: any) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Action: Update Hospital Status
  const handleUpdateHospitalStatus = async (id: string, receivingStatus: ReceivingStatus) => {
    try {
      await apiClient.updateAdminHospitalStatus(id, { receivingStatus });
      fetchOverview();
      fetchAuditLogs();
    } catch (err: any) {
      alert(`Failed to update hospital status: ${err.message}`);
    }
  };

  // Action: Reset Demo
  const handleResetDemo = async () => {
    setResetting(true);
    try {
      await apiClient.resetDemoScenario();
      setShowResetConfirm(false);
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    } catch (err: any) {
      alert(`Failed to reset demo: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleTraceCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveTab('audit');
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
          <span>Loading Admin Command Dashboard...</span>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6" />
          <h2 className="text-lg font-bold">Admin Authorization or Network Error</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Make sure you are logged in as an <strong>ADMIN</strong> user (e.g. System Dispatcher).
          Paramedics and hospital clinicians do not have access to admin command routes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Admin Command & System Monitoring
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-medium">
                  Global Oversight
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Live Sync
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Multi-facility hospital capacity, real-time telemetry freshness, immutable audit trail, and emergency routing controls.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800/60 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition shadow-sm"
              title="Reset demo scenario to baseline state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Demo
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Emergencies */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Cases</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{overview?.activeCasesCount ?? 0}</span>
            <span className="text-xs text-slate-400">in network</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex gap-2">
            <span>En Route: {overview?.casesByStatus?.EN_ROUTE ?? 0}</span>
            <span>•</span>
            <span>Arrived: {overview?.casesByStatus?.ARRIVED ?? 0}</span>
            <span>•</span>
            <span>Handed Over: {overview?.casesByStatus?.HANDED_OVER ?? 0}</span>
          </div>
        </div>

        {/* Hospital Fleet Utilization */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fleet Equipment</span>
            <HospitalIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{overview?.totalResources.available ?? 0}</span>
            <span className="text-xs text-slate-400">/ {overview?.totalResources.total ?? 0} Available</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex gap-2">
            <span>Reserved: {overview?.totalResources.reserved ?? 0}</span>
            <span>•</span>
            <span>In-Use: {overview?.totalResources.inUse ?? 0}</span>
            <span>•</span>
            <span>OOS: {overview?.totalResources.outOfService ?? 0}</span>
          </div>
        </div>

        {/* Pending Requests */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Requests</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{overview?.pendingRequestsCount ?? 0}</span>
            <span className="text-xs text-slate-400">awaiting accept</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            5 Registered Regional Facilities
          </div>
        </div>

        {/* Telemetry Health */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ambulance Telemetry</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {overview?.ambulanceTelemetry.isStale ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                STALE ({overview.ambulanceTelemetry.stalenessSeconds}s)
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                HEALTHY ({overview?.ambulanceTelemetry.stalenessSeconds ?? 0}s ago)
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-mono">
            Seq #{overview?.ambulanceTelemetry.serverSequence} • Speed: {overview?.ambulanceTelemetry.speed} km/h
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'simulation'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-4 h-4 text-purple-400" />
          3D Digital Twin Simulation
        </button>
        <button
          onClick={() => setActiveTab('fleet')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'fleet'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <HospitalIcon className="w-4 h-4" />
          Fleet Hospital Readiness
        </button>
        <button
          onClick={() => setActiveTab('cases')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${
            activeTab === 'cases'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Active Cases ({overview?.activeCasesCount ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${
            activeTab === 'audit'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Timeline & Inspector
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${
            activeTab === 'settings'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Operational Settings
        </button>
      </div>

      {/* TAB 0: 3D DIGITAL TWIN SIMULATION */}
      {activeTab === 'simulation' && (
        <Simulation3DView activeCaseId={cases[0]?.id} onTraceCase={handleTraceCase} />
      )}

      {/* TAB 1: FLEET READINESS */}
      {activeTab === 'fleet' && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Admin Integrity Invariant:</strong> Status modifications adjust receiving readiness and intake delay.
              They never silently override patient clinical requirements or release occupied hospital equipment.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overview?.hospitalReadiness.map((hosp) => (
              <div
                key={hosp.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">{hosp.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {hosp.code}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-1">
                      {hosp.capabilities.map((cap) => (
                        <span key={cap} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={hosp.receivingStatus}
                    onChange={(e) =>
                      handleUpdateHospitalStatus(hosp.id, e.target.value as ReceivingStatus)
                    }
                    className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
                  >
                    <option value={ReceivingStatus.OPEN}>OPEN</option>
                    <option value={ReceivingStatus.RESTRICTED}>RESTRICTED</option>
                    <option value={ReceivingStatus.DIVERT_ALL}>DIVERT_ALL</option>
                  </select>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Resource Utilization</span>
                    <span className="text-slate-200 font-semibold">{hosp.resourceUtilizationPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all ${
                        hosp.resourceUtilizationPercent > 80
                          ? 'bg-rose-500'
                          : hosp.resourceUtilizationPercent > 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, hosp.resourceUtilizationPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Resource Stats Grid */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-center">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850">
                    <div className="text-xs text-slate-500">Available</div>
                    <div className="text-sm font-bold text-emerald-400">{hosp.availableCount}</div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850">
                    <div className="text-xs text-slate-500">Reserved</div>
                    <div className="text-sm font-bold text-purple-400">{hosp.reservedCount}</div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850">
                    <div className="text-xs text-slate-500">In-Use</div>
                    <div className="text-sm font-bold text-amber-400">{hosp.inUseCount}</div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850">
                    <div className="text-xs text-slate-500">OOS</div>
                    <div className="text-sm font-bold text-slate-400">{hosp.outOfServiceCount}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE CASES */}
      {activeTab === 'cases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Displaying {cases.length} registered cases</span>
          </div>

          <div className="space-y-3">
            {cases.length === 0 ? (
              <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400">
                No emergency cases recorded yet. Create one from the Ambulance tab!
              </div>
            ) : (
              cases.map((c: any) => (
                <div
                  key={c.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-white">{c.patientLabel}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {c.id}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 font-semibold">
                        {c.caseStatus}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3">
                      <span>Destination: <strong>{c.destination?.hospitalId || 'Unassigned'}</strong></span>
                      <span>•</span>
                      <span>Readiness: <strong>{c.destination?.readiness || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Ambulance: {c.assignedAmbulanceId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleTraceCase(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition shadow-sm"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Trace Audit
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TIMELINE */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ListFilter className="w-4 h-4 text-purple-400" />
              <span>Filters:</span>
            </div>

            {/* Case Filter */}
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
            >
              <option value="">All Cases</option>
              {cases.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.patientLabel} ({c.id.substring(0, 10)})
                </option>
              ))}
            </select>

            {/* Hospital Filter */}
            <select
              value={selectedHospitalId}
              onChange={(e) => setSelectedHospitalId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
            >
              <option value="">All Hospitals</option>
              {overview?.hospitalReadiness?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.code})
                </option>
              ))}
            </select>

            {/* Action Search Input */}
            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Filter by action..."
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {(selectedCaseId || selectedHospitalId || selectedAction) && (
              <button
                onClick={() => {
                  setSelectedCaseId('');
                  setSelectedHospitalId('');
                  setSelectedAction('');
                }}
                className="text-xs text-purple-400 hover:text-purple-300 underline ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Timeline View */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Immutable Audit Log ({auditLogs.length} events)
              </h3>
              {selectedCaseId && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                  Tracing Case: {selectedCaseId}
                </span>
              )}
            </div>

            {auditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching audit entries found for this filter.
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-purple-300 font-bold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                          {log.action}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                          Actor: {log.actorRole} ({log.actorId.substring(0, 8)})
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()} ({new Date(log.timestamp).toISOString()})
                      </span>
                    </div>

                    <div className="text-slate-400 flex items-center gap-2 text-[11px]">
                      <span>Entity: <strong className="text-slate-300">{log.entityType}</strong> ({log.entityId})</span>
                    </div>

                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="p-2 bg-slate-900 rounded border border-slate-800/60 font-mono text-[10px] text-slate-300 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SYSTEM OPERATIONAL SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-400" />
              Operational Parameters & Staleness Thresholds
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure system refresh cadences, telemetry staleness warnings, and ranking hysteresis margins.
              All updates are validated and recorded with actor-attribution in the audit trail.
            </p>
          </div>

          {settingsSavedMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{settingsSavedMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Setting 1: Refresh Cadence */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">
                Demo Refresh Interval
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settingsForm.demoRefreshIntervalSeconds}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      demoRefreshIntervalSeconds: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500">seconds</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Interval between automated polling fallbacks (1 to 60 seconds).
              </p>
            </div>

            {/* Setting 2: Staleness Threshold */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">
                Telemetry Staleness Threshold
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={settingsForm.stalenessThresholdSeconds}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      stalenessThresholdSeconds: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500">seconds</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Threshold beyond which ambulance position is flagged STALE (5 to 300 seconds).
              </p>
            </div>

            {/* Setting 3: Ranking Margin */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">
                Ranking Improvement Margin
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={settingsForm.rankingImprovementMarginSeconds}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      rankingImprovementMarginSeconds: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500">seconds</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Hysteresis buffer required before swapping destination recommendations (0 to 600s).
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-2"
            >
              {settingsSaving ? 'Saving...' : 'Apply System Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Demo Reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Reset Demo Scenario?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action resets all active cases, reservations, allocations, and requests back to baseline synthetic demo state.
              This action is logged in the immutable audit trail.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDemo}
                disabled={resetting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                {resetting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
