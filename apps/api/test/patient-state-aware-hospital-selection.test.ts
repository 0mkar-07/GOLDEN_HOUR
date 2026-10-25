import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  DEMONSTRATION_SCENARIOS,
  SYNTHETIC_TEACHING_TRAVEL_SECONDS,
  CANONICAL_DEMO_ROLE_BINDINGS,
  getHospitalOperationalOverlay,
  applyHospitalOperationalOverlay,
} from '@goldenhour/scenario-fixtures';
import { runAgent1 } from '../src/modules/agents/agent1.js';
import { runAgent2 } from '../src/modules/agents/agent2.js';
import { runAgent3 } from '../src/modules/agents/agent3.js';
import { runAgentCoordinator } from '../src/modules/agents/agentCoordinator.js';
import { store } from '../src/db/store.js';
import { buildServer } from '../src/server.js';
import { routingProvider } from '../src/modules/routing/index.js';
import { CaseStatus, UserRole } from '@goldenhour/contracts';

const roleAId = CANONICAL_DEMO_ROLE_BINDINGS.roleA;
const roleBId = CANONICAL_DEMO_ROLE_BINDINGS.roleB;
const roleCId = CANONICAL_DEMO_ROLE_BINDINGS.roleC;

describe('Codex Gate: Patient-State-Aware Hospital Selection (6 Cases & Counterfactuals)', () => {
  const app = buildServer();
  let paramedicCookie: string;

  beforeAll(async () => {
    await store.seed();
    await app.ready();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    paramedicCookie = loginRes.cookies[0].value;
  });

  beforeEach(async () => {
    await store.seed();
  });

  // --------------------------------------------------------------------------
  // CASE 1: Stable patient needing specialist service (A wins over closer B)
  // --------------------------------------------------------------------------
  it('Case 1: Stable specialist case — A wins because B lacks neurosurgery and direct transport is permitted', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_1_STABLE_SPECIALIST;

    // 1. Agent 1 proposes needs from observations
    const proposal = runAgent1(sc.observations);
    expect(proposal.proposedFullCareNeeds).toContain('NEUROSURGERY');
    expect(proposal.proposedTransportAssessment).toBe('DIRECT_TRANSPORT_PERMITTED');
    expect(proposal.proposedPathway).toBe('DIRECT_DEFINITIVE');

    // 2. Build mock teaching route snapshot matching Section 4.1
    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-1',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId], // 18 min
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'], // 7 min
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'], // 5 min
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    // 3. Agent 2 evaluates candidates
    const demoHospitals = [
      store.getHospital(roleAId)!,
      store.getHospital('nitk:PADMAVATHI_SURATHKAL')!,
      store.getHospital('nitk:CHIRASHREE_SURATHKAL')!,
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const evalA = evaluations.find((e) => e.hospital.id === roleAId)!;
    const evalB = evaluations.find((e) => e.hospital.id === 'nitk:PADMAVATHI_SURATHKAL')!;
    const evalC = evaluations.find((e) => e.hospital.id === 'nitk:CHIRASHREE_SURATHKAL')!;

    expect(evalA.isFullCareEligible).toBe(true);
    expect(evalB.isFullCareEligible).toBe(false); // B lacks neurosurgery!
    expect(evalB.missingFullCareCapabilities).toContain('NEUROSURGERY');
    expect(evalC.isFullCareEligible).toBe(false);

    // 4. Agent 3 ranks candidates
    const ranking = runAgent3(
      'case-1',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    expect(ranking.recommendationMode).toBe('FULL_CARE_AVAILABLE');
    expect(ranking.hospitalA).toBeDefined();
    expect(ranking.hospitalA!.hospitalId).toBe(roleAId);
    expect(ranking.policyReasonCodes).toContain('DEFINITIVE_SERVICE_REQUIRED');
    expect(ranking.policyReasonCodes).toContain('NEARER_FACILITY_MISSING_REQUIRED_SERVICE');
    expect(ranking.policyReasonCodes).toContain('DIRECT_TRANSPORT_CONFIRMED');
    expect(ranking.whyChanged).toContain('lacks the confirmed specialist service');
  });

  // --------------------------------------------------------------------------
  // CASE 2: Urgent patient needing general emergency intervention (B wins earlier)
  // --------------------------------------------------------------------------
  it('Case 2: Urgent general intervention — B wins because care starts at 11m vs A at 22m', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_2_URGENT_GENERAL;

    const proposal = runAgent1(sc.observations);
    expect(proposal.proposedFullCareNeeds).toContain('OPERATING_THEATRE');
    expect(proposal.requiredIntervention).toBe('GENERAL_SURGERY');

    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-2',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId], // 18m
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'], // 7m
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'], // 5m
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    // Apply teaching scenario overlay
    const demoHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:CHIRASHREE_SURATHKAL')!, sc.seed),
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const evalA = evaluations.find((e) => e.hospital.id === roleAId)!;
    const evalB = evaluations.find((e) => e.hospital.id === 'nitk:PADMAVATHI_SURATHKAL')!;
    const evalC = evaluations.find((e) => e.hospital.id === 'nitk:CHIRASHREE_SURATHKAL')!;

    // Both A and B are eligible for general surgical emergency! C is not.
    expect(evalA.isFullCareEligible).toBe(true);
    expect(evalB.isFullCareEligible).toBe(true);
    expect(evalC.isFullCareEligible).toBe(false);

    const ranking = runAgent3(
      'case-2',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    expect(ranking.recommendationMode).toBe('FULL_CARE_AVAILABLE');
    // B must win Primary destination because care starts sooner (11m vs 22m)
    expect(ranking.hospitalA!.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');
    expect(ranking.hospitalA!.timeToCareSeconds).toBe(11 * 60); // 660s
    expect(ranking.policyReasonCodes).toContain('EARLIER_REQUIRED_INTERVENTION');
    expect(ranking.whyChanged).toContain('Padmavathi');
  });

  // --------------------------------------------------------------------------
  // CASE 3: Critical patient needing capabilities only A provides -> A wins
  // --------------------------------------------------------------------------
  it('Case 3: Critical specialist case — A wins because severity alone does not erase neurosurgical requirement', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_3_CRITICAL_SPECIALIST;

    const proposal = runAgent1(sc.observations);
    expect(proposal.proposedFullCareNeeds).toContain('NEUROSURGERY');
    expect(proposal.proposedClinicalStability).toBe('UNSTABLE');

    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-3',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId],
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'],
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'],
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    const demoHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:CHIRASHREE_SURATHKAL')!, sc.seed),
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const ranking = runAgent3(
      'case-3',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    expect(ranking.recommendationMode).toBe('FULL_CARE_AVAILABLE');
    expect(ranking.hospitalA!.hospitalId).toBe(roleAId);
    expect(ranking.policyReasonCodes).toContain('DEFINITIVE_SERVICE_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // CASE 4: Deteriorating patient requiring stabilisation first -> B wins immediate
  // --------------------------------------------------------------------------
  it('Case 4: Deteriorating case — B becomes recommended immediate destination under confirmed stabilisation-first plan', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_4_DETERIORATING_STABILIZE_FIRST;

    const proposal = runAgent1(sc.observations);
    expect(proposal.proposedConditionTrend).toBe('DETERIORATING');
    expect(proposal.proposedTransportAssessment).toBe('STABILIZE_BEFORE_TRANSFER');
    expect(proposal.proposedPathway).toBe('STABILIZE_THEN_TRANSFER');

    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-4',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId],
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'],
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'],
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    const demoHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:CHIRASHREE_SURATHKAL')!, sc.seed),
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const ranking = runAgent3(
      'case-4',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    // In stabilization-first mode, hospitalA is empty, and hospitalB is immediate destination
    expect(ranking.recommendationMode).toBe('STABILIZATION_ONLY');
    expect(ranking.hospitalA).toBeNull();
    expect(ranking.hospitalB).toBeDefined();
    expect(ranking.hospitalB!.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');
    expect(ranking.policyReasonCodes).toContain('STABILIZATION_FIRST_CONFIRMED');

    // Onward transfer timing not confirmed
    expect(ranking.onwardTransfer).toBeDefined();
    expect(ranking.onwardTransfer!.timingConfirmed).toBe(false);
    expect(ranking.onwardTransfer!.destinationHospitalId).toBe(roleAId);
  });

  // --------------------------------------------------------------------------
  // CASE 5: Nearest facility C unsuitable -> C excluded despite 5 min proximity
  // --------------------------------------------------------------------------
  it('Case 5: Nearest facility C lacks required immediate intervention — excluded despite 5 min proximity', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_5_NEAREST_UNSUITABLE;

    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-5',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId],
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'],
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'], // 5 min! Closest!
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    const demoHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:CHIRASHREE_SURATHKAL')!, sc.seed),
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const evalC = evaluations.find((e) => e.hospital.id === 'nitk:CHIRASHREE_SURATHKAL')!;
    // C must be ineligible because it lacks certified trauma bay resuscitation
    expect(evalC.isStabilizationEligible).toBe(false);

    const ranking = runAgent3(
      'case-5',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    // C is excluded; B wins immediate stabilization
    expect(ranking.hospitalB!.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');
    expect(ranking.policyReasonCodes).toContain('NEARER_FACILITY_MISSING_REQUIRED_SERVICE');
  });

  // --------------------------------------------------------------------------
  // CASE 6: B near but its OT is occupied -> A wins on earlier service start
  // --------------------------------------------------------------------------
  it('Case 6: B near (7m) but OT occupied (care start 35m) — A wins on earlier service start (22m)', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_6_THEATRE_UNAVAILABLE;

    const mockRouteSnapshot: any = {
      snapshotId: 'snap-case-6',
      routes: {
        [roleAId]: {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS[roleAId], // 18m
          distanceMeters: 14000,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:PADMAVATHI_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:PADMAVATHI_SURATHKAL'], // 7m
          distanceMeters: 4500,
          routingSource: 'SIMULATED_GRAPH',
        },
        'nitk:CHIRASHREE_SURATHKAL': {
          status: 'AVAILABLE',
          durationSeconds: SYNTHETIC_TEACHING_TRAVEL_SECONDS['nitk:CHIRASHREE_SURATHKAL'],
          distanceMeters: 2800,
          routingSource: 'SIMULATED_GRAPH',
        },
      },
    };

    // Hospital B has theatre occupied overlay
    const demoHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed),
      applyHospitalOperationalOverlay(store.getHospital('nitk:CHIRASHREE_SURATHKAL')!, sc.seed),
    ];

    const evaluations = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      demoHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const evalB = evaluations.find((e) => e.hospital.id === 'nitk:PADMAVATHI_SURATHKAL')!;
    expect(evalB.theatreReady).toBe(false);
    expect(evalB.theatreWaitSeconds).toBe(1860);

    const ranking = runAgent3(
      'case-6',
      1,
      sc.ambulanceOrigin,
      evaluations,
      routingProvider,
      {},
      mockRouteSnapshot,
      {
        selectedPathway: sc.confirmedState.selectedPathway,
        requiredIntervention: sc.confirmedState.requiredIntervention,
      }
    );

    // A wins Primary A because care starts at 22 min while B starts at 35 min!
    expect(ranking.recommendationMode).toBe('FULL_CARE_AVAILABLE');
    expect(ranking.hospitalA!.hospitalId).toBe(roleAId);
    expect(ranking.hospitalA!.timeToCareSeconds).toBe(22 * 60); // 1320s
    expect(ranking.policyReasonCodes).toContain('THEATRE_NOT_READY_AT_ARRIVAL');
    expect(ranking.policyReasonCodes).toContain('EARLIER_REQUIRED_INTERVENTION');
  });

  // --------------------------------------------------------------------------
  // COUNTERFACTUAL & INVARIANT GATES
  // --------------------------------------------------------------------------

  it('Counterfactual: Holding operating state fixed while toggling patient state flips outcome from A to B', () => {
    const fixedHospitals = [
      applyHospitalOperationalOverlay(store.getHospital(roleAId)!, 'fixed-seed'),
      applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, 'fixed-seed'),
    ];

    const mockSnapshot: any = {
      snapshotId: 'snap-fixed',
      routes: {
        [roleAId]: { status: 'AVAILABLE', durationSeconds: 18 * 60, distanceMeters: 14000, routingSource: 'SIMULATED_GRAPH' },
        'nitk:PADMAVATHI_SURATHKAL': { status: 'AVAILABLE', durationSeconds: 7 * 60, distanceMeters: 4500, routingSource: 'SIMULATED_GRAPH' },
      },
    };

    // Patient State 1: Confirmed direct definitive neurosurgery -> A wins
    const eval1 = runAgent2(
      ['TRAUMA_L1', 'NEUROSURGERY'],
      ['STABILIZATION'],
      fixedHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: 'NEUROSURGERY' }
    );
    const rank1 = runAgent3('c1', 1, { x: 120, y: 150 }, eval1, routingProvider, {}, mockSnapshot, {
      selectedPathway: 'DIRECT_DEFINITIVE',
      requiredIntervention: 'NEUROSURGERY',
    });
    expect(rank1.hospitalA!.hospitalId).toBe(roleAId);

    // Patient State 2: Confirmed stabilisation first -> B becomes immediate winner!
    const eval2 = runAgent2(
      ['TRAUMA_L1', 'NEUROSURGERY'],
      ['STABILIZATION'],
      fixedHospitals,
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: 'RESUSCITATION' }
    );
    const rank2 = runAgent3('c1', 2, { x: 120, y: 150 }, eval2, routingProvider, {}, mockSnapshot, {
      selectedPathway: 'STABILIZE_THEN_TRANSFER',
      requiredIntervention: 'RESUSCITATION',
    });
    expect(rank2.hospitalB!.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');
  });

  it('Invariant: Adding irrelevant extra capabilities to A does not change ranking', () => {
    const hospA = { ...store.getHospital(roleAId)! };
    hospA.capabilities = [...hospA.capabilities, 'BLOOD_BANK', 'DIALYSIS', 'BURNS_CARE', 'MRI'];

    const hospB = store.getHospital('nitk:PADMAVATHI_SURATHKAL')!;

    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_2_URGENT_GENERAL;
    const mockSnapshot: any = {
      snapshotId: 'snap-extra-caps',
      routes: {
        [hospA.id]: { status: 'AVAILABLE', durationSeconds: 18 * 60, distanceMeters: 14000, routingSource: 'SIMULATED_GRAPH' },
        [hospB.id]: { status: 'AVAILABLE', durationSeconds: 7 * 60, distanceMeters: 4500, routingSource: 'SIMULATED_GRAPH' },
      },
    };

    const evals = runAgent2(
      sc.confirmedState.confirmedFullCareNeeds,
      sc.confirmedState.confirmedStabilizationNeeds,
      [applyHospitalOperationalOverlay(hospA, sc.seed), applyHospitalOperationalOverlay(hospB, sc.seed)],
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id),
      { requiredIntervention: sc.confirmedState.requiredIntervention }
    );

    const rank = runAgent3('c-extra', 1, { x: 120, y: 150 }, evals, routingProvider, {}, mockSnapshot, {
      selectedPathway: sc.confirmedState.selectedPathway,
      requiredIntervention: sc.confirmedState.requiredIntervention,
    });

    // B still wins because general surgery care starts earlier; extra capabilities on A do not compensate!
    expect(rank.hospitalA!.hospitalId).toBe(hospB.id);
  });

  it('Invariant: Permuting candidate array order produces identical winner and metrics', () => {
    const sc = DEMONSTRATION_SCENARIOS.SCENARIO_2_URGENT_GENERAL;
    const hA = applyHospitalOperationalOverlay(store.getHospital(roleAId)!, sc.seed);
    const hB = applyHospitalOperationalOverlay(store.getHospital('nitk:PADMAVATHI_SURATHKAL')!, sc.seed);

    const mockSnapshot: any = {
      snapshotId: 'snap-permute',
      routes: {
        [hA.id]: { status: 'AVAILABLE', durationSeconds: 18 * 60, distanceMeters: 14000, routingSource: 'SIMULATED_GRAPH' },
        [hB.id]: { status: 'AVAILABLE', durationSeconds: 7 * 60, distanceMeters: 4500, routingSource: 'SIMULATED_GRAPH' },
      },
    };

    // Order 1: [A, B]
    const evals1 = runAgent2(sc.confirmedState.confirmedFullCareNeeds, sc.confirmedState.confirmedStabilizationNeeds, [hA, hB], (id) => store.listResourcePoolsByHospital(id), (id) => store.listStaffByHospital(id), { requiredIntervention: sc.confirmedState.requiredIntervention });
    const rank1 = runAgent3('p1', 1, { x: 120, y: 150 }, evals1, routingProvider, {}, mockSnapshot, { selectedPathway: sc.confirmedState.selectedPathway, requiredIntervention: sc.confirmedState.requiredIntervention });

    // Order 2: [B, A]
    const evals2 = runAgent2(sc.confirmedState.confirmedFullCareNeeds, sc.confirmedState.confirmedStabilizationNeeds, [hB, hA], (id) => store.listResourcePoolsByHospital(id), (id) => store.listStaffByHospital(id), { requiredIntervention: sc.confirmedState.requiredIntervention });
    const rank2 = runAgent3('p2', 1, { x: 120, y: 150 }, evals2, routingProvider, {}, mockSnapshot, { selectedPathway: sc.confirmedState.selectedPathway, requiredIntervention: sc.confirmedState.requiredIntervention });

    expect(rank1.hospitalA!.hospitalId).toBe(rank2.hospitalA!.hospitalId);
    expect(rank1.hospitalA!.timeToCareSeconds).toBe(rank2.hospitalA!.timeToCareSeconds);
  });

  it('Missing data safety: Missing resuscitation pool results in unknown/ineligible, not implicit availability', () => {
    const hosp = store.getHospital('nitk:CHIRASHREE_SURATHKAL')!;

    // Return empty pools -> missing resuscitation pool
    const evals = runAgent2(
      ['EMERGENCY_DEPT'],
      ['STABILIZATION', 'TRAUMA_BAY'],
      [hosp],
      () => [], // No pools!
      () => []
    );

    expect(evals[0].isStabilizationEligible).toBe(false);
  });

  it('Deterioration Lifecycle: New deterioration proposal does not automatically divert destination without human confirmation', async () => {
    // 1. Create and dispatch a case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Transit Deterioration Test' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // 2. Submit initial assessment & confirm direct transport
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Moderate head trauma, stable',
          urgencyLevel: 'STABLE',
          vitals: { gcs: 14, systolicBp: 120, heartRate: 75, respiratoryRate: 16, oxygenSaturation: 98 },
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY'],
        confirmedStabilizationNeeds: ['STABILIZATION'],
        confirmedPathway: 'DIRECT_DEFINITIVE',
      },
    });

    // Generate recommendation before dispatch
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });

    // 3. Dispatch to Hospital A
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: roleAId,
        careObjective: 'FULL_CARE',
      },
    });

    const caseBefore = store.getCase(caseId)!;
    expect(caseBefore.selectedHospitalId).toBe(roleAId);
    expect(caseBefore.caseStatus).toBe(CaseStatus.DISPATCHING);

    // 4. Paramedic submits acute in-transit deterioration
    const detRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Acute respiratory collapse and shock in transit',
          urgencyLevel: 'CRITICAL',
          vitals: { gcs: 7, systolicBp: 70, heartRate: 140, respiratoryRate: 36, oxygenSaturation: 80 },
          clinicalStability: 'UNSTABLE',
          conditionTrend: 'DETERIORATING',
        },
      },
    });
    expect(detRes.statusCode).toBe(200);

    // CRITICAL INVARIANT: The selected destination MUST NOT have auto-diverted!
    const caseAfter = store.getCase(caseId)!;
    expect(caseAfter.selectedHospitalId).toBe(roleAId);
    expect(caseAfter.assessmentVersion).toBe(2);
  });
});
