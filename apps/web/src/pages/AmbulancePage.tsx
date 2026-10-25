import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Send,
  ArrowRightLeft,
  Radio,
} from 'lucide-react';
import {
  EmergencyCaseDto,
  AssessmentDto,
  Agent1Proposal,
  CaseStatus,
  RecommendationDto,
  DestinationDto,
  HospitalDto,
  AmbulancePositionDto,
  RoadGraphDto,
  SharedRouteDto,
  CareObjective,
  EmergencyPriorityTicketDto,
} from '@goldenhour/contracts';
import { apiClient } from '../lib/api-client';
import { DeteriorationDiversionDialog } from '../components/DeteriorationDiversionDialog';
import { useAuth } from '../context/AuthContext';
import { useHospitalDirectory } from '../hooks/useHospitalDirectory';
import { subscribeToRealtimeEvent } from '../lib/socket';
import { MapPanel } from '../components/MapPanel';
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
    name: 'Case 1: Stable patient needing specialist service',
    patientLabel: 'Case 1 - Motor vehicle accident, intracranial hemorrhage (Stable)',
    presentingIssue: 'Motor vehicle accident with focal neurological deficit and suspected intracranial hemorrhage.',
    urgencyLevel: 'STABLE',
    vitals: {
      heartRate: 78,
      systolicBp: 124,
      diastolicBp: 78,
      respiratoryRate: 16,
      oxygenSaturation: 98,
      gcs: 14,
    },
    ambulanceSupportProvided: ['C-collar applied', 'IV line established'],
    notes: 'Compare current hospital capabilities and routes. No destination is predetermined.',
  },
  {
    name: 'Case 2: Urgent general surgical case',
    patientLabel: 'Case 2 - Blunt abdominal trauma with peritoneal signs (Urgent)',
    presentingIssue: 'Blunt abdominal trauma with acute surgical abdomen and peritoneal signs; hemodynamically compensated.',
    urgencyLevel: 'URGENT',
    vitals: {
      heartRate: 98,
      systolicBp: 110,
      diastolicBp: 70,
      respiratoryRate: 20,
      oxygenSaturation: 96,
      gcs: 15,
    },
    ambulanceSupportProvided: ['Normal saline infusing', 'Oxygen via nasal cannula'],
    notes: 'Compare arrival time and current theatre readiness across the regional directory.',
  },
  {
    name: 'Case 3: Critical patient needing specialist service',
    patientLabel: 'Case 3 - Unresponsive pedestrian, severe TBI & pupil dilation (Critical)',
    presentingIssue: 'Pedestrian struck by heavy vehicle; unresponsive, unilateral dilated pupil, severe traumatic brain injury.',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 122,
      systolicBp: 90,
      diastolicBp: 56,
      respiratoryRate: 26,
      oxygenSaturation: 91,
      gcs: 6,
    },
    ambulanceSupportProvided: ['Endotracheal tube secured', 'C-spine immobilized', 'High-flow O2'],
    notes: 'Assess specialist requirements and transport suitability before choosing a destination.',
  },
  {
    name: 'Case 4: Deteriorating patient: stabilization assessment',
    patientLabel: 'Case 4 - Acute respiratory collapse & shock in transit (Deteriorating)',
    presentingIssue: 'Acute respiratory collapse and worsening refractory shock in transit.',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 136,
      systolicBp: 72,
      diastolicBp: 44,
      respiratoryRate: 34,
      oxygenSaturation: 82,
      gcs: 9,
    },
    ambulanceSupportProvided: ['High-flow O2 non-rebreather', 'Push-dose epinephrine'],
    notes: 'Review immediate stabilization needs and transport suitability.',
  },
  {
    name: 'Case 5: Immediate resuscitation requirements',
    patientLabel: 'Case 5 - Penetrating thoracic trauma with active hemorrhage (Critical)',
    presentingIssue: 'Severe penetrating trauma with active thoracic hemorrhage requiring immediate surgical chest tube / bay.',
    urgencyLevel: 'CRITICAL',
    vitals: {
      heartRate: 128,
      systolicBp: 84,
      diastolicBp: 52,
      respiratoryRate: 28,
      oxygenSaturation: 89,
      gcs: 13,
    },
    ambulanceSupportProvided: ['Occlusive dressing', 'Large-bore IV'],
    notes: 'Exclude facilities that cannot provide the confirmed immediate intervention.',
  },
  {
    name: 'Case 6: Urgent surgery: compare current theatre readiness',
    patientLabel: 'Case 6 - Acute surgical abdomen (compare theatre readiness)',
    presentingIssue: 'Acute surgical abdomen requiring emergency operating room access.',
    urgencyLevel: 'URGENT',
    vitals: {
      heartRate: 94,
      systolicBp: 114,
      diastolicBp: 74,
      respiratoryRate: 18,
      oxygenSaturation: 97,
      gcs: 15,
    },
    ambulanceSupportProvided: ['Analgesia administered', 'IV maintenance'],
    notes: 'Use current theatre availability; this preset does not mark a hospital theatre busy.',
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
  const [caseRoutes, setCaseRoutes] = useState<Record<string, SharedRouteDto>>({});
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [diverting, setDiverting] = useState<boolean>(false);
  const [showDeteriorationModal, setShowDeteriorationModal] = useState<boolean>(false);
  const [priorityTicket, setPriorityTicket] = useState<EmergencyPriorityTicketDto | null>(null);

  // Road Graph & Telemetry State
  const [roadGraph, setRoadGraph] = useState<RoadGraphDto | null>(null);
  const [ambulancePosition, setAmbulancePosition] = useState<AmbulancePositionDto>({
    ambulanceId: 'amb-104',
    x: 120,
    y: 150,
    lat: 13.0110,
    lng: 74.7943,
    speed: 0,
    heading: 85,
    source: 'SIMULATED',
    sourceGeneration: 1,
    serverSequence: 1,
    observedAt: new Date().toISOString(),
  });
  const [trafficOverrides, setTrafficOverrides] = useState<Record<string, number>>({});
  const { hospitals, loading: hospitalsLoading, error: hospitalsError, reload: reloadHospitals } = useHospitalDirectory();
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // Browser GPS Streaming State
  const [isSharingGps, setIsSharingGps] = useState<boolean>(false);
  const gpsWatchIdRef = useRef<number | null>(null);

  // Form State
  const [patientLabel, setPatientLabel] = useState<string>('John Doe, 34M — High-Speed Collision');
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

  const routeRequest = useRef(0);
  const patientReset = useRef(false);

  // Load Geographic Routes
  const loadRoutes = useCallback(async (caseId: string) => {
    try {
      const request = routeRequest.current;
      const res = await apiClient.getCaseRoutes(caseId);
      if (request === routeRequest.current && res?.routes) {
        setCaseRoutes(res.routes);
      }
    } catch (err) {
      console.warn('Failed to load geographic routes:', err);
    }
  }, []);

  // Load existing active case if present
  const loadActiveCase = useCallback(async () => {
    try {
      const res = await apiClient.listCases();
      if (res?.cases && res.cases.length > 0) {
        const latest = res.cases[res.cases.length - 1];
        const detail = await apiClient.getCase(latest.id);
        if (patientReset.current) return;
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
            try {
              const recRes = await apiClient.getRecommendations(latest.id);
              if (recRes.recommendation) {
                setRecommendation(recRes.recommendation);
                loadRoutes(latest.id);
              }
            } catch {
              // Standby
            }

            try {
              const destRes = await apiClient.getCaseDestination(latest.id);
              if (destRes?.destination) {
                setDestination(destRes.destination);
              }
            } catch {
              // Standby
            }

            try {
              const ticketRes = await apiClient.getCasePriorityReview(latest.id);
              setPriorityTicket(ticketRes?.ticket || null);
            } catch {
              setPriorityTicket(null);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load active case:', err);
    }
  }, [loadRoutes]);

  // Load Road Graph independently from hospital directory
  const loadRoadGraph = useCallback(async () => {
    try {
      const graphRes = await apiClient.getRoadGraph();
      setRoadGraph(graphRes.graph);
      setTrafficOverrides(graphRes.trafficOverrides || {});
      setAmbulancePosition(graphRes.ambulancePosition);

      // Load preview routes immediately so live map renders routes before case submission
      try {
        const previewRes = await apiClient.getPreviewRoutes();
        if (previewRes?.routes) {
          setCaseRoutes((prev) => (Object.keys(prev).length === 0 ? previewRes.routes : prev));
        }
      } catch (e) {
        console.warn('Preview routes standby:', e);
      }
    } catch (err: any) {
      console.error('Failed to load road graph:', err);
    }
  }, []);

  useEffect(() => {
    loadActiveCase();
    loadRoadGraph();
  }, [loadActiveCase, loadRoadGraph]);

  // Real-Time Socket.IO Subscriptions
  useEffect(() => {
    const unsubPos = subscribeToRealtimeEvent('ambulance.position.updated', (event: any) => {
      setAmbulancePosition(event.payload || event);
    });

    const unsubDest = subscribeToRealtimeEvent('destination.updated', (event: any) => {
      if (activeCase && event.entityId === activeCase.id) {
        setDestination(event.payload || null);
        loadRoutes(activeCase.id);
      }
    });

    const unsubCase = subscribeToRealtimeEvent('case.updated', (event: any) => {
      if (activeCase && event.entityId === activeCase.id) {
        setActiveCase((prev) => (prev ? { ...prev, caseStatus: event.payload.status } : null));
      }
    });

    const unsubTicket = subscribeToRealtimeEvent('priority_ticket.updated', (event: any) => {
      if (activeCase && (event.payload?.caseId === activeCase.id || event.entityId === activeCase.id)) {
        setPriorityTicket(event.payload || null);
      }
    });

    return () => {
      unsubPos();
      unsubDest();
      unsubCase();
      unsubTicket();
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, [activeCase?.id, loadRoutes]);

  // Toggle Browser GPS Sharing
  const toggleShareGps = () => {
    if (isSharingGps) {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      setIsSharingGps(false);
      setSuccessMsg('Browser GPS streaming deactivated. Switched back to simulation telemetry.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      if (!navigator.geolocation) {
        setError('Browser Geolocation API is not supported on this device.');
        return;
      }

      setError(null);
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            const res = await apiClient.submitAmbulancePosition('amb-104', {
              lat: Number(pos.coords.latitude.toFixed(6)),
              lng: Number(pos.coords.longitude.toFixed(6)),
              speed: Math.round(pos.coords.speed || 0),
              heading: Math.round(pos.coords.heading || 0),
              accuracyMeters: Math.round(pos.coords.accuracy || 5),
            });
            if (res?.position) {
              setAmbulancePosition(res.position);
              if (activeCase) loadRoutes(activeCase.id);
            }
          } catch (err: any) {
            console.error('Failed to stream device GPS position:', err);
          }
        },
        (err) => {
          setError(`GPS Location Signal Error: ${err.message}`);
          setIsSharingGps(false);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );

      gpsWatchIdRef.current = watchId;
      setIsSharingGps(true);
      setSuccessMsg('Live Browser Device GPS activated! Transmitting real coordinates to regional dispatch.');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Generate Recommendations
  const handleGenerateRecommendations = async () => {
    if (!activeCase) return;
    const request = routeRequest.current;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.generateRecommendations(activeCase.id);
      if (request !== routeRequest.current) return;
      setRecommendation(res.recommendation);
      loadRoutes(activeCase.id);
      setSuccessMsg('Tri-Agent Recommendations generated with Primary A and Dynamic Backups B/C.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  // A committed pin invalidates the old ranking and its route geometry together.
  const handleOriginChanged = async (position: { lat: number; lng: number }) => {
    const request = ++routeRequest.current;
    setAmbulancePosition((previous) => ({ ...previous, ...position }));
    setCaseRoutes({});
    setRecommendation(null);
    setSelectedHospitalId(null);
    setLoading(true);
    setError(null);
    try {
      if (activeCase && assessment?.clinicianConfirmed) {
        const result = await apiClient.generateRecommendations(activeCase.id);
        if (request !== routeRequest.current) return;
        const routes = await apiClient.getCaseRoutes(activeCase.id);
        if (request !== routeRequest.current) return;
        setRecommendation(result.recommendation);
        setCaseRoutes(routes.routes || {});
      } else {
        const result = await apiClient.getPreviewRoutes();
        if (request !== routeRequest.current) return;
        setCaseRoutes(result.routes || {});
      }
    } catch (err: any) {
      if (request === routeRequest.current) setError(`Pin saved, but route refresh failed: ${err.message}. Recalculate to retry.`);
    } finally {
      if (request === routeRequest.current) setLoading(false);
    }
  };

  const handleResetPatient = () => {
    patientReset.current = true;
    ++routeRequest.current;
    setActiveCase(null);
    setAssessment(null);
    setAgent1Proposal(null);
    setRecommendation(null);
    setDestination(null);
    setPriorityTicket(null);
    setShowDeteriorationModal(false);
    setCaseRoutes({});
    setSelectedHospitalId(null);
    setConfirmedFullCare([]);
    setConfirmedStabilization([]);
    setNewFullCareTag('');
    setNewStabTag('');
    setPatientLabel('');
    setPresentingIssue('');
    setHeartRate('');
    setSystolicBp('');
    setDiastolicBp('');
    setRespiratoryRate('');
    setOxygenSaturation('');
    setGcs('');
    setUrgencyLevel('URGENT');
    setSupportItems([]);
    setClinicalNotes('');
    setError(null);
    setSuccessMsg('Patient form cleared. Submit a new assessment to start a new case. Existing case records are retained.');
  };

  // Dispatch Ambulance (Full-Care or Stabilization Priority)
  const handleDispatch = async (targetHospitalId?: string, careObjective: CareObjective = 'FULL_CARE') => {
    if (!activeCase) return;
    try {
      setDispatching(true);
      setError(null);
      const res = await apiClient.dispatchCase(activeCase.id, {
        targetHospitalId,
        careObjective,
        selectionReason:
          careObjective === 'STABILIZATION' ? 'NO_FULL_CARE_AVAILABLE' : 'INITIAL_FULL_CARE',
      });
      setActiveCase(res.case);
      setDestination(res.destination);
      loadRoutes(activeCase.id);
      const targetHosp = hospitals.find((h) => h.id === res.destination.hospitalId);
      const targetName = targetHosp?.name || 'selected facility';
      setSuccessMsg(
        careObjective === 'STABILIZATION'
          ? `Ambulance dispatched to ${targetName} for emergency stabilization! Alternative centers notified on standby.`
          : `Case dispatched to ${targetName}! Definitive full-care reservation requested; standby centers notified.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch case');
    } finally {
      setDispatching(false);
    }
  };

  // Clinician Diversion (Dynamic Backup Selection or Reported Deterioration)
  const handleDivert = async (hospitalId: string, customReason?: string, previewId?: string) => {
    if (!activeCase || !destination) return;
    try {
      setDiverting(true);
      setError(null);
      const res = await apiClient.divertCase(activeCase.id, {
        targetHospitalId: hospitalId,
        expectedDestinationVersion: destination.version,
        reason: customReason || 'Clinician in-transit diversion',
        previewId,
      });
      setActiveCase(res.case);
      setDestination(res.destination);
      loadRoutes(activeCase.id);
      const oldHosp = hospitals.find((h) => h.id === destination.hospitalId);
      const newHosp = hospitals.find((h) => h.id === hospitalId);
      const releaseInfo =
        res.releasedAllocations && res.releasedAllocations.length > 0
          ? ` Prior unused reservations at ${oldHosp?.name || 'previous hospital'} released atomically.`
          : '';
      setSuccessMsg(`Ambulance diverted to ${newHosp?.name || 'backup hospital'}!${releaseInfo}`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.message || 'Failed to divert case');
    } finally {
      setDiverting(false);
    }
  };

  // Request Emergency Priority Review (Stage 4)
  const handleRequestPriorityReview = async (hospitalId: string) => {
    if (!activeCase) {
      setError('Please submit and confirm clinical assessment before requesting emergency priority review.');
      return;
    }
    try {
      const res = await apiClient.createPriorityReview(activeCase.id, {
        caseId: activeCase.id,
        hospitalId,
        estimatedArrivalSeconds: 720,
        urgencyLevel,
        clinicalRationale: `Critical inbound emergency (${presentingIssue}). Immediate trauma resuscitation & OR suite requested.`,
      });
      setPriorityTicket(res.ticket);
      setSuccessMsg('Emergency priority review request dispatched to hospital surgical director.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit emergency priority review');
    }
  };

  // Mark Arrival
  const handleArrive = async () => {
    if (!activeCase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.arriveCase(activeCase.id);
      setActiveCase(res.case);
      setSuccessMsg('Ambulance marked arrived at ED Bay. Reserved resources remain locked during intake.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to record arrival');
    } finally {
      setLoading(false);
    }
  };

  // Complete Handover
  const handleHandover = async () => {
    if (!activeCase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.handoverCase(activeCase.id);
      setActiveCase(res.case);
      setSuccessMsg('Clinical handover complete. Case handed over; equipment remains in-use until hospital release.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete handover');
    } finally {
      setLoading(false);
    }
  };

  // Preset Applicator
  const handleApplyPreset = (sc: ScenarioPreset) => {
    ++routeRequest.current;
    setAssessment(null);
    setAgent1Proposal(null);
    setRecommendation(null);
    setConfirmedFullCare([]);
    setConfirmedStabilization([]);
    setCaseRoutes({});
    setSuccessMsg('Patient scenario loaded. Run Agent 1 and confirm the new assessment to calculate current NITK destinations.');
    setPatientLabel(sc.patientLabel);
    setPresentingIssue(sc.presentingIssue);
    setUrgencyLevel(sc.urgencyLevel);
    setHeartRate(sc.vitals.heartRate !== null ? String(sc.vitals.heartRate) : '');
    setSystolicBp(sc.vitals.systolicBp !== null ? String(sc.vitals.systolicBp) : '');
    setDiastolicBp(sc.vitals.diastolicBp !== null ? String(sc.vitals.diastolicBp) : '');
    setRespiratoryRate(sc.vitals.respiratoryRate !== null ? String(sc.vitals.respiratoryRate) : '');
    setOxygenSaturation(sc.vitals.oxygenSaturation !== null ? String(sc.vitals.oxygenSaturation) : '');
    setGcs(sc.vitals.gcs !== null ? String(sc.vitals.gcs) : '');
    setSupportItems(sc.ambulanceSupportProvided);
    setClinicalNotes(sc.notes);
  };

  // Case Creation
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
      setRecommendation(null);
      setDestination(null);
      setCaseRoutes({});
      setSuccessMsg(`Emergency Case ${res.case.id} created.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  // Submit Assessment for Agent 1 Review
  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase) {
      try {
        setLoading(true);
        const newCaseRes = await apiClient.createCase({
          patientLabel,
          assignedAmbulanceId: user?.ambulanceId || 'amb-104',
        });
        setActiveCase(newCaseRes.case);
        await runAssessmentForCase(newCaseRes.case.id);
      } catch (err: any) {
        setError(err?.message || 'Failed to initialize case');
        setLoading(false);
      }
    } else {
      await runAssessmentForCase(activeCase.id);
    }
  };

  const runAssessmentForCase = async (caseId: string) => {
    try {
      setLoading(true);
      setError(null);
      const observations = {
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
      };

      const res = await apiClient.submitAssessment(caseId, { observations });
      setAssessment(res.assessment);
      setAgent1Proposal(res.agent1Proposal);
      setConfirmedFullCare(res.agent1Proposal.proposedFullCareNeeds);
      setConfirmedStabilization(res.agent1Proposal.proposedStabilizationNeeds);
      setSuccessMsg('Agent 1 Assessment complete. Review requirements below.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit assessment');
    } finally {
      setLoading(false);
    }
  };

  // Clinician Confirms Requirements
  const handleConfirmRequirements = async () => {
    if (!activeCase || !assessment) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.confirmRequirements(activeCase.id, {
        assessmentVersion: assessment.version,
        confirmedFullCareNeeds: confirmedFullCare,
        confirmedStabilizationNeeds: confirmedStabilization,
        confirmedPathway: agent1Proposal?.proposedPathway ?? assessment.proposedPathway,
        confirmedTransportAssessment: agent1Proposal?.proposedTransportAssessment ?? assessment.proposedTransportAssessment,
        confirmedClinicalStability: agent1Proposal?.proposedClinicalStability ?? assessment.proposedClinicalStability,
        confirmedConditionTrend: agent1Proposal?.proposedConditionTrend ?? assessment.proposedConditionTrend,
        requiredIntervention: agent1Proposal?.requiredIntervention ?? assessment.requiredIntervention,
      });
      setAssessment(res.assessment);
      setSuccessMsg('Requirements confirmed by clinician! Running destination matching...');
      setTimeout(() => setSuccessMsg(null), 4000);

      // Trigger recommendation generation
      const recRes = await apiClient.generateRecommendations(activeCase.id);
      setRecommendation(recRes.recommendation);
      loadRoutes(activeCase.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm requirements');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Scenario Controls */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-[#176B68]">
              <Ambulance className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#172B2A] tracking-tight">Ambulance Mobile Terminal</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3] font-semibold">
                  {user?.ambulanceId || 'Medic 4'} • In Service
                </span>
              </div>
              <p className="text-xs text-[#596B69] mt-0.5">
                Clinical telemetry intake, Agent 1 requirements review, and real-time hospital dispatch
              </p>
            </div>
          </div>

          {/* Quick Scenario Preset Loader */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[#596B69] font-medium">Scenario Preset:</span>
              <select
                aria-label="Preset Scenario"
                disabled={loading || dispatching || diverting || activeCase?.caseStatus === CaseStatus.EN_ROUTE || activeCase?.caseStatus === CaseStatus.DISPATCHING}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx)) handleApplyPreset(DEMO_SCENARIOS[idx]);
                }}
                defaultValue="0"
                className="bg-transparent text-[#172B2A] font-semibold focus:outline-none cursor-pointer"
              >
                {DEMO_SCENARIOS.map((sc, i) => (
                  <option key={i} value={i} className="bg-white text-[#172B2A]">
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleResetPatient}
              disabled={loading || dispatching || diverting || activeCase?.caseStatus === CaseStatus.EN_ROUTE || activeCase?.caseStatus === CaseStatus.DISPATCHING}
              className="px-3 py-1.5 border border-[#DCE5E3] rounded-xl text-xs font-semibold disabled:opacity-50"
              title="Clear patient inputs for a new case; existing records are retained. Complete active transport first."
            >
              Reset patient data
            </button>
            <button
              onClick={handleCreateCase}
              disabled={loading}
              className="px-3 py-1.5 bg-[#174C49] hover:bg-[#135552] text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Case
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mt-3 p-3 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl text-xs text-[#237048] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#237048] shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-[#FDF2F2] border border-[#F8D7DA] rounded-xl text-xs text-[#B42318] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
          </div>
        )}

        {/* Active Case Context Bar */}
        {activeCase && (
          <div className="mt-4 pt-3.5 border-t border-[#DCE5E3] flex flex-wrap items-center justify-between text-xs gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[#596B69]">
                Case: <strong className="text-[#172B2A] font-mono">{activeCase.id}</strong>
              </span>
              <span className="text-[#DCE5E3]">|</span>
              <span className="text-[#596B69]">
                Patient: <strong className="text-[#172B2A]">{activeCase.patientLabel}</strong>
              </span>
              <span className="text-[#DCE5E3]">|</span>
              <span className="text-[#596B69]">
                Status:{' '}
                <strong
                  className={`uppercase ${
                    activeCase.caseStatus === CaseStatus.EN_ROUTE
                      ? 'text-[#176B68]'
                      : activeCase.caseStatus === CaseStatus.ARRIVED || activeCase.caseStatus === CaseStatus.HANDED_OVER
                      ? 'text-[#237048]'
                      : 'text-[#8A5800]'
                  }`}
                >
                  {activeCase.caseStatus}
                </strong>
              </span>
            </div>

            {/* In-Transit Journey Action Buttons */}
            <div className="flex items-center gap-2">
              <span className="text-[#596B69]">Assessment:</span>
              <span className="font-mono px-2 py-0.5 rounded bg-[#F6F8F8] text-[#172B2A] border border-[#DCE5E3] font-bold">
                v{activeCase.assessmentVersion}
              </span>

              {/* In-Transit Deterioration Diversion Entry Point */}
              {destination &&
                activeCase.caseStatus !== CaseStatus.ARRIVED &&
                activeCase.caseStatus !== CaseStatus.HANDED_OVER && (
                  <button
                    onClick={() => setShowDeteriorationModal(true)}
                    className="px-3 py-1 bg-[#FFF8E6] hover:bg-[#FDF0D0] text-[#8A5800] border border-[#F3E5AB] rounded-lg font-bold text-xs transition shadow-xs flex items-center gap-1.5"
                    title="Report acute clinical deterioration and evaluate nearest stabilization alternatives"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-[#8A5800]" />
                    Patient deteriorating — review diversion
                  </button>
                )}

              {activeCase.caseStatus === CaseStatus.EN_ROUTE && (
                <button
                  onClick={handleArrive}
                  disabled={loading}
                  className="px-3 py-1 bg-[#174C49] hover:bg-[#135552] text-white rounded-lg font-semibold text-xs transition shadow-xs"
                >
                  Mark Arrived at ED Bay
                </button>
              )}

              {activeCase.caseStatus === CaseStatus.ARRIVED && (
                <button
                  onClick={handleHandover}
                  disabled={loading}
                  className="px-3 py-1 bg-[#237048] hover:bg-[#1C5939] text-white rounded-lg font-semibold text-xs transition shadow-xs"
                >
                  Complete Bedside Handover
                </button>
              )}

              {activeCase.caseStatus === CaseStatus.HANDED_OVER && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3] text-[11px] font-bold">
                  ✓ Handover Complete
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Split: Left (38%) Telemetry Form & Review | Right (62%) Geographic Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols = ~40%): Telemetry Capture & Requirements Synthesis */}
        <div className="lg:col-span-5 space-y-6">
          {/* Telemetry Capture Card */}
          <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
              <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#176B68]" />
                Patient Telemetry & Presenting Symptoms
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#F6F8F8] text-[#596B69] border border-[#DCE5E3] font-mono">
                Field Intake
              </span>
            </div>

            <form onSubmit={handleSubmitAssessment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#172B2A]">Patient Identifier / Name</label>
                <input
                  type="text"
                  value={patientLabel}
                  onChange={(e) => setPatientLabel(e.target.value)}
                  className="w-full bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-xs text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#172B2A]">Presenting Clinical Complaint</label>
                <input
                  type="text"
                  value={presentingIssue}
                  onChange={(e) => setPresentingIssue(e.target.value)}
                  className="w-full bg-white border border-[#DCE5E3] rounded-xl px-3 py-2 text-xs text-[#172B2A] focus:outline-none focus:ring-1 focus:ring-[#176B68]"
                  required
                />
              </div>

              {/* Vitals Grid */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-[#172B2A] flex items-center gap-1.5">
                    <HeartPulse className="w-3.5 h-3.5 text-[#B42318]" />
                    Vital Signs (Blank = Explicit Unknown)
                  </label>
                  <span className="text-[11px] text-[#8A5800]">Flags missing telemetry</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">Heart Rate (bpm)</span>
                    <input
                      type="number"
                      placeholder="e.g. 128"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="w-full bg-transparent font-mono text-sm font-bold text-[#172B2A] focus:outline-none"
                    />
                  </div>

                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">Blood Pressure (mmHg)</span>
                    <div className="flex items-center gap-1 font-mono text-sm font-bold text-[#172B2A]">
                      <input
                        type="number"
                        placeholder="82"
                        value={systolicBp}
                        onChange={(e) => setSystolicBp(e.target.value)}
                        className="w-12 bg-transparent focus:outline-none"
                      />
                      <span className="text-[#596B69]">/</span>
                      <input
                        type="number"
                        placeholder="48"
                        value={diastolicBp}
                        onChange={(e) => setDiastolicBp(e.target.value)}
                        className="w-12 bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">SpO2 (%)</span>
                    <input
                      type="number"
                      placeholder="e.g. 89"
                      value={oxygenSaturation}
                      onChange={(e) => setOxygenSaturation(e.target.value)}
                      className="w-full bg-transparent font-mono text-sm font-bold text-[#172B2A] focus:outline-none"
                    />
                  </div>

                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">GCS (3-15)</span>
                    <input
                      type="number"
                      placeholder="e.g. 7"
                      value={gcs}
                      onChange={(e) => setGcs(e.target.value)}
                      className="w-full bg-transparent font-mono text-sm font-bold text-[#172B2A] focus:outline-none"
                    />
                  </div>

                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">Resp Rate (/min)</span>
                    <input
                      type="number"
                      placeholder="e.g. 26"
                      value={respiratoryRate}
                      onChange={(e) => setRespiratoryRate(e.target.value)}
                      className="w-full bg-transparent font-mono text-sm font-bold text-[#172B2A] focus:outline-none"
                    />
                  </div>

                  <div className="bg-[#F6F8F8] p-2.5 rounded-xl border border-[#DCE5E3] space-y-1">
                    <span className="text-[11px] text-[#596B69]">Urgency Level</span>
                    <select
                      value={urgencyLevel}
                      onChange={(e) => setUrgencyLevel(e.target.value as any)}
                      className="w-full bg-transparent font-bold text-xs text-[#172B2A] focus:outline-none cursor-pointer"
                    >
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="URGENT">URGENT</option>
                      <option value="STABLE">STABLE</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#174C49] hover:bg-[#135552] text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-emerald-300" />
                {loading ? 'Synthesizing...' : 'Run Agent 1 Requirements Synthesis'}
              </button>
            </form>
          </div>

          {/* Agent 1 Requirements Synthesis & Clinician Confirmation Card */}
          <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#DCE5E3] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-[#176B68]" />
                    Agent 1 — Requirements Synthesis
                  </h2>
                  {agent1Proposal?.interpreterType === 'GEMINI_LLM' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]">
                      <Sparkles className="w-3 h-3 text-[#176B68]" />
                      Gemini 3.5 LLM
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F6F8F8] text-[#596B69] border border-[#DCE5E3]">
                      Clinical Rules Engine
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#596B69] mt-0.5">
                  Full-care & immediate stabilization criteria awaiting clinician confirmation
                </p>
              </div>

              {assessment?.clinicianConfirmed ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3] text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB] text-xs font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Pending Review
                </span>
              )}
            </div>

            {/* Missing Inputs Alert Banner (Explicit unknown handling) */}
            {agent1Proposal && agent1Proposal.missingInputs.length > 0 && (
              <div className="p-3 bg-[#FFF8E6] border border-[#F3E5AB] rounded-xl space-y-1.5 text-xs text-[#8A5800]">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#8A5800]" />
                  Explicit Missing Telemetry Detected (Not Assumed Normal):
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {agent1Proposal.missingInputs.map((missing, i) => (
                    <li key={i}>{missing}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full-Care vs Stabilization Criteria Tags */}
            <div className="space-y-3">
              <div>
                <span className="text-xs font-semibold text-[#172B2A]">Full Definitive Care Requirements (Hospital A):</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {confirmedFullCare.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-lg bg-[#EAF5F2] border border-[#DCE5E3] text-xs font-semibold text-[#174C49] flex items-center gap-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#172B2A]">Immediate Stabilization Needs (Backups B/C):</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {confirmedStabilization.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-lg bg-[#F6F8F8] border border-[#DCE5E3] text-xs font-semibold text-[#596B69] flex items-center gap-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {assessment && <div className="text-xs space-y-1 border-t pt-3">
              <p>Proposed pathway: {agent1Proposal?.proposedPathway ?? assessment.proposedPathway ?? 'Review required'}</p>
              <p>Transport assessment: {agent1Proposal?.proposedTransportAssessment ?? assessment.proposedTransportAssessment ?? 'Unknown'}</p>
              <p>Required intervention: {agent1Proposal?.requiredIntervention ?? assessment.requiredIntervention ?? 'Unknown'}</p>
              <p>Confirming locks these proposed decisions alongside the capability requirements.</p>
            </div>}
            {/* Clinician Confirmation Button */}
            {assessment && !assessment.clinicianConfirmed && (
              <button
                onClick={handleConfirmRequirements}
                disabled={loading}
                className="w-full py-2.5 bg-[#237048] hover:bg-[#1C5939] text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Clinician Confirm Requirements (Lock Assessment v{assessment.version})
              </button>
            )}
          </div>
        </div>

        {/* Right Column (7 cols = ~60%): Live Geographic Map Panel */}
        <div className="lg:col-span-7 h-full min-h-[540px]">
          {hospitalsLoading && <p role="status">Loading current NITK hospitals...</p>}
          {hospitalsError && <p role="alert">{hospitalsError} <button onClick={reloadHospitals}>Retry hospital directory</button></p>}
          <p className="text-xs text-[#596B69] mb-2">NITK regional directory: {hospitals.length} facilities. A/B/C are current recommendation ranks, not fixed hospital identities. Operational availability is synthetic demo data.</p>
          <MapPanel
            hospitals={hospitals}
            selectedHospitalId={selectedHospitalId}
            onSelectHospital={setSelectedHospitalId}
            ambulancePosition={ambulancePosition}
            recommendation={recommendation}
            confirmedHospitalId={destination?.hospitalId}
            routes={caseRoutes}
            isSharingGps={isSharingGps}
            onToggleShareGps={toggleShareGps}
            onOriginChanged={handleOriginChanged}
          />
        </div>
      </div>

      {/* Tri-Agent Destination Recommendations (Primary A, Backups B & C) */}
      <RecommendationPanel
        recommendation={recommendation}
        loading={loading}
        onRefresh={handleGenerateRecommendations}
        destination={destination}
        onDispatch={handleDispatch}
        dispatching={dispatching}
        onDivert={handleDivert}
        diverting={diverting}
        priorityTicket={priorityTicket}
        onRequestPriorityReview={handleRequestPriorityReview}
      />

      {/* Patient In-Transit Deterioration Diversion Dialog */}
      {showDeteriorationModal && destination && activeCase && (
        <DeteriorationDiversionDialog
          isOpen={showDeteriorationModal}
          onClose={() => setShowDeteriorationModal(false)}
          caseId={activeCase.id}
          currentDestinationName={
            hospitals.find((h) => h.id === destination.hospitalId)?.name || 'Current Destination'
          }
          currentDestinationVersion={destination.version}
          onConfirmDiversion={async (targetHospId, reason, previewId) => {
            await handleDivert(targetHospId, reason, previewId);
          }}
        />
      )}
    </div>
  );
};
