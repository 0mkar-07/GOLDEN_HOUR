# Antigravity handoff: accurate hospital ETA, varied readiness and evidence-based agent behaviour

Date: 25 October 2026. Deliverable: Markdown implementation plan only.

No application code, hospital data, credentials, configuration or database is changed by writing this document. Existing uncommitted work belongs to earlier tasks and must be preserved.

## Copy-ready implementation instruction

> When implementation is authorised, repair the recommendation pipeline using this document. Keep all supplied hospital names, canonical IDs and geographic coordinates unchanged within the existing NITK 40 km region. Calculate travel time from the ambulance's current location to each hospital's actual road-access point. Model hospital readiness, staffing, queues and schedules separately from travel time. Remove the causes of repeated four-minute results; do not assign arbitrary unique ETAs or add random numbers to make the application look intelligent. Use one versioned routing/readiness snapshot for ranking, cards, map and simulator. Demonstrate agent behaviour through goal-directed tool use, evidence checks, event-driven reassessment and explanations of changed decisions. Preserve deterministic calculations and reproducible simulation seeds. Complete the stages and acceptance tests below; report any unavailable road data, live API failures or incomplete gates honestly.

## What “agentic” means for this project

A deterministic calculation can be a tool inside an agentic application. Giving every hospital a different random ETA would make the display less reliable, not more agentic. Equal ETAs can also be legitimate, especially after rounding.

The intended behaviour is: interpret the patient requirements, identify missing evidence, retrieve relevant hospital/route state, evaluate constraints, explain alternatives, and reassess when new evidence arrives. Keep dispatch, hospital acceptance, elective deferral and ambulance diversion under their existing authorised human workflows.

Describe the current implementation honestly as an AI-assisted multi-module workflow where appropriate. Add a bounded decision-and-tool loop before claiming that the system autonomously selects and sequences evidence-gathering actions. Do not label a fixed list of function calls as autonomous reasoning merely because the UI contains three agent cards.

## Current source findings and likely cause of repeated four-minute results

Source was reviewed for this document; the reported UI symptom was not reproduced in a browser during this documentation task.

| Finding | Source anchor | Required change |
|---|---|---|
| Intake defaults are almost identical | `packages/scenario-fixtures/src/importer.ts`: 90 seconds for Padmavathi, 150 for Srinivas, 120 for most other facilities | Generate structured, documented demo operating conditions instead of near-uniform intake constants |
| Readiness is calculated from intake delay | `apps/api/src/modules/agents/agent3.ts`: both `readyAtSeconds` and `receivingDelaySeconds` derive from `hosp.receivingDelaySeconds || 120` | Derive readiness from required staff/resources/schedules; add intake exactly once |
| Four-minute result has a direct arithmetic explanation | With a zero graph route and 120-second defaults, the current calculation is `max(0, 120) + 120 = 240` | Diagnose collapsed routes and duplicate timing semantics before editing hospital parameters |
| Canonical facilities fall through a five-ID routing map | Agent 3 maps legacy IDs, then resolves other hospitals using nearest graph x/y | Route by canonical hospital geographic access, not legacy A–E slots |
| Imported x/y and the legacy schematic may not share a coordinate system | Importer derives projected metric offsets divided by ten; the fixture graph uses schematic coordinates | Eliminate mixed-coordinate nearest-node lookup from ranking |
| Nearest-node snapping can collapse distinct facilities onto one node | `routing/index.ts`, simulated graph/geographic providers | Bound access snapping and account for access segments; do not report zero travel between distinct remote facilities |
| Map and ranking obtain routes separately | `modules/cases/routes.ts` calls synchronous `runAgent3` using `routingProvider`; route endpoints use `geographicRoutingProvider` | Centralise the route snapshot used by both consumers |
| Fallback geometry adds origin/destination connectors without adding their cost | `SimulatedGeographicRoutingProvider.calculateGeographicRoute` | Validate and cost actual access paths or return unavailable |
| Output readiness does not match calculation | Several candidate objects still emit `readyAtSeconds: 0` | Return the actual scored timing breakdown from one candidate builder |
| Unavailable travel uses numeric sentinel `9999` | Agent 3 and fallback route outputs | Use explicit availability status with nullable duration |
| Generated specialist readiness is repetitive | `db/store.ts` seeds many team slots as one slot, ready in five minutes | Use scenario-based shift/availability data, with provenance |
| UI rounds all values to whole minutes | `RecommendationPanel.tsx` uses `Math.round(seconds / 60)` | Keep full precision for ranking; distinguish genuine ties from display rounding |
| Interpreter confidence is hard-coded | `agents/interpreter.ts` returns fixed 0.95/1.0 | Do not present these as measured correctness probabilities; show source, mode and missing evidence |

The zero-route explanation is a source-supported hypothesis for the user's symptom, not proof that every observed four-minute card has that exact cause. Stage 1 must capture the actual candidate inputs.

## Non-negotiable data rules

1. Preserve the supplied hospital identities and coordinates. Do not move a hospital closer or farther away to create variation.
2. Keep `distanceFromNitkKm`, straight-line distance from the current ambulance, and road-route distance as three different measurements. Only the last is used for a road travel estimate.
3. Keep the regional centre at the existing configured NITK point and radius at 40,000 metres. A valid driving route may leave and re-enter the region.
4. Real-world names/coordinates and synthetic operational parameters must have separate provenance.
5. The supplied 23 facilities are not proof of complete real-world coverage of every hospital within 40 km.
6. Unknown availability stays unknown. Display `NIL` or “Not confirmed”; do not convert it into zero wait or immediate readiness.
7. Positive capacity does not prove that a required specialist or service is available at arrival.
8. Do not invent surgeon identities, trauma certification, live occupancy or provider traffic measurements for named facilities. Generated services and operational values are demonstration scenario data.
9. No stored per-hospital `etaMinutes` constant. ETA is a result for a particular ambulance position, destination, departure time and route snapshot.
10. Equal values remain allowed when justified. No acceptance test should require every hospital ETA to be unique.

## Stage 1 — Diagnose and make timing provenance observable

**Tools:** existing TypeScript/Zod contracts, structured API logging, Vitest, browser network inspection during implementation.

1. Add a development-only recommendation diagnostic report keyed by `caseId` and `recommendationId`.
2. Capture one evaluation timestamp, ambulance lat/lng, position sequence, source generation, assessment version and dataset version.
3. For each candidate, log canonical hospital ID, source coordinates, separate road-access coordinates, selected provider and any resolved graph nodes/segments.
4. Capture straight-line distance, road distance, route duration, route status, staffing/resource readiness, intake delay and final time-to-care.
5. Compare raw values with the rounded UI labels. Identify whether repetition appears in route durations, readiness calculation, output serialization or display formatting.
6. Flag unexpected zero routes for geographically separated points and candidate groups that all map to the same graph endpoint. Treat this as a diagnostic, not a command to force different numbers.
7. Record a reproducible failing case using the selected origin and current source dataset. Do not hard-code the visible result as the expected behaviour.
8. Exclude patient identifiers, API keys and raw clinical notes from routine timing diagnostics.

**Gate:** an implementer can explain the origin of each displayed four-minute value. The report identifies which values are measured/provider-derived, synthetic, unknown or defaults.

## Stage 2 — Create one geographic route snapshot for all candidates

**Tools:** existing `geographicRoutingProvider`, Google Routes adapter, reviewed local graph for offline simulation, bounded asynchronous requests and typed route results.

1. Introduce a shared route-evaluation service called by recommendation generation and map route retrieval. The map must not calculate a second unrelated ETA for the same recommendation.
2. Change Agent 3 to consume completed route results, or make an upstream recommendation service asynchronous. Keep numerical scoring pure where possible.
3. Route from current ambulance lat/lng and position generation to each candidate's reviewed access point. Preserve the hospital's original marker coordinates.
4. Use the existing Google Routes adapter when live routing is selected. It can return road distance, duration and polyline in one response through a field mask. See [Compute Routes documentation](https://developers.google.com/maps/documentation/routes/compute_route_directions).
5. Pass a consistent supported departure-time policy and traffic preference. Traffic configuration affects both route choice and travel time; consult the [official traffic options](https://developers.google.com/maps/documentation/routes/traffic-opt).
6. Do not add synthetic congestion on top of an already traffic-aware live ETA unless explicitly implementing and labelling a hypothetical overlay mode. Default to separate live and synthetic modes.
7. Use a modest configurable concurrency limit, initially four requests, and a bounded evaluation deadline. Record each provider timeout/error without replacing it with four minutes.
8. Validate route duration and distance as finite/nonnegative; reject malformed or inconsistent responses. A zero-distance route requires genuinely coincident access points, not merely a shared nearest graph node.
9. Offline mode must use a reviewed regional graph with meaningful geometry and access connections. A sparse five-hospital graph cannot represent arbitrary 40 km origins/destinations.
10. If offline graph coverage is missing, return `UNAVAILABLE: GRAPH_COVERAGE_MISSING`. Keep the facility visible on the directory but do not rank it as a known reachable destination.
11. Include costs for actual access connectors. Never draw a straight connector across terrain and exclude its time from the estimate.
12. Cache only under a key including origin position or documented spatial bucket, destination access revision, provider/mode, departure-time bucket, graph revision and traffic revision. Respect provider storage/licensing rules.
13. Begin with exact origin/version cache keys for correctness. Introduce spatial bucketing only after measuring its error; do not use a large bucket that conceals pin movement.
14. Return one `routeSnapshotId` used by candidate cards, route polylines, comparison tables and downstream simulation. On source/version mismatch, refetch or show stale state.

**Proposed route result fields**

| Field | Meaning |
|---|---|
| `hospitalId`, `routeId`, `routeSnapshotId` | Stable linkage between candidate and route |
| `origin`, `originSequence`, `sourceGeneration` | Current ambulance origin evidence |
| `destinationAccessPoint`, `accessRevision` | Actual routing target, separate from preserved identity |
| `straightLineDistanceMeters` | Informational geographic distance, not road ETA input |
| `roadDistanceMeters`, `travelSeconds` | Nullable when no route is available |
| `status`, `unavailabilityReason` | AVAILABLE, PENDING, STALE or UNAVAILABLE and why |
| `provider`, `trafficMode`, `calculatedAt` | Provenance and freshness |
| `pathCoordinates`, `graphRevision`, `trafficRevision` | Geometry and reproducible input versions |

**Gate:** a hospital not in the old A–E mapping gets its actual route or an explicit unavailable result. The map and recommendation show the same route duration.

## Stage 3 — Improve hospital operating data before tuning ranking

**Tools:** existing importer, resource/staff/scheduling DTOs, a separate deterministic scenario overlay and contract validation.

### Proposed operational fields

| Group | Fields | Use |
|---|---|---|
| Intake | `intakeServiceSeconds`, `observedAt`, `expiresAt` | Residual receiving process duration, applied once |
| Queue | `queueReadyAt`, waiting cases, staffed service slots | Explicit estimate of when required service becomes usable |
| Specialist | specialty, available team slots, shift interval, `readyAt` | Case-specific availability at arrival |
| Resource | type, total/out-of-service/occupied/reserved/in-use, `readyAt` | Allocatable capacity and future readiness |
| Hours | service, weekly opening intervals, exceptions, timezone | Service availability at predicted arrival |
| Theatre | capabilities, scheduled intervals, turnover, actual state | Real resource conflicts, not hospital-wide generic delay |
| Provenance | synthetic/verified/live, scenario seed, source revision, verification status | Explain what the values represent |

### Implementation steps

1. Separate the immutable facility catalogue from mutable operating state. Seed the latter by `scenarioSeed + hospitalId + serviceCode`, independent of row order.
2. Keep the existing supplied operational values as a baseline if useful, but label them synthetic. Generate richer states in named overlays instead of silently replacing them as “real”.
3. Define coherent profiles such as low-load stabilisation, busy emergency intake, specialist on-call, equipment maintenance, theatre occupied and service closed.
4. Assign profiles through an explicit reviewed scenario configuration. A real hospital's facility type alone is not proof of every speciality or certification.
5. Use illustrative configurable intake durations, for example 60–180 seconds for low load, 180–420 seconds for moderate load and 420–900 seconds for congestion. These are demo design ranges, not empirical hospital benchmarks.
6. Express specialist readiness as timestamps or schedule-derived times. Examples for simulation: already on duty, ready in eight minutes, occupied until a specific procedure ends, or unavailable/unknown. Do not seed every specialist as ready in five minutes.
7. Keep staff and resources consistent: a theatre cannot become ready while its required team remains unavailable; a future release cannot make currently reserved resources free prematurely.
8. Preserve the existing capacity equation. If availability is derived from multiple occupancy states, do not add a second independent “free count” to the table.
9. Model future readiness for the required service only. A patient not requiring surgery should not inherit the operating theatre's delay.
10. Calculate schedules relative to a fixed scenario start time and simulated clock. Avoid hard-coded expired dates and independent `Date.now()` calls that destroy replay consistency.
11. Distinguish a hospital rejecting intake, service closed at arrival, resource unavailable, and merely busy. Use explicit reasons in eligibility, not a random waiting penalty.
12. For an unknown queue, return unknown readiness or a labelled estimate with its assumption. Do not treat lack of information as an advantage in ranking.
13. If a queue model is desired, document it. A simple demo estimate may use cases ahead, mean service duration and effective parallel service slots; validate all units and mark it as a modelled approximation.
14. Do not double-count the same queue in `queueReadyAt`, `resourceReadyAt` and intake service duration. Define each field's responsibility in the contract.
15. Validate the overlay before activation and export a per-hospital explanation of the generated profile and its parameters.

**Gate:** all facilities keep their source identity; readiness varies for traceable operational reasons; the same seed and scenario time reproduce the same state.

## Stage 4 — Correct the time-to-care formula and candidate serialization

Use seconds for durations and timezone-aware timestamps for instants. Select one evaluation time `t0` for the entire batch.

```text
arrivalAt = t0 + travelSeconds

serviceReadyAt = earliest permitted time at which the required service,
                 staff, resources and compatible schedule are jointly usable

startBeforeIntake = max(arrivalAt, serviceReadyAt)
careStartAt = startBeforeIntake + residualIntakeServiceSeconds

waitAfterArrivalSeconds = max(0, serviceReadyAt - arrivalAt)
timeToCareSeconds = careStartAt - t0
```

This simplified formula is suitable only when required resources can be jointly available at the resulting time. If staff and equipment intervals do not overlap, solve for an actual feasible interval; a simple maximum of unrelated readiness timestamps is insufficient.

1. Remove `readyAtSeconds = receivingDelaySeconds`. Receiving work and resource readiness are different quantities.
2. Replace `value || 120` with validated explicit defaults/null handling. A legitimate zero intake delay must remain zero; an unknown delay must remain identified as unknown.
3. Derive `serviceReadyAt` from the requirements for that candidate and care objective. A future availability estimate is not a reservation or guaranteed acceptance.
4. Treat an active procedure as occupied through its actual/estimated completion and turnover. A pending deferral request does not immediately free the theatre.
5. Define any emergency queue-priority policy explicitly; do not assume every emergency bypasses all preparation, staffing or in-progress work.
6. Create one candidate serializer that receives the computed timing object. Populate all A/B/C cards, `priorityCandidates` and `allEvaluations` from it.
7. Return `travelSeconds`, `waitAfterArrivalSeconds`, `intakeSeconds`, `timeToCareSeconds`, readiness timestamp, route snapshot and limiting reason. Do not return readiness zero while scoring a positive wait.
8. Keep status distinct from score: full-care eligible, stabilisation eligible, evidence incomplete and unavailable route. An unavailable candidate has no numeric ranking score.
9. For full care, rank clinically eligible reachable candidates by the configured time-to-care policy. For immediate stabilisation, preserve the agreed proximity/readiness policy and show the objective; do not silently mix full care with stabilisation.
10. Use a deterministic tie-break such as canonical ID after meaningful metrics. Never add noise just to break an honest tie.

### Arithmetic verification examples

The following are invented test fixtures, not claimed road times or clinical facts for named hospitals. Distances illustrate separate route lengths; ETA remains a route result.

| Test facility | Route distance | Travel | Service ready relative to t0 | Residual intake | Post-arrival wait | Time to care |
|---|---:|---:|---:|---:|---:|---:|
| Fixture Alpha | 2.4 km | 360 s | 0 s | 90 s | 0 s | 450 s / 7m 30s |
| Fixture Beta | 7.8 km | 720 s | 1,200 s | 120 s | 480 s | 1,320 s / 22m |
| Fixture Gamma | 13.6 km | 1,080 s | 0 s | 60 s | 0 s | 1,140 s / 19m |
| Fixture Delta | 1.2 km | 180 s | Unknown | 90 s | Unknown | Not confirmed |

Beta is closer than Gamma but begins care later because of readiness. Delta must not win merely because its unknown wait is treated as zero. A separate fixture where travel is zero, readiness is already satisfied and intake is 120 seconds must return 120 seconds—not 240.

**Gate:** arithmetic tests pass and the numbers displayed in cards reconstruct the score exactly without duplicated delays.

## Stage 5 — Add causal traffic and scenario evolution

**Tools:** current simulation service, shared edge-cost function, seeded scenario events, route/readiness revisions and Socket.IO updates.

1. Select live routing or synthetic graph routing per run. Preserve source labels in every route result.
2. In synthetic mode, apply congestion to road segments or corridors, not arbitrary per-hospital ETA multipliers. Shared route sections should experience shared events.
3. Derive edge time from validated length/speed and traffic cost, or from a validated base travel time; use the same convention for ETA and simulated movement.
4. Use a scenario seed and time buckets for bounded variation. Never regenerate hospital waits or traffic with `Math.random()` during rendering or every recommendation request.
5. Add named event types: corridor congestion, closure/reopening, specialist arrival, resource maintenance/release, intake surge, service-hours change and patient requirement update.
6. An event changes specific facts and increments relevant revisions. Unaffected hospitals must not all receive new random states.
7. Simulated clock pause freezes traffic and scheduled scenario evolution. Speed-up advances all related timed processes consistently.
8. As the ambulance moves, recompute remaining route duration from its actual progress, not the original distance from NITK.
9. Debounce non-urgent event bursts; invalidate immediately for hard loss of eligibility or route closure. Make thresholds configurable and observable.
10. Prevent visual rank oscillation from insignificant changes through a documented recommendation stability policy. Hard constraints override any hysteresis.
11. Do not change a confirmed destination automatically when the recommendation order changes. Show a new recommendation and require the existing diversion confirmation/version checks.
12. Store event timeline, seed, revisions and position sequence for replay.

**Gate:** congestion on a candidate's route changes its travel time; a specialist release changes readiness; neither changes unrelated source identity or fabricates capabilities.

## Stage 6 — Implement a bounded evidence-gathering agent loop

**Tools:** existing Agent 1 interpreter, Agent 2 eligibility logic, Agent 3 ranking; typed read-only tools, orchestration state and event-triggered reevaluation. A new vector database is not required for numeric ETA correctness.

### Responsibilities

| Component | Responsibility | Authority boundary |
|---|---|---|
| Agent 1 | Interpret patient observations into proposed care requirements; identify missing facts | Cannot invent facility capacity or confirm clinical requirements itself |
| Agent 2 | Retrieve and validate candidate capability, staff, schedule and resource evidence | Cannot promote unknown data to verified readiness |
| Agent 3 | Obtain route/timing evidence, compare feasible candidates and explain tradeoffs | Does not invent route duration or autonomously commit dispatch/diversion |
| Coordinator | Decide which missing/expired evidence to retrieve next; merge consistent results and trigger reassessment | Read-only evidence gathering, bounded retries and explicit user approvals for state-changing workflows |

### Read-only tool contracts

- `getCaseRequirements(caseId, assessmentVersion)` returns confirmed/proposed status and missing fields.
- `listCandidateHospitals(regionId, capabilityFilters, datasetVersion)` returns canonical identities and evidence status.
- `getHospitalReadiness(hospitalId, requirements, arrivalAt, expectedVersion)` returns feasible readiness, limiting resource and supporting versions.
- `getCandidateRoutes(origin, destinations, departureAt, routingMode)` returns the shared route snapshot and per-destination errors.
- `getScheduleConflicts(hospitalId, resourceNeeds, arrivalWindow)` returns concrete conflicts/alternatives without deferring procedures.
- `getRecommendationChanges(previousId, currentId)` returns factual reason codes and changed metrics for explanation.

### Bounded loop

1. Set the goal to finding an eligible reachable destination for the confirmed care objective, not to finding any three facilities at all costs.
2. Read the current assessment and evidence snapshot. If required patient facts are absent, request review rather than fabricating them.
3. Choose evidence tools based on missing/stale inputs. A hospital whose service is definitively unsupported does not require expensive route calls for that objective.
4. Get routes, then evaluate readiness at predicted arrival. This ordering matters because a service can open/close or a team can become free while the ambulance travels.
5. If a material contradiction or missing freshness condition appears, make one targeted refresh round. Suggested initial ceiling: two evidence rounds per recommendation, with a configurable overall deadline.
6. The LLM/coordinator may propose tool calls and explanatory summaries. Validate tool arguments and enforce allowed operations server-side; structured calculations remain authoritative.
7. If a pending candidate could alter the winner, mark the result provisional instead of presenting the partial batch as complete. Prefer explicit no-confirmed-result to invented certainty.
8. Stop on sufficient evidence, exhausted budget, hard missing input or provider failure. Record a stable stop reason and a safe fallback mode.
9. Generate a short explanation from structured result fields: selected objective, travel, readiness bottleneck, rejected alternatives and evidence age.
10. On new traffic/staff/patient data, invalidate only dependent evidence and start a bounded reassessment. Do not call the LLM for every telemetry frame.
11. Record observable audit facts—tool name, validated inputs, source IDs, timestamps, result status and decision reason. Do not store or expose hidden chain-of-thought.
12. Surface `LLM_ASSISTED`, `RULES_FALLBACK`, `WAITING_FOR_DATA` and `PROVISIONAL` modes honestly. Fixed confidence numbers are not calibrated probabilities.

**Gate:** a demonstration can show which evidence was requested, why an assessment was refreshed and exactly which changed fact altered a recommendation. All outputs remain valid if the LLM is temporarily unavailable.

## Stage 7 — Make the UI explain variation accurately

**Tools:** existing React recommendation panel/map/table, shared formatting helpers and typed timing DTOs.

1. Show distinct labels: **Road distance**, **Travel ETA**, **Wait after arrival**, **Intake**, and **Estimated care start**.
2. Display short synthetic durations as `7m 30s` where useful; show live estimates as rounded approximate values without implying second-level predictive accuracy.
3. Keep underlying seconds unrounded for sorting and tests. Include details explaining why two rounded labels may both read four minutes.
4. Show source badges such as Google traffic-aware, synthetic road scenario, stale route and no verified route.
5. Provide a timing breakdown tooltip or detail panel with route snapshot, position timestamp, readiness source and limiting requirement.
6. Add a “Why this changed” summary: for example, “Team ready time moved from +20m to +8m; estimated care start reduced by 10m.” Compute the claimed difference from snapshots.
7. Show comparisons such as “Closer, but theatre unavailable until 10:35” instead of unexplained “AI score 97”.
8. On recalculation, retain a visibly stale prior result only if appropriate; never replace missing values temporarily with four minutes.
9. Add a small activity log showing evidence retrieval and completion states. Do not animate invented agent actions that did not occur.
10. Show synthetic operating-state labels prominently even when real names and real map coordinates are used.
11. In the hospital dashboard, expose permitted staff/queue/resource edits and show their effect after acknowledgement/versioned updates. Do not mutate data just by inspecting a hospital.
12. Keep confirmed destination, recommended destination and stabilisation alternatives visibly distinct.

**Gate:** a reviewer can explain a candidate's total time using the displayed breakdown, including genuine equal estimates and missing evidence.

## Stage 8 — Regression tests and demonstration evidence

No tests are executed for this documentation deliverable. Antigravity must add and run the following during implementation.

| Test | Setup | Required result |
|---|---|---|
| ETA-01 | Distinct hospital coordinates, same former nearest graph node | Actual access routes or explicit no-coverage; no fabricated zero travel |
| ETA-02 | Zero travel, ready now, 120-second intake | Total 120 seconds, not 240 |
| ETA-03 | Travel 720s, readiness +1200s, intake 120s | Wait 480s; total 1320s |
| ETA-04 | Valid zero intake | Zero remains zero; `|| 120` cannot restore a delay |
| ETA-05 | Missing staff/resource/queue evidence | Explicit uncertainty; candidate cannot win as zero wait |
| ETA-06 | Provider unavailable or malformed response | Typed failure; no four-minute or 9999-second ranked fallback |
| ETA-07 | Valid route duration exceeds 9999s | Still a valid route if policy permits; unavailable status is separate |
| ETA-08 | UI map and recommendation share a snapshot | Same road distance, duration and destination access revision |
| ETA-09 | Distinct durations both round to four minutes | Honest tied display/detail; no artificial separation |
| DATA-01 | Change operational scenario seed | Hospital identity checksum unchanged |
| DATA-02 | Replay same seed, time and event sequence | Same operating state, routes and ranking under fixed simulated inputs |
| EVENT-01 | Congestion affects a corridor used by two candidates | Both affected routes update coherently; unrelated routes remain unchanged |
| EVENT-02 | Specialist becomes ready sooner | Readiness/time-to-care changes; travel time does not |
| EVENT-03 | Hospital hours close before predicted arrival | Candidate feasibility changes with explanation |
| EVENT-04 | Confirmed diversion/ambulance movement | Remaining route uses current position and destination generation |
| AGENT-01 | Missing route evidence and fresh clinical evidence | Coordinator retrieves routes without unnecessarily reinterpreting patient data |
| AGENT-02 | LLM/provider timeout | Bounded fallback, visible mode and no invented facts |
| AGENT-03 | Late result for older assessment/position | Discarded or labelled stale; cannot overwrite current recommendation |
| AGENT-04 | Missing candidate result could change winner | Provisional result, not false complete recommendation |
| AUTH-01 | Recommendation order changes | No automatic dispatch, ticket approval or destination mutation |

### Demonstration script for presentation

1. Load the preserved NITK catalogue and a documented synthetic operating scenario.
2. Set an origin on a supported road; show candidate-specific road distances and ETAs from that point.
3. Enter patient observations and confirm the proposed requirements. Show the evidence-gathering tools that actually ran.
4. Compare a closer busy facility with a farther ready facility using an explicit time breakdown. Use labelled fixture conditions; do not invent operational claims about named hospitals.
5. Apply a corridor congestion event and show affected route metrics and reranking.
6. Change a required team's readiness and show the operational contribution changing independently of travel.
7. Demonstrate a genuine tie or unknown input. Explain why the system preserves it instead of forcing a unique answer.
8. Demonstrate a failed provider call and the visible fallback/provisional state.
9. Keep the final dispatch/diversion decision under the authorised user workflow.

### Required implementation report

- Root cause captured for the repeated four-minute symptom, with before/after candidate snapshots.
- Modified file list and contract changes, including consumers migrated to the shared route snapshot.
- Preserved identity checksum and scenario-overlay provenance.
- Test results with exact commands; distinguish mocked providers, real provider checks and browser checks.
- A saved reproducible scenario and event trace showing causal recommendation changes.
- Provider/mode limitations, missing coverage and unverified hospital operating data.

## File-by-file implementation map

| File/area | Instruction |
|---|---|
| `packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json` | Preserve identities and coordinates; do not assign fixed travel times here |
| `packages/scenario-fixtures/src/importer.ts` | Separate source import from operating overlays; remove near-uniform intake as an unexplained universal default |
| `packages/contracts/src/hospital.ts`, `resources.ts`, `scheduling.ts` | Define nullable, versioned readiness facts with provenance |
| Recommendation/route contracts | Add route status, snapshot identity, timing breakdown and evaluation versions |
| `apps/api/src/db/store.ts` | Read one consistent operating snapshot; expose scenario changes and source versions |
| `apps/api/src/modules/routing/index.ts`, `google-routes.ts` | Candidate-specific geographic routing and honest fallback status |
| `apps/api/src/modules/cases/routes.ts` | Await shared route/readiness evaluation; reject stale results before saving recommendation |
| `apps/api/src/modules/agents/agent1.ts`, `interpreter.ts` | Validated proposed requirements, missing evidence and truthful fallback mode |
| `apps/api/src/modules/agents/agent2.ts` | Readiness at arrival under the confirmed care objective |
| `apps/api/src/modules/agents/agent3.ts` | Pure timing/ranking calculation from evidence; remove duplicated intake and magic unavailable duration |
| Simulation service | One clock, one traffic model and consistent movement/ETA inputs |
| `apps/web/src/components/RecommendationPanel.tsx` | Display the authoritative timing breakdown and changed-evidence explanation |
| `LiveMap.tsx` and hospital views | Use route/operating snapshots without local ETA invention |
| Existing API/web test suites | Extend meaningful assertions; retire assumptions that every example must follow the original five-hospital ranking |

## Completion criteria

- No forced unique ETAs, hard-coded per-hospital travel minutes or random display-only delays.
- Travel depends on current origin, valid destination access, actual route and selected traffic mode.
- Hospital state contributes through relevant readiness and intake facts, without double-counting.
- All views agree on one evaluated snapshot and show uncertainty/provenance.
- Meaningful events cause explainable reassessment; unchanged replay inputs remain reproducible.
- Agent activity logs reflect real tool operations and decision changes rather than decorative claims.
- Supplied names, IDs and coordinates are preserved; synthetic operating data stays clearly labelled.

Only this Markdown handoff is created in the current task. Implementing it requires a subsequent code-change instruction.
