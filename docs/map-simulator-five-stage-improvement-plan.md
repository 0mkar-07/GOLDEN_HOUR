# GoldenHour: Map and Simulator Improvement Plan

**Prepared:** 24 October 2026  
**Delivery:** Documentation only; no application-code changes.  
**Execution:** Five stages, implemented one by one in the order below.  
**Scope:** Geographic map, routing presentation, GPS tracking, deterministic simulator, scenario controls, synchronization and verification.

## How to use this plan

Complete a stage and its acceptance checks before starting the next stage. Each stage describes a proposed future change, its purpose, affected files, tests and completion criteria. Do not interpret this document as evidence that the changes already exist.

This plan supplements `live-map-ui-upgrade-plan.md`. It is based on the current map/simulation source rather than assuming the earlier proposal was fully implemented. The RAG/vector-database proposal remains separate: embeddings should not drive vehicle movement, routing geometry or live resource availability.

### Intended result

- A geographic map showing actual streets, valid hospital locations and provider-generated routes.
- A simulation that advances consistently, follows the correct directed route, and remains synchronized across views.
- Clear separation between device GPS, simulated positions, real route estimates and injected simulation traffic.
- Useful play/pause/step/reset controls, reproducible scenarios and a readable event timeline.
- Correct destination changes without teleporting, stale route overwrites or accidental clinical lifecycle actions.
- A polished light teal/white interface consistent with the rest of GoldenHour.

## Current implementation: findings to address

Source inspection only; the application and test suite were not run for this document.

| Area | Observed behavior | Improvement needed |
|---|---|---|
| `LiveMap.tsx` | Custom SVG projection and grid, not a loaded Google basemap | Real geographic map renderer with an explicitly labelled schematic fallback |
| Map coordinates | Missing latitude/longitude can be replaced with arithmetic based on `x/y` or fixed defaults | Reject or visibly omit invalid geographic locations; never invent real coordinates |
| Map viewport | Bounds recalculate as ambulance coordinates change; follow resets pan | Stable map instance and viewport with explicit follow/recenter actions |
| `MapPanel.tsx` | Simulation fallback passes a small hardcoded graph with an empty edge array | Consume the same authoritative graph as the simulator |
| Route rendering | Lines may be drawn based on geometry without checking unavailable status | Render only valid routes and display unavailable/stale states explicitly |
| Geographic fallback router | Connects arbitrary endpoints to nearest demo nodes without a coverage gate | Restrict simulated routing to the configured demo area and valid connectors |
| `Simulation3DView.tsx` | “3D” is SVG with CSS perspective; active route line points to fixed coordinates | Label the existing view as isometric and render the actual active path |
| Simulation clock | Each timer callback assumes 500 ms elapsed | Fixed-step integration driven by a monotonic clock with a bounded catch-up policy |
| Edge movement | One update can advance only one edge; residual distance uses the original edge speed | Consume remaining time across every traversed edge and its own speed |
| Traversal direction | Interpolation uses stored edge `from/to` rather than route traversal orientation | Derive directed segments from the ordered route path |
| Destination changes | Existing `activeRoute` is reused without checking destination version | Invalidate/replan on accepted destination changes |
| Replanning | Starts at the nearest node with progress reset | Preserve position along the current segment to avoid jumps |
| Unit identity | Simulator state uses `amb-101`; GPS submission uses `amb-104` | One explicit unit assignment in state, events and commands |
| Units | Simulation speed is km/h; browser GPS speed is submitted without that conversion | One canonical speed unit and explicit display conversion |
| Reset | Clears movement progress and origin but not the complete scenario state | Define separate rewind and scenario-reset behavior |
| Source ownership | Simulation and GPS write the same position object | A server-enforced exclusive position source per unit |
| Events | Raw broadcasts and enveloped events coexist; simulation emits globally | Typed, authorized, sequenced updates with reconnect recovery |
| Control validation | Some invalid payloads silently use defaults | Structured validation errors; no unintended scenario injection |
| Scenario UI | Traffic action selects `edge-1`, while scenario step checks `edge-3` | Derive active scenario state from actual events and overrides |
| Failed state fetch | Failed load can leave the simulator showing a perpetual loading message | Explicit error, retry and disconnected states |

### Rules that apply throughout all five stages

1. The server owns movement and simulation time. Renderers only display state and interpolate between valid updates.
2. Map selection inspects a hospital; it does not dispatch, accept, reserve equipment or divert.
3. A route reaching its final point is a simulation event. Clinical arrival remains an explicit authorized workflow action unless a clearly isolated scripted demo enables automatic arrival.
4. New recommendations do not automatically replace the confirmed destination.
5. Live GPS and simulation cannot control the same unit simultaneously.
6. Failure must not produce plausible-looking invented geography, live labels or ETA values.
7. Keep hospital resource transactions, clinician confirmation and allocation-release rules intact.
8. Use a single-unit implementation first. A multi-unit display requires per-unit server state and access rules, not duplicated markers over one global position.

## Stage 1 - Unify state, contracts, identity and source ownership

**Goal:** Give the map and simulator one consistent interpretation of positions, routes, time and commands.  
**Dependency:** None; this is the foundation for all later stages.  
**Result:** Typed shared contracts, a clear mode/state model and validated controls.

### 1.1 Define the operating modes

| Mode | Position producer | Route source | Allowed simulation controls |
|---|---|---|---|
| Live tracking | Assigned authorized GPS device/session | Configured external routing provider | None for the live unit |
| Simulation | Server simulation engine | Versioned owned/demo road graph | Play, pause, step, speed, scenario controls |
| Replay | Recorded simulation snapshots/events | Recorded owned simulation graph/routes | Playback and read-only seeking |

The view selection is independent: Geographic, Schematic, and Isometric describe presentation. They must not silently change the position producer. Opening a simulator tab must not overwrite a live GPS position.

### 1.2 Extend shared contracts

Review `packages/contracts/src/case.ts`, `routing.ts` and `simulation.ts`. Add or consolidate these concepts rather than creating duplicate frontend-only interfaces:

- **Position:** `ambulanceId`, `source`, geographic coordinates when valid, simulation coordinates where applicable, `speedMps`, optional `headingDegrees`, optional accuracy, observation time, server receipt time, sequence and source generation.
- **Route:** route ID/version, case/unit ID, destination ID/version, origin position sequence, provider, traffic mode, geometry, distance, duration, calculation time, status and failure reason.
- **Simulation run:** unique run ID, graph/scenario versions, seed, state, clock, playback speed, run version, selected case/unit, source mode and latest event sequence.
- **Directed segment:** edge ID, traversal start/end nodes, length, remaining distance, current speed and optional intermediate geometry.
- **Realtime envelope:** event ID/type, run ID where applicable, unit/case identity, entity version, sequence, occurrence time and typed payload.
- **Control request:** command ID/idempotency key, target run, expected run version, action and validated parameters.

Use a discriminated route status: available routes have valid geometry/duration; unavailable routes have a reason and no misleading ETA. Do not preserve `9999` seconds as if it were an estimate.

Browser geolocation reports speed in meters per second and may return no speed value. Keep it nullable when unknown; convert to km/h only for display (`m/s × 3.6`). See [Geolocation speed documentation](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/speed).

Use heading degrees clockwise from north, normalized to `[0, 360)`. Unknown heading is different from north. Define one deliberate conversion for SVG and isometric scene coordinates.

### 1.3 Establish one authoritative state path

1. Replace scattered hardcoded unit IDs with an assigned unit from the authenticated session/run context.
2. Supply the full road graph from the simulation snapshot; remove the empty-edge graph embedded in `MapPanel`.
3. Add a server source-switch operation with an expected version. Starting GPS pauses simulation for that unit; stopping GPS marks tracking stopped until another source is explicitly selected.
4. Clear stale source buffers and invalidate incompatible routes when the source generation changes.
5. Make snapshots atomic enough to pair run, position, graph and route versions from the same state transition.
6. Keep transport serialization separate from domain state, and derive freshness from timestamps rather than a permanently animated “live” icon.

### 1.4 Fix control semantics and validation

- `play`: validate speed, ignore duplicate commands safely and create at most one ticker.
- `pause`: freeze authoritative simulation time and position; report success only after the server applies it.
- `step`: accept a finite positive interval up to an explicit limit; require a paused run.
- `speed`: validate finite values in the supported range; return the applied value.
- `traffic`: validate that the selected edge exists and the multiplier is allowed.
- `hospital-surge`: validate hospital membership and return an error if the target does not exist.
- `reset`: require the expected run version and distinguish rewind from scenario reset.
- Invalid payloads return a structured 400 response; stale state returns a conflict; unauthorized actions return an authorization error.

Audit route registration and add explicit authentication to simulation-state access. The current state handler does not itself attach the auth hooks used by the control scope; do not rely on its comment to establish access control. Scope socket subscriptions and emissions to the authorized run/case/unit.

### 1.5 Files likely to change later

- `packages/contracts/src/case.ts`, `routing.ts`, `simulation.ts`, `index.ts`.
- `apps/api/src/modules/simulation/routes.ts` and `service.ts`.
- `apps/api/src/modules/cases/routes.ts`, `modules/realtime/index.ts`, `db/store.ts`.
- `apps/web/src/lib/api-client.ts`, `lib/socket.ts`, `components/MapPanel.tsx`.

### 1.6 Acceptance checks

- [ ] Map and simulator receive the same unit identity and graph version.
- [ ] Speed and heading have consistent units and unknown states.
- [ ] Invalid commands cannot silently execute default actions.
- [ ] Duplicate play requests cannot create multiple tickers.
- [ ] GPS and simulation cannot write to the same unit concurrently.
- [ ] Unauthorized clients cannot read precise position streams or control runs.

**Stage handoff:** Record the finalized contracts, command/state transition table and source-ownership rules. Begin Stage 2 only after these checks pass.

## Stage 2 - Correct the simulation engine and route lifecycle

**Goal:** Make movement correct, repeatable and independent of rendering speed.  
**Dependency:** Stage 1 shared contracts and source ownership.  
**Result:** A deterministic engine that handles multiple edges, traffic, pause/step, diversion and completion.

### 2.1 Separate the engine from service side effects

Split the current service into a pure movement/state-transition module and an orchestration service. The engine receives state, elapsed simulation time, graph and scheduled events; it returns new state plus domain events. The orchestration layer handles timers, authorization, storage and broadcasting.

Keep the same simulation algorithm for play and step. Do not implement a separate fast-forward shortcut that behaves differently from ordinary movement.

### 2.2 Correct clock advancement

1. Measure wall elapsed time with a monotonic clock.
2. Multiply by the chosen simulation speed and place the result in a time accumulator.
3. Consume fixed integration steps, initially around 50-100 ms of simulated time, with exact event boundaries where necessary.
4. Bound catch-up work after long stalls. For large delays, pause and report the interruption or apply a documented catch-up cap; do not silently teleport.
5. Broadcast snapshots at a separate cadence, initially around 2-5 Hz. Renderer frames must not create extra simulation ticks.
6. Keep simulation elapsed time separate from wall timestamps used for freshness and logs.

Record commands against simulation time and sequence. Replaying the same initial state and command sequence should produce the same domain state, excluding wall-clock timestamps and transport IDs.

### 2.3 Traverse directed segments correctly

For every update, consume **remaining time**, not one distance increment calculated with the first edge's speed:

```text
remainingTime = requested simulation delta
while remainingTime > 0 and route has an unfinished segment:
  resolve current segment in actual route direction
  compute current speed from its base travel model and overrides
  compute time needed to finish that segment
  advance by the smaller of remainingTime and segment completion time
  subtract consumed time
  if segment ends, move to the next segment and continue
emit final position and any route-completion event
```

- Use ordered path nodes to orient traversal, including reverse travel on a two-way edge.
- Add an explicit directed/one-way model where required. Do not infer one-way restrictions from how the renderer draws an edge.
- Handle zero remaining distance, malformed graph references, disconnected routes and terminal segments without infinite loops.
- Use one consistent base duration model for both route ETA and movement. Resolve conflicts between `distanceMeters`, `speedKmh` and `baseTravelSeconds` during graph validation.
- Interpolate along segment geometry by cumulative distance; straight interpolation is acceptable only for deliberately straight synthetic segments.
- Preserve floating-point position internally and round only display values. Avoid quantization jitter from rounding every engine update.

### 2.4 Replanning and diversion without jumps

1. Watch accepted destination changes by case/unit and destination version.
2. Replan when the confirmed destination changes, the current route becomes invalid, or an allowed traffic event materially changes the remaining path.
3. Represent the current position as progress on a directed edge, not merely the nearest node.
4. Build legal connectors from that current position to the remaining network. Respect direction and explicitly define whether a turnaround is allowed.
5. Preserve the current position when a new route is adopted. Increment route version and emit a route-change reason.
6. A receiving-delay change can change hospital ranking without changing the road path to the same destination. Recompute the appropriate layer rather than resetting movement unnecessarily.
7. Discard asynchronous results from older destination/position generations.

### 2.5 Completion and reset behavior

- Emit `ROUTE_COMPLETED` exactly once, set speed to zero and stop advancing beyond the endpoint.
- Treat proximity to a hospital as informational. Keep operational arrival explicit by default.
- Allow automatic arrival only in an isolated scripted demo setting, with a visible label and idempotent domain transition.
- **Rewind run:** reset position, simulated time, route progress and run-local events to the selected scenario baseline.
- **Reset scenario:** additionally restore run-local traffic, receiving delays and scripted scenario state.
- Never reset shared live hospital inventory, unrelated cases or real GPS state as a side effect of replay/rewind.
- Revalidate the route against the current confirmed destination on resume. Do not default to Hospital A when no destination exists; show “Awaiting destination” unless the run explicitly uses a standalone demo route.

### 2.6 Tests and acceptance checks

- [ ] One large step and equivalent small steps produce equal simulated progress within a documented numeric tolerance.
- [ ] A 60-second step can cross multiple edges with different speeds correctly.
- [ ] Reverse traversal moves in the correct direction and heading.
- [ ] Pause freezes state; step works only while paused; resume preserves progress.
- [ ] Congestion affects both movement and remaining ETA consistently.
- [ ] Accepted diversion changes the route without a position jump.
- [ ] Missing/no-path destinations produce an unavailable state, not a route to Hospital A.
- [ ] Completion fires once; repeated ticks do not repeatedly call arrival.
- [ ] Scenario reset restores its baseline without changing unrelated operational state.

**Stage handoff:** Demonstrate engine correctness using deterministic tests and a simple schematic view. Visual polish is not a substitute for these checks.

## Stage 3 - Build the actual geographic map and reliable tracking

**Goal:** Replace the SVG grid as the primary geographic view and present route/GPS information accurately.  
**Dependency:** Stage 1 contracts and Stage 2 route/state behavior.  
**Result:** A real basemap, accurate overlays, stable camera controls and transparent failure states.

### 3.1 Integrate a real map renderer

Use Google Maps JavaScript API as the default because a Google Routes adapter already exists. Keep the current SVG renderer as a named schematic view, not as “Live Geographic Map”.

Implementation sequence:

1. Add a single lazy-loading SDK boundary that reports loading, ready and failed states.
2. Initialize one map instance per mounted geographic view; update overlays without recreating the map on every position change.
3. Use validated geographic coordinates for hospital and vehicle markers. Omit invalid markers with a visible list warning instead of substituting New York defaults.
4. Use a JavaScript map ID and advanced markers if that marker approach is selected. Google documents billing, API enablement and map-ID prerequisites in [Advanced Marker setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start).
5. Create/update/delete marker and polyline objects by stable identity; clean up listeners on unmount.
6. Keep provider branding and attribution visible, including beneath mobile controls.

Use separate restricted browser-map and server-route credentials. Supply browser build variables before the Vite build and keep backend secrets out of `VITE_` variables. The precise environment names should be reconciled with current configuration during implementation.

### 3.2 Route overlays and information

- Render only `AVAILABLE` routes with validated geometry.
- Draw the confirmed destination route prominently; display recommended A and backups B/C as separate roles when they differ.
- Show selected hospital details without changing the confirmed destination.
- Include distance, drive time, receiving delay, total time-to-care, route source and calculation age.
- Do not label all Google results as “Live Traffic” solely from the provider name; use the response/request traffic mode and freshness.
- Keep stale previous routes visibly stale during refresh. Do not silently display them as current.
- Restrict demo fallback routing to a configured coverage region and valid graph connectors. Outside that region, return route unavailable.
- Do not add straight origin/destination connectors to a demo graph and present them as verified roads.

Google Routes results displayed on a map must be shown on a Google map. Review current storage/attribution requirements before persisting provider geometry or exposing it in replay. Keep the standalone schematic/isometric simulator on owned synthetic graph data. See [Routes API policies](https://developers.google.com/maps/documentation/routes/policies).

### 3.3 Camera and interaction behavior

| Action | Expected behavior |
|---|---|
| Initial valid snapshot | Fit relevant hospitals, vehicle and selected route once |
| Follow vehicle | Keep the vehicle comfortably in view without repeatedly fitting every hospital |
| Manual pan/zoom | Suspend follow; preserve the user's viewport |
| Recenter | Return to the selected vehicle and re-enable follow |
| Show all facilities | Explicitly fit the facility set |
| Select hospital | Synchronize marker and list selection; open details |
| Switch map/schematic view | Preserve selection and source mode; no new simulation producer |

Use touch and keyboard controls, labelled buttons and an accessible hospital/route list. Keep mobile controls from covering the marker, primary action or provider attribution.

### 3.4 Reliable GPS and realtime behavior

1. Bind GPS to the assigned unit, not a hardcoded ambulance ID.
2. Require an explicit start-sharing action; handle unsupported geolocation, denied permission and stopped/background browser sessions.
3. Transmit original observation timestamps, available accuracy and nullable speed/heading. Throttle updates and reject older observations server-side.
4. Use the source generation and sequence to reject late data after mode changes.
5. Stop the watch and clear its state on logout, role change, source change and unmount. Distinguish successful sharing from merely registering a watch.
6. Define freshness states, initially fresh up to 15 seconds and stale after that, subject to project settings. Use elapsed wall time, not whether the component recently re-rendered.
7. Buffer accepted updates briefly for visual interpolation. Stop at the last received position when stale; do not invent continuing movement.
8. On reconnect, retrieve a fresh authorized snapshot and reconcile subsequent events by sequence.

Route refreshes must be independent of every GPS tick. Start with a configurable interval near 30 seconds, plus destination changes or sustained off-route movement. Debounce jitter, coalesce duplicate requests, limit provider concurrency and discard old results. Thresholds should account for GPS accuracy and be tested, not treated as fixed clinical constants.

### 3.5 Suggested files and checks

Review `LiveMap.tsx`, `MapPanel.tsx`, `RoadNetworkMap.tsx`, `AmbulancePage.tsx`, `api-client.ts`, routing providers, `google-routes.ts`, case routes and realtime code. Extract a shared tracking hook/store only if it removes duplicated behavior.

- [ ] Actual streets and facility positions are visible with a valid restricted key.
- [ ] Missing/invalid keys leave the hospital list and schematic demo usable.
- [ ] Manual camera movement persists across updates.
- [ ] Invalid coordinates are not fabricated or silently plotted.
- [ ] Unavailable routes are not drawn as successful paths.
- [ ] GPS pause, denial, staleness and source changes are represented correctly.
- [ ] Both map and simulator consume consistent run/unit state.
- [ ] External route requests do not scale with every rendering frame or GPS event.

**Stage handoff:** Complete a restricted-key smoke test and the no-key/offline walkthrough before starting the simulator presentation upgrade.

## Stage 4 - Improve simulator workspace, scenarios and replay

**Goal:** Turn the simulator into a clear demonstration and investigation tool.  
**Dependency:** Correct engine from Stage 2 and integrated state/rendering from Stage 3.  
**Result:** Usable controls, clear scenarios, reliable replay and optional genuine 3D visualization.

### 4.1 Simulator workspace layout

```text
Simulation | Run ID | Scenario | Paused/Running | Source status
----------------------------------------------------------------
Play/Pause | Step +5s | Speed | Rewind | Reset scenario
----------------------------------------------------------------
Map / Schematic / Isometric view       | Selected unit and case
                                      | Confirmed destination
Actual active route and progress      | Remaining drive time
                                      | Distance / speed / freshness
----------------------------------------------------------------
Scenario controls                     | Event timeline
Traffic / Road closure / Intake delay | Timestamp, action, effect
----------------------------------------------------------------
Comparison: baseline versus current travel/time-to-care
```

Use white surfaces, teal primary controls and restrained borders. Reserve warning colors for meaningful stale/failed/congested states. Remove decorative pulses and glows that obscure the route. Keep compact status labels readable at mobile widths.

### 4.2 Controls and honest naming

- Rename the current CSS-tilted view to **Isometric schematic** until genuine 3D exists.
- Show the actual path segments and actual destination instead of a line ending at fixed `[350, 150]` coordinates.
- Disable step during play and controls during conflicting pending commands.
- Display server-acknowledged speed; roll back optimistic UI if a command fails.
- Show network and load errors with Retry rather than an endless spinner.
- Make rewind/reset scope explicit before applying them, because a full scenario reset changes more than position.
- Use accessible control names, visible focus and reduced-motion behavior. Keep the full simulation operable through the 2D view.

### 4.3 Scenario model

Replace hardcoded action buttons with versioned scenario definitions containing:

- Scenario ID/version, name, description, graph version and seed.
- Starting unit position, optional case fixture and configured destination.
- Ordered events with simulation timestamp, event type, target ID and parameters.
- Expected observable outcome, such as increased remaining travel time or a new unconfirmed recommendation.
- Reset policy and allowed lifecycle automation settings.

Start with these scenarios:

| Scenario | Injected change | Expected observation |
|---|---|---|
| Normal transfer | None | Stable travel and one route completion |
| Traffic slowdown | Multiplier on a selected route edge | Movement slows and ETA changes consistently |
| Road closure | Explicit closed-edge state | Legal alternate route or no-route state |
| Hospital intake surge | Receiving delay on chosen facility | Time-to-care changes; confirmed destination is not silently replaced |
| Approved diversion | Authorized destination change | Route switches without teleporting |
| GPS interruption | Controlled test feed stops | Stale indicator, no fabricated movement |
| Reconnect | Client loses/rejoins transport | Snapshot restores current state without duplication |

Use a separate closure flag rather than an infinite traffic multiplier. Synthetic patient-change scenarios must remain clearly synthetic and still require the existing clinician confirmation workflow. Do not add new medical rules as part of map improvements.

Correct text such as “+350%” when the actual factor is 3.5x; show an unambiguous multiplier or percentage with a consistent definition.

### 4.4 Timeline, replay and comparisons

1. Record immutable run events with simulation time, ordering, actor, affected entity and command ID.
2. Save checkpoints containing engine state, graph/scenario versions and position/route progress.
3. Reconstruct a replay from a checkpoint plus ordered events. Replay is read-only and must not re-send dispatch, arrival or allocation commands.
4. Allow timeline seeking only in replay or a paused isolated simulation. Rewind to an earlier checkpoint rather than reversing live operational mutations.
5. Pin external inputs or use owned deterministic fixtures for reproducible runs. Fresh Google traffic responses cannot guarantee repeatable replay.
6. Show baseline and scenario drive time, receiving delay and time-to-care separately. State which inputs changed.
7. Export owned scenario/event data as JSON for debugging; omit patient identifiers and provider content that cannot be retained/exported.

### 4.5 Optional genuine 3D renderer

Only after the core simulator works, decide whether actual 3D adds value. The repository includes Three.js/React Three Fiber dependencies, but installed dependencies do not mean the current view uses them.

If selected, implement a lazy-loaded scene using the same directed graph/state: roads from graph geometry, simple hospital models, vehicle orientation from canonical heading, orbit/follow controls and context-loss handling. Keep animation cosmetic; the server engine remains authoritative. Retain a complete 2D fallback and benchmark on the intended laptop/mobile hardware.

Do not spend this stage on elaborate city assets before scenarios, route correctness and controls are complete. Genuine 3D is optional; accurate simulation is required.

### 4.6 Acceptance checks

- [ ] Scenario selection, controls and progress are understandable without reading source code.
- [ ] Current route/destination replaces the hardcoded destination line.
- [ ] Traffic controls and displayed scenario state refer to the same actual edge/events.
- [ ] Replay never mutates live cases, inventory or device GPS state.
- [ ] The same scenario/seed/event sequence reproduces the same simulated outcome.
- [ ] Baseline comparison distinguishes travel delay from hospital receiving delay.
- [ ] All controls work in 2D, with keyboard access and explicit errors.
- [ ] Isometric SVG is not labelled as a genuine 3D engine.

**Stage handoff:** Record a repeatable normal-transfer, traffic and diversion walkthrough with the timeline visible.

## Stage 5 - Verify integration, performance and release readiness

**Goal:** Prove the map and simulator stay correct through failures and repeated use.  
**Dependency:** Stages 1-4 complete.  
**Result:** Test evidence, performance measurements, configuration guide and a controlled rollout.

### 5.1 Automated verification matrix

| Layer | Required tests |
|---|---|
| Contracts | Coordinates, units, nullable heading/speed, unavailable routes, invalid commands |
| Engine | Multi-edge traversal, reverse direction, closure/no-path, pause/resume, fixed-step equivalence, terminal behavior |
| Route lifecycle | Destination version change, mid-edge replan, outdated async result, ETA/movement consistency |
| Source ownership | GPS/simulation exclusion, mode changes, old-generation event rejection |
| Authorization | Unauthorized control/read, unrelated hospital/unit subscribers, role-change cleanup |
| Transport | Duplicates, out-of-order events, disconnect/reconnect, snapshot reconciliation |
| Frontend | Camera persistence, route selection, loading/error/stale states, fallback renderer, cleanup |
| Scenarios | Idempotent commands, reset isolation, replay determinism, no operational writes during replay |
| Clinical/resource regression | Confirmation, reservation, diversion release, explicit arrival, handover and release |

Extend existing suites including `apps/api/test/simulation-3d.test.ts`, `geographic-routing-api.test.ts`, routing/lifecycle tests, `apps/web/src/test/Simulation3DView.test.tsx` and `LiveMap.test.tsx`. Rename/add suites to reflect actual renderer behavior if appropriate.

Use fake clocks and owned route fixtures for engine tests. Mock paid routing APIs in ordinary CI; perform a separate small manual provider smoke test. Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Record failures and actual results; do not copy earlier README test counts as fresh evidence.

### 5.2 Manual acceptance walkthrough

1. Open the app with no map key: verify configuration messaging and usable schematic/list fallback.
2. Open with a valid key: verify real streets, provider attribution and approved facility positions.
3. Select a case/unit and destination; confirm selection does not reserve equipment.
4. Start, pause and step the simulator; compare the map and simulator state.
5. Change speed, cross multiple edges and inject a slowdown.
6. Divert through the authorized workflow and verify a continuous position with a new route.
7. Reach the endpoint; verify exactly-once completion and the configured explicit-arrival behavior.
8. Rewind/reset the isolated scenario and verify unrelated operational state remains intact.
9. Switch the assigned unit to GPS, stop updates and verify staleness; ensure the simulation cannot overwrite it.
10. Reconnect a client, switch roles and inspect state/authorization cleanup.
11. Replay the run and verify no operational mutations occur.
12. Repeat at 390, 768, 1280 and 1440 px, with keyboard and reduced motion.

### 5.3 Performance and reliability targets

These are initial engineering targets to measure on named hardware, not promises:

- Stable map instance and event subscription counts after at least 20 tab switches/mount cycles.
- Smooth visual interpolation targeting 60 fps on a reference desktop and at least 30 fps on the chosen constrained device.
- Position updates visible within approximately one second on a healthy local/demo connection.
- No unbounded event, replay or marker arrays during a 30-minute simulation.
- Bounded external route request rates, with metrics for calls, errors, latency and stale responses.
- Engine advancement independent of whether a browser tab is hidden or a renderer is mounted.
- Explicit graceful behavior after server restart. Persist a checkpoint if resumption is required; otherwise show that the volatile run was interrupted rather than pretending it continued.

For multi-process deployment, choose one run owner/leader or a lease-backed scheduler. Multiple API replicas must not independently tick the same run. Keep the first release single-process if this coordination is not implemented, and document the limitation.

### 5.4 Configuration and release sequence

1. Document separate browser map/server route key references, enabled services, map ID, allowed domains and billing quotas. Never place actual secrets in Markdown.
2. Document GPS permissions, authorized unit assignment, demo coverage area, graph versions and reset behavior.
3. Use feature flags for geographic map, live GPS and simulator. Defaults must not let a demo ticker control a live unit.
4. Enable the corrected simulator with owned data first, then the geographic map, then opt-in GPS.
5. Preserve an explicit schematic fallback and source-labelled unavailable state.
6. Define rollback to the previous compatible schema/build. Never turn a provider outage into fabricated live routing.
7. Update README claims to distinguish real basemap, external routing, real GPS, synthetic movement, isometric view and any actual 3D renderer.

### 5.5 Final completion checklist

- [ ] All five stage acceptance gates have recorded evidence.
- [ ] Maps display true geographic data and simulator paths match the active route.
- [ ] Movement, ETA, source identity and destination version agree across views.
- [ ] Source switches, replay and resets cannot corrupt live operational state.
- [ ] No invalid key, missing coordinate or failed route is disguised as a successful live result.
- [ ] Commands and location streams are authorized and validated.
- [ ] Failure states and mobile/keyboard interactions have been reviewed.
- [ ] Tests, typechecks, production build and provider smoke test are recorded.
- [ ] Current limitations and configuration requirements are documented.

**Stage handoff:** Release only the verified scope. Keep optional 3D and fleet expansion separate if their acceptance work is incomplete.

## Inputs needed before the relevant stage

| Input | Needed by | Default/decision |
|---|---|---|
| Map provider | Stage 3 | Google Maps to match current Routes work |
| Browser map key reference, map ID, permitted domains | Stage 3 provider smoke test | User supplies restricted configuration |
| Server routing credential reference and quotas | Stage 3 provider smoke test | User supplies backend-only configuration |
| Demo service area and verified facility coordinates | Stages 1-3 | Audit existing synthetic geography; do not silently change city |
| GPS device/feed and assigned unit | Stage 3 live tracking | Browser foreground demo first; no assumption of reliable background tracking |
| Single-unit versus fleet scope | Stage 1 | Single unit first |
| Automatic arrival in scripted demos | Stage 2 | Off by default; operational arrival stays explicit |
| Required scenario list and reset boundaries | Stages 2 and 4 | Start with the scenarios in this plan |
| Isometric-only versus genuine 3D | Stage 4 | Accurate 2D/isometric first; genuine 3D optional |
| Replay retention and restart recovery requirement | Stages 4-5 | Owned synthetic data only; choose retention explicitly |
| Target devices and deployment topology | Stage 5 | Name test devices; single-process engine initially |

## One-by-one execution order

| Order | Stage | Main deliverable | Do not proceed until |
|---|---|---|---|
| 1 | State and contracts | Consistent identity, units, modes and commands | Source ownership and contract checks pass |
| 2 | Simulation correctness | Deterministic movement and route lifecycle | Traversal, diversion and reset tests pass |
| 3 | Geographic map and GPS | Real basemap, routes and stable tracking | Provider/failure/source-switch checks pass |
| 4 | Simulator experience | Scenarios, timeline, replay and clear controls | Repeatable demonstrations and reset isolation pass |
| 5 | Verification and rollout | Measured, documented release | End-to-end acceptance and regression checks pass |

This document adds no implementation. It defines the future sequence so each stage can be requested and reviewed independently without changing unrelated parts of GoldenHour.
