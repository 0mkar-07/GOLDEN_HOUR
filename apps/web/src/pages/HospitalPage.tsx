import React, { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Layers,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Edit3,
  X,
  Clock,
  ShieldAlert,
  Sliders,
  ChevronRight,
  TrendingDown,
  Bell,
  Radio,
  Check,
  XCircle,
} from 'lucide-react';
import {
  HospitalDto,
  ResourcePoolDto,
  StaffAvailabilityDto,
  HospitalRequestDto,
  ReceivingStatus,
  RequestRole,
  RequestStatus,
  UserRole,
} from '@goldenhour/contracts';
import { apiClient, ApiError } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';
import { subscribeToRealtimeEvent } from '../lib/socket';

export const HospitalPage: React.FC = () => {
  const { user } = useAuth();

  // State
  const [hospitals, setHospitals] = useState<HospitalDto[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('hosp-001');
  const [currentHospital, setCurrentHospital] = useState<HospitalDto | null>(null);
  const [resourcePools, setResourcePools] = useState<ResourcePoolDto[]>([]);
  const [staffList, setStaffList] = useState<StaffAvailabilityDto[]>([]);
  const [requests, setRequests] = useState<HospitalRequestDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Edit Modal State for Resource Pool
  const [editingPool, setEditingPool] = useState<ResourcePoolDto | null>(null);
  const [editTotal, setEditTotal] = useState<number>(0);
  const [editOutOfService, setEditOutOfService] = useState<number>(0);
  const [editExternal, setEditExternal] = useState<number>(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Sync selected hospital with logged-in user if hospital role
  useEffect(() => {
    if (user?.role === UserRole.HOSPITAL && user.hospitalId) {
      setSelectedHospitalId(user.hospitalId);
    }
  }, [user]);

  // Load all hospitals
  const loadHospitals = useCallback(async () => {
    try {
      const res = await apiClient.listHospitals();
      setHospitals(res.hospitals);
    } catch (err: any) {
      console.error('Failed to fetch hospitals list:', err);
    }
  }, []);

  // Load selected hospital details, resources, staff, and incoming requests
  const loadHospitalData = useCallback(async (hospId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [hospRes, poolsRes, staffRes, reqRes] = await Promise.all([
        apiClient.getHospital(hospId),
        apiClient.getHospitalResources(hospId),
        apiClient.getHospitalStaff(hospId),
        apiClient.listHospitalRequests(hospId),
      ]);
      setCurrentHospital(hospRes.hospital);
      setResourcePools(poolsRes.resourcePools);
      setStaffList(staffRes.staffAvailability);
      setRequests(reqRes.requests || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load hospital state');
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-Time Event Subscriptions
  useEffect(() => {
    const unsubReqCreated = subscribeToRealtimeEvent('request.created', (event) => {
      const newReq = event.payload as HospitalRequestDto;
      if (newReq.hospitalId === selectedHospitalId) {
        setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)]);
      }
    });

    const unsubReqUpdated = subscribeToRealtimeEvent('request.updated', (event) => {
      const updatedReq = event.payload as HospitalRequestDto;
      setRequests((prev) =>
        prev.map((r) => (r.id === updatedReq.id ? updatedReq : r))
      );
    });

    const unsubInv = subscribeToRealtimeEvent('inventory.updated', (event) => {
      if ((event.payload as any)?.hospitalId === selectedHospitalId) {
        // Refetch inventory to reflect new reservations
        apiClient.getHospitalResources(selectedHospitalId).then((res) => {
          setResourcePools(res.resourcePools);
        });
      }
    });

    return () => {
      unsubReqCreated();
      unsubReqUpdated();
      unsubInv();
    };
  }, [selectedHospitalId]);

  // Handle Accept Incoming Request (Triggers atomic reservation)
  const handleAcceptRequest = async (requestId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.acceptHospitalRequest(requestId);

      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? res.request : r))
      );
      setActionSuccess(`Request accepted! Case is now EN_ROUTE. Required resources atomically reserved.`);
      setTimeout(() => setActionSuccess(null), 4000);

      // Reload inventory pools to show new reservation numbers
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      setError(err?.message || 'Failed to accept hospital request');
    }
  };

  // Handle Decline Request
  const handleDeclineRequest = async (requestId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.declineHospitalRequest(requestId);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? res.request : r))
      );
      setActionSuccess('Request declined.');
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to decline request');
    }
  };

  useEffect(() => {
    loadHospitals();
  }, [loadHospitals]);

  useEffect(() => {
    if (selectedHospitalId) {
      loadHospitalData(selectedHospitalId);
    }
  }, [selectedHospitalId, loadHospitalData]);

  // Handle Receiving Status change
  const handleStatusChange = async (newStatus: ReceivingStatus) => {
    if (!currentHospital) return;
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.updateHospital(currentHospital.id, {
        receivingStatus: newStatus,
        expectedVersion: currentHospital.version,
      });
      setCurrentHospital(res.hospital);
      setActionSuccess(`Receiving status updated to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update receiving status');
    }
  };

  // Handle Receiving Delay change
  const handleDelayChange = async (deltaSeconds: number) => {
    if (!currentHospital) return;
    const newDelay = Math.max(0, currentHospital.receivingDelaySeconds + deltaSeconds);
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.updateHospital(currentHospital.id, {
        receivingDelaySeconds: newDelay,
        expectedVersion: currentHospital.version,
      });
      setCurrentHospital(res.hospital);
      setActionSuccess(`Intake delay updated to ${Math.round(newDelay / 60)} minutes (${newDelay}s)`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update intake delay');
    }
  };

  // Open Edit Modal for a Resource Pool
  const startEditPool = (pool: ResourcePoolDto) => {
    setEditingPool(pool);
    setEditTotal(pool.totalCount);
    setEditOutOfService(pool.outOfServiceCount);
    setEditExternal(pool.externalOccupancy);
    setEditError(null);
  };

  // Submit Pool Edit
  const handleSavePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPool) return;

    setEditSaving(true);
    setEditError(null);

    try {
      const res = await apiClient.updateResourcePool(editingPool.id, {
        totalCount: editTotal,
        outOfServiceCount: editOutOfService,
        externalOccupancy: editExternal,
        expectedVersion: editingPool.version,
      });

      // Update state locally
      setResourcePools((prev) =>
        prev.map((p) => (p.id === res.resourcePool?.id || p.id === editingPool.id ? res.resourcePool : p))
      );

      setEditingPool(null);
      setActionSuccess(`Resource pool ${editingPool.resourceType} successfully updated.`);
      setTimeout(() => setActionSuccess(null), 3500);
      // Reload in background to ensure all records sync
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 409) {
        setEditError('Conflict: This record was modified by another session. Please reload fresh values.');
      } else {
        setEditError(err?.message || 'Failed to update resource pool');
      }
    } finally {
      setEditSaving(false);
    }
  };

  // Quick Team Slot Increment/Decrement
  const handleStaffSlotChange = async (staff: StaffAvailabilityDto, delta: number) => {
    const newSlots = Math.max(0, staff.availableTeamSlots + delta);
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.updateStaffAvailability(staff.id, {
        availableTeamSlots: newSlots,
        expectedVersion: staff.version,
      });

      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? res.staffAvailability : s))
      );
      setActionSuccess(`Staff readiness updated: ${staff.specialty} = ${newSlots} team(s)`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update staff slots');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Hospital Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {currentHospital ? currentHospital.name : 'Hospital Command Portal'}
                </h1>
                {currentHospital && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    {currentHospital.code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentHospital?.address} • Coordinates: [{currentHospital?.location.lat}, {currentHospital?.location.lng}]
              </p>
            </div>
          </div>

          {/* Hospital Switcher & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-medium">Viewing Facility:</span>
              <select
                aria-label="Active Facility"
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id} className="bg-slate-900 text-slate-100">
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => loadHospitalData(selectedHospitalId)}
              disabled={loading}
              title="Reload live inventory"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Notifications & Status Banners */}
        {actionSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Facility Metadata Strip */}
        {currentHospital && (
          <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Receiving Status Control */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Intake Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    currentHospital.receivingStatus === ReceivingStatus.OPEN
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : currentHospital.receivingStatus === ReceivingStatus.RESTRICTED
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {currentHospital.receivingStatus}
                </span>
              </div>
              <div className="flex gap-1 pt-1">
                {(['OPEN', 'RESTRICTED', 'DIVERT_ALL'] as ReceivingStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className={`flex-1 py-1 rounded text-[10px] font-semibold transition ${
                      currentHospital.receivingStatus === st
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {st === 'DIVERT_ALL' ? 'DIVERT' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Intake Receiving Delay */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Internal Receiving Delay:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {Math.round(currentHospital.receivingDelaySeconds / 60)}m ({currentHospital.receivingDelaySeconds}s)
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleDelayChange(-60)}
                  className="flex-1 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  -1 min
                </button>
                <button
                  onClick={() => handleDelayChange(60)}
                  className="flex-1 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  +1 min
                </button>
              </div>
            </div>

            {/* Version & Capabilities */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Record Version:</span>
                <span className="font-mono text-slate-300">v{currentHospital.version}</span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Capabilities: {currentHospital.capabilities.join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Resource Pools & Staff Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resource Pools (Span 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  Live Resource Capacity & Occupancy
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Formula: <code className="text-blue-300">Available = Total - OutOfService - External - Reserved - InUse</code>
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
                {resourcePools.length} Pools Configured
              </span>
            </div>

            {/* Pools List */}
            <div className="space-y-3">
              {resourcePools.map((pool) => {
                const committed = pool.outOfServiceCount + pool.externalOccupancy + pool.reservedCount + pool.inUseCount;
                const percentAvailable = pool.totalCount > 0 ? (pool.availableCount / pool.totalCount) * 100 : 0;

                return (
                  <div
                    key={pool.id}
                    className="p-4 bg-slate-950/70 border border-slate-850 rounded-xl space-y-3 hover:border-slate-800 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-sm text-slate-100">{pool.resourceType}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                            pool.availableCount > 0
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {pool.availableCount} Available
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-400 font-mono">
                          <span>Total: <strong className="text-slate-200">{pool.totalCount}</strong></span> •{' '}
                          <span>Ext: <strong className="text-slate-300">{pool.externalOccupancy}</strong></span> •{' '}
                          <span>Reserved: <strong className="text-amber-400">{pool.reservedCount}</strong></span> •{' '}
                          <span>In Use: <strong className="text-blue-400">{pool.inUseCount}</strong></span> •{' '}
                          <span>OOS: <strong className="text-rose-400">{pool.outOfServiceCount}</strong></span>
                        </div>

                        <button
                          onClick={() => startEditPool(pool)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition"
                          title="Edit capacity numbers"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Visualizer */}
                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex">
                      {/* Available (Green) */}
                      <div
                        style={{ width: `${percentAvailable}%` }}
                        className="bg-emerald-500 transition-all duration-300"
                        title={`Available: ${pool.availableCount}`}
                      />
                      {/* Reserved (Amber) */}
                      <div
                        style={{ width: `${(pool.reservedCount / (pool.totalCount || 1)) * 100}%` }}
                        className="bg-amber-500 transition-all duration-300"
                        title={`Reserved: ${pool.reservedCount}`}
                      />
                      {/* In Use (Blue) */}
                      <div
                        style={{ width: `${(pool.inUseCount / (pool.totalCount || 1)) * 100}%` }}
                        className="bg-blue-500 transition-all duration-300"
                        title={`In Use: ${pool.inUseCount}`}
                      />
                      {/* External / OOS (Slate) */}
                      <div
                        style={{
                          width: `${((pool.externalOccupancy + pool.outOfServiceCount) / (pool.totalCount || 1)) * 100}%`,
                        }}
                        className="bg-slate-700 transition-all duration-300"
                        title={`External & Out of Service: ${pool.externalOccupancy + pool.outOfServiceCount}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Staff Readiness & Invariant Guard (1 Col) */}
        <div className="space-y-4">
          {/* Incoming Dispatch Requests Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-red-400" />
                Incoming Case Requests
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-bold">
                {requests.length} Total
              </span>
            </div>

            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  No active ambulance requests for this facility.
                </div>
              ) : (
                requests.map((req) => {
                  const isMain = req.role === RequestRole.MAIN;
                  const isPending = req.status === RequestStatus.PENDING;
                  const isAccepted = req.status === RequestStatus.ACCEPTED;
                  const isDeclined = req.status === RequestStatus.DECLINED;

                  return (
                    <div
                      key={req.id}
                      className={`p-4 rounded-xl border space-y-3 transition ${
                        isMain
                          ? 'bg-red-950/20 border-red-500/30 shadow-lg shadow-red-500/5'
                          : 'bg-amber-950/15 border-amber-500/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                isMain
                                  ? 'bg-red-500 text-white'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isMain ? 'Target: Full-Care (A)' : 'Standby Notice (B/C)'}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              Gen {req.destinationGeneration}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-300">
                            Case:{' '}
                            <strong className="text-white font-mono">{req.caseId}</strong>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {isPending && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold animate-pulse">
                              <Radio className="w-3 h-3 text-amber-400" />
                              Pending Action
                            </span>
                          )}
                          {isAccepted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              Accepted
                            </span>
                          )}
                          {isDeclined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-bold">
                              <XCircle className="w-3 h-3" />
                              Declined
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex justify-between items-center pt-1 border-t border-slate-800/60">
                        <span>
                          {isMain
                            ? 'Accepting atomically reserves required pools & staff slots.'
                            : 'Standby acknowledgment does not lock equipment.'}
                        </span>
                        <span className="font-mono text-slate-500">
                          {new Date(req.createdAt).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Action Buttons for Pending */}
                      {isPending && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleAcceptRequest(req.id)}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold shadow-md transition flex items-center justify-center gap-1.5 ${
                              isMain
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isMain ? 'Accept & Reserve' : 'Acknowledge Standby'}
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(req.id)}
                            className="py-1.5 px-3 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 rounded-lg text-xs font-medium transition"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Staff Readiness Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Staff Specialty Teams
              </h2>
              <span className="text-xs text-slate-500">Live Slots</span>
            </div>

            <div className="space-y-3">
              {staffList.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center">No specialized team slots assigned.</div>
              ) : (
                staffList.map((staff) => (
                  <div key={staff.id} className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-200">{staff.specialty}</span>
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {staff.availableTeamSlots} Team(s) Ready
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>Ready At: Now</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleStaffSlotChange(staff, -1)}
                          disabled={staff.availableTeamSlots <= 0}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded font-mono font-bold disabled:opacity-40"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => handleStaffSlotChange(staff, 1)}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded font-mono font-bold"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* GoldenHour Resource Invariants Reference */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Resource Allocation Rules
            </div>
            <ul className="space-y-1.5 list-disc pl-4 text-[11px] leading-relaxed">
              <li>Staff update actual capacity & external occupancy; backend maintains reservations & availability.</li>
              <li>A single ventilator cannot be allocated to two cases simultaneously.</li>
              <li>Reductions in total capacity cannot breach current committed allocations.</li>
              <li>Arrival or handover does not automatically release equipment; release is an explicit action.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Edit Pool Modal */}
      {editingPool && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-white text-base">Edit {editingPool.resourceType} Capacity</h3>
              </div>
              <button onClick={() => setEditingPool(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSavePool} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Total Count (Physical Units)</label>
                <input
                  type="number"
                  min="0"
                  value={editTotal}
                  onChange={(e) => setEditTotal(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Out of Service</label>
                  <input
                    type="number"
                    min="0"
                    value={editOutOfService}
                    onChange={(e) => setEditOutOfService(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">External Occupancy</label>
                  <input
                    type="number"
                    min="0"
                    value={editExternal}
                    onChange={(e) => setEditExternal(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Computed Preview */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>GoldenHour Committed (Reserved + InUse):</span>
                  <span className="text-slate-200">{editingPool.reservedCount + editingPool.inUseCount}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Committed:</span>
                  <span className="text-slate-200">
                    {editOutOfService + editExternal + editingPool.reservedCount + editingPool.inUseCount}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                  <span className="text-slate-300">Projected Available:</span>
                  <span
                    className={
                      editTotal - (editOutOfService + editExternal + editingPool.reservedCount + editingPool.inUseCount) >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {editTotal - (editOutOfService + editExternal + editingPool.reservedCount + editingPool.inUseCount)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPool(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
