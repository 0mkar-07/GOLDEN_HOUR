import React, { useState, useEffect, useCallback } from 'react';
import {
  Ambulance,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ClipboardCheck,
  HeartPulse,
  Activity,
  Plus,
  Trash2,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  Tag,
  MapPin,
  Navigation,
} from 'lucide-react';
import {
  EmergencyCaseDto,
  AssessmentDto,
  Agent1Proposal,
  CaseStatus,
  RecommendationDto,
  RoadGraphDto,
  AmbulancePositionDto,
  HospitalDto,
  DestinationDto,
  DestinationReadiness,
} from '@goldenhour/contracts';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';
import { subscribeToRealtimeEvent } from '../lib/socket';
import { RoadNetworkMap } from '../components/RoadNetworkMap';
import { RecommendationPanel } from '../components/RecommendationPanel';

interface ScenarioPreset {
  name: string;
  patientLabel: string;
  presentingIssue: string;
  urgencyLevel: 'CRITICAL' | 'URGENT' | 'STABLE';
  vitals: {
    heartRate: number | null;
    systolicBp: number | null;
    diastolicBp: number | null;
    respiratoryRate: number | null;
    oxygenSaturation: number | null;
    gcs: number | null;
  };
  ambulanceSupportProvided: string[];
  notes: string;
}

const DEMO_SCENARIOS: ScenarioPreset[] = [
  {
    name: 'Scenario 1: Severe TBI & Polytrauma (High-Speed Collision)',
    patientLabel: 'John Doe, 34M — Unrestrained Driver',
    presentingIssue: 'Severe Polytrauma with Traumatic Brain Injury and Hemorrhagic Shock',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 128,
      systolicBp: 82,
      diastolicBp: 48,
      respiratoryRate: 26,
      oxygenSaturation: 89,
      gcs: 7,
    },
    ambulanceSupportProvided: ['HIGH_FLOW_O2', 'IV_ACCESS', 'CERVICAL_COLLAR', 'PELVIC_BINDER'],
    notes: 'Blunt trauma to skull, responsive only to noxious stimuli. GCS 7 requires urgent airway management.',
  },
  {
    name: 'Scenario 2: Acute STEMI / Cardiogenic Deterioration',
    patientLabel: 'Robert Miller, 58M — Crushing Chest Pain',
    presentingIssue: 'Acute ST-Elevation Myocardial Infarction (Anterior STEMI)',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 104,
      systolicBp: 138,
      diastolicBp: 88,
      respiratoryRate: 20,
      oxygenSaturation: 94,
      gcs: 15,
    },
    ambulanceSupportProvided: ['ASPIRIN_324MG', '12_LEAD_ECG', 'IV_ACCESS', 'OXYGEN_2L'],
    notes: '12-lead shows 4mm ST elevations in V1-V4. Immediate PCI catheterization required.',
  },
  {
    name: 'Scenario 3: Incomplete Assessment (Missing Critical Vitals)',
    patientLabel: 'Unknown Female, approx 25F — Roadside Extraction',
    presentingIssue: 'Altered Mental Status following roadside vehicular rollover',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 110,
      systolicBp: null, // Explicit unknown
      diastolicBp: null,
      respiratoryRate: 22,
      oxygenSaturation: null, // Explicit unknown
      gcs: null, // Explicit unknown
    },
    ambulanceSupportProvided: ['CERVICAL_COLLAR'],
    notes: 'Rapid extraction in progress. Vitals pending detailed assessment.',
  },
];

export const AmbulancePage: React.FC = () => {
  const { user } = useAuth();

  // Active Case State
  const [activeCase, setActiveCase] = useState<EmergencyCaseDto | null>(null);
  const [assessment, setAssessment] = useState<AssessmentDto | null>(null);
  const [agent1Proposal, setAgent1Proposal] = useState<Agent1Proposal | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationDto | null>(null);
  const [destination, setDestination] = useState<DestinationDto | null>(null);
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [diverting, setDiverting] = useState<boolean>(false);

  // Road Graph & Simulation State
  const [roadGraph, setRoadGraph] = useState<RoadGraphDto | null>(null);
  const [ambulancePosition, setAmbulancePosition] = useState<AmbulancePositionDto>({
    ambulanceId: 'amb-104',
    x: 120,
    y: 150,
    lat: 40.71,
    lng: -74.02,
    speed: 0,
    heading: 85,
    serverSequence: 1,
    observedAt: new Date().toISOString(),
  });
  const [trafficOverrides, setTrafficOverrides] = useState<Record<string, number>>({});
  const [hospitals, setHospitals] = useState<HospitalDto[]>([]);

  // Form State
  const [patientLabel, setPatientLabel] = useState<string>('John Doe, 34M — Unrestrained Driver');
  const [presentingIssue, setPresentingIssue] = useState<string>(
    'Severe Polytrauma with Traumatic Brain Injury and Hemorrhagic Shock'
  );
  const [urgencyLevel, setUrgencyLevel] = useState<'CRITICAL' | 'URGENT' | 'STABLE'>('CRITICAL');
  const [heartRate, setHeartRate] = useState<string>('128');
  const [systolicBp, setSystolicBp] = useState<string>('82');
  const [diastolicBp, setDiastolicBp] = useState<string>('48');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('26');
  const [oxygenSaturation, setOxygenSaturation] = useState<string>('89');
  const [gcs, setGcs] = useState<string>('7');
  const [supportItems, setSupportItems] = useState<string[]>([
    'HIGH_FLOW_O2',
    'IV_ACCESS',
    'CERVICAL_COLLAR',
  ]);
  const [clinicalNotes, setClinicalNotes] = useState<string>(
    'Blunt trauma to skull, responsive only to noxious stimuli. GCS 7 requires urgent airway management.'
  );

  // Review & Confirmation Tags
  const [confirmedFullCare, setConfirmedFullCare] = useState<string[]>([]);
  const [confirmedStabilization, setConfirmedStabilization] = useState<string[]>([]);
  const [newFullCareTag, setNewFullCareTag] = useState<string>('');
  const [newStabTag, setNewStabTag] = useState<string>('');

  // UI status
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing active case if present
  const loadActiveCase = useCallback(async () => {
    try {
      const res = await apiClient.listCases();
      if (res?.cases && res.cases.length > 0) {
        const latest = res.cases[res.cases.length - 1];
        const detail = await apiClient.getCase(latest.id);
        setActiveCase(detail.case);
        if (detail.latestAssessment) {
          setAssessment(detail.latestAssessment);
          setConfirmedFullCare(
            detail.latestAssessment.clinicianConfirmed
              ? detail.latestAssessment.confirmedFullCareNeeds
              : detail.latestAssessment.proposedFullCareNeeds
          );
          setConfirmedStabilization(
            detail.latestAssessment.clinicianConfirmed
              ? detail.latestAssessment.confirmedStabilizationNeeds
              : detail.latestAssessment.proposedStabilizationNeeds
          );

          if (detail.latestAssessment.clinicianConfirmed) {
            // Load existing recommendation
            try {
              const recRes = await apiClient.getRecommendations(latest.id);
              if (recRes.recommendation) {
                setRecommendation(recRes.recommendation);
              }
            } catch {
              // Standby
            }

            // Load existing destination
            try {
              const destRes = await apiClient.getCaseDestination(latest.id);
              if (destRes?.destination) {
                setDestination(destRes.destination);
              }
            } catch {
              // Standby
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load active case:', err);
    }
  }, []);

  // Load Road Graph & Hospitals
  const loadMapAndHospitals = useCallback(async () => {
    try {
      const [graphRes, hospRes] = await Promise.all([
        apiClient.getRoadGraph(),
        apiClient.listHospitals(),
      ]);
      setRoadGraph(graphRes.graph);
      setTrafficOverrides(graphRes.trafficOverrides || {});
      setAmbulancePosition(graphRes.ambulancePosition);
      setHospitals(hospRes.hospitals);
    } catch (err: any) {
      console.error('Failed to load graph/hospitals:', err);
    }
  }, []);

  useEffect(() => {
    loadActiveCase();
    loadMapAndHospitals();
  }, [loadActiveCase, loadMapAndHospitals]);

  // Real-Time Event Subscriptions for Case & Destination updates
  useEffect(() => {
    const unsubDest = subscribeToRealtimeEvent('destination.updated', (event) => {
      const dest = event.payload as DestinationDto;
      if (dest.caseId === activeCase?.id) {
        setDestination(dest);
      }
    });

    const unsubCase = subscribeToRealtimeEvent('case.updated', (event) => {
      const c = event.payload as EmergencyCaseDto;
      if (c.id === activeCase?.id) {
        setActiveCase(c);
      }
    });

    return () => {
      unsubDest();
      unsubCase();
    };
  }, [activeCase?.id]);

  // Generate / Refresh Recommendations
  const handleGenerateRecommendations = async () => {
    if (!activeCase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.generateRecommendations(activeCase.id);
      setRecommendation(res.recommendation);
      setSuccessMsg('Agent 2 & 3: Recommendations generated with Primary A and Backups B/C.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  // Dispatch Case to Hospital A
  const handleDispatchCase = async () => {
    if (!activeCase || !recommendation) return;
    try {
      setDispatching(true);
      setError(null);
      const res = await apiClient.dispatchCase(activeCase.id);
      setActiveCase(res.case);
      setDestination(res.destination);
      setSuccessMsg(
        'Ambulance dispatched! MAIN reservation request sent to Hospital A; STANDBY notices sent to B & C.'
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch case');
    } finally {
      setDispatching(false);
    }
  };

  // Phase 8: Clinician Diversion to Proximity Backup
  const handleDivert = async (targetHospitalId: string) => {
    if (!activeCase || !destination) return;
    try {
      setDiverting(true);
      setError(null);
      const res = await apiClient.divertCase(activeCase.id, {
        targetHospitalId,
        expectedDestinationVersion: activeCase.destinationVersion,
        reason: 'Clinician emergency diversion to stabilization facility',
      });
      setActiveCase(res.case);
      setDestination(res.destination);
      setSuccessMsg(`Route diverted to ${targetHospitalId}! Unused reservations at previous hospital released.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.message || 'Failed to divert route');
    } finally {
      setDiverting(false);
    }
  };

  // Phase 8: Record Arrival at Hospital Bay
  const handleArrive = async () => {
    if (!activeCase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.arriveCase(activeCase.id);
      setActiveCase(res.case);
      setSuccessMsg('Ambulance marked ARRIVED at receiving facility bay. Resources remain reserved.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to record arrival');
    } finally {
      setLoading(false);
    }
  };

  // Phase 8: Clinical Handover to Receiving ED
  const handleHandover = async () => {
    if (!activeCase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.handoverCase(activeCase.id);
      setActiveCase(res.case);
      setSuccessMsg('Clinical handover complete! Patient care transferred to ED team.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to record handover');
    } finally {
      setLoading(false);
    }
  };

  // Apply Demo Preset
  const handleApplyPreset = (preset: ScenarioPreset) => {
    setPatientLabel(preset.patientLabel);
    setPresentingIssue(preset.presentingIssue);
    setUrgencyLevel(preset.urgencyLevel);
    setHeartRate(preset.vitals.heartRate !== null ? String(preset.vitals.heartRate) : '');
    setSystolicBp(preset.vitals.systolicBp !== null ? String(preset.vitals.systolicBp) : '');
    setDiastolicBp(preset.vitals.diastolicBp !== null ? String(preset.vitals.diastolicBp) : '');
    setRespiratoryRate(preset.vitals.respiratoryRate !== null ? String(preset.vitals.respiratoryRate) : '');
    setOxygenSaturation(preset.vitals.oxygenSaturation !== null ? String(preset.vitals.oxygenSaturation) : '');
    setGcs(preset.vitals.gcs !== null ? String(preset.vitals.gcs) : '');
    setSupportItems(preset.ambulanceSupportProvided);
    setClinicalNotes(preset.notes);
    setSuccessMsg(`Loaded ${preset.name}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // 1. Create or Reset Case
  const handleCreateCase = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.createCase({
        patientLabel,
        assignedAmbulanceId: user?.ambulanceId || 'amb-104',
      });
      setActiveCase(res.case);
      setAssessment(null);
      setAgent1Proposal(null);
      setConfirmedFullCare([]);
      setConfirmedStabilization([]);
      setSuccessMsg(`Created new emergency transport case #${res.case.id}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Telemetry to Agent 1
  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Auto-create case if not present
    let caseId = activeCase?.id;
    if (!caseId) {
      try {
        setLoading(true);
        const newCaseRes = await apiClient.createCase({
          patientLabel,
          assignedAmbulanceId: user?.ambulanceId || 'amb-104',
        });
        setActiveCase(newCaseRes.case);
        caseId = newCaseRes.case.id;
      } catch (err: any) {
        setError(err?.message || 'Failed to initialize case');
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const res = await apiClient.submitAssessment(caseId, {
        observations: {
          presentingIssue,
          urgencyLevel,
          vitals: {
            heartRate: heartRate !== '' ? parseInt(heartRate, 10) : null,
            systolicBp: systolicBp !== '' ? parseInt(systolicBp, 10) : null,
            diastolicBp: diastolicBp !== '' ? parseInt(diastolicBp, 10) : null,
            respiratoryRate: respiratoryRate !== '' ? parseInt(respiratoryRate, 10) : null,
            oxygenSaturation: oxygenSaturation !== '' ? parseInt(oxygenSaturation, 10) : null,
            gcs: gcs !== '' ? parseInt(gcs, 10) : null,
          },
          ambulanceSupportProvided: supportItems,
          notes: clinicalNotes,
        },
      });

      setAssessment(res.assessment);
      setAgent1Proposal(res.agent1Proposal);
      setConfirmedFullCare(res.agent1Proposal.proposedFullCareNeeds);
      setConfirmedStabilization(res.agent1Proposal.proposedStabilizationNeeds);
      setSuccessMsg('Agent 1 interpreted requirements successfully. Ready for clinician confirmation.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit assessment to Agent 1');
    } finally {
      setLoading(false);
    }
  };

  // 3. Confirm Clinical Requirements
  const handleConfirmRequirements = async () => {
    if (!activeCase || !assessment) return;

    if (confirmedFullCare.length === 0 || confirmedStabilization.length === 0) {
      setError('Please specify at least one full-care and one stabilization requirement.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.confirmRequirements(activeCase.id, {
        assessmentVersion: assessment.version,
        confirmedFullCareNeeds: confirmedFullCare,
        confirmedStabilizationNeeds: confirmedStabilization,
      });

      setAssessment(res.assessment);
      setActiveCase((prev) => (prev ? { ...prev, caseStatus: CaseStatus.ASSESSED } : null));
      setSuccessMsg('Clinical requirements confirmed! Generating A/B/C destination recommendations...');
      setTimeout(() => setSuccessMsg(null), 4000);

      // Auto-trigger Agent 2 & Agent 3 matching
      try {
        const recRes = await apiClient.generateRecommendations(activeCase.id);
        setRecommendation(recRes.recommendation);
      } catch (recErr: any) {
        console.warn('Recommendation auto-generation deferred:', recErr?.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm requirements');
    } finally {
      setLoading(false);
    }
  };

  // Tag helper functions
  const addFullCareTag = () => {
    if (newFullCareTag.trim() && !confirmedFullCare.includes(newFullCareTag.trim())) {
      setConfirmedFullCare([...confirmedFullCare, newFullCareTag.trim().toUpperCase()]);
      setNewFullCareTag('');
    }
  };

  const removeFullCareTag = (tag: string) => {
    setConfirmedFullCare(confirmedFullCare.filter((t) => t !== tag));
  };

  const addStabilizationTag = () => {
    if (newStabTag.trim() && !confirmedStabilization.includes(newStabTag.trim())) {
      setConfirmedStabilization([...confirmedStabilization, newStabTag.trim().toUpperCase()]);
      setNewStabTag('');
    }
  };

  const removeStabilizationTag = (tag: string) => {
    setConfirmedStabilization(confirmedStabilization.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Scenario Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              <Ambulance className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Ambulance Mobile Terminal</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold font-mono">
                  {user?.ambulanceId || 'Unit 104'} • En Route
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Patient telemetry capture, Agent 1 requirements interpretation, and clinician confirmation.
              </p>
            </div>
          </div>

          {/* Quick Scenario Preset Loader */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-medium">Scenario Preset:</span>
              <select
                aria-label="Preset Scenario"
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx)) handleApplyPreset(DEMO_SCENARIOS[idx]);
                }}
                defaultValue="0"
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                {DEMO_SCENARIOS.map((sc, i) => (
                  <option key={i} value={i} className="bg-slate-900 text-slate-100">
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCreateCase}
              disabled={loading}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-red-600/20 transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Case
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Case Metadata Strip */}
        {activeCase && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs gap-4">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">
                Case ID: <strong className="text-slate-200 font-mono">{activeCase.id}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">
                Patient: <strong className="text-slate-200">{activeCase.patientLabel}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">
                Status:{' '}
                <strong
                  className={`uppercase ${
                    activeCase.caseStatus === CaseStatus.ASSESSED
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {activeCase.caseStatus}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-slate-400">Assessment Version:</span>
              <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                v{activeCase.assessmentVersion}
              </span>

              {/* Transit Journey Actions (Phase 8) */}
              {activeCase.caseStatus === CaseStatus.EN_ROUTE && (
                <button
                  onClick={handleArrive}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition shadow-md shadow-blue-600/20"
                >
                  Mark Arrived at ED Bay
                </button>
              )}

              {activeCase.caseStatus === CaseStatus.ARRIVED && (
                <button
                  onClick={handleHandover}
                  disabled={loading}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs transition shadow-md shadow-emerald-600/20"
                >
                  Complete Clinical Handover
                </button>
              )}

              {activeCase.caseStatus === CaseStatus.HANDED_OVER && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                  ✓ Handover Complete
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Telemetry Form & Agent 1 Reasoning */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Patient Telemetry Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-red-400" />
              Patient Telemetry & Presenting Symptoms
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              In-Transit Data
            </span>
          </div>

          <form onSubmit={handleSubmitAssessment} className="space-y-4">
            {/* Patient Label & Urgency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Patient Identifier / Label</label>
                <input
                  type="text"
                  value={patientLabel}
                  onChange={(e) => setPatientLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Urgency Level</label>
                <select
                  aria-label="Urgency Level"
                  value={urgencyLevel}
                  onChange={(e) => setUrgencyLevel(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="URGENT">URGENT</option>
                  <option value="STABLE">STABLE</option>
                </select>
              </div>
            </div>

            {/* Presenting Issue */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Presenting Clinical Issue</label>
              <input
                type="text"
                value={presentingIssue}
                onChange={(e) => setPresentingIssue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                required
              />
            </div>

            {/* Vital Signs Grid */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                  Vital Signs (Leave blank for Explicit Unknown)
                </label>
                <span className="text-[11px] text-amber-400">Agent 1 flags missing inputs</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                  <span className="text-[11px] text-slate-400">Heart Rate (bpm)</span>
                  <input
                    type="number"
                    placeholder="e.g. 128"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                  <span className="text-[11px] text-slate-400">Blood Pressure (mmHg)</span>
                  <div className="flex items-center gap-1 font-mono text-sm font-bold text-white">
                    <input
                      type="number"
                      placeholder="82"
                      value={systolicBp}
                      onChange={(e) => setSystolicBp(e.target.value)}
                      className="w-12 bg-transparent focus:outline-none"
                    />
                    <span className="text-slate-500">/</span>
                    <input
                      type="number"
                      placeholder="48"
                      value={diastolicBp}
                      onChange={(e) => setDiastolicBp(e.target.value)}
                      className="w-12 bg-transparent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                  <span className="text-[11px] text-slate-400">Oxygen Sat (SpO2 %)</span>
                  <input
                    type="number"
                    placeholder="e.g. 89"
                    value={oxygenSaturation}
                    onChange={(e) => setOxygenSaturation(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                  <span className="text-[11px] text-slate-400">Glasgow Coma Scale</span>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    placeholder="3 - 15"
                    value={gcs}
                    onChange={(e) => setGcs(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                  <span className="text-[11px] text-slate-400">Resp Rate (/min)</span>
                  <input
                    type="number"
                    placeholder="e.g. 26"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 flex flex-col justify-center text-center">
                  <span className="text-[10px] text-slate-500">Explicit Unknowns:</span>
                  <span className="text-xs font-semibold text-amber-400">
                    {[heartRate, systolicBp, oxygenSaturation, gcs, respiratoryRate].filter((v) => v === '').length} Omitted
                  </span>
                </div>
              </div>
            </div>

            {/* Support provided */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Ambulance Interventions Active</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {['HIGH_FLOW_O2', 'IV_ACCESS', 'CERVICAL_COLLAR', 'BAG_VALVE_MASK', 'PELVIC_BINDER'].map(
                  (item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() =>
                        setSupportItems((prev) =>
                          prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                        supportItems.includes(item)
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Clinical Narrative</label>
              <textarea
                rows={2}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-red-600/20 transition flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {loading ? 'Processing...' : 'Run Agent 1 Requirements Synthesis'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Agent 1 Proposal & Clinician Confirmation */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-amber-400" />
                    Agent 1 — Requirements Synthesis
                  </h2>
                  {agent1Proposal?.interpreterType === 'GEMINI_LLM' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      Gemini 3.5 AI Model
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      Clinical Rules Engine
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Proposed full-care & stabilization criteria awaiting clinician confirmation.
                </p>
              </div>

              {assessment?.clinicianConfirmed ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Pending Review
                </span>
              )}
            </div>

            {/* Missing Inputs Alert Banner (Explicit unknown handling) */}
            {agent1Proposal && agent1Proposal.missingInputs.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5 text-xs text-amber-300">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Explicit Missing Telemetry Detected (Not Assumed Normal):
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-200">
                  {agent1Proposal.missingInputs.map((missing, i) => (
                    <li key={i}>{missing}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Agent 1 Clinical Reasoning */}
            {agent1Proposal ? (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
                <span className="text-xs font-semibold text-slate-300">Agent 1 Clinical Rationale:</span>
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-400">
                  {agent1Proposal.reasons.map((r, i) => (
                    <li key={i} className="leading-relaxed">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-6 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">
                  Submit telemetry on the left or load a scenario preset to run Agent 1 requirements interpretation.
                </p>
              </div>
            )}

            {/* Review & Edit Requirements Form */}
            {assessment && (
              <div className="space-y-4 pt-2">
                {/* Full-Care Tags */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-400" />
                      Full-Care Requirements (Hospital A Target)
                    </span>
                    <span className="text-slate-500 text-[11px]">Primary destination requirement</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-950 rounded-xl border border-slate-850">
                    {confirmedFullCare.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-semibold"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeFullCareTag(tag)}
                          className="hover:text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add custom full-care requirement..."
                      value={newFullCareTag}
                      onChange={(e) => setNewFullCareTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFullCareTag())}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addFullCareTag}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Stabilization Tags */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      Immediate Stabilization Requirements (Backups B / C)
                    </span>
                    <span className="text-slate-500 text-[11px]">Dynamic proximity backups</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-950 rounded-xl border border-slate-850">
                    {confirmedStabilization.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeStabilizationTag(tag)}
                          className="hover:text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add custom stabilization requirement..."
                      value={newStabTag}
                      onChange={(e) => setNewStabTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStabilizationTag())}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addStabilizationTag}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Clinician Confirmation Button */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <button
                    onClick={handleConfirmRequirements}
                    disabled={loading || confirmedFullCare.length === 0}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {assessment.clinicianConfirmed
                      ? 'Re-Confirm Modified Requirements'
                      : 'Clinician Confirm Requirements (Lock Assessment v' + assessment.version + ')'}
                  </button>

                  {assessment.clinicianConfirmed && (
                    <div className="text-center text-[11px] text-emerald-400 font-medium">
                      ✓ Confirmed by {assessment.confirmedBy || 'Medical Lead'} at{' '}
                      {new Date(assessment.confirmedAt || '').toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Destination Recommendations Section (Phase 5, 6, & 8) */}
      <RecommendationPanel
        recommendation={recommendation}
        loading={loading}
        onRefresh={handleGenerateRecommendations}
        destination={destination}
        onDispatch={handleDispatchCase}
        dispatching={dispatching}
        onDivert={handleDivert}
        diverting={diverting}
      />

      {/* Live Road Network Transit Map */}
      {roadGraph && (
        <RoadNetworkMap
          graph={roadGraph}
          ambulancePosition={ambulancePosition}
          recommendation={recommendation}
          hospitals={hospitals}
          trafficOverrides={trafficOverrides}
        />
      )}
    </div>
  );
};
