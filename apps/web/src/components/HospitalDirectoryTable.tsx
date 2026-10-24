import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronRight,
  X,
  Clock,
  ShieldAlert,
  Activity,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MapPin,
  Calendar,
  Stethoscope,
  Scissors,
  FileText,
  BadgeAlert,
} from 'lucide-react';
import { HospitalDto, CAPABILITY_CATALOGUE, CapabilityCode } from '@goldenhour/contracts';
import { formatNil } from '../utils/nilFormatter';
import { apiClient } from '../lib/api-client';

interface HospitalDirectoryTableProps {
  onSelectHospital?: (hospitalId: string) => void;
  selectedHospitalId?: string;
}

export const HospitalDirectoryTable: React.FC<HospitalDirectoryTableProps> = ({
  onSelectHospital,
  selectedHospitalId,
}) => {
  const [hospitals, setHospitals] = useState<HospitalDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('ALL');
  const [capabilityFilter, setCapabilityFilter] = useState('ALL');
  const [receivingFilter, setReceivingFilter] = useState('ALL');
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(30);

  // Detail Drawer state
  const [drawerHospital, setDrawerHospital] = useState<HospitalDto | null>(null);
  const [drawerTab, setDrawerTab] = useState<'capabilities' | 'resources' | 'hours' | 'procedures' | 'provenance'>('capabilities');
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [drawerData, setDrawerData] = useState<{
    resources?: any[];
    staff?: any[];
    theatres?: any[];
    procedures?: any[];
    services?: any[];
  }>({});

  // Fetch tabular hospitals on mount and on filter changes
  useEffect(() => {
    let active = true;
    const fetchTabular = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getTabularHospitals({
          facilityType: facilityTypeFilter !== 'ALL' ? facilityTypeFilter : undefined,
          service: capabilityFilter !== 'ALL' ? capabilityFilter : undefined,
          maxDistanceKm: maxDistanceKm < 30 ? maxDistanceKm : undefined,
        });
        if (active) {
          setHospitals(res.hospitals || []);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to load tabular hospital directory');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchTabular();
    return () => {
      active = false;
    };
  }, [facilityTypeFilter, capabilityFilter, maxDistanceKm]);

  // Client-side text & receiving filtering
  const filteredHospitals = useMemo(() => {
    return hospitals.filter((h) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          h.name.toLowerCase().includes(q) ||
          h.code.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (receivingFilter !== 'ALL' && h.receivingStatus !== receivingFilter) {
        return false;
      }
      return true;
    });
  }, [hospitals, searchQuery, receivingFilter]);

  // Open detail drawer
  const openDrawer = async (hosp: HospitalDto) => {
    setDrawerHospital(hosp);
    setDrawerLoading(true);
    setDrawerTab('capabilities');
    try {
      const [resPools, resStaff, resTheatres, resProcs, resServices] = await Promise.allSettled([
        apiClient.getHospitalResources(hosp.id),
        apiClient.getHospitalStaff(hosp.id),
        apiClient.getHospitalTheatres(hosp.id),
        apiClient.getHospitalProcedures(hosp.id),
        apiClient.getHospitalServices(hosp.id),
      ]);

      setDrawerData({
        resources: resPools.status === 'fulfilled' ? resPools.value.resourcePools : [],
        staff: resStaff.status === 'fulfilled' ? resStaff.value.staffAvailability : [],
        theatres: resTheatres.status === 'fulfilled' ? resTheatres.value.theatres : [],
        procedures: resProcs.status === 'fulfilled' ? resProcs.value.procedures : [],
        services: resServices.status === 'fulfilled' ? resServices.value.services : [],
      });
    } catch {
      // drawer gracefully displays partial data
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerHospital(null);
    setDrawerData({});
  };

  // 9 Core Capability Codes
  const coreCapabilities: CapabilityCode[] = [
    'TRAUMA_L1',
    'NEUROSURGERY',
    'CARDIAC_CATH',
    'VENTILATORS',
    'ICU',
    'CT_SCAN',
    'STABILIZATION',
    'BASIC_OXYGEN',
    'EMERGENCY_DEPT',
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="p-5 border-b border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                Regional Hospital Directory & Capability Matrix
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                NITK 30 km Enclave ({filteredHospitals.length} facilities)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tabulated facilities with explicit NIL semantics, distance from NITK Surathkal (13.0108, 74.7936), and verified capabilities.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Dataset Provenance:</span>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
              Synthetic Demo (23 Facilities)
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search facility name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Facility Type */}
          <div>
            <select
              value={facilityTypeFilter}
              onChange={(e) => setFacilityTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Facility Types</option>
              <option value="medical_college_hospital">Medical College Hospital</option>
              <option value="hospital">General Hospital</option>
              <option value="nursing_home">Nursing Home</option>
              <option value="campus_health_center">Campus Health Centre</option>
            </select>
          </div>

          {/* Capability Filter */}
          <div>
            <select
              value={capabilityFilter}
              onChange={(e) => setCapabilityFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Any Capability</option>
              <option value="TRAUMA_L1">Trauma Level 1</option>
              <option value="NEUROSURGERY">Neurosurgery</option>
              <option value="CARDIAC_CATH">Cardiac Cath Lab</option>
              <option value="VENTILATORS">Ventilators</option>
              <option value="ICU">Intensive Care Unit (ICU)</option>
              <option value="CT_SCAN">CT Scanner</option>
              <option value="STABILIZATION">Stabilization Bay</option>
              <option value="BASIC_OXYGEN">Oxygen Beds</option>
              <option value="EMERGENCY_DEPT">Emergency Dept (24x7)</option>
            </select>
          </div>

          {/* Receiving Status */}
          <div>
            <select
              value={receivingFilter}
              onChange={(e) => setReceivingFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Receiving Statuses</option>
              <option value="OPEN">Open (Receiving)</option>
              <option value="DELAYED">Delayed (Surge)</option>
              <option value="CLOSED">Closed (Bypass)</option>
            </select>
          </div>

          {/* Distance Slider */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 border border-slate-300 rounded-xl">
            <span className="text-xs text-slate-600 whitespace-nowrap">Dist: ≤{maxDistanceKm}km</span>
            <input
              type="range"
              min={3}
              max={30}
              step={1}
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Main Tabular Capability Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4 sticky left-0 bg-slate-50 z-10 w-72 shadow-xs">
                Facility & Location
              </th>
              <th className="py-3 px-3 text-center">Distance</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-2 text-center" title="Trauma Level 1">Trauma L1</th>
              <th className="py-3 px-2 text-center" title="Neurosurgery Service">Neuro</th>
              <th className="py-3 px-2 text-center" title="Cardiac Catheterization Lab">Cath Lab</th>
              <th className="py-3 px-2 text-center" title="Mechanical Ventilators">Vents</th>
              <th className="py-3 px-2 text-center" title="Intensive Care Unit">ICU</th>
              <th className="py-3 px-2 text-center" title="CT Scanner">CT Scan</th>
              <th className="py-3 px-2 text-center" title="Resuscitation / Stabilization Bay">Stab Bay</th>
              <th className="py-3 px-2 text-center" title="Oxygen-Supported Beds">O2 Beds</th>
              <th className="py-3 px-2 text-center" title="24x7 Emergency Department">ED (24x7)</th>
              <th className="py-3 px-4 text-center">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span>Loading 23 NITK regional facilities...</span>
                  </div>
                </td>
              </tr>
            ) : filteredHospitals.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-slate-500">
                  No facilities match your search and filter criteria within the 30 km enclave.
                </td>
              </tr>
            ) : (
              filteredHospitals.map((hosp) => {
                const isSelected = selectedHospitalId === hosp.id;
                const details = hosp.capabilitiesDetail || {};

                return (
                  <tr
                    key={hosp.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    {/* Sticky Name Column */}
                    <td className="py-3 px-4 sticky left-0 bg-white group-hover:bg-slate-50/80 z-10 shadow-xs border-r border-slate-100">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span className="truncate max-w-[220px]" title={hosp.name}>
                          {hosp.name}
                        </span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="capitalize">{hosp.facilityType?.replace(/_/g, ' ') || 'Hospital'}</span>
                        <span>•</span>
                        <span className="font-mono">{hosp.code}</span>
                      </div>
                    </td>

                    {/* Distance from NITK */}
                    <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-xs">
                      <span className="font-medium text-slate-800">
                        {hosp.distanceFromNitkKm ?? '—'}
                      </span>
                      <span className="text-slate-400 text-[10px] ml-0.5">km</span>
                    </td>

                    {/* Receiving Status */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          hosp.receivingStatus === 'OPEN'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : hosp.receivingStatus === 'RESTRICTED'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {hosp.receivingStatus}
                      </span>
                    </td>

                    {/* 9 Core Capabilities with precise NIL formatting */}
                    {coreCapabilities.map((cap) => {
                      const detail = details[cap];
                      // Use availableCount if countable, else supported boolean
                      const catInfo = CAPABILITY_CATALOGUE[cap];
                      const rawVal = catInfo.isCountable
                        ? (detail?.availableCount ?? (hosp.capabilities.includes(cap) ? null : false))
                        : (detail?.supported ?? (hosp.capabilities.includes(cap) ? true : false));

                      const formatted = formatNil(rawVal, catInfo.unit);

                      return (
                        <td key={cap} className="py-3 px-2 text-center whitespace-nowrap">
                          <span
                            className={formatted.badgeClass}
                            title={`${catInfo.label}: ${formatted.explanation}`}
                          >
                            {formatted.text}
                          </span>
                        </td>
                      );
                    })}

                    {/* Action / Inspect Button */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => openDrawer(hosp)}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over Detail Drawer (Stage 5.3) */}
      {drawerHospital && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in">
          <div className="w-full max-w-xl bg-white shadow-2xl h-full flex flex-col border-l border-slate-200 animate-slide-left">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {drawerHospital.code}
                  </span>
                  <span className="text-xs text-slate-500 capitalize">
                    {drawerHospital.facilityType?.replace(/_/g, ' ') || 'Medical Center'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {drawerHospital.name}
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {drawerHospital.address}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Coordinates: <span className="font-mono">[{drawerHospital.location.lat}, {drawerHospital.location.lng}]</span> • Distance from NITK: <span className="font-semibold">{drawerHospital.distanceFromNitkKm} km</span>
                </p>
              </div>

              <button
                onClick={closeDrawer}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
                title="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 px-5 gap-4 bg-white text-xs font-semibold overflow-x-auto">
              <button
                onClick={() => setDrawerTab('capabilities')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  drawerTab === 'capabilities'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Stethoscope className="w-4 h-4" />
                Capabilities
              </button>
              <button
                onClick={() => setDrawerTab('resources')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  drawerTab === 'resources'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                Resources & Staff
              </button>
              <button
                onClick={() => setDrawerTab('hours')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  drawerTab === 'hours'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                Service Hours
              </button>
              <button
                onClick={() => setDrawerTab('procedures')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  drawerTab === 'procedures'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Scissors className="w-4 h-4" />
                Surgical & OT
              </button>
              <button
                onClick={() => setDrawerTab('provenance')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  drawerTab === 'provenance'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                Provenance
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {drawerLoading ? (
                <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  <span>Loading facility telemetry...</span>
                </div>
              ) : (
                <>
                  {/* Tab 1: Capabilities */}
                  {drawerTab === 'capabilities' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">
                        Capabilities verified or marked NIL (not supplied) from synthetic regional dataset:
                      </p>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {coreCapabilities.map((capCode) => {
                          const cat = CAPABILITY_CATALOGUE[capCode];
                          const detail = drawerHospital.capabilitiesDetail?.[capCode];
                          const rawVal = cat.isCountable
                            ? (detail?.availableCount ?? (drawerHospital.capabilities.includes(capCode) ? null : false))
                            : (detail?.supported ?? (drawerHospital.capabilities.includes(capCode) ? true : false));
                          const formatted = formatNil(rawVal, cat.unit);

                          return (
                            <div key={capCode} className="p-3 flex items-center justify-between hover:bg-slate-50">
                              <div>
                                <div className="font-semibold text-slate-900 text-xs">
                                  {cat.label}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {cat.description}
                                </div>
                              </div>
                              <span className={formatted.badgeClass} title={formatted.explanation}>
                                {formatted.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Resources & Staff */}
                  {drawerTab === 'resources' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                          Physical Resource Pools
                        </h4>
                        {(drawerData.resources || []).length === 0 ? (
                          <div className="p-3 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                            No physical resource pools provisioned for this facility.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {drawerData.resources?.map((r) => (
                              <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <div className="text-xs font-semibold text-slate-900 uppercase">
                                  {r.resourceType.replace(/_/g, ' ')}
                                </div>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className="text-lg font-bold font-mono text-emerald-700">
                                    {r.availableCount}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    / {r.totalCount} total
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                  In use: {r.inUseCount} • Reserved: {r.reservedCount} • OOS: {r.outOfServiceCount}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                          Specialist Staff Coverage
                        </h4>
                        {(drawerData.staff || []).length === 0 ? (
                          <div className="p-3 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                            No active on-call staff records registered.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                            {drawerData.staff?.map((s) => (
                              <div key={s.id} className="p-2.5 flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-900">{s.specialty.replace(/_/g, ' ')}</span>
                                <span className="font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                  {s.availableTeamSlots} team(s) ready
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Service Hours */}
                  {drawerTab === 'hours' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                        <div className="font-semibold">Emergency Services Operating Policy:</div>
                        <div className="text-emerald-800 mt-0.5">
                          {drawerHospital.timingsSummary?.emergency || '24x7 emergency medical triage and acute care'}
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-slate-600">Outpatient Dept (OPD):</span>
                          <span className="font-semibold text-slate-900">
                            {drawerHospital.timingsSummary?.opd || 'Mon-Sat 09:00-17:00'}
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-slate-600">Elective Operating Theatre:</span>
                          <span className="font-semibold text-slate-900">
                            {drawerHospital.timingsSummary?.electiveOt || 'Mon-Sat 08:00-18:00'}
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-slate-600">Timezone:</span>
                          <span className="font-mono text-slate-900">Asia/Kolkata (IST)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 4: Surgical & Operating Theatres */}
                  {drawerTab === 'procedures' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <div className="text-[11px] text-slate-500">Operating Theatres</div>
                          <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                            {drawerHospital.surgicalSummary?.operatingTheatresAvailable ?? 0} /{' '}
                            {drawerHospital.surgicalSummary?.operatingTheatresTotal ?? (drawerData.theatres?.length || 0)}
                          </div>
                          <div className="text-[10px] text-slate-500">Available / Total</div>
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <div className="text-[11px] text-slate-500">Emergency Surgery Support</div>
                          <div className="text-sm font-bold text-emerald-700 mt-1">
                            {drawerHospital.surgicalSummary?.emergencySupported ? 'Supported (24x7)' : 'Limited / Transfer'}
                          </div>
                          <div className="text-[10px] text-slate-500">Level 1 Trauma OR</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                          Scheduled Surgical Procedures
                        </h4>
                        {(drawerData.procedures || []).length === 0 ? (
                          <div className="p-3 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                            No scheduled or elective procedures recorded today.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                            {drawerData.procedures?.map((proc) => (
                              <div key={proc.id} className="p-3 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-900">{proc.procedureName}</span>
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                      proc.caseType === 'ELECTIVE'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {proc.caseType}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Theatre: <span className="font-mono text-slate-700">{proc.theatreId}</span> • Turnover: {proc.turnoverMinutes}m
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Status: <span className="font-semibold text-slate-800">{proc.status}</span> • Deferral: {proc.deferralEligibility}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab 5: Data Provenance */}
                  {drawerTab === 'provenance' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                          Synthetic Data Governance Notice:
                        </div>
                        <p className="mt-1 text-amber-800">
                          Resource counts, available bed numbers, and operation timings are synthetic demo values generated for NITK healthcare simulation. They must not be used for live patient clinical decisions.
                        </p>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-slate-500">Data Status:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {drawerHospital.provenance?.datasetStatus || 'synthetic_demo'}
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-slate-500">Source Archive:</span>
                          <span className="font-mono text-slate-800">
                            database.zip:database/seed/nitk_facilities.synthetic.json
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-slate-500">Coordinate Source:</span>
                          <span className="text-slate-800">
                            {drawerHospital.provenance?.coordinateSource || 'public hospital directory reference'}
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-slate-500">Coordinate Confidence:</span>
                          <span className="font-semibold capitalize text-slate-800">
                            {drawerHospital.provenance?.coordinateConfidence || 'medium'}
                          </span>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-slate-500">Regional Enclave Radius:</span>
                          <span className="font-semibold text-slate-800">30,000 meters (30 km)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => {
                  if (onSelectHospital) onSelectHospital(drawerHospital.id);
                  closeDrawer();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
              >
                Set as Active Hospital
              </button>
              <button
                onClick={closeDrawer}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
