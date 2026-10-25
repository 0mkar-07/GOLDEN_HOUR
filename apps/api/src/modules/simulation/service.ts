import {
  RoadGraphDto,
  SimulationRunDto,
  AmbulancePositionDto,
  CaseStatus,
  DestinationReadiness,
  UserRole,
  projectToNitkMetric,
  NITK_REGION,
} from '@goldenhour/contracts';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';
import { store } from '../../db/store.js';
import { SimulatedRoutingProvider, RouteResult } from '../routing/index.js';
import { getIO } from '../realtime/index.js';

class SimulationService {
  private routingProvider: SimulatedRoutingProvider;
  private ticker: NodeJS.Timeout | null = null;
  private speedMultiplier = 1.0;
  private running = false;
  private simulatedSeconds = 0;
  private activeRoute: RouteResult | null = null;
  private currentEdgeIndex = 0;
  private distanceOnCurrentEdge = 0; // meters traveled on current edge
  private runVersion = 1;
  private completed = false;
  private checkpointCount = 0;
  private lastWallTime: number | null = null;

  constructor() {
    this.routingProvider = new SimulatedRoutingProvider(SEEDED_ROAD_GRAPH);
  }

  public getSimulationState(): {
    simulationRun: SimulationRunDto;
    ambulancePosition: AmbulancePositionDto;
    roadGraph: RoadGraphDto;
    activeRoute: RouteResult | null;
    trafficOverrides: Record<string, number>;
  } {
    return {
      simulationRun: {
        id: 'sim-default',
        seed: 'goldenhour-2026',
        running: this.running,
        speedMultiplier: this.speedMultiplier,
        simulatedSeconds: this.simulatedSeconds,
        scenarioStep: this.getScenarioStep(),
        runVersion: store.simulationRun.runVersion,
        assignedAmbulanceId: 'amb-104',
        completed: this.completed,
        checkpointCount: this.checkpointCount,
        updatedAt: new Date().toISOString(),
      },
      ambulancePosition: {
        ...store.ambulancePosition,
        ambulanceId: 'amb-104',
      },
      roadGraph: SEEDED_ROAD_GRAPH,
      activeRoute: this.activeRoute,
      trafficOverrides: store.trafficOverrides,
    };
  }

  public play(speedMultiplier = 1.0): SimulationRunDto {
    this.speedMultiplier = Math.max(0.5, Math.min(10, speedMultiplier));
    this.running = true;
    store.simulationRun.running = true;
    this.completed = false;
    this.lastWallTime = Date.now();

    if (this.ticker) {
      clearInterval(this.ticker);
    }

    // Monotonic server ticker runs every 500ms
    const intervalMs = 500;
    this.ticker = setInterval(() => {
      const now = Date.now();
      const elapsedWallSec = this.lastWallTime ? (now - this.lastWallTime) / 1000 : 0.5;
      this.lastWallTime = now;
      // Bounded catch-up cap to prevent catch-up teleporting
      const boundedElapsed = Math.min(2.0, Math.max(0.05, elapsedWallSec));
      const deltaSec = boundedElapsed * this.speedMultiplier;
      this.advanceClock(deltaSec);
    }, intervalMs);

    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  public pause(): SimulationRunDto {
    this.running = false;
    store.simulationRun.running = false;
    this.lastWallTime = null;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  public step(stepSeconds = 5): SimulationRunDto {
    this.advanceClock(stepSeconds);
    this.checkpointCount += 1;
    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  public setSpeed(multiplier: number): SimulationRunDto {
    this.speedMultiplier = Math.max(0.5, Math.min(10, multiplier));
    if (this.running) {
      this.play(this.speedMultiplier);
    }
    return this.getSimulationState().simulationRun;
  }

  public reset(incrementVersion = true): SimulationRunDto {
    this.pause();
    this.simulatedSeconds = 0;
    this.currentEdgeIndex = 0;
    this.distanceOnCurrentEdge = 0;
    this.activeRoute = null;
    this.completed = false;
    if (incrementVersion) store.simulationRun.runVersion += 1;
    this.runVersion = store.simulationRun.runVersion;

    // Reset ambulance position to selected scenario origin (or NITK default) (F-13)
    const origin = store.ambulanceOrigin;
    const metric = projectToNitkMetric(origin.lat, origin.lng);
    store.updateAmbulancePosition(
      Math.round(metric.x / 10),
      Math.round(metric.y / 10),
      origin.lat,
      origin.lng
    );
    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  /**
   * Deterministic movement across multiple directed route edges (Stage 2.3)
   */
  public advanceClock(deltaSeconds: number): void {
    if (this.completed) return;
    this.simulatedSeconds += deltaSeconds;

    // 1. Resolve active route from case or default hospital A route
    this.ensureActiveRoute();

    if (!this.activeRoute || this.activeRoute.edgeIds.length === 0) {
      this.broadcastTelemetry();
      return;
    }

    let remainingTime = deltaSeconds;

    // Multi-edge consumption loop: consume remaining time across each traversed segment and its own speed
    while (remainingTime > 0 && this.currentEdgeIndex < this.activeRoute.edgeIds.length) {
      const fromNodeId = this.activeRoute.pathNodeIds[this.currentEdgeIndex];
      const toNodeId = this.activeRoute.pathNodeIds[this.currentEdgeIndex + 1];
      const currentEdgeId = this.activeRoute.edgeIds[this.currentEdgeIndex];
      const edge = SEEDED_ROAD_GRAPH.edges.find((e) => e.id === currentEdgeId);
      if (!edge || !fromNodeId || !toNodeId) break;

      const trafficMultiplier = store.trafficOverrides[edge.id] ?? edge.trafficMultiplier ?? 1.0;
      const speedMps = (edge.speedKmh / 3.6) / trafficMultiplier;
      const segmentTotalMeters = edge.distanceMeters;
      const remainingDistanceOnSegment = Math.max(0, segmentTotalMeters - this.distanceOnCurrentEdge);

      const timeToFinishSegment = speedMps > 0 ? remainingDistanceOnSegment / speedMps : 9999;

      if (remainingTime < timeToFinishSegment) {
        // Advance within current segment
        this.distanceOnCurrentEdge += speedMps * remainingTime;
        remainingTime = 0;
      } else {
        // Finish this segment and advance to next
        remainingTime -= timeToFinishSegment;
        if (this.currentEdgeIndex < this.activeRoute.edgeIds.length - 1) {
          this.currentEdgeIndex += 1;
          this.distanceOnCurrentEdge = 0;
        } else {
          // Reached final destination
          this.distanceOnCurrentEdge = segmentTotalMeters;
          remainingTime = 0;
          this.onReachedDestination();
          break;
        }
      }
    }

    // Interpolate coordinates along the active directed segment
    const fromNodeId = this.activeRoute.pathNodeIds[this.currentEdgeIndex];
    const toNodeId = this.activeRoute.pathNodeIds[this.currentEdgeIndex + 1];
    const currentEdgeId = this.activeRoute.edgeIds[this.currentEdgeIndex];
    const edge = SEEDED_ROAD_GRAPH.edges.find((e) => e.id === currentEdgeId);

    if (fromNodeId && toNodeId && edge) {
      const fromNode = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === fromNodeId)!;
      const toNode = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === toNodeId)!;

      const progressFraction = Math.min(1, Math.max(0, this.distanceOnCurrentEdge / edge.distanceMeters));
      const newX = Math.round(fromNode.x + progressFraction * (toNode.x - fromNode.x));
      const newY = Math.round(fromNode.y + progressFraction * (toNode.y - fromNode.y));
      const newLat = Number((fromNode.lat + progressFraction * (toNode.lat - fromNode.lat)).toFixed(6));
      const newLng = Number((fromNode.lng + progressFraction * (toNode.lng - fromNode.lng)).toFixed(6));

      const trafficMultiplier = store.trafficOverrides[edge.id] ?? edge.trafficMultiplier ?? 1.0;
      const speedKmh = Math.round(edge.speedKmh / trafficMultiplier);
      const headingDeg = Math.round(
        ((Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x) * 180) / Math.PI + 360) % 360
      );

      store.ambulancePosition = {
        ambulanceId: 'amb-104',
        x: newX,
        y: newY,
        lat: newLat,
        lng: newLng,
        speed: speedKmh,
        speedMps: Number((speedKmh / 3.6).toFixed(2)),
        heading: headingDeg,
        headingDegrees: headingDeg,
        accuracyMeters: 5,
        source: 'SIMULATED',
        sourceGeneration: store.ambulancePosition.sourceGeneration,
        serverSequence: store.ambulancePosition.serverSequence + 1,
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      };
    }

    this.broadcastTelemetry();
  }

  // --- Scenario Action Injections ---
  public injectTraffic(edgeId: string, multiplier: number, actorUserId: string): void {
    store.setTrafficOverride(edgeId, multiplier);
    store.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'SCENARIO_TRAFFIC_INJECTED',
      entityType: 'ROAD_NETWORK',
      entityId: edgeId,
      details: { multiplier },
    });

    // Recompute route if active
    this.recomputeRoute();
    this.broadcastSimulationState();
  }

  public injectHospitalSpike(hospitalId: string, actorUserId: string): void {
    const hosp = store.getHospital(hospitalId);
    if (!hosp) return;

    hosp.receivingDelaySeconds = 900; // 15 min intake delay
    hosp.version += 1;
    hosp.updatedAt = new Date().toISOString();
    store.hospitals.set(hospitalId, hosp);

    store.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'SCENARIO_HOSPITAL_SPIKE_INJECTED',
      entityType: 'HOSPITAL',
      entityId: hospitalId,
      details: { newDelay: 900 },
    });

    store.queueOutbox('hospital.updated', hospitalId, hosp);
    this.recomputeRoute();
    this.broadcastSimulationState();
  }

  public injectPatientDecompensation(caseId: string, actorUserId: string): void {
    const activeCase = store.cases.get(caseId);
    if (!activeCase) return;

    // Create deteriorating observation
    const decompAssessment = store.createAssessment(
      caseId,
      {
        presentingIssue: 'Acute In-Transit Decompensation: Critical Hypoxemia & Brain Herniation Signs',
        urgencyLevel: 'CRITICAL',
        vitals: {
          heartRate: 142,
          systolicBp: 72,
          diastolicBp: 40,
          respiratoryRate: 34,
          oxygenSaturation: 82, // Critical drop
          gcs: 5, // Severe coma
        },
        ambulanceSupportProvided: ['BAG_VALVE_MASK', 'HIGH_FLOW_O2', 'IV_ACCESS', 'CHEST_DECOMPRESSION'],
        notes: 'Sudden pupil dilation, severe hypoxemia. Immediate stabilization ED diversion required!',
      },
      ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'ICU'],
      ['STABILIZATION', 'BASIC_OXYGEN', 'TRAUMA_BAY']
    );

    store.recordAudit({
      actorId: actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'SCENARIO_DECOMPENSATION_INJECTED',
      entityType: 'ASSESSMENT',
      entityId: decompAssessment.id,
      details: { caseId, vitals: decompAssessment.observations.vitals },
    });

    store.queueOutbox('assessment.created', caseId, decompAssessment);
    this.broadcastSimulationState();
  }

  private ensureActiveRoute(): void {
    if (this.activeRoute) return;

    // Check if there is an active case with confirmed destination
    const activeCase = Array.from(store.cases.values()).find(
      (c) => c.caseStatus === CaseStatus.EN_ROUTE || c.caseStatus === CaseStatus.DISPATCHING
    );

    let destinationNodeId = 'node-hosp-a'; // Default
    if (activeCase && activeCase.selectedHospitalId) {
      const hosp = store.getHospital(activeCase.selectedHospitalId);
      if (hosp) {
        const closestDest = this.routingProvider.findClosestNode(hosp.location.x, hosp.location.y);
        destinationNodeId = closestDest.id;
      }
    }

    const closestNode = this.routingProvider.findClosestNode(
      store.ambulancePosition.x,
      store.ambulancePosition.y
    );

    this.activeRoute = this.routingProvider.calculateRoute(
      closestNode.id,
      destinationNodeId,
      store.trafficOverrides
    );
    this.currentEdgeIndex = 0;
    this.distanceOnCurrentEdge = 0;
  }

  private recomputeRoute(): void {
    if (!this.activeRoute) return;
    const destNode = this.activeRoute.toNodeId;
    const closestNode = this.routingProvider.findClosestNode(
      store.ambulancePosition.x,
      store.ambulancePosition.y
    );
    this.activeRoute = this.routingProvider.calculateRoute(
      closestNode.id,
      destNode,
      store.trafficOverrides
    );
    this.currentEdgeIndex = 0;
    this.distanceOnCurrentEdge = 0;
  }

  private onReachedDestination(): void {
    if (this.completed) return;
    this.completed = true;
    this.pause();

    const activeCase = Array.from(store.cases.values()).find(
      (c) => c.caseStatus === CaseStatus.EN_ROUTE
    );
    if (activeCase) {
      try {
        store.arriveCase(activeCase.id, 'system-simulation');
      } catch (err) {
        // already arrived
      }
    }

    const io = getIO();
    if (io) {
      io.to('ambulance:cases').emit('simulation.completed', {
        runId: 'sim-default',
        completedAt: new Date().toISOString(),
      });
    }
  }

  private getScenarioStep(): string {
    if (store.trafficOverrides['edge-3']) return 'TRAFFIC_CONGESTION';
    const hospA = store.getHospital('hosp-001');
    if (hospA && hospA.receivingDelaySeconds > 600) return 'HOSPITAL_SURGE';
    return 'STANDARD_TRANSIT';
  }

  private broadcastTelemetry(): void {
    const io = getIO();
    if (io) {
      io.emit('ambulance.telemetry', store.ambulancePosition);
    }
  }

  private broadcastSimulationState(): void {
    const io = getIO();
    if (io) {
      io.emit('simulation.updated', this.getSimulationState());
    }
  }
}

export const simulationService = new SimulationService();
