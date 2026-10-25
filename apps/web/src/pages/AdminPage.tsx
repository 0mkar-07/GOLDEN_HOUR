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
  Map as MapIcon,
  Box,
  Building2,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { subscribeToRealtimeEvent } from '../lib/socket';
import { AdminOverviewDto, AuditEventDto, ReceivingStatus, HospitalDto } from '@goldenhour/contracts';
import { Simulation3DView } from '../components/Simulation3DView';
import { LiveMap } from '../components/LiveMap';
import { HospitalDirectoryTable } from '../components/HospitalDirectoryTable';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'map' | 'simulation' | 'cases' | 'audit' | 'settings' | 'directory'>('fleet');

  // Overview & cases state
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<HospitalDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEventDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Map selection state
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // Audit filter state
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>('');
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

  // Query parameter listener
  useEffect(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(search);
    const tabParam = params.get('tab');
    if (tabParam === 'simulation') {
      setActiveTab('simulation');
    } else if (tabParam === 'map') {
      setActiveTab('map');
    }
  }, []);

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

  // Fetch hospitals
  const fetchHospitals = useCallback(async () => {
    try {
      const data = await apiClient.listHospitals();
      setHospitals(data.hospitals || []);
    } catch (err: any) {
      console.warn('Failed to fetch hospitals:', err);
    }
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      const data = await apiClient.getAdminAuditLogs({
        caseId: selectedCaseId || undefined,
        hospitalId: selectedHospitalFilter || undefined,
        action: selectedAction || undefined,
        limit: 100,
      });
      setAuditLogs(data.logs || []);
    } catch (err: any) {
      console.warn('Failed to fetch audit logs:', err);
    }
  }, [selectedCaseId, selectedHospitalFilter, selectedAction]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([fetchOverview(), fetchCases(), fetchHospitals(), fetchAuditLogs()]).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchOverview, fetchCases, fetchHospitals, fetchAuditLogs]);

  // Real-time socket subscriptions
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

    const unsubInv = subscribeToRealtimeEvent('inventory.updated', () => {
      fetchOverview();
    });

    const unsubPos = subscribeToRealtimeEvent('ambulance.position.updated', () => {
      fetchOverview();
    });

    return () => {
      unsubCase();
      unsubDest();
      unsubInv();
      unsubPos();
    };
  }, [fetchOverview, fetchCases, fetchAuditLogs]);

  // Quick hospital status toggle
  const handleToggleHospitalStatus = async (hospitalId: string, currentStatus: ReceivingStatus) => {
    const nextStatus: ReceivingStatus =
      currentStatus === ReceivingStatus.OPEN
        ? ReceivingStatus.RESTRICTED
        : currentStatus === ReceivingStatus.RESTRICTED
        ? ReceivingStatus.DIVERT_ALL
        : ReceivingStatus.OPEN;

    try {
      await apiClient.updateHospital(hospitalId, {
        receivingStatus: nextStatus,
      });
      fetchOverview();
    } catch (err: any) {
      alert(`Error updating hospital status: ${err.message}`);
    }
  };

  // Adjust receiving delay
  const handleAdjustDelay = async (hospitalId: string, currentDelay: number, delta: number) => {
    const newDelay = Math.max(0, currentDelay + delta);
    try {
      await apiClient.updateHospital(hospitalId, {
        receivingDelaySeconds: newDelay,
      });
      fetchOverview();
    } catch (err: any) {
      alert(`Error adjusting delay: ${err.message}`);
    }
  };

  // Save system settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsSavedMessage(null);
    try {
      const data = await apiClient.updateAdminSettings(settingsForm);
      setSettingsSavedMessage('System parameters successfully committed.');
      setOverview((prev) => (prev ? { ...prev, systemSettings: data.settings } : null));
      fetchAuditLogs();
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Execute demo scenario reset
  const handleExecuteReset = async () => {
    setResetting(true);
    try {
      await apiClient.resetDemoScenario();
      setShowResetConfirm(false);
      alert('Demo state reset successfully to baseline synthetic configuration.');
      fetchOverview();
      fetchCases();
      fetchAuditLogs();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
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
        <div className="flex items-center gap-3 text-[#596B69]">
          <RefreshCw className="w-6 h-6 animate-spin text-[#176B68]" />
          <span>Loading Dispatch Command Dashboard...</span>
        </div>
      </div>
    );
  }

  const ambulancePos = overview?.ambulanceTelemetry?.position || {
    x: 120,
    y: 150,
    lat: 13.0110,
    lng: 74.7943,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-[#176B68]">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#172B2A] tracking-tight">Admin Command & System Monitoring</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3] font-semibold flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Live Sync
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#F6F8F8] text-[#596B69] border border-[#DCE5E3] text-[10px]">
                  Global Oversight
                </span>
              </div>
              <p className="text-xs text-[#596B69] mt-0.5">
                Multi-facility hospital capacity, real-time telemetry freshness, immutable audit trail, and emergency routing controls.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchOverview();
                fetchCases();
                fetchAuditLogs();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F6F8F8] text-[#172B2A] text-xs font-semibold rounded-xl border border-[#DCE5E3] shadow-xs transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Snapshot
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#FDF2F2] text-[#B42318] text-xs font-semibold rounded-xl border border-[#DCE5E3] shadow-xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Demo Scenario
            </button>
          </div>
        </div>

        {/* Overview Metric Row */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3.5 border-t border-[#DCE5E3]">
            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3]">
              <span className="text-[11px] text-[#596B69] font-medium block">Active Cases</span>
              <span className="text-lg font-bold text-[#172B2A] font-mono">{overview.activeCasesCount}</span>
            </div>

            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3]">
              <span className="text-[11px] text-[#596B69] font-medium block">Fleet Equipment</span>
              <span className="text-lg font-bold text-[#237048] font-mono">
                {overview.totalResources.available} / {overview.totalResources.total}
              </span>
            </div>

            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3]">
              <span className="text-[11px] text-[#596B69] font-medium block">Pending Hospital Requests</span>
              <span className="text-lg font-bold text-[#176B68] font-mono">{overview.pendingRequestsCount}</span>
            </div>

            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3]">
              <span className="text-[11px] text-[#596B69] font-medium block">Ambulance Telemetry</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    overview.ambulanceTelemetry?.isStale ? 'bg-[#8A5800]' : 'bg-[#237048]'
                  }`}
                ></span>
                <span className="text-xs font-bold text-[#172B2A]">
                  {overview.ambulanceTelemetry?.isStale
                    ? `Stale (${overview.ambulanceTelemetry?.stalenessSeconds}s)`
                    : 'Live GPS Connected'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#DCE5E3] gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('fleet')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'fleet'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <HospitalIcon className="w-4 h-4" />
          Fleet Hospital Readiness
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'map'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <MapIcon className="w-4 h-4" />
          Live Regional Map
        </button>

        <button
          onClick={() => setActiveTab('cases')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'cases'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <Activity className="w-4 h-4" />
          Active Cases ({cases.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Timeline & Inspector
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'simulation'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <Box className="w-4 h-4" />
          3D Digital Twin Simulation
        </button>

        <button
          onClick={() => setActiveTab('directory')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'directory'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          NITK 23 Hospital Directory
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-[#174C49] text-[#174C49]'
              : 'border-transparent text-[#596B69] hover:text-[#172B2A]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Operational Settings
        </button>
      </div>

      {/* TAB 1: FLEET READINESS */}
      {activeTab === 'fleet' && (
        <div className="space-y-4">
          <div className="p-3 bg-[#FFF8E6] border border-[#F3E5AB] rounded-xl text-xs text-[#8A5800] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#8A5800]" />
            <span>
              <strong>Admin Integrity Invariant:</strong> Status modifications adjust receiving readiness and intake delay. They never silently override patient clinical requirements or release occupied hospital equipment.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overview?.hospitalReadiness.map((hosp) => (
              <div
                key={hosp.id || hosp.code}
                className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#172B2A]">{hosp.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EAF5F2] text-[#176B68]">
                        {hosp.code}
                      </span>
                    </div>
                    <span className="text-xs text-[#596B69] block mt-0.5">
                      Intake Delay: <strong>+{Math.round(hosp.receivingDelaySeconds / 60)}m</strong>
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleHospitalStatus(hosp.id, hosp.receivingStatus)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      hosp.receivingStatus === ReceivingStatus.OPEN
                        ? 'bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3]'
                        : hosp.receivingStatus === ReceivingStatus.RESTRICTED
                        ? 'bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB]'
                        : 'bg-[#FDF2F2] text-[#B42318] border border-[#F8D7DA]'
                    }`}
                  >
                    {hosp.receivingStatus}
                  </button>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1.5 pt-2 border-t border-[#DCE5E3]">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#596B69]">Resource Utilization</span>
                    <span className="text-[#172B2A] font-semibold">{hosp.resourceUtilizationPercent}%</span>
                  </div>
                  <div className="w-full bg-[#F6F8F8] rounded-full h-2 overflow-hidden border border-[#DCE5E3]">
                    <div
                      className={`h-full transition-all ${
                        hosp.resourceUtilizationPercent > 80
                          ? 'bg-[#B42318]'
                          : hosp.resourceUtilizationPercent > 50
                          ? 'bg-[#8A5800]'
                          : 'bg-[#237048]'
                      }`}
                      style={{ width: `${Math.min(100, hosp.resourceUtilizationPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Resource Stats Grid */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#DCE5E3] text-center">
                  <div className="p-2 bg-[#F6F8F8] rounded-lg border border-[#DCE5E3]">
                    <span className="text-[10px] text-[#596B69] uppercase block font-medium">Available</span>
                    <span className="text-sm font-bold text-[#237048]">{hosp.availableCount}</span>
                  </div>
                  <div className="p-2 bg-[#F6F8F8] rounded-lg border border-[#DCE5E3]">
                    <span className="text-[10px] text-[#596B69] uppercase block font-medium">Reserved</span>
                    <span className="text-sm font-bold text-[#176B68]">{hosp.reservedCount}</span>
                  </div>
                  <div className="p-2 bg-[#F6F8F8] rounded-lg border border-[#DCE5E3]">
                    <span className="text-[10px] text-[#596B69] uppercase block font-medium">In Use</span>
                    <span className="text-sm font-bold text-[#8A5800]">{hosp.inUseCount}</span>
                  </div>
                  <div className="p-2 bg-[#F6F8F8] rounded-lg border border-[#DCE5E3]">
                    <span className="text-[10px] text-[#596B69] uppercase block font-medium">Total</span>
                    <span className="text-sm font-bold text-[#172B2A]">{hosp.totalResources}</span>
                  </div>
                </div>

                {/* Capabilities Tags */}
                {hosp.capabilities && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {hosp.capabilities.map((cap) => (
                      <span key={cap} className="px-1.5 py-0.5 rounded bg-[#F6F8F8] border border-[#DCE5E3] text-[#596B69] text-[10px] font-mono">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE REGIONAL MAP */}
      {activeTab === 'map' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 h-[560px]">
            <LiveMap
              hospitals={hospitals}
              selectedHospitalId={selectedHospitalId}
              onSelectHospital={setSelectedHospitalId}
              ambulancePosition={{
                ambulanceId: 'amb-104',
                x: ambulancePos.x || 120,
                y: ambulancePos.y || 150,
                lat: ambulancePos.lat || 13.0110,
                lng: ambulancePos.lng || 74.7943,
                speed: overview?.ambulanceTelemetry?.speed || 0,
                heading: overview?.ambulanceTelemetry?.heading || 85,
                source: 'SIMULATED',
                sourceGeneration: 1,
                serverSequence: overview?.ambulanceTelemetry?.serverSequence || 1,
                observedAt: overview?.ambulanceTelemetry?.observedAt || new Date().toISOString(),
              }}
            />
          </div>

          <div className="lg:col-span-4 bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
            <h3 className="font-bold text-sm text-[#172B2A] border-b border-[#DCE5E3] pb-2.5">
              Regional Receiving Facilities ({hospitals.length})
            </h3>
            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {hospitals.map((h) => (
                <div
                  key={h.id}
                  onClick={() => setSelectedHospitalId(h.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedHospitalId === h.id
                      ? 'bg-[#EAF5F2] border-[#176B68]'
                      : 'bg-[#F6F8F8] border-[#DCE5E3] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#172B2A]">{h.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#176B68] border border-[#DCE5E3]">
                      {h.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#596B69] mt-0.5">{h.address}</p>
                  <div className="flex items-center justify-between text-[11px] text-[#596B69] mt-2 pt-2 border-t border-[#DCE5E3]">
                    <span>Status: <strong className="text-[#237048]">{h.receivingStatus}</strong></span>
                    <span>Delay: +{Math.round(h.receivingDelaySeconds / 60)}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVE CASES */}
      {activeTab === 'cases' && (
        <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
            <h3 className="font-bold text-base text-[#172B2A]">Active Transport Emergencies</h3>
            <span className="text-xs text-[#596B69]">{cases.length} recorded cases</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6F8F8] border-b border-[#DCE5E3] text-[#596B69] uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Case ID</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Assigned Unit</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Audit Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE5E3]">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F6F8F8]">
                    <td className="py-3 px-3 font-mono font-bold text-[#172B2A]">{c.id}</td>
                    <td className="py-3 px-3 font-semibold text-[#172B2A]">{c.patientLabel}</td>
                    <td className="py-3 px-3 text-[#596B69] font-mono">{c.assignedAmbulanceId}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]">
                        {c.caseStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleTraceCase(c.id)}
                        className="px-2.5 py-1 bg-white border border-[#DCE5E3] hover:bg-[#EAF5F2] text-[#176B68] font-semibold rounded-lg text-xs transition"
                      >
                        Trace Audit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TIMELINE */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {selectedCaseId && (
            <div className="p-3 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-xs text-[#176B68] flex items-center justify-between">
              <span>Tracing Case: {selectedCaseId}</span>
              <button
                onClick={() => setSelectedCaseId('')}
                className="text-[11px] underline font-semibold hover:text-[#174C49]"
              >
                Clear Filter
              </button>
            </div>
          )}

          <div className="bg-white border border-[#DCE5E3] rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs text-[#596B69]">
              <ListFilter className="w-4 h-4 text-[#176B68]" />
              <span>Filters:</span>
            </div>

            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="bg-[#F6F8F8] border border-[#DCE5E3] text-[#172B2A] rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="">All Cases</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.patientLabel}
                </option>
              ))}
            </select>

            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="bg-[#F6F8F8] border border-[#DCE5E3] text-[#172B2A] rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="">All Actions</option>
              <option value="CASE_CREATED">CASE_CREATED</option>
              <option value="REQUIREMENTS_CONFIRMED">REQUIREMENTS_CONFIRMED</option>
              <option value="RECOMMENDATIONS_GENERATED">RECOMMENDATIONS_GENERATED</option>
              <option value="CASE_DISPATCHED">CASE_DISPATCHED</option>
              <option value="REQUEST_ACCEPTED">REQUEST_ACCEPTED</option>
              <option value="CASE_DIVERTED">CASE_DIVERTED</option>
              <option value="AMBULANCE_ARRIVED">AMBULANCE_ARRIVED</option>
              <option value="CASE_HANDOVER">CASE_HANDOVER</option>
              <option value="ALLOCATION_RELEASED">ALLOCATION_RELEASED</option>
            </select>

            <button
              onClick={fetchAuditLogs}
              className="px-3 py-1.5 bg-[#174C49] hover:bg-[#135552] text-white text-xs font-semibold rounded-lg shadow-xs"
            >
              Apply Filter
            </button>
          </div>

          <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-3 shadow-xs">
            {auditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#596B69]">
                No matching audit entries found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#172B2A] font-mono">{log.action}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white text-[#596B69] border border-[#DCE5E3]">
                          Actor: {log.actorRole}
                        </span>
                      </div>
                      <p className="text-[#596B69] text-[11px] font-mono">
                        Entity: {log.entityType} ({log.entityId})
                      </p>
                      {log.details && (
                        <pre className="text-[10px] text-[#172B2A] bg-white p-2 rounded border border-[#DCE5E3] overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                    <span className="text-[10px] text-[#596B69] shrink-0 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: 3D DIGITAL TWIN SIMULATION */}
      {activeTab === 'simulation' && (
        <div className="bg-white border border-[#DCE5E3] rounded-2xl p-4 shadow-xs">
          <Simulation3DView activeCaseId={cases[0]?.id} onTraceCase={handleTraceCase} />
        </div>
      )}

      {/* TAB 6: SYSTEM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-[#DCE5E3] rounded-2xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#176B68]" />
              System Operational Settings
            </h3>
            <p className="text-xs text-[#596B69] mt-0.5">
              Configure system refresh cadences, telemetry staleness warnings, and ranking hysteresis buffers.
            </p>
          </div>

          {settingsSavedMessage && (
            <div className="p-3 bg-[#EAF5F2] border border-[#DCE5E3] text-[#237048] rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{settingsSavedMessage}</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg text-xs">
            <div>
              <label className="font-semibold text-[#172B2A]">Demo Refresh Interval</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settingsForm.demoRefreshIntervalSeconds}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, demoRefreshIntervalSeconds: parseInt(e.target.value, 10) || 5 })
                  }
                  className="w-full bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                />
                <span className="absolute right-3 top-2 text-xs text-[#596B69]">seconds</span>
              </div>
              <span className="text-[11px] text-[#596B69] mt-0.5 block">
                Interval between automated polling fallbacks (1 to 60 seconds).
              </span>
            </div>

            <div>
              <label className="font-semibold text-[#172B2A]">Telemetry Staleness Threshold</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={settingsForm.stalenessThresholdSeconds}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, stalenessThresholdSeconds: parseInt(e.target.value, 10) || 15 })
                  }
                  className="w-full bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                />
                <span className="absolute right-3 top-2 text-xs text-[#596B69]">seconds</span>
              </div>
              <span className="text-[11px] text-[#596B69] mt-0.5 block">
                Threshold beyond which vehicle telemetry is flagged STALE.
              </span>
            </div>

            <div>
              <label className="font-semibold text-[#172B2A]">Ranking Improvement Margin</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={settingsForm.rankingImprovementMarginSeconds}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, rankingImprovementMarginSeconds: parseInt(e.target.value, 10) || 120 })
                  }
                  className="w-full bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                />
                <span className="absolute right-3 top-2 text-xs text-[#596B69]">seconds</span>
              </div>
              <span className="text-[11px] text-[#596B69] mt-0.5 block">
                Hysteresis buffer required before swapping destination recommendations (0 to 600s).
              </span>
            </div>

            <button
              type="submit"
              disabled={settingsSaving}
              className="px-4 py-2 bg-[#174C49] hover:bg-[#135552] text-white font-semibold rounded-xl shadow-xs transition"
            >
              {settingsSaving ? 'Saving...' : 'Apply System Settings'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: 23 HOSPITAL DIRECTORY & CAPABILITY MATRIX (Stage 5) */}
      {activeTab === 'directory' && (
        <HospitalDirectoryTable
          selectedHospitalId={selectedHospitalId || undefined}
          onSelectHospital={(id) => setSelectedHospitalId(id)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE5E3] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-[#B42318]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-[#172B2A]">Reset Demo Scenario?</h3>
            </div>
            <p className="text-xs text-[#596B69] leading-relaxed">
              This will restore all 5 hospitals, resource pools, staff readiness, and ambulance positions to baseline synthetic state. Any active cases will be cleared.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 bg-white border border-[#DCE5E3] text-[#596B69] text-xs font-semibold rounded-xl hover:bg-[#F6F8F8]"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReset}
                disabled={resetting}
                className="flex-1 py-2 bg-[#B42318] hover:bg-[#911C13] text-white text-xs font-semibold rounded-xl shadow-xs transition"
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
