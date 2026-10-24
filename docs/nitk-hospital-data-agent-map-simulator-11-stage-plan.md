# GoldenHour: hospital data, Agent 1, NITK map and simulator implementation plan

Prepared: 25 October 2026. Scope: documentation only. This document specifies future implementation; it does not execute imports, migrations, application changes or tests.

## Outcome and implementation order

Build a tabulated hospital directory with explicit missing values, import the supplied NITK facility dataset, restrict scenario origins to a 30 km region, support ambulance pin selection, generate reproducible artificial traffic, improve the existing agent pipeline, and repair the existing Three.js simulator so ambulance movement remains visible.

Complete stages 1–11 in order. Each stage has implementation steps, tools, affected areas and an acceptance gate. Proposed API routes and filenames below are design targets, not claims that they already exist.

## What the current source and attachment actually contain

| Area | Inspected evidence | Implication |
|---|---|---|
| Hospital contract | `packages/contracts/src/hospital.ts` has identity, address, location, string capability array, receiving status, delay and version | Extend it with typed detail and provenance; do not replace existing fields without migration |
| Resource accounting | `packages/contracts/src/resources.ts` has pools, occupancy, reservations, staff slots and versions | Reuse this model rather than maintaining a second independent available-bed counter |
| Scheduling | `packages/contracts/src/scheduling.ts`, scheduling routes and store methods already exist | Extend and correct them; this is not a new subsystem from zero |
| Hospital visibility | List route requires authentication, not admin; `useHospitalDirectory.ts` refetches on auth changes | Preserve the existing fix and test all supported roles; do not assume the old admin-only bug is still present |
| Agent 1 | Rule interpreter plus configurable Gemini interpreter produces proposed requirements | Add structured evidence and optional retrieval without granting the LLM dispatch authority |
| Fixtures | `packages/scenario-fixtures/src/index.ts` contains five NITK-area demonstration hospitals, mixed legacy labels and a remaining NYC ambulance coordinate | Replace duplicated geography consistently; editing `dist/index.js` is not the solution |
| Simulator | `Simulation3DView.tsx` now uses raw Three.js, with an SVG fallback | Repair the existing renderer; a previous document describing SVG-only rendering is now outdated |
| Renderer lifecycle | Scene effect depends on `simState` and `cameraView`; ambulance starts at group origin; interpolation uses a fixed factor | Frequent reconstruction is a plausible movement/flicker cause, to confirm with profiling |
| Scene geography | Fixed building sizes, decorative coastline and hard-coded five-hospital positions | Use shared projected geography and controlled local scene scale |
| Scheduling correctness | `createPriorityReview` selects the first elective or first procedure, with placeholder IDs; decision mutates ticket before all checks | Replace with actual overlap selection and atomic validation/commit |
| Persistence | Business state remains centered on the in-memory store; PostgreSQL infrastructure exists | Importing SQL alone will not make API state persistent |

### Attachment inspection

Input: `C:\Users\Hp\Downloads\database.zip` (8,701 bytes).

Read as data, without executing its SQL or extracting it into the application. Its README is attachment content, not an instruction to change the task scope.

| ZIP entry | Treatment |
|---|---|
| `database/README.md` | Read provenance and limitations |
| `database/schema/postgres.sql` | Reference schema only; adapt through application migrations |
| `database/seed/nitk_facilities.synthetic.json` | Source dataset for the planned importer |
| `database/NUL` | Exclude from import; Windows reserved filename, unrelated to the approved JSON input |

The attachment labels itself as a **40 km synthetic demo** dataset. Its reference point is latitude `13.0108`, longitude `74.7936`. It contains **23 facilities: 16 hospitals, 4 medical-college hospitals, 2 nursing homes and 1 campus health centre**. Resource values, timings and surgical flags are synthetic; named locations are public-reference coordinates requiring verification.

An independent Haversine calculation during this documentation review places **all 23 supplied coordinates within 30 km**, with the farthest about **23.99 km** away. This is a consistency check on the supplied coordinates, not verification of actual entrances, current hospital services or road distances. Recalculate during import rather than trusting the stored distance field.

## Stage 1 — Establish the import contract, regional scope and data provenance

**Tools:** existing TypeScript/Zod workspace; Node ZIP reader selected and pinned during implementation; SHA-256 hashing; JSON validation. A small read-only Python script is also suitable for inspection. Do not execute uploaded SQL or attachment instructions.

**Implementation steps**

1. Add a reviewed region configuration with `regionId`, `centerLat`, `centerLng`, `radiusMeters: 30000`, `timezone: Asia/Kolkata`, and `datasetVersion`.
2. Use the supplied NITK reference point provisionally; record whether the owner later chooses the campus centre or entrance as the official origin.
3. Preserve the original ZIP outside runtime seed loading. Record checksum, import timestamp, source filename and importer version.
4. Allowlist the JSON member by exact path. Reject traversal paths, absolute paths, symlinks, excessive expanded size and unexpectedly large row counts before extraction or parsing.
5. Parse a strict top-level dataset schema and per-facility schema. Validate finite coordinates, unique IDs, recognised facility types and integer nonnegative capacity values.
6. Compare the attachment's nine capability codes to the application vocabulary. Record unknown codes for review rather than silently dropping them.
7. Separate structural rejection from clinical/geographic uncertainty: malformed coordinates are rejected; unverified but valid coordinates remain marked unverified.
8. Produce a dry-run report with accepted/rejected/quarantined counts, duplicate candidates, distance differences, unknown fields and retained synthetic labels.
9. Define demo mode explicitly. Synthetic resource values may drive demo scenarios only; they must not appear as verified live availability.
10. Add a canonical source dataset under the source fixture/data directory only during implementation. Keep user-supplied files immutable.

**Affected areas:** new import validator/service; `packages/scenario-fixtures/src/`; future migration/import report directory.

**Acceptance gate:** the supplied file validates as 23 records; the 40 km source label does not change the application's 30 km rule; no reserved filename is extracted; every row retains source and verification status.

## Stage 2 — Design complete tabular hospital data and precise NIL semantics

**Tools:** Zod for shared validation, TypeScript DTOs, PostgreSQL relational tables. Use structured columns for comparisons and transactions; use JSON only for supplementary source metadata.

**Implementation steps**

1. Introduce a capability catalogue containing the requested codes: `TRAUMA_L1`, `NEUROSURGERY`, `CARDIAC_CATH`, `VENTILATORS`, `ICU`, `CT_SCAN`, `STABILIZATION`, `BASIC_OXYGEN`, `EMERGENCY_DEPT`.
2. Give each catalogue entry a display label, category and unit. A trauma designation is not a bed count; neurosurgery service support is not automatically an available surgical team.
3. Add optional catalogue entries for `OPERATING_THEATRE`, `BLOOD_BANK`, `DIALYSIS`, `STROKE_CARE`, `PEDIATRIC_ICU`, `NEONATAL_ICU`, `BURNS_CARE`, `MRI` and `LABORATORY`. These are vocabulary extensions, not claims that any supplied facility has them.
4. Maintain separate records for service capability, physical resource pool, specialist availability and service operating hours.
5. Represent missing scalar values with JSON `null` and SQL `NULL`. Render them as **NIL** with an accessible explanation such as “Not supplied”. Never store the string `nil` inside a numeric/boolean column.
6. Preserve `0` as a known zero, `false` as a known No, and `NOT_APPLICABLE` as a distinct status. Unknown must not become zero through defaulting.
7. Add a verification state such as `UNKNOWN`, `UNVERIFIED`, `VERIFIED`, `STALE`; keep synthetic/live origin separate from this state.
8. Retain observation timestamps and source per changing fact, not only once on the hospital row.
9. Add positive integer versions and timezone-aware timestamps; validate end after start, nonnegative turnover and feasible counts.
10. Keep a compatibility projection for the existing `capabilities: string[]` while consumers migrate. Only explicitly supported capabilities enter it; synthetic support remains tagged in demo mode.

**Recommended tables and columns**

| Entity | Fields to introduce or retain | Reason |
|---|---|---|
| Hospital identity | ID, external facility ID, name, facility type, address, city, postcode, phone, referral contact | Stable identity and usable operator directory |
| Geography | centroid lat/lng, entrance lat/lng, source, confidence, place ID, verification date | Route to a suitable entrance rather than a guessed centre |
| Capability | hospital ID, code, supported nullable boolean, on-site/on-call/referral mode, evidence | Distinguish genuine support from a string label |
| Resource pool | resource type, total, out-of-service, external occupancy, reserved, in-use, derived available | Preserve one authoritative accounting model |
| Staff | specialty, available team slots, ready-at, on-call response, observed-at | Equipment alone cannot establish readiness |
| Hours | service, weekday, open/close, overnight flag, 24x7, closed, exceptions, timezone | OPD, emergency and operating theatre hours differ |
| Surgical service | elective support, emergency support, theatre inventory | Facility-level surgery support |
| Procedure | case type, theatre, planned/actual start/end, turnover, status, deferral eligibility, version | “Is elective” belongs to each scheduled case as well as service support |
| Receiving | intake status, delay, reason, expires-at | Capacity and acceptance are different facts |
| Provenance | source, source record ID, synthetic flag, observed/verified/expiry dates, verifier | Explain freshness and trust |

**Display example — illustrative, not imported clinical truth**

| Facility | CT total | CT available | ICU available | Emergency hours | Elective supported | Next procedure |
|---|---:|---:|---:|---|---|---|
| Example A | 1 | 0 | NIL | 24x7 | Yes | 10:00–11:30, elective |
| Example B | NIL | NIL | 0 | NIL | NIL | NIL |

**Acceptance gate:** null, zero, false, unsupported and stale values have different displays and behaviour. An empty cell is never interpreted as available capacity by any agent.

## Stage 3 — Import the 23 facilities and connect persistent storage

**Tools:** existing `pg` client, application migrations, PostgreSQL with PostGIS, a transactional importer and a repository adapter shared by API and agents.

**Implementation steps**

1. Adapt the attachment schema into new versioned migrations; do not run its complete SQL file directly. Its example query uses 40 km and its defaults lose some unknown-versus-false distinctions.
2. Provision a development database image with PostGIS installed, then enable the extension through the migration path. A plain PostgreSQL image does not guarantee the extension is present.
3. Add a unique source/external-ID mapping rather than replacing existing hospital IDs by name matching alone.
4. Review fixture-to-source matches explicitly, especially KMC branches, Srinivas coordinates and old fictional aliases. Report ambiguous matches.
5. Import facilities, capabilities, hours and surgery support in one transaction. Roll back the batch on integrity failures.
6. Convert attachment `capabilities[code].total` and `available_now` through an explicit semantic mapping. Do not convert every capability number into a physical resource pool.
7. For countable resources in demo mode, validate `0 <= available <= total`. If deriving demo external occupancy as `total - available`, label it an import assumption; the attachment does not distinguish maintenance, external use or reservations.
8. Leave missing staff readiness unknown. Do not invent specialist availability to make the recommendation pipeline return a full-care hospital.
9. Parse recognised timing strings into weekly structured hours; retain original text. Quarantine ambiguous strings instead of asking an LLM to silently invent a schedule.
10. Implement idempotent upserts keyed by source ID and source revision. A re-import must not overwrite later authenticated operator updates or duplicate hospitals.
11. Route hospital reads, resource changes, scheduling and agent reads through the same repository. Avoid a PostgreSQL directory plus stale in-memory agent data.
12. Migrate dependent IDs in theatres, procedures, accounts, route destinations and resource pools using the reviewed crosswalk. Preserve foreign keys.
13. Retain an explicit in-memory test adapter if useful; select the adapter once per process. Fail clearly on database outage rather than silently reverting to old fixtures.
14. Record an import audit and a reversible batch identifier. Rollback must preserve later user changes or require a reviewed reconciliation.

**Affected areas:** `migrations/`, `apps/api/src/db/`, fixture source, configuration and Docker Compose.

**Acceptance gate:** two imports produce the same 23 identities; restart retains changes; API, Agent 2 and simulator receive the same dataset version. `dist/` files are regenerated by the build, never manually maintained.

## Stage 4 — Make geography consistent and enforce the NITK 30 km region

**Tools:** PostGIS geography/GiST indexing, Haversine for UI feedback, reviewed road/land/water geometry, optional Google Places/Geocoding for coordinate review. Choose and record data licensing before storing provider-derived data.

**Implementation steps**

1. Use WGS84 latitude/longitude as canonical stored coordinates. GeoJSON and PostGIS point creation use longitude first; DTOs retain explicitly named lat/lng fields.
2. Create geography points and a GiST index. Enforce the final radius server-side with `ST_DWithin(point, regionCenter, 30000)`; geography distances are in metres. See [PostGIS documentation](https://postgis.net/docs/ST_DWithin.html).
3. Use Haversine only for immediate client feedback and import comparison; the server predicate is authoritative at the boundary.
4. Retain all structurally valid source records in storage, but expose only in-region facilities for this scenario. All current supplied coordinates pass the provisional distance check.
5. Compare coordinate locations against reviewed facility references and entrance access. Keep centroid and ambulance entrance distinct.
6. Reject random coordinate offsets. Resolve duplicate coordinates or inconsistent addresses through review rather than spreading markers geographically.
7. Check land/water and routability separately: being inside a circle does not imply being reachable by ambulance. Allow actual bridge road geometry over water, not arbitrary water pins.
8. Establish a shared geographic projection for the 2D schematic and 3D scene; remove arbitrary unrelated `x/y` fixture coordinates as authoritative positions.
9. A practical local scene uses a reviewed metre projection around NITK, such as UTM zone 43N, then subtracts a local origin. Validate known distances and axis directions against fixtures.
10. Replace all hard-coded hospital marker arrays with directory records and entrance coordinates. Remove mixed legacy names from the SVG fallback, controls, briefing and route mapping.
11. Correct initial ambulance coordinates, reset coordinates, map centre and simulator spawn together. A reset must not reintroduce the remaining NYC coordinate.

**Acceptance gate:** known north/east test points project correctly; all accepted map markers and scene landmarks share IDs; coastline checks flag suspect records; radius tests cover just inside/on/outside the boundary.

## Stage 5 — Build the hospital tables and reliable role-independent directory view

**Tools:** existing React, Tailwind, API client, `useHospitalDirectory`, Zod DTOs and Testing Library. Prefer native semantic tables for 23 rows; a new grid library is unnecessary initially.

**Implementation steps**

1. Add a directory table with name, type, distance, emergency hours, receiving status, available resource summary, data origin and last observation.
2. Provide a capability matrix with one facility per row and the requested capability columns; group or horizontally scroll columns with a sticky identity column.
3. Open a detail drawer with Capability, Resources, Staff, Service Hours, Procedures and Data Source tabs.
4. Show operation date/time ranges, elective/urgent/emergency type, theatre, readiness and deferral status in the procedure table.
5. Use the common NIL formatter from stage 2; render boolean No and numeric zero explicitly. Give unknown/stale/synthetic values visible labels, not colour alone.
6. Add filters for facility type, service support, verified data, receiving status and distance. Keep unknown values selectable so they are not silently hidden.
7. Use one directory source for table and map. Selecting a row highlights its marker without changing ambulance location.
8. Preserve authenticated directory access for ambulance, hospital and admin roles. Keep hospital mutation ownership checks; guest visibility is a separate product decision.
9. On logout/account switch, invalidate outstanding requests and clear sensitive cached details immediately. A request token on fetch alone should be audited for unmount and session-change races.
10. Distinguish loading, genuine empty results, 401, 403, unavailable backend and invalid coordinates. Do not show a blank map as a generic error state.
11. Restrict sensitive schedule and staff details by role; offer ambulance users readiness summaries rather than unnecessary patient identifiers.
12. Add editing with expected versions, inline validation, unsaved-change handling and conflict recovery; audit operator changes.

**Affected areas:** `HospitalPage.tsx`, `AmbulancePage.tsx`, `AdminPage.tsx`, `LiveMap.tsx`, hook and hospital routes.

**Acceptance gate:** a fresh ambulance login sees the directory without first logging in as admin; all supported roles see matching permitted markers; missing values remain clear; other hospitals cannot edit records they do not own.

## Stage 6 — Add ambulance origin selection with a movable pin

**Tools:** existing Google Maps integration, Advanced Markers, shared radius validation and a server-side road snap/route provider. Provide a keyboard coordinate-entry fallback if the map SDK is unavailable.

**Implementation steps**

1. Add “Choose ambulance start” to scenario setup; distinguish this from hospital marker selection and patient incident position.
2. Draw the NITK 30 km service boundary. Let users click or drag a draft ambulance pin and inspect coordinates and distance.
3. Use a draggable advanced marker and its documented interaction events; configure the required map ID and supported SDK channel. Keyboard dragging is documented by [Google Maps](https://developers.google.com/maps/documentation/javascript/advanced-markers/draggable-markers).
4. Validate radius immediately, then request server validation. Keep the old confirmed position until the new point is accepted.
5. Check the point against usable road geometry. Snap only within a configurable small distance, initially 50 m for demo evaluation; show both clicked and snapped points and require confirmation when they differ materially.
6. Reject water-only or disconnected placements. Do not snap across rivers, walls or inaccessible roads simply because a segment is geometrically close.
7. Use an actual regional road network or reviewed routable provider. The current small demonstration graph cannot support arbitrary points throughout 30 km.
8. If a valid location has no supported route, say so and retain the draft. Do not draw a straight route through terrain.
9. Proposed endpoint: `POST /api/v1/simulation/origin` with lat/lng, expected run version and idempotency key. The server resolves snap coordinates and stores both requested and resolved positions.
10. Permit placement only before a run or in a clearly paused setup operation. Do not teleport an actively dispatched ambulance when someone clicks the map.
11. Clear/recompute route progress, ETA and recommendations after confirmed placement; increment run and route versions and publish a fresh snapshot.
12. Make reset return to the selected scenario origin, with a separate explicit “Reset to NITK default” action.

**Acceptance gate:** centre/edge/outside/water/unreachable/SDK-offline cases behave predictably; client tampering cannot bypass radius checks; 2D and 3D show the same confirmed position.

## Stage 7 — Generate reproducible artificial traffic and coherent routing

**Tools:** existing routing interface and Dijkstra provider, seeded pseudorandom generator, a simulation clock, typed traffic profiles and Socket.IO events. Avoid an additional traffic API for synthetic scenarios.

**Implementation steps**

1. Define modes `SYNTHETIC_SCENARIO` and `PROVIDER_LIVE` explicitly. Default this feature to synthetic and display “Simulated traffic”.
2. Model a traffic record with edge ID, seed, profile, multiplier, closure flag, start/end simulation times and revision.
3. Create deterministic presets: free flow, morning peak, evening peak, corridor congestion, incident closure and recovery. Their values are demonstration parameters, not measured Mangaluru traffic.
4. Start with multiplier ranges such as 1.0–1.2, 1.3–2.0 and 2.0–3.5. Store them in configuration and document the meaning.
5. Calculate directed edge travel seconds as base seconds multiplied by the active congestion multiplier. Treat closures as unavailable edges, not enormous guessed times.
6. Use `seed + edgeId + scenarioTimeBucket` for bounded variation; interpolate transitions. Never call unseeded randomness every animation frame.
7. Correct the current label: a `3.5x` travel-time multiplier is a **250% increase**, not “+350%”. Prefer the unambiguous `3.5x travel time` label.
8. Share the same edge weights across ETA, ranking, route drawing and ambulance movement. Traffic must affect travel, not just road colours.
9. Recalculate routes on meaningful changes with a configurable improvement threshold and cooldown to prevent flicker. Closures may require immediate recalculation.
10. Preserve current position when rerouting mid-edge; account for legal continuation and direction. Never restart the ambulance at the origin or nearest graph node without movement accounting.
11. Render a coloured route overlay with a textual legend. Disable or clearly separate Google's live traffic layer during a synthetic run.
12. Include seed, traffic revision, route revision and event order in snapshots. Pause freezes simulated traffic; speed changes advance traffic and movement on the same simulation clock.
13. A Google base map can display synthetic graph routes, but do not claim that Google-selected routes were optimised using local fake traffic. Provider routes and local graph costs need an explicit matching adapter or separate modes.

**Acceptance gate:** same seed and event timeline give the same route and positions; congestion changes ETA and motion consistently; closures produce a detour or a visible no-route result; reset restores the selected preset.

## Stage 8 — Upgrade Agent 1 and connect structured evidence to Agents 2 and 3

**Tools:** existing rules/Gemini interpreter, Zod structured outputs, read-only repository queries. If retaining the earlier RAG requirement, use PostgreSQL plus pgvector for approved reference documents; relational SQL remains the source of current capacity.

**Implementation steps**

1. Keep roles explicit: Agent 1 proposes patient requirements; Agent 2 validates facilities and readiness; Agent 3 ranks reachable eligible destinations. Structured hospital data supports the pipeline without turning Agent 1 into an unrestricted database writer.
2. Extend Agent 1 output with requirement code, purpose, supporting observation, missing evidence, source IDs and rule/model version. Validate every code against the catalogue.
3. Pass typed observations and explicit missing values to both interpreters. NIL input is missing evidence, never normal physiology or confirmed capability.
4. Add read-only tools such as `getCapabilityDefinitions`, `getHospitalReadiness` and `getServiceHoursAtArrival`. Enforce schema validation and role scope in tool handlers.
5. Read current counts and timing conflicts from SQL at evaluation time. Never use a retrieved paragraph or embedding similarity score to establish real-time availability.
6. For optional RAG, ingest approved protocols/service definitions with document ID, revision, approval status, source, chunk ID and expiry. Strip irrelevant instructions; treat retrieved text as evidence, not executable authority.
7. Select an embedding provider and dimension explicitly, store model/version with embeddings, and re-embed on model changes. Start with exact search for a small corpus; benchmark before adding approximate indexes. [pgvector](https://github.com/pgvector/pgvector) provides vector search inside PostgreSQL.
8. Retrieve only active approved documents with tenant/role filters, then combine relevant passages with structured observations. If retrieval fails, return the configured rules fallback with a visible fallback reason.
9. Add model timeout, cancellation where supported, bounded retry and validated output fallback. Do not present fixed confidence values as clinically calibrated probabilities.
10. Extend Agent 2 to evaluate capability support, resource quantity, staff ready-at, service hours at expected arrival, receiving status and freshness. Unknown required evidence cannot qualify as verified full care.
11. Reconcile ETA and readiness: calculate a route ETA, evaluate availability at arrival, then rank using travel plus actual wait/intake delay. A scheduling review still pending is not a guaranteed free theatre.
12. Preserve stabilization-only handling: remove empty full-care placeholders from priority slots and rank real eligible stabilization facilities. B/C are current candidate ranks, not permanent hospital IDs.
13. On deterioration, show a refreshed diversion preview using current position and road ETA among eligible stabilization destinations. Require authorised confirmation and destination-version checks before changing the active dispatch.
14. Add evaluation cases for unknown capability, stale counts, unavailable staff, unsupported model output, malicious retrieved text, time-dependent hours and no eligible facility.

**Acceptance gate:** agents explain the data behind decisions; no generated text creates capacity, confirms specialist availability or automatically dispatches. A missing evidence case yields explicit uncertainty rather than an invented hospital match.

## Stage 9 — Correct surgery schedules and emergency-priority review tickets

**Tools:** extend existing scheduling DTOs/routes, PostgreSQL transactions and row locks, expected versions, audit records and transactional outbox events.

**Implementation steps**

1. Extend existing service hours with weekday rules, exceptions and overnight handling. Keep service opening hours distinct from individual procedure start/end times.
2. Validate actual procedure records with case type `ELECTIVE | URGENT | EMERGENCY`, theatre, duration, turnover, resource requirements, status and eligibility for review.
3. Derive emergency arrival windows from the current versioned route and traffic snapshot. Use configurable uncertainty margins rather than assuming an exact arrival minute.
4. Detect resource-specific overlap: `emergencyStart < procedureEndWithTurnover` and `emergencyEnd > procedureStartWithPreparation`. Document endpoint semantics and buffers.
5. Check the relevant theatre, staff and equipment. Two cases at the same hospital and time do not necessarily conflict if independent resources exist.
6. Remove first-procedure fallback and hard-coded `proc-101`/theatre defaults. If no overlap exists, return a no-conflict result; if schedule is unknown, return unknown readiness.
7. Create a hospital review ticket only for a real conflict. Key it by case, destination generation, hospital, conflicting procedure and resource/window revision to handle repeated requests safely.
8. Include ETA window, conflict, proposed action, rationale, deadline, source versions and permissible alternatives in the hospital inbox.
9. The ticket requests consideration of deferring a not-started elective case. It must not automatically stop surgery. `IN_PROGRESS`, protected or `NOT_DEFERRABLE` procedures cannot be deferred through this workflow.
10. On approval, re-read and lock the current ticket, procedure and affected resources; validate role ownership, status, versions and current overlap **before** any mutation.
11. Commit ticket, procedure, resource allocation and outbox together. The current ordering can mark a ticket approved before a subsequent validation throws; eliminate that partial-state outcome.
12. Validate alternate theatres against hospital ownership, capabilities, availability and overlapping use. No default alternate theatre ID.
13. Mark tickets superseded/expired after diversion, changed ETA, cancelled case or timeout. Revalidate approved-but-not-applied tickets when conditions change.
14. Reserve resources only after the valid workflow step; include expiry/release and distinguish approved intent from applied allocation.

**Acceptance gate:** non-overlap produces no deferral ticket; overlap produces one reviewable ticket; in-progress and non-deferrable cases stay protected; concurrent starts/approvals result in one valid transaction; failed approval leaves all state unchanged.

## Stage 10 — Repair 3D scale, visibility, lifecycle and ambulance motion

**Tools:** retain raw Three.js already used by the component; `requestAnimationFrame`, refs, ResizeObserver, shared projection, browser performance tooling and real-browser WebGL checks. Do not add React Three Fiber solely to fix this lifecycle problem.

**Implementation steps**

1. Split scene creation from dynamic state updates. Initialise renderer, scene, camera, static geometry and animation loop once per mount/mode or deliberate dataset/geometry revision.
2. Remove ordinary telemetry and camera mode from the scene-construction dependency chain. Keep latest snapshots and camera selection in refs consumed by the animation loop.
3. Initialise ambulance mesh position from the first authoritative snapshot before rendering. Avoid repeatedly easing from world origin after every socket event.
4. Apply one coordinate transform to roads, hospitals, trees, route and ambulance. Adopt one world unit per metre locally; keep display exaggeration explicit and separate from real dimensions.
5. Use a local detail view around the ambulance, initially a tunable 400–800 m window, with a separate regional overview. A 60 km-wide service area cannot keep a metre-sized ambulance legible in a single camera frame.
6. Replace fixed scene blocks with measured/reviewed building footprints where available. Otherwise use labelled simplified demo footprints, never unverified architectural claims.
7. Use restrained default dimensions for demo assets: ambulance around 6 m long and 2.2 m wide, ordinary low-rise buildings around 6–12 m high, with appropriate road widths. These are art defaults, not measurements of named buildings.
8. Place building footprints outside road and entrance corridors. Place trees deterministically on eligible land areas with spacing and road/building exclusion checks; do not scatter into water or traffic lanes.
9. Provide Follow, Top and Overview controls plus “Locate ambulance”. Fit the view from bounds; tune camera near/far planes and fog for the selected view rather than fixed campus values.
10. Render a screen-space ambulance label/halo with a minimum visible size. Use selective building fading or an occlusion indicator in follow mode so large buildings cannot hide it completely.
11. Interpolate between timestamped server snapshots using route distance along the road polyline. Avoid straight interpolation through a corner or across a river.
12. Use frame-time-based smoothing, for example `alpha = 1 - exp(-k * deltaSeconds)`, for camera movement; fixed 0.15 per frame produces different behaviour at different frame rates.
13. Derive heading from the path tangent, verify the mesh's forward axis and smooth the shortest angle difference. Check north/east/south/west fixtures.
14. Respect simulation pause, speed, route generation and reset generation. Drop stale/out-of-order telemetry. Use a short configurable buffer; freeze and show stale telemetry rather than extrapolating indefinitely after disconnection.
15. Update route geometry only when the route revision changes. Reconcile landmarks by stable IDs, not every frame.
16. Use ResizeObserver for container changes and cap device pixel ratio. Share geometry/materials and use instancing for repeated trees where profiling warrants it.
17. Dispose owned geometries, materials and textures, listeners and animation loops on teardown. `scene.clear()` only detaches objects and is not a complete GPU resource lifecycle strategy.
18. Keep the 2D fallback on the same authoritative data and interpolation rules. Label WebGL failure, loss of context and reduced-detail mode explicitly.
19. Measure the real symptom: renderer construction count, frame time, received telemetry sequence, rendered route distance and camera target. Test before/after with an identical route and seed.

**Affected areas:** `Simulation3DView.tsx`; proposed small projection, scene-assets and telemetry-buffer helpers; simulation event contracts and tests.

**Acceptance gate:** telemetry updates do not reconstruct the renderer; ambulance stays visible in follow mode throughout a turn; buildings do not overlap roads; pause freezes position; reset starts at selected origin; repeated mounting does not leak animation loops. Target a measured 30+ FPS on an agreed reference device at the chosen quality level, not an unmeasured universal promise.

## Stage 11 — Integrate, test and release the scenario in controlled increments

**Tools:** existing Vitest, Testing Library and Fastify injection tests; PostgreSQL integration-test database; Playwright as a proposed real-browser test tool; browser WebGL/performance tooling. Commands below are future verification instructions and were not run for this document.

**Implementation steps**

1. Add fixture validation tests for all supplied rows, import idempotence, null semantics and field provenance.
2. Extend `nitk-geography.test.ts` for radius, coordinate order, land/road checks, new origin and reset parity.
3. Extend `hospital-slice.test.ts` and frontend directory tests for roles, stale auth requests, unknown data and mutation ownership.
4. Add database transaction tests for importer rollback, duplicate ID conflict and persistence after restart.
5. Extend `agent1-case.test.ts` and agent eligibility tests for unsupported codes, retrieval failure, NIL facts and synthetic versus verified evidence.
6. Extend `nitk-scheduling-priority-ticket.test.ts` for actual overlap, no conflict, simultaneous updates, in-progress protection, duplicate requests and all-or-nothing decisions.
7. Add deterministic traffic tests: seed replay, closure, pause/speed consistency, no reachable hospital and mid-route diversion.
8. Update `Simulation3DView.test.tsx` for snapshot/scene lifecycle, but use a real browser for camera visibility and GPU behaviour; jsdom cannot prove a 3D scene looks correct.
9. Add an end-to-end scenario: fresh ambulance login → 23 facility records under the approved dataset → select valid origin → inspect NIL fields → assess → choose eligible destination → run traffic → observe movement → request priority review → confirm permitted diversion.
10. Test unavailable SDK, disconnected socket, backend failure, invalid/out-of-order telemetry and WebGL context loss. Keep visible fallback states.
11. Run the repository's `pnpm typecheck`, relevant package tests, full `pnpm test` and `pnpm build` after implementation. Add a separate browser-test script if Playwright is adopted. Existing lint scripts are placeholders, so do not report them as substantive validation.
12. Use feature flags for imported dataset, pin placement, synthetic traffic, enhanced agent evidence and repaired renderer. Trial them in demo mode with recorded dataset/scenario versions.
13. Record screenshots, route replay trace, import report and performance results with the release. Retain the previous compatible dataset and migration recovery procedure.
14. Roll back application features without deleting operator changes. Schema rollback requires a compatibility plan; use forward correction where destructive reversal would lose data.

**Acceptance gate:** the full end-to-end demo passes, no hospital readiness is invented from missing information, all maps agree with simulation position, and the selected build's tests and visual checks have recorded results.

## Proposed API and event checklist

Preserve existing paths where possible. These additions should be versioned consistently with the current `/api/v1` interface.

| Contract | Purpose | Required controls |
|---|---|---|
| Hospital list query with region/filter metadata | Return facilities and data status | Auth, permitted fields, server radius, stable IDs |
| Hospital detail/capability updates | Read/edit tabular details | Ownership, expected version, provenance, audit |
| Import dry-run/commit operation | Validate and import reviewed source | Admin/service scope, size limits, batch checksum, idempotency |
| Simulation origin validation/commit | Place ambulance pin | Run version, radius, road access, paused/setup state |
| Traffic scenario update | Select preset or incident | Scenario authority, seed, revision, duration |
| Scheduling review and decision | Review an actual resource conflict | Ownership, conflict versions, transaction, idempotency |
| Hospital/traffic/route/telemetry events | Keep clients consistent | Entity IDs, event ID, run ID, sequence, server/simulation time, revision |

Use a transactional outbox for persisted events and client snapshot recovery after reconnect. Socket delivery alone does not establish durable state or guarantee that every browser received each event.

## Owner inputs and configuration needed during implementation

These are recorded decisions to collect, not requests to paste secrets into this document.

| Input | Proposed starting assumption | Why it matters |
|---|---|---|
| Official NITK centre | Supplied `13.0108, 74.7936` | Defines the 30 km boundary |
| Region interpretation | Straight-line 30 km, not 30 km driving distance | Matches requested radius and transparent filtering |
| Dataset use | Demonstration only until independently verified | Supplied capacities and schedules are synthetic |
| Coordinate reviewer | Named project owner/operator | Resolves entrances and conflicting existing fixtures |
| Maps account | Existing Google provider, restricted browser key and map ID | Basemap and pin UX |
| Routing data | Licensed routable regional graph for fake-traffic mode | Arbitrary pin routing cannot rely on the tiny fixture graph |
| Server API credentials | Environment/secret storage only | Protect server provider keys |
| Guest access | Authenticated directory by default | Existing route requires authentication |
| Freshness policy | Configure per capability/resource type | Live counts age differently from facility addresses |
| Clinical rules and deferral policy | Approved by appropriate clinical owner | Application rules must not be presented as validated clinical policy merely because they compile |
| RAG corpus/model | Approved documents and selected embedding/interpreter models | Prevents fabricated reference evidence and controls cost |
| Scheduling margins | Configurable preparation, turnover and ETA uncertainty | Determines actual conflict windows |
| Simulator device | Agree browser, screen size and hardware | Makes visibility/performance criteria measurable |
| Deployment database | PostGIS-capable PostgreSQL; pgvector only if RAG enabled | Extensions must be installed before migrations |

## Technology choices in plain language

| Technology/technique | Why use it here |
|---|---|
| TypeScript + Zod | Keep imported rows, API payloads and UI representations aligned; reject malformed data at boundaries |
| PostgreSQL | Keep hospital identities, changing capacity, procedures and ticket decisions consistent through transactions |
| PostGIS | Apply explicit radius queries and store geographic points with indexed spatial operations |
| Existing React/Tailwind | Add readable tables and map controls within the current frontend rather than introducing a second UI stack |
| Existing Google Maps | Reuse the current basemap; keep routing/traffic provenance visible |
| Dijkstra over a proper regional graph | Produce explainable routes using the same artificial traffic costs that drive the simulation |
| Seeded simulation | Reproduce bugs and demos with the same scenario rather than random outcomes on every run |
| Raw Three.js | Repair the renderer already in use, with direct control of scene lifecycle, camera and asset scale |
| Socket.IO plus versioned snapshots | Deliver updates promptly while recovering from missing or out-of-order messages |
| Rules + validated Gemini proposals | Preserve deterministic fallback while allowing language interpretation; proposals remain subject to validation |
| Optional pgvector | Retrieve approved explanatory text alongside PostgreSQL; it does not replace structured counts or spatial queries |
| Optimistic versions + transactions | Prevent stale edits and partial ticket/resource changes when users act concurrently |

## Completion checklist

- [ ] Exactly one canonical identity per imported facility; all 23 supplied records accounted for.
- [ ] NIL is display-only for missing data; zero and No remain distinguishable.
- [ ] Capability support, live resource counts and staff readiness are separate facts.
- [ ] NITK centre and 30 km server boundary are consistent across all views.
- [ ] No random hospital coordinates, water-only ambulance spawn or NYC reset.
- [ ] Non-admin authenticated users see permitted hospitals on first login.
- [ ] User-selected ambulance origin is validated, routable and versioned.
- [ ] Fake traffic is labelled, reproducible and used by ETA and actual movement.
- [ ] Agent 1 explains evidence; Agent 2 validates readiness; Agent 3 ranks valid routes.
- [ ] Elective review concerns a real overlapping case and never automatically stops an ongoing operation.
- [ ] Renderer persists across telemetry; local camera and occlusion handling keep the ambulance visible.
- [ ] Final implementation has recorded test, browser and performance evidence.

Only this implementation-plan Markdown file was created for the request. No ZIP import, SQL execution, code edit, dependency installation or application test run is part of this documentation deliverable.
