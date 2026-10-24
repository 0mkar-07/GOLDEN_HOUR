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
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import {
  HospitalDto,
  ResourcePoolDto,
  StaffAvailabilityDto,
  HospitalRequestDto,
  AllocationDto,
  AllocationState,
  ReceivingStatus,
  RequestRole,
  RequestStatus,
  UserRole,
  OperatingTheatreDto,
  ScheduledProcedureDto,
  EmergencyPriorityTicketDto,
} from '@goldenhour/contracts';
import { apiClient, ApiError } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';
import { useHospitalDirectory } from '../hooks/useHospitalDirectory';
import { subscribeToRealtimeEvent } from '../lib/socket';

export const HospitalPage: React.FC = () => {
  const { user } = useAuth();
  const { hospitals, loading: hospitalsLoading, error: hospitalsError, reload: reloadHospitals } = useHospitalDirectory();

  // State
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('hosp-001');
  const [currentHospital, setCurrentHospital] = useState<HospitalDto | null>(null);
  const [resourcePools, setResourcePools] = useState<ResourcePoolDto[]>([]);
  const [staffList, setStaffList] = useState<StaffAvailabilityDto[]>([]);
  const [requests, setRequests] = useState<HospitalRequestDto[]>([]);
  const [allocations, setAllocations] = useState<AllocationDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Scheduling & Operating Theatre State
  const [theatres, setTheatres] = useState<OperatingTheatreDto[]>([]);
  const [procedures, setProcedures] = useState<ScheduledProcedureDto[]>([]);
  const [priorityTickets, setPriorityTickets] = useState<EmergencyPriorityTicketDto[]>([]);
  const [reviewerNotes, setReviewerNotes] = useState<string>(
    'Approved elective deferral: OR-1 prioritized for critical inbound emergency trauma'
  );
  const [decisionProcessing, setDecisionProcessing] = useState<boolean>(false);

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

  // Load data for selected hospital
  const loadHospitalData = useCallback(async (hospId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [hospRes, poolsRes, staffRes] = await Promise.all([
        apiClient.getHospital(hospId),
        apiClient.getHospitalResources(hospId),
        apiClient.getHospitalStaff(hospId),
      ]);

      setCurrentHospital(hospRes.hospital);
      setResourcePools(poolsRes.resourcePools || []);
      setStaffList(staffRes.staffAvailability || []);

      // Active requests, allocations, and operating theatre schedules
      try {
        const [reqsRes, allocsRes, theatresRes, procsRes, ticketsRes] = await Promise.all([
          apiClient.listHospitalRequests(hospId),
          apiClient.listHospitalAllocations(hospId),
          apiClient.getHospitalTheatres(hospId),
          apiClient.getHospitalProcedures(hospId),
          apiClient.getHospitalPriorityTickets(hospId),
        ]);
        setRequests(reqsRes?.requests || []);
        setAllocations(allocsRes?.allocations || []);
        setTheatres(theatresRes?.theatres || []);
        setProcedures(procsRes?.procedures || []);
        setPriorityTickets(ticketsRes?.tickets || []);
      } catch {
        setRequests([]);
        setAllocations([]);
        setTheatres([]);
        setProcedures([]);
        setPriorityTickets([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load hospital state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedHospitalId) {
      loadHospitalData(selectedHospitalId);
    }
  }, [selectedHospitalId, loadHospitalData]);

  // Real-Time Socket.IO Subscriptions
  useEffect(() => {
    if (!selectedHospitalId) return;

    const unsubReq = subscribeToRealtimeEvent('request.created', (event: any) => {
      if (event.payload?.hospitalId === selectedHospitalId) {
        setRequests((prev) => [event.payload, ...prev.filter((r) => r.id !== event.payload.id)]);
      }
    });

    const unsubReqUpd = subscribeToRealtimeEvent('request.updated', (event: any) => {
      if (event.payload?.hospitalId === selectedHospitalId) {
        setRequests((prev) =>
          prev.map((r) => (r.id === event.payload.id ? event.payload : r))
        );
      }
    });

    const unsubInv = subscribeToRealtimeEvent('inventory.updated', (event: any) => {
      if (event.payload?.hospitalId === selectedHospitalId) {
        setResourcePools((prev) =>
          prev.map((p) => (p.id === event.payload.id ? event.payload : p))
        );
      }
    });

    const unsubAlloc = subscribeToRealtimeEvent('allocation.updated', () => {
      apiClient.listHospitalAllocations(selectedHospitalId).then((res) => setAllocations(res.allocations));
    });

    return () => {
      unsubReq();
      unsubReqUpd();
      unsubInv();
      unsubAlloc();
    };
  }, [selectedHospitalId]);

  // Handle Receiving Status Change
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
      setActionSuccess(`Hospital receiving status updated to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update receiving status');
    }
  };

  // Handle Receiving Delay Change
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
      setActionSuccess(`Intake delay updated to ${Math.round(newDelay / 60)} minutes`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update delay');
    }
  };

  // Handle Accept Incoming Request (Atomic Reservation)
  const handleAcceptRequest = async (reqId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.acceptHospitalRequest(reqId);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? res.request : r)));
      setActionSuccess('Emergency Case Accepted! Required equipment and staff reserved atomically.');
      setTimeout(() => setActionSuccess(null), 4000);

      // Refresh inventory and allocations
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      setError(err?.message || 'Failed to accept case request');
    }
  };

  // Handle Decline Incoming Request
  const handleDeclineRequest = async (reqId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.declineHospitalRequest(reqId);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? res.request : r)));
      setActionSuccess('Request declined. Case diverted.');
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to decline request');
    }
  };

  // Start In-Use
  const handleStartUse = async (allocId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const alloc = allocations.find((a) => a.id === allocId);
      const res = await apiClient.startUseAllocation(allocId, {
        expectedVersion: alloc?.version ?? 1,
      });
      setAllocations((prev) => prev.map((a) => (a.id === allocId ? res.allocation : a)));
      setActionSuccess('Equipment transitioned to IN_USE.');
      setTimeout(() => setActionSuccess(null), 3500);
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      setError(err?.message || 'Failed to transition to in-use');
    }
  };

  // Release Equipment
  const handleRelease = async (allocId: string) => {
    try {
      setActionSuccess(null);
      setError(null);
      const alloc = allocations.find((a) => a.id === allocId);
      const res = await apiClient.releaseAllocation(allocId, {
        expectedVersion: alloc?.version ?? 1,
      });
      setAllocations((prev) => prev.map((a) => (a.id === allocId ? res.allocation : a)));
      setActionSuccess('Equipment released and restored to available inventory.');
      setTimeout(() => setActionSuccess(null), 3500);
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      setError(err?.message || 'Failed to release allocation');
    }
  };

  // Handle Decision on Emergency Priority Review Ticket
  const handleTicketDecision = async (
    ticketId: string,
    decision: 'APPROVED' | 'DECLINED' | 'ALTERNATIVE_RESOURCE',
    alternateTheatreId?: string
  ) => {
    try {
      setDecisionProcessing(true);
      setActionSuccess(null);
      setError(null);
      const res = await apiClient.decidePriorityTicket(ticketId, {
        decision,
        reviewerNotes,
        alternateTheatreId,
      });

      setPriorityTickets((prev) => prev.map((t) => (t.id === ticketId ? res.ticket : t)));

      if (res.deferredProcedure) {
        setProcedures((prev) =>
          prev.map((p) => (p.id === res.deferredProcedure!.id ? res.deferredProcedure! : p))
        );
      }

      const msg =
        decision === 'APPROVED'
          ? 'Emergency priority APPROVED: Elective procedure deferred. OR Suite prioritized for inbound trauma.'
          : decision === 'ALTERNATIVE_RESOURCE'
          ? 'Emergency priority APPROVED with alternate theatre assignment.'
          : 'Emergency priority deferral DECLINED.';
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4500);
      loadHospitalData(selectedHospitalId);
    } catch (err: any) {
      setError(err?.message || 'Failed to process priority ticket decision');
    } finally {
      setDecisionProcessing(false);
    }
  };

  // Open Edit Modal for Resource Pool
  const openEditModal = (pool: ResourcePoolDto) => {
    setEditingPool(pool);
    setEditTotal(pool.totalCount);
    setEditOutOfService(pool.outOfServiceCount);
    setEditExternal(pool.externalOccupancy);
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingPool(null);
    setEditError(null);
  };

  // Save Resource Pool Edits
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

      setResourcePools((prev) =>
        prev.map((p) => (p.id === editingPool.id ? res.resourcePool : p))
      );

      setActionSuccess(`Inventory updated: ${res.resourcePool.resourceType} Available = ${res.resourcePool.availableCount}`);
      setTimeout(() => setActionSuccess(null), 3500);
      closeEditModal();
    } catch (err: any) {
      if (err?.status === 409 || err?.statusCode === 409) {
        setEditError('Conflict: Pool modified concurrently by another user. Reloading...');
        loadHospitalData(selectedHospitalId);
      } else {
        setEditError(err?.message || 'Failed to update resource pool');
      }
    } finally {
      setEditSaving(false);
    }
  };

  // Quick Staff Slots Change
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

  // Pending incoming requests
  const pendingRequests = requests.filter((r) => r.status === RequestStatus.PENDING);

  return (
    <div className="space-y-6">
      {/* Top Banner & Hospital Facility Header */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-[#176B68]">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#172B2A] tracking-tight">
                  {currentHospital ? currentHospital.name : 'Hospital Command Portal'}
                </h1>
                {currentHospital && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]">
                    {currentHospital.code}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#596B69] mt-0.5">
                {currentHospital?.address} • Coordinates: [{currentHospital?.location.lat}, {currentHospital?.location.lng}]
              </p>
            </div>
          </div>

          {/* Facility Switcher & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[#596B69] font-medium">Viewing Facility:</span>
              <select
                aria-label="Active Facility"
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="bg-transparent text-[#172B2A] font-semibold focus:outline-none cursor-pointer"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id} className="bg-white text-[#172B2A]">
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => loadHospitalData(selectedHospitalId)}
              disabled={loading}
              title="Reload live inventory"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F6F8F8] text-[#172B2A] text-xs font-semibold rounded-xl border border-[#DCE5E3] transition shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="mt-3 p-3 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-xs text-[#237048] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#237048] shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-[#FDF2F2] border border-[#F8D7DA] rounded-xl text-xs text-[#B42318] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="text-[#596B69] hover:text-[#172B2A]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Facility Metadata Strip */}
        {currentHospital && (
          <div className="mt-4 pt-3.5 border-t border-[#DCE5E3] grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Receiving Status Control */}
            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3] space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#596B69] font-medium">Emergency Intake Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    currentHospital.receivingStatus === ReceivingStatus.OPEN
                      ? 'bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3]'
                      : currentHospital.receivingStatus === ReceivingStatus.RESTRICTED
                      ? 'bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB]'
                      : 'bg-[#FDF2F2] text-[#B42318] border border-[#F8D7DA]'
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
                        ? 'bg-[#174C49] text-white'
                        : 'bg-white hover:bg-[#EAF5F2] text-[#596B69] border border-[#DCE5E3]'
                    }`}
                  >
                    {st === 'DIVERT_ALL' ? 'DIVERT' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Intake Receiving Delay */}
            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3] space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#596B69] font-medium">Internal Intake Delay:</span>
                <span className="font-mono font-semibold text-[#172B2A]">
                  +{Math.round(currentHospital.receivingDelaySeconds / 60)}m ({currentHospital.receivingDelaySeconds}s)
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleDelayChange(-60)}
                  className="flex-1 py-1 rounded bg-white hover:bg-[#EAF5F2] text-[#172B2A] border border-[#DCE5E3] text-xs font-semibold"
                >
                  -1 min
                </button>
                <button
                  onClick={() => handleDelayChange(60)}
                  className="flex-1 py-1 rounded bg-white hover:bg-[#EAF5F2] text-[#172B2A] border border-[#DCE5E3] text-xs font-semibold"
                >
                  +1 min
                </button>
              </div>
            </div>

            {/* Verified Capabilities */}
            <div className="bg-[#F6F8F8] p-3 rounded-xl border border-[#DCE5E3] space-y-1">
              <span className="text-xs text-[#596B69] font-medium">Verified Capabilities:</span>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {currentHospital.capabilities.map((c) => (
                  <span
                    key={c}
                    className="px-1.5 py-0.5 rounded bg-white border border-[#DCE5E3] text-[10px] font-medium text-[#172B2A]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Operating Theatres & Emergency Priority Scheduling Review (Stages 3 & 4) */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#DCE5E3] pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#176B68]" />
            <h2 className="text-base font-bold text-[#172B2A]">
              Operating Theatres & Surgical Schedule (Asia/Kolkata)
            </h2>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]">
            24/7 Emergency & Trauma Coverage Active
          </span>
        </div>

        {/* Priority Review Tickets Banner */}
        {priorityTickets.filter((t) => t.status === 'PENDING_REVIEW').length > 0 && (
          <div className="space-y-3">
            {priorityTickets
              .filter((t) => t.status === 'PENDING_REVIEW')
              .map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-4 bg-[#FFF8E6] border border-[#FEEFC7] rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#B54708]">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Emergency Priority Review Required • Inbound Trauma
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-white text-[#B54708] border border-[#FEEFC7]">
                      ETA Window: {Math.round(ticket.emergencyArrivalWindow.estimatedSeconds / 60)} min
                    </span>
                  </div>

                  <p className="text-xs text-[#8A5800] leading-relaxed">
                    {ticket.clinicalRationale}
                  </p>

                  <div className="bg-white/80 border border-[#FEEFC7] rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#596B69]">Conflicting Scheduled Case:</span>
                      <span className="font-semibold text-[#172B2A]">
                        {ticket.conflictingProcedureName} ({ticket.caseType})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#596B69]">Target Theatre:</span>
                      <span className="font-mono font-semibold text-[#176B68]">
                        {theatres.find((t) => t.id === ticket.targetTheatreId)?.name || ticket.targetTheatreId}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[#8A5800]">
                      Reviewer Decision Rationale / Notes:
                    </label>
                    <input
                      type="text"
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      placeholder="Enter clinical rationale for scheduling decision..."
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCE5E3] rounded-lg text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => handleTicketDecision(ticket.id, 'APPROVED')}
                      disabled={decisionProcessing}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-[#174C49] hover:bg-[#093D39] text-white text-xs font-bold rounded-lg shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Elective Deferral (Prioritize Emergency)
                    </button>
                    <button
                      onClick={() => handleTicketDecision(ticket.id, 'ALTERNATIVE_RESOURCE', 'ot-001-2')}
                      disabled={decisionProcessing}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F8F8] text-[#176B68] border border-[#176B68] text-xs font-semibold rounded-lg shadow-xs transition"
                    >
                      Propose Alternate Room (OR-2)
                    </button>
                    <button
                      onClick={() => handleTicketDecision(ticket.id, 'DECLINED')}
                      disabled={decisionProcessing}
                      className="px-3 py-2 bg-white hover:bg-red-50 text-[#B42318] border border-[#FDA29B] text-xs font-semibold rounded-lg transition"
                    >
                      Decline Deferral
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Operating Theatre Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {theatres.map((theatre) => {
            const theatreProcs = procedures.filter((p) => p.theatreId === theatre.id);
            const activeOrUpcoming = theatreProcs[0];

            return (
              <div
                key={theatre.id}
                className="p-3.5 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl space-y-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#172B2A]">{theatre.name}</h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {theatre.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[9px] px-1 py-0.2 rounded bg-white text-[#596B69] border border-[#DCE5E3]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {activeOrUpcoming ? (
                  <div className="bg-white border border-[#DCE5E3] rounded-lg p-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#172B2A] line-clamp-1">
                        {activeOrUpcoming.procedureName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          activeOrUpcoming.caseType === 'ELECTIVE'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {activeOrUpcoming.caseType}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#596B69]">
                      <span>Status:</span>
                      <span
                        className={`font-semibold ${
                          activeOrUpcoming.status === 'DEFERRED'
                            ? 'text-orange-600 line-through'
                            : activeOrUpcoming.status === 'IN_PROGRESS'
                            ? 'text-emerald-600 animate-pulse'
                            : 'text-[#172B2A]'
                        }`}
                      >
                        {activeOrUpcoming.status}
                      </span>
                    </div>

                    <div className="text-[10px] text-[#596B69] border-t border-[#F6F8F8] pt-1">
                      {activeOrUpcoming.clinicianInCharge}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/60 border border-dashed border-[#DCE5E3] rounded-lg p-3 text-center text-xs text-[#596B69]">
                    Room Ready & Available for Emergency Intake
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 1. Incoming Case Requests Banner (Placed Prominently Before Inventory) */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#176B68]" />
            <h2 className="text-base font-bold text-[#172B2A]">
              Incoming Emergency Case Requests ({pendingRequests.length} Pending)
            </h2>
          </div>
          <span className="text-[11px] text-[#596B69]">
            Main Requests lock equipment on accept; Standby tickets provide live visibility
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#596B69] space-y-1">
            <Radio className="w-6 h-6 text-[#889B99] mx-auto animate-pulse" />
            <p>No pending emergency cases. Hospital intake on standby.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  req.role === RequestRole.MAIN
                    ? 'bg-[#EAF5F2] border-[#176B68]'
                    : 'bg-[#F6F8F8] border-[#DCE5E3]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        req.role === RequestRole.MAIN
                          ? 'bg-[#174C49] text-white'
                          : 'bg-white text-[#596B69] border border-[#DCE5E3]'
                      }`}
                    >
                      {req.role === RequestRole.MAIN ? 'PRIMARY TARGET (A)' : 'STANDBY NOTICE (B/C)'}
                    </span>
                    <span className="text-xs font-mono font-bold text-[#172B2A]">
                      Case: {req.caseId}
                    </span>
                  </div>
                  <p className="text-xs text-[#596B69]">
                    Destination Gen: #{req.destinationGeneration} • Expires: {new Date(req.expiresAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {req.role === RequestRole.MAIN && (
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      className="px-4 py-2 bg-[#174C49] hover:bg-[#135552] text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      Accept & Reserve Equipment
                    </button>
                  )}
                  <button
                    onClick={() => handleDeclineRequest(req.id)}
                    className="px-3 py-2 bg-white hover:bg-[#FDF2F2] text-[#B42318] border border-[#DCE5E3] text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Decline / Divert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Live Hospital Resource Inventory Table */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#DCE5E3] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#176B68]" />
              Live Hospital Resource Inventory
            </h2>
            <p className="text-xs text-[#596B69] mt-0.5">
              Available count computed server-side via invariant formula:
            </p>
          </div>
          <div className="px-3 py-1 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl font-mono text-[11px] text-[#174C49] font-bold">
            Available = Total - OOS - Ext - Reserved - InUse
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F6F8F8] border-b border-[#DCE5E3] text-[#596B69] uppercase font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Resource Type</th>
                <th className="py-2.5 px-3 text-center">Total</th>
                <th className="py-2.5 px-3 text-center">Out of Service</th>
                <th className="py-2.5 px-3 text-center">External In-Use</th>
                <th className="py-2.5 px-3 text-center">Reserved</th>
                <th className="py-2.5 px-3 text-center">In Use</th>
                <th className="py-2.5 px-3 text-center font-bold text-[#174C49]">Available</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE5E3]">
              {resourcePools.map((pool) => (
                <tr key={pool.id} className="hover:bg-[#F6F8F8] transition-colors">
                  <td className="py-3 px-3 font-semibold text-[#172B2A]">{pool.resourceType}</td>
                  <td className="py-3 px-3 text-center font-mono text-[#596B69]">{pool.totalCount}</td>
                  <td className="py-3 px-3 text-center font-mono text-[#B42318]">{pool.outOfServiceCount}</td>
                  <td className="py-3 px-3 text-center font-mono text-[#8A5800]">{pool.externalOccupancy}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-[#176B68]">{pool.reservedCount}</td>
                  <td className="py-3 px-3 text-center font-mono text-[#596B69]">{pool.inUseCount}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-sm text-[#237048]">
                    {pool.availableCount} Available
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => openEditModal(pool)}
                      title="Edit capacity numbers"
                      className="px-2.5 py-1 bg-white border border-[#DCE5E3] hover:bg-[#EAF5F2] text-[#176B68] rounded-lg font-semibold text-xs transition"
                    >
                      Update
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Active Case Equipment Allocations Table (Arrival & Release) */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#176B68]" />
            <h2 className="text-base font-bold text-[#172B2A]">
              Active Case Equipment Allocations ({allocations.filter((a) => a.state !== AllocationState.RELEASED).length} Active)
            </h2>
          </div>
          <span className="text-[11px] text-[#596B69]">
            Arrival moves items to IN_USE; explicit hospital release restores capacity
          </span>
        </div>

        {allocations.filter((a) => a.state !== AllocationState.RELEASED).length === 0 ? (
          <div className="py-6 text-center text-xs text-[#596B69]">
            No equipment currently reserved or in-use by inbound emergency cases.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6F8F8] border-b border-[#DCE5E3] text-[#596B69] uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Case ID</th>
                  <th className="py-2.5 px-3">Resource</th>
                  <th className="py-2.5 px-3 text-center">Quantity</th>
                  <th className="py-2.5 px-3 text-center">Lifecycle State</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE5E3]">
                {allocations
                  .filter((a) => a.state !== AllocationState.RELEASED)
                  .map((alloc) => (
                    <tr key={alloc.id} className="hover:bg-[#F6F8F8]">
                      <td className="py-3 px-3 font-mono font-bold text-[#172B2A]">{alloc.caseId}</td>
                      <td className="py-3 px-3 font-semibold text-[#174C49]">{alloc.resourceType}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold">{alloc.quantity}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            alloc.state === AllocationState.RESERVED
                              ? 'bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]'
                              : 'bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB]'
                          }`}
                        >
                          {alloc.state}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        {alloc.state === AllocationState.RESERVED && (
                          <button
                            onClick={() => handleStartUse(alloc.id)}
                            className="px-2.5 py-1 bg-[#174C49] hover:bg-[#135552] text-white rounded-lg font-semibold text-xs transition"
                          >
                            Start In-Use
                          </button>
                        )}
                        <button
                          onClick={() => handleRelease(alloc.id)}
                          className="px-2.5 py-1 bg-white border border-[#DCE5E3] hover:bg-[#EAF5F2] text-[#237048] rounded-lg font-semibold text-xs transition"
                        >
                          Release Equipment
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Specialty Staff Readiness */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#176B68]" />
            <h2 className="text-base font-bold text-[#172B2A]">
              Specialist Surgical & Medical Teams Readiness
            </h2>
          </div>
          <span className="text-[11px] text-[#596B69]">
            Verified on-duty teams for trauma, neuro, and catheterization intake
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staffList.map((staff) => (
            <div
              key={staff.id}
              className="p-3.5 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-bold text-[#172B2A] block">{staff.specialty}</span>
                <span className="text-[11px] text-[#596B69]">
                  <strong className="text-[#174C49] font-mono">{staff.availableTeamSlots} Team(s) Ready</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleStaffSlotChange(staff, -1)}
                  disabled={staff.availableTeamSlots <= 0}
                  className="w-7 h-7 bg-white hover:bg-[#EAF5F2] text-[#172B2A] border border-[#DCE5E3] rounded-lg font-bold text-xs disabled:opacity-40"
                >
                  -
                </button>
                <button
                  onClick={() => handleStaffSlotChange(staff, 1)}
                  className="w-7 h-7 bg-white hover:bg-[#EAF5F2] text-[#172B2A] border border-[#DCE5E3] rounded-lg font-bold text-xs"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Resource Pool Modal */}
      {editingPool && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE5E3] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#172B2A]">
                  Edit {editingPool.resourceType} Capacity
                </h3>
                <p className="text-xs text-[#596B69]">Manage physical equipment counts and occupancy</p>
              </div>
              <button onClick={closeEditModal} className="text-[#596B69] hover:text-[#172B2A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-[#FDF2F2] border border-[#F8D7DA] text-[#B42318] rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSavePool} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#172B2A]">Total Inventory Count</label>
                <input
                  type="number"
                  min="0"
                  value={editTotal}
                  onChange={(e) => setEditTotal(parseInt(e.target.value, 10) || 0)}
                  className="w-full mt-1 bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-[#172B2A]">Out of Service (Maintenance / Repair)</label>
                <input
                  type="number"
                  min="0"
                  value={editOutOfService}
                  onChange={(e) => setEditOutOfService(parseInt(e.target.value, 10) || 0)}
                  className="w-full mt-1 bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-[#172B2A]">External Patients In-Use (Non-Emergency)</label>
                <input
                  type="number"
                  min="0"
                  value={editExternal}
                  onChange={(e) => setEditExternal(parseInt(e.target.value, 10) || 0)}
                  className="w-full mt-1 bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                  required
                />
              </div>

              <div className="p-3 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl space-y-1 text-[11px] text-[#596B69]">
                <div className="flex justify-between">
                  <span>Current Reserved:</span>
                  <span className="font-bold text-[#176B68] font-mono">{editingPool.reservedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current In-Use:</span>
                  <span className="font-bold text-[#172B2A] font-mono">{editingPool.inUseCount}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#DCE5E3] font-bold text-[#237048]">
                  <span>Projected Available:</span>
                  <span className="font-mono">
                    {Math.max(
                      0,
                      (Number(editTotal) || 0) -
                        (Number(editOutOfService) || 0) -
                        (Number(editExternal) || 0) -
                        (Number(editingPool.reservedCount) || 0) -
                        (Number(editingPool.inUseCount) || 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 py-2 rounded-xl bg-white border border-[#DCE5E3] text-[#596B69] font-semibold hover:bg-[#F6F8F8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 py-2 rounded-xl bg-[#174C49] hover:bg-[#135552] text-white font-semibold shadow-xs"
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
