import {
  RoadGraphDto,
  SimulationRunDto,
  AmbulancePositionDto,
  CaseStatus,
  DestinationReadiness,
  UserRole,
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
        updatedAt: new Date().toISOString(),
      },
      ambulancePosition: {
        ambulanceId: 'amb-101',
        ...store.ambulancePosition,
      },
      roadGraph: SEEDED_ROAD_GRAPH,
      activeRoute: this.activeRoute,
      trafficOverrides: store.trafficOverrides,
    };
  }

  public play(speedMultiplier = 1.0): SimulationRunDto {
    this.speedMultiplier = Math.max(0.5, Math.min(10, speedMultiplier));
    this.running = true;

    if (this.ticker) {
      clearInterval(this.ticker);
    }

    // Server ticker runs every 500ms
    const intervalMs = 500;
    this.ticker = setInterval(() => {
      // Delta seconds scaled by speed multiplier
      const deltaSec = (intervalMs / 1000) * this.speedMultiplier;
      this.advanceClock(deltaSec);
    }, intervalMs);

    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  public pause(): SimulationRunDto {
    this.running = false;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  public step(stepSeconds = 5): SimulationRunDto {
    this.advanceClock(stepSeconds);
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

  public reset(): SimulationRunDto {
    this.pause();
    this.simulatedSeconds = 0;
    this.currentEdgeIndex = 0;
    this.distanceOnCurrentEdge = 0;
    this.activeRoute = null;

    // Reset ambulance position to scene start
    store.updateAmbulancePosition(120, 150, 40.71, -74.02);
    this.broadcastSimulationState();
    return this.getSimulationState().simulationRun;
  }

  /**
   * Deterministic movement along current route edges
   */
  public advanceClock(deltaSeconds: number): void {
    this.simulatedSeconds += deltaSeconds;

    // 1. Resolve active route from case or default hospital A route
    this.ensureActiveRoute();

    if (!this.activeRoute || this.activeRoute.edgeIds.length === 0) {
      this.broadcastTelemetry();
      return;
    }

    const currentEdgeId = this.activeRoute.edgeIds[this.currentEdgeIndex];
    const edge = SEEDED_ROAD_GRAPH.edges.find((e) => e.id === currentEdgeId);
    if (!edge) {
      return;
    }

    // Speed in meters per second (default 50 km/h = ~13.89 m/s)
    const trafficMultiplier = store.trafficOverrides[edge.id] ?? edge.trafficMultiplier;
    const speedMps = (edge.speedKmh / 3.6) / trafficMultiplier;
    const distanceDelta = speedMps * deltaSeconds;

    this.distanceOnCurrentEdge += distanceDelta;

    // Move to next edge if edge completed
    if (this.distanceOnCurrentEdge >= edge.distanceMeters) {
      if (this.currentEdgeIndex < this.activeRoute.edgeIds.length - 1) {
        this.distanceOnCurrentEdge -= edge.distanceMeters;
        this.currentEdgeIndex += 1;
      } else {
        // Reached end of route
        this.distanceOnCurrentEdge = edge.distanceMeters;
        this.onReachedDestination();
      }
    }

    // Interpolate coordinates on current edge
    const activeEdge = SEEDED_ROAD_GRAPH.edges.find(
      (e) => e.id === this.activeRoute!.edgeIds[this.currentEdgeIndex]
    )!;
    const fromNode = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === activeEdge.from)!;
    const toNode = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === activeEdge.to)!;

    const progressFraction = Math.min(1, Math.max(0, this.distanceOnCurrentEdge / activeEdge.distanceMeters));
    const newX = Math.round(fromNode.x + progressFraction * (toNode.x - fromNode.x));
    const newY = Math.round(fromNode.y + progressFraction * (toNode.y - fromNode.y));
    const newLat = Number((fromNode.lat + progressFraction * (toNode.lat - fromNode.lat)).toFixed(6));
    const newLng = Number((fromNode.lng + progressFraction * (toNode.lng - fromNode.lng)).toFixed(6));

    // Calculate heading angle in degrees
    const headingDeg = Math.round(
      (Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x) * 180) / Math.PI
    );

    store.ambulancePosition = {
      x: newX,
      y: newY,
      lat: newLat,
      lng: newLng,
      speed: Math.round(edge.speedKmh / trafficMultiplier),
      heading: headingDeg,
      source: 'SIMULATED',
      serverSequence: store.ambulancePosition.serverSequence + 1,
      observedAt: new Date().toISOString(),
    };

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

    let destinationNodeId = 'node-hosp-a'; // Default to St. Jude
    if (activeCase && activeCase.selectedHospitalId) {
      if (activeCase.selectedHospitalId === 'hosp-002') destinationNodeId = 'node-hosp-b';
      else if (activeCase.selectedHospitalId === 'hosp-003') destinationNodeId = 'node-hosp-c';
      else if (activeCase.selectedHospitalId === 'hosp-004') destinationNodeId = 'node-hosp-d';
      else if (activeCase.selectedHospitalId === 'hosp-005') destinationNodeId = 'node-hosp-e';
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
