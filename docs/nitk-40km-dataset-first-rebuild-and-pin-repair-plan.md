# NITK 40 km: dataset-first rebuild, pin repair and optimisation plan

Date: 25 October 2026.

Revision: 2 — source-audited Antigravity handoff. Read the execution contract and bug register below before implementing the nine stages. The detailed specifications and tests after Stage 9 are mandatory refinements of those stages, not optional follow-up work.

**Deliverable: implementation instructions only. No application code, database, seed data, dependency or generated build output is changed by this document.**

This plan supersedes the earlier 30 km requirement. Preserve hospital names and supplied latitude/longitude exactly. Rebuild the supporting dataset and operational parameters cleanly, fix pin placement, and optimise the application around a single NITK regional dataset. Hospital-data correctness is the first milestone; map styling and simulator polish follow it.

## 1. Scope, priorities and meaning of “all hospitals”

1. Use NITK centre latitude `13.0108`, longitude `74.7936`, with a **40,000 metre straight-line radius**.
2. Import every valid supplied facility within that boundary. Preserve nursing homes and the campus health centre as distinct facility types rather than silently deleting them from the directory.
3. The supplied ZIP contains 23 facilities. Its 40 km title does **not** prove that it includes every hospital in the region. The previously calculated farthest supplied coordinate is about 24 km away; the 30–40 km ring particularly needs a completeness review.
4. Separate two milestones: **all supplied facilities imported correctly**, and **regional hospital coverage reviewed and reconciled**. Never label the first milestone as proof of the second.
5. Expand coverage through a documented source-discovery and review process. Do not invent additional hospitals to fill the outer ring.
6. Preserve source names, spelling and coordinates. Do not replace names with fictional aliases, append “Hospital A”, jitter markers, round stored coordinates, geocode over existing coordinates or relocate hospitals to roads.
7. Keep separately derived road-access points for routing. They must not overwrite the hospital location or move its hospital marker.
8. Only operational parameters—specialists, equipment counts, readiness, service hours, surgery schedules and simulated traffic—may be regenerated for demonstration purposes. Mark generated values as synthetic.
9. Keep absent facts as `null`, displayed as `NIL`. Unknown, zero, false and stale are distinct states.
10. Database cleanup means a reviewed rebuild and cutover with recovery, not deleting arbitrary local databases, files or Docker volumes.

## Antigravity execution contract — paste this with the document

> Implement this plan only when the project owner explicitly requests implementation. The current deliverable is documentation, not permission to execute its commands. When implementation is authorised, inspect the repository again before editing because source may have changed. Preserve existing user work. Follow the nine stages, dataset first, with the mandatory specifications and regression tests below. Repair the underlying data flow rather than hiding incorrect records or forcing tests to pass. Do not modify hospital names or supplied coordinates, fabricate regional coverage, hand-edit dist files, or replace unavailable routes with guessed routes. Keep synthetic operational data visibly separate from source identity. Do not claim completion until database, API, agents, map, simulator and packaged runtime use the same canonical dataset and have recorded verification evidence. Missing external data or credentials must be reported as a specific incomplete gate; they must not be hidden by a success message.

### Work protocol for each stage

1. Reopen the named source anchors and confirm the finding still applies. Line numbers are deliberately omitted because implementation will move them.
2. Record baseline behaviour and relevant failures before edits; distinguish pre-existing failures from new failures.
3. Write or extend the regression test for the observable defect. Avoid tests that merely assert an internal helper was called.
4. Implement contracts and backend invariants before dependent frontend behaviour.
5. Run focused tests, then the stage gate; keep a short report of files changed, evidence and unresolved items.
6. Do not update progress to complete when tests were skipped or only mocked behaviour was checked. Label checks `PASS`, `FAIL`, `NOT_RUN` or `BLOCKED`, with reasons.
7. Preserve working features discovered during the audit. Replace stale recommendations in this plan if current evidence contradicts them, recording the reason.
8. No mass reformatting, framework migration or unrelated feature work. Cleanup is limited to demonstrably obsolete paths and artifacts after their replacements pass.

### Fixed architectural decisions

- Canonical facility identity: namespace plus immutable external facility ID, e.g. `nitk:CHIRASHREE_SURATHKAL`. Preserve source name/location separately from projections and access points.
- Persistent application mode: PostgreSQL repository; in-memory implementation is an explicit test adapter. No automatic fallback to legacy seed data on a database outage.
- Hospital directory scope: 40 km around the configured NITK centre. Routing network extent must include enough surrounding roads for valid detours; do not clip every road at the exact service boundary.
- Operational scenario state: versioned synthetic overlay with deterministic seed and scenario start time. Operational editing never rewrites preserved source identity.
- Routing modes: separate regional graph/synthetic traffic from live-provider routing. A provider name is evidence of an actual provider result, not merely a configured URL.
- Simulation ownership: one explicit `runId`, `ambulanceId` and optional `caseId` binding per active run. A single-run demo is acceptable if concurrent runs are explicitly rejected; selecting the first case in a global Map is not acceptable.
- RAG is not a prerequisite for this dataset repair. Retain the current Agent 1 interface, validate its vocabulary, and defer a vector database until the separate RAG scope is authorised.

## 2. Findings from the current source

These are source-review findings, not claims that the application was run or its tests passed during preparation of this document.

| Finding | Evidence | Implementation consequence |
|---|---|---|
| Canonical input exists | `packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json` contains 23 rows; inspected names and coordinates match the ZIP | Preserve this source identity; rebuild the transformations around it |
| Generated hospital IDs collide | `importer.ts` mixes legacy crosswalk IDs with array-index IDs; `CHIRASHREE_SURATHKAL` and `KMC_ATTAVAR` both become `hosp-004` | 23 input records produce only 22 unique generated IDs; repair before any UI work |
| Seed merge retains old identity | `store.seed()` first loads legacy hospitals, then enriches only selected fields | Legacy name, location and capability arrays can disagree with imported detail fields |
| Alias records duplicate entities | Store adds external-ID copies to the hospitals map | Use an alias-to-canonical-ID map instead of a second hospital entity |
| Directory reconstruction hides inconsistency | Directory maps imported entries back through store IDs | A collision can repeat a hospital rather than expose the missing identity |
| Unknowns are converted to assumptions | Importer derives support as false, defaults some service hours to 24x7, and substitutes zero for missing availability | Preserve unknowns; generated assumptions belong in a separate demo overlay |
| Region is still 30 km | `region.ts`, map circle, UI text, errors and importer report fields | Replace with one shared 40 km region configuration |
| Set Pin mode is not enforced | Map click listener directly calls `setSimulationOrigin`, without checking `pinPlacementMode` | Normal clicks can mutate origin and reset the run |
| Road snapping is misleading | Nearest graph node is used within 1,000 m; outside that range requested lat/lng can be retained while x/y come from the nearest node | Replace with explicit road-segment validation and consistent projection |
| Version check is ineffective | Store's expected-run-version branch does not reject a mismatch | Validate before mutation and return a real conflict response |
| Origin request resets simulation | Origin route calls `simulationService.reset()` after store mutation | Make origin changes an explicit setup transaction, not an incidental map click |
| Idempotency is declared but not applied in the inspected route | Request accepts a key but handler does not forward/use it | Implement deduplication or remove the misleading contract until implemented |
| Business storage is mainly in memory | Store owns Maps and legacy/imported seeding; migration infrastructure also exists | Running SQL alone will not change API behaviour; connect a repository explicitly |
| Progress document describes an older verification snapshot | `docs/progress.md` claims all phases complete and fixed test counts | Update claims only after the new implementation has current evidence |

### Important corrections to older plans

- Current Three.js code already uses refs for telemetry/camera and removes `simState` from scene-creation dependencies. Do not reintroduce scene rebuilding. It now needs a reliable canvas-mount/initial-snapshot lifecycle, as described in F-18 below.
- Current scheduling code already tests time overlap and validates some conditions before changing a ticket. Do not describe first-procedure placeholders as the current implementation. Its remaining problems are resource matching, procedure eligibility, stale-ticket identity, authorization and durable transactionality.
- Existing names/coordinates in the raw 23-row JSON match the inspected attachment; contamination occurs during ID generation, merging and downstream lookup. Replacing the original geographic data is not the repair.

## Additional bug register and required fixes

Severity is implementation priority, not a claim that a defect has caused an actual clinical incident. Findings marked “source-confirmed” follow directly from inspected code; “runtime verification required” means the exact visible symptom must still be reproduced.

| ID / priority | Source anchor and finding | Required repair / stage |
|---|---|---|
| F-01 / P0 | `importer.ts`, `stableId`: Chirashree and KMC share `hosp-004`; source-confirmed | Stable namespaced IDs, uniqueness failure, reviewed legacy-reference migration; stages 1–2 |
| F-02 / P0 | `store.seed`: legacy identity retained, aliases inserted as hospital copies; source-confirmed | One canonical record and explicit alias resolver, no fuzzy mutation lookup; stages 2–4 |
| F-03 / P0 | `importer.ts`: raw JSON cast to `RawFacility[]`, no runtime schema parse before transformation; source-confirmed | Validate entire input and field invariants, reject/quarantine with reasons; stages 1–3 |
| F-04 / P0 | `importer.ts`: only ventilator/ICU/stabilisation pools generated; CT capability does not create CT pool; source-confirmed | Explicit capability-to-resource mapping; never let CT display say available while eligibility reads an absent pool; stage 3 |
| F-05 / P0 | `store.seed`: imported theatres/hours returned by importer are not loaded through the corresponding seed paths, which use independent defaults; source-confirmed | One source for service schedules, theatre inventory and summaries; stages 3–4 |
| F-06 / P0 | `agent2.ts`: ICU/cath readiness not evaluated equivalently to CT/ventilator checks; stabilization only matches capability strings after receiving-status check; source-confirmed | Requirement-driven resource/staff/hour checks for both care objectives; stage 5 |
| F-07 / P0 | `agent3.ts`: `HOSPITAL_NODE_MAP[hosp.id] || 'node-hosp-a'`; source-confirmed | Resolve every candidate's actual access point; no default A route; stages 5 and 7 |
| F-08 / P1 | `agent3.ts`: readiness fixed at zero; route unavailable represented by 9999 seconds; source-confirmed | Real relative readiness and explicit route status; valid long journeys remain distinguishable from unavailable routes; stage 5 |
| F-09 / P0 | `migrate.ts`: offline DB returns success, says SQL syntax verified without executing a parser; empty SQL possible if file missing; source-confirmed | Fail required migrations on offline/missing input; migration ledger/checksums/transaction; stage 4 |
| F-10 / P0 | `seed.ts` seeds process-local store and exits; source-confirmed | Persistent import writes/commit and independent-process readback; stage 4 |
| F-11 / P1 | `LiveMap.tsx` click ignores mode, stale request races possible; source-confirmed handler gap | Draft/validate/confirm state machine and sequence checks; stage 6 |
| F-12 / P0 | `setAmbulanceOrigin`: nearest-node x/y can disagree with lat/lng; no actual version rejection; source-confirmed | One geographic resolution and atomic versioned commit; stage 7 |
| F-13 / P1 | `simulationService.reset`: always writes x/y `120,150` with selected origin lat/lng; source-confirmed | Project selected origin consistently; preserve source generation rules; stage 7 |
| F-14 / P0 | `ensureActiveRoute` and `onReachedDestination`: first global active case, five-hospital destination switch; source-confirmed | Bind run to case/ambulance and destination revision; never update unrelated case; stages 5 and 7 |
| F-15 / P1 | `ensureActiveRoute` returns early when route exists; `recomputeRoute` restarts from nearest node and retains old target; source-confirmed | Destination-change invalidation and remaining-segment replan without teleport; stage 7 |
| F-16 / P1 | `SimulatedGeographicRoutingProvider`: adds origin/destination connectors but excludes connector cost, no snap bound; source-confirmed | Validate/cost actual access paths or return unavailable; stage 7 |
| F-17 / P1 | `LiveRoutingAdapter`: sets `isLive:true` and `LIVE_OSRM` while returning graph result without an HTTP request; source-confirmed | Remove false live labelling; implement actual adapter or expose simulated status; stages 7–8 |
| F-18 / P1 | `Simulation3DView`: loading return omits canvas; setup effect depends only on mode/WebGL; cold-load init can miss later canvas mount; source lifecycle confirmed, browser reproduction required | Separate mounted Scene component or canvas callback ref with initial snapshot, geometry revision and cleanup; stage 8 |
| F-19 / P1 | Scene still owns hard-coded landmarks and `scene.clear()` cleanup without per-resource disposal; source-confirmed | Data-driven landmarks and owned GPU resource disposal; stage 8 |
| F-20 / P0 | Scheduling decision route only requires auth; store does not establish actor hospital ownership; source-confirmed | Hospital/admin decision authorization with canonical ownership and actor ID; stages 4–5 |
| F-21 / P0 | `createPriorityReview` overlap scans all procedures, returns first overlap without case-type/status/resource compatibility checks; source-confirmed | Ignore completed/cancelled cases, select competing resource, never defer urgent/emergency/non-deferrable cases; stage 5 |
| F-22 / P0 | `decidePriorityTicket`: only in-progress/protected checks; alternate resource can omit theatre; source-confirmed | Explicit permitted transition, required alternate target, capability/availability and version validation; stage 5 |
| F-23 / P1 | Pending ticket reuse only checks case ID, not destination/window revision; source-confirmed | Idempotency scoped to current conflict; supersede old destination tickets; stage 5 |
| F-24 / P0 | Realtime middleware allows unauthenticated clients into case room; simulation globally emits state; source-confirmed | Authenticated room policy, scoped payloads, session revocation and reconnect recovery; stages 4–5 |
| F-25 / P1 | `resetDemoScenario` replaces pools with legacy pools while keeping other imported state/tickets; source-confirmed | Reset from selected dataset/overlay in one consistent operation; stage 4 |
| F-26 / P1 | Ticker uses `Date.now()` despite “monotonic” comment; step pauses before validating request; source-confirmed | Monotonic elapsed clock and validate-before-mutate; stages 7–8 |
| F-27 / P1 | Router inserts both edge directions; movement and ETA use separate speed/base-time sources; source-confirmed | Directed access model and one edge-cost function with validated length/time; stages 7–8 |
| F-28 / P1 | Geography tests prove bounding ranges and node incidence, not land access or connectivity for imported catalogue; source-confirmed | Real identity, topology, directed reachability and reviewed-land tests; stage 9 |
| F-29 / P1 | `useHospitalDirectory` retains old rows on errors and lacks cancellation/invalidation cleanup; source-confirmed | Clear scoped data on logout/switch, abort/discard old responses, label deliberate stale cache; stages 5–6 |
| F-30 / P0 | Shared package manifests point to `src/index.ts`, Docker runner copies only `dist`; source-confirmed artifact mismatch; runtime verification required | Align production exports and copied assets with compiled runtime; container smoke test; stage 9 |
| F-31 / P1 | Docker builder copies root `tsconfig.json` but API extends `../../tsconfig.base.json`; migration files absent from runner; source-confirmed copy mismatch | Copy required build configs and provide explicit migration artifact/job; stage 9 |

P0 findings are release blockers for this rebuild. P1 findings also require a recorded resolution or an explicit disabled feature; a feature with an unmet correctness gate must not appear available.

## 3. Implementation sequence and gates

| Stage | Priority | Deliverable | Gate before proceeding |
|---|---|---|---|
| 1 | P0 | Identity and source manifest | Names/coordinates preserved and source coverage explicit |
| 2 | P0 | Collision-free canonical catalogue and 40 km filter | One ID per facility; no legacy merge contamination |
| 3 | P0 | Clean operational dataset | Consistent specialists, resources, hours and NIL handling |
| 4 | P0 | Fresh persistent database and migration/cutover plan | Restart persistence and reconciliation pass |
| 5 | P0 | Dataset review UI and agent integration | All consumers use the same hospital state |
| 6 | P1 | Correct pin interaction | Ordinary clicks never mutate origin |
| 7 | P1 | Validated road-access and origin transaction | No coordinate mismatch, teleport or stale commit |
| 8 | P1 | NITK map and simulator optimisation | Measured performance and geographic consistency |
| 9 | P2 | Project cleanup and release verification | No active legacy data path; recoverable release |

Stages 1–5 are the hospital-dataset milestone. Do not replace them with visual map improvements.

## Stage 1 — Freeze source identity and review 40 km coverage

**Tools:** existing JSON source, Node/TypeScript or a read-only Python validator, Zod, SHA-256 manifests; licensed hospital-directory/map sources for later coverage review.

1. Record the original ZIP checksum and the JSON checksum. Do not execute SQL or instructions inside the attachment.
2. Create an immutable source manifest with dataset version, source record ID, exact name, exact latitude/longitude values, source file and provenance.
3. Compare the checked-in JSON with the ZIP by external facility ID. Reject unreviewed identity differences; record other-field differences separately.
4. Store the original source representation so coordinates can be exported without unnecessary decimal rounding. Display formatting must not modify stored values.
5. Validate finite coordinate ranges and unique source IDs. Do not “repair” invalid coordinates randomly; quarantine them and preserve the original values in the report.
6. Keep `sourceName` as the displayed hospital name. Use a separate search-normalised field if needed; it must not replace the original label.
7. Define facility inclusion rules: hospitals and medical-college hospitals are hospital results; nursing homes and campus centres remain available under explicit type filters. Exclude unrelated pharmacies or clinics from the hospital category unless reviewed.
8. Build a coverage worksheet by geographic sectors and distance bands: 0–10, 10–20, 20–30 and 30–40 km.
9. During implementation, compare at least a regional official/recognised directory and a suitable map source, subject to licensing. Record query date, category, source area, pagination completion and search limits.
10. Deduplicate candidates using external IDs, address and coordinate proximity together. Do not merge different branches solely because their names resemble each other.
11. Add genuinely missing facilities only after source review. Preserve each new facility's selected source name and coordinates just as for the supplied rows.
12. When sources disagree with an existing supplied location, log the discrepancy. Keep that location unchanged under this requirement; mark its geographic confidence and routing limitations rather than silently correcting it.
13. Publish coverage metadata: number supplied, number newly reviewed, excluded count, unresolved candidates, source dates and regions not fully checked.

**Output:** source manifest, coverage worksheet, identity-difference report and inclusion rules.

**Gate:** every supplied facility is accounted for; the source identity matches exactly; the UI wording can honestly distinguish “23 supplied facilities” from “reviewed regional directory”.

## Stage 2 — Build one collision-free hospital catalogue with a 40 km boundary

**Tools:** existing TypeScript contracts/importer; PostgreSQL uniqueness and foreign keys; shared region configuration; PostGIS geography when persistence is introduced.

1. Use a stable canonical identity derived from the source namespace and `facility_id`, or a persisted UUID mapping with a unique `(source, external_id)` constraint.
2. Remove array-position ID generation. Reordering input rows must never change hospital identity.
3. Map legacy `hosp-001` through `hosp-005` to canonical IDs in an alias table. Aliases resolve to a facility; they are not additional facilities.
4. Treat the current `hosp-004` collision as ambiguous legacy data. Review dependent rows before assigning them to Chirashree or KMC; do not blindly migrate every reference to one branch.
5. Create a migration inventory of hospital references in users, resource pools, staff, theatres, procedures, dispatches, allocations, cases, tickets, road destinations and scenario presets.
6. Replace legacy-first seed enrichment with a canonical import. Hospital name and location must be sourced from the preserved catalogue, not existing fixture values.
7. Introduce `nitk-surathkal-40km` and `radiusMeters: 40000` in the shared region contract. Expose it through a configuration response consumed by the client.
8. Derive circle radius, messages, help text and distance limits from this configuration. Rename `within30km` report fields to `withinRegion` so future radius changes do not leave misleading contracts.
9. Apply the exact radius on the server using a geography distance predicate. PostGIS geography `ST_DWithin` accepts metres and can use spatial indexes: [official reference](https://postgis.net/docs/ST_DWithin.html).
10. Use the same authoritative inclusion method for imports and directory queries. A client Haversine estimate can provide feedback, but must not overrule server boundary decisions.
11. Test just inside/on/outside 40 km, and points between 30 and 40 km. Do not use a bounding square as the final inclusion rule.
12. Return records directly from the canonical repository; assert unique IDs in list responses. Do not reconstruct the directory from imported rows plus fallback store lookups.
13. Generate checksums of `(sourceId, exactName, sourceLat, sourceLng)` before and after the transformation. Any difference fails the identity-preservation gate.

**Affected existing files:** `packages/contracts/src/region.ts`, `packages/scenario-fixtures/src/importer.ts`, `apps/api/src/db/store.ts`, hospital routes and all legacy ID consumers. These are future edit targets only.

**Gate:** initial supplied import yields 23 rows and 23 unique canonical IDs; both Chirashree and KMC Attavar are independently retrievable. Adding more reviewed facilities changes that expected count through the manifest, not a hard-coded constant.

## Stage 3 — Regenerate operational parameters without changing hospital identity

**Tools:** Zod schemas, a deterministic synthetic-data generator, existing resource/scheduling contracts, versioned JSON demo overlay, relational constraints.

### Separate immutable identity from mutable operational data

| Data group | Fields | Rule |
|---|---|---|
| Preserved identity | Source ID, name, source latitude, source longitude | Read-only under this task |
| Source context | Address, facility type, source metadata | Preserve; flag discrepancies rather than casually regenerate |
| Capability support | Requested nine capability codes, optional approved extensions | Explicit true/false/unknown with source and verification state |
| Staff | Specialty, total team slots, available slots, ready-at, shift hours, on-call response | Editable or synthetic with provenance |
| Equipment | Total, out-of-service, external occupancy, reserved, in-use | Counts must satisfy one accounting formula |
| Hours | Service, weekday, opening, closing, 24x7, closed, exceptions, timezone | Missing hours remain unknown |
| Surgery | Elective/emergency support, theatres, actual scheduled procedures, turnover | Procedure-level elective status, not a single hospital-wide switch |
| Receiving | Acceptance status, delay, reason, expiry | Not inferred from equipment ownership |

1. Define the baseline nine capability codes from the request: `TRAUMA_L1`, `NEUROSURGERY`, `CARDIAC_CATH`, `VENTILATORS`, `ICU`, `CT_SCAN`, `STABILIZATION`, `BASIC_OXYGEN`, `EMERGENCY_DEPT`.
2. Record units and semantics. Trauma designation is not a machine count; neurosurgical support is not necessarily an available neurosurgical team.
3. Generate operational parameters in a separate overlay keyed by canonical hospital ID. Do not rewrite the source identity JSON to simulate resource changes.
4. Seed generation with `datasetVersion + scenarioSeed + canonicalId`; never use array order or unseeded randomness.
5. Use explicitly reviewed demo profiles: stabilisation facility, general hospital, tertiary demo centre and limited-capacity facility. Label profiles as scenario assignments, not factual classifications of named hospitals.
6. Assign correlated data: a demo cath service needs an appropriate team and service schedule; a closed service cannot simultaneously be shown as ready now without an explicit exception.
7. Add unknown and unavailable examples deliberately. Do not give every hospital every speciality merely to ensure three recommendations.
8. Distinguish `supported: null`, `supported: false`, and `supported: true` with zero available resources. Render them as NIL, No and Supported/currently unavailable respectively.
9. Remove implicit `isOpenNow: true` for supported capabilities and implicit 24x7 for absent timing data.
10. Enforce `available = total - outOfService - externalOccupancy - reserved - inUse`, with all component counts nonnegative and the result nonnegative.
11. Do not maintain a stale `capabilitiesDetail.availableCount` independently of the resource pool. Generate detail responses from the authoritative pool plus capability facts.
12. When source availability is null, retain unknown status. A generator may supply an explicitly synthetic value in the overlay, but must not relabel it as imported evidence.
13. Model specialist slots separately; equipment capacity must not imply staff availability. Keep ready-at and observed-at timestamps.
14. Add per-service weekly hours and exception dates; validate overnight schedules and `Asia/Kolkata` display. Use timezone-aware timestamps for actual procedure instances.
15. Generate procedure schedules relative to the selected demo scenario date, not permanently expired October timestamps. Make deterministic regeneration possible using the scenario start time.
16. Include elective/urgent/emergency type, planned/actual start/end, preparation, turnover, status, review eligibility and versions.
17. Preserve protections against deferring an in-progress or non-deferrable case. Synthetic data should include such cases for testing.
18. Add per-field source, generated-at/observed-at, freshness and verification states. Mark the entire demonstration clearly as synthetic operational capacity.
19. Validate cross-entity integrity before accepting the overlay: hospital exists, theatre belongs to hospital, staff speciality is recognised, schedules are coherent and allocations are feasible.
20. Create several scenarios from the same identities: normal capacity, constrained capacity, unavailable specialist, unknown data and regional traffic disruption.

**Gate:** rerunning the same seed reproduces operational values; every facility retains its original name/location; changing scenario seed affects only approved operational fields; no duplicated or contradictory capacity counters exist.

## Stage 4 — Rebuild the database cleanly and retire legacy data safely

**Tools:** current `pg` dependency, versioned SQL migrations, PostgreSQL with PostGIS, `pg_dump`/`pg_restore` for a future verified backup, transactional importer, repository interface.

1. Inventory actual storage paths before cleanup: SQL database, in-memory Maps, static JSON, fixture constants, generated `dist`, browser caches and scenario state. Record which path currently feeds each API.
2. Identify the exact development/demo database, container, volume, connection target and ownership. Do not infer that every PostgreSQL service or Docker volume belongs to this project.
3. Back up the existing target database and export relevant user/account mappings and operator changes. Verify a restore into a separate temporary target before cutover.
4. Build a new development database or versioned schema alongside the old one. Keep the old dataset available until reconciliation succeeds.
5. Implement normalized tables: `hospital_identity`, `hospital_alias`, `hospital_capability`, `resource_pool`, `specialist_availability`, `service_hours`, `operating_theatre`, `scheduled_procedure`, `scenario_run`, `ambulance_origin`, `import_batch`, audit and outbox tables.
6. Preserve or migrate existing dispatch, allocation and ticket tables according to the ID inventory. Do not orphan case history or account permissions.
7. Give identity uniqueness, foreign keys, version columns, timestamps and count constraints database enforcement rather than relying only on frontend validation.
8. Make a repository the only application access path. Production/demo persistent mode uses SQL; isolated unit tests can use a clearly selected in-memory adapter.
9. Update API, agents, scheduling and simulation reads together. Do not leave agents using legacy Maps while the table reads PostgreSQL.
10. Import preserved identities first, then aliases, then operational overlay, then dependent scenarios/accounts. Commit each versioned import batch atomically and report counts.
11. Reject duplicate IDs and ambiguous legacy ownership instead of applying last-write-wins behaviour. Quarantine references that cannot be resolved confidently.
12. Make imports idempotent. Reimport of the same manifest must not duplicate records or overwrite newer operator edits.
13. Compare source, database, API and UI identity hashes and counts. Verify both colliding facilities and all migrated foreign keys individually.
14. Restart the API and database to prove persistence. A successful in-memory seed run is not evidence of persistent storage.
15. Cut over configuration to the new database only after the gate passes. Increment dataset version and invalidate client caches and stale session hospital mappings as required.
16. Retire legacy seed loading from application startup. Keep old fixtures only where explicitly needed for isolated tests, with descriptive test-only names.
17. Archive old data before deletion. Any later removal must target the exact reviewed database/schema or workspace file paths. Avoid global volume deletion and broad recursive cleanup commands.
18. Document rollback: switch back to the previous compatible application/database pair, reconcile post-cutover writes, and invalidate incompatible caches. Do not restore an old snapshot over new user changes without reconciliation.

**Gate:** one persistent source of hospital truth, a verified recovery path, no legacy hospital enrichment on startup, no orphaned references and no data lost merely to make the project appear clean.

## Stage 5 — Verify the dataset through the table, map and agent pipeline

**Tools:** existing React tables, API client, shared DTOs, role checks, Vitest and Testing Library.

1. Add a dataset audit view showing source ID, canonical ID, exact name, source coordinates, radius distance, provenance and missing-field count.
2. Put operational data in separate tabs/columns: capabilities, specialists, resources, hours and procedures. Identity columns are read-only under this task.
3. Show NIL consistently and retain zero/No. Add filters for unverified, stale, missing specialist data, full capacity and unavailable service.
4. Make directory, markers and detail panels query the same repository version. No map-only copied hospital array.
5. Verify authenticated ambulance, hospital and admin users see permitted directory records on first login; editing stays scoped to hospital ownership/admin authority.
6. Agent 1 proposes patient needs against the shared capability catalogue. It must not invent missing hospital attributes or modify source identity.
7. Agent 2 checks structured capability, capacity, specialist readiness, hours at arrival and freshness. Missing evidence cannot establish confirmed full care.
8. Agent 3 ranks eligible candidates from the actual ambulance origin and route costs. No hard-coded A/B/C-to-hospital mapping.
9. Preserve stabilization-only behaviour and authorised diversion review when full-care requirements cannot be met.
10. Evaluate elective conflicts against overlapping procedure/resource intervals. Do not infer that any elective procedure at the destination should be stopped.
11. Add invariant tests that API markers and table rows have identical IDs/names/coordinates, including Chirashree and KMC Attavar.
12. Record completion of the dataset milestone only when import, persistence, UI and agent data all agree. Until then, defer cosmetic optimisation work.

**Gate:** all supplied records are independently visible, source coordinates match, operational fields are explainable, and the system does not depend on old demo hospitals for recommendations.

## Stage 6 — Repair the pin interaction as an explicit state machine

**Tools:** existing Google Maps component, stable event listeners, React refs/state, AbortController where supported, real-browser interaction tests.

### Required states

`IDLE → PICKING → VALIDATING → READY_TO_CONFIRM → SAVING → CONFIRMED`

`VALIDATING/SAVING → ERROR`; Cancel returns to IDLE without moving the ambulance. A rejected point remains a visible draft with a reason.

1. Reproduce and record the present issue: a normal map click invokes the origin mutation despite Set Pin being off. Capture request count and current run version.
2. Make the click listener return immediately unless the current interaction state permits placement. Do not read an outdated initial React closure; use a current ref or a deliberately managed listener lifecycle.
3. Register one listener per map instance and remove it on cleanup. Verify hot reload/remount does not duplicate API requests. Google documents event registration and listener cleanup in its [Maps events guide](https://developers.google.com/maps/documentation/javascript/events).
4. Separate hospital inspection clicks, map dragging, zoom controls and pin placement. A hospital marker click must not create an ambulance origin.
5. Clicking in PICKING updates a draft marker only. It must not call the commit endpoint, reset the run or move the confirmed ambulance marker.
6. Validate the draft after click/drag end, not every mouse movement. Abort obsolete validation or discard responses whose request sequence no longer matches the latest draft.
7. Show clicked coordinate, validated road coordinate, actual snap distance and rejection reason. Keep the draft visible so a failed save does not appear as a disappearing pin.
8. Add Confirm and Cancel controls. Confirm is enabled only for the current validated draft and allowed run state; disable repeated save clicks while saving.
9. Suspend automatic map-follow while selecting the pin so telemetry does not move the viewport away from the selection. Restore follow only through an explicit choice or clearly defined successful-confirmation behaviour.
10. Make click/drag selection usable with keyboard and touch. If SDK loading fails, provide a coordinate form using the same validation API rather than an inert Set Pin button.
11. If the SVG fallback supports placement, convert screen coordinates through its inverse view transform and geographic inverse projection; do not mistake pixel positions for longitude/latitude. Otherwise clearly use the coordinate form.
12. After successful commit, apply the returned authoritative snapshot, clear the draft and show the new confirmed origin. Do not wait for a socket event that may be delayed or lost.
13. On cancel or error preserve the prior confirmed origin. On lost save response, use the idempotency key/status reconciliation instead of assuming no commit occurred.

**Gate:** Set Pin off causes zero origin requests; map pan does not place a pin; one confirmation causes one logical commit; stale validation responses cannot resurrect an old point.

## Stage 7 — Fix server-side road validation and origin consistency

**Tools:** shared geometry helpers, indexed regional road segments or an appropriately licensed route/snap provider, typed origin contracts, SQL transactions and run-version checks.

1. Replace the nearest-node-within-1-km shortcut. Search for a point on a drivable road segment, including segment direction and access constraints.
2. Cover the whole 40 km service area with reviewed routable road data. The old small fixture graph cannot establish road access for arbitrary regional points.
3. Set a configurable snap tolerance, initially 50 m for evaluation. Beyond tolerance, return `NO_ROAD_ACCESS`; do not silently move the ambulance a kilometre.
4. Retain requested coordinates and resolved coordinates separately. Calculate snap distance between those two actual points, not the distance to an unused nearest node.
5. Check radius for both requested and resolved points, along with land/access rules. Road geometry on a legitimate bridge is valid; an arbitrary point in water is not.
6. Do not change hospital source coordinates when deriving destination access. Store `routingAccessPoint` separately with source/confidence, and show its offset when material.
7. Derive x/y from the final accepted lat/lng through the same projection used by the map and simulator. Never combine nearest-node x/y with unsnapped requested lat/lng.
8. Use one run version authority. Existing store and simulation service versions must not diverge. Require expected version on commit; reject mismatches with `409` before modifying anything.
9. Enforce role/ambulance/run ownership and run-state restrictions. An active transport cannot be relocated through a setup pin operation; paused setup is not an unrestricted teleport mechanism for dispatched cases.
10. Separate preview from commit: a read-only validation endpoint returns resolved point, segment, validity, region and graph revision; commit revalidates against current versions.
11. Implement idempotency with a request fingerprint scoped to user/run/key. Same key and body returns the recorded result; same key with different body is rejected.
12. Atomically update origin, current position, route state and run version. Emit the versioned event after persistence, preferably through the existing outbox path.
13. Clear incompatible route progress only as part of this explicit operation; do not invoke a broad unrelated reset that changes traffic/case data unexpectedly.
14. Make ordinary scenario Reset return to the selected origin. Keep “Reset to NITK default” separate and apply the same permissions/version checks.
15. Test disconnected roads, invalid numbers, water, >40 km, 30–40 km, duplicate request, concurrent request and stale version.

**Proposed response fields:** `requested`, `resolved`, `snapDistanceMeters`, `distanceFromNitkMeters`, `regionVersion`, `graphVersion`, `runId`, `runVersion`, `validationStatus`, `rejectionCode` and an authoritative origin/position snapshot after commit.

**Gate:** 2D, geographic and 3D positions agree; no unsupported point is accepted as routable; a rejected or stale request leaves state unchanged.

## Stage 8 — Optimise the NITK map, routing and simulator

**Tools:** PostgreSQL query plans and indexes, browser performance/network tools, existing Google Maps and Three.js, spatial/route caches with explicit versions.

1. Measure before changing architecture: directory response size and latency, route computation time, map initialisation count, marker update count, frame time and socket event rate.
2. Return light directory summaries for the map; fetch detailed schedules/staff on selection. Avoid sending every procedure on each telemetry update.
3. Index canonical ID, source ID and geographic point. Add operational query indexes based on actual filter/query plans, not every column automatically.
4. Cache stable identity data by dataset version; invalidate operational summaries using entity versions. Never cache current availability indefinitely.
5. Use one Google Map instance per mounted view. Reconcile markers by stable ID; update changed markers instead of deleting and recreating every marker for each ambulance update.
6. Fit bounds on initial load or explicit user request. Do not fit all hospitals every time telemetry arrives, which would interfere with pin placement and follow mode.
7. An 80 km-wide regional overview and a street-level ambulance-follow view serve different tasks. Add explicit Overview, Follow and Selected Hospital controls.
8. Keep canonical lat/lng unchanged. Derive local metric coordinates for rendering; the current degree-scale approximation should be named accurately, not described as a true UTM transform. Validate projection error at the 40 km edge before choosing a better implementation.
9. Keep the 3D scene local to the ambulance; load/render nearby roads and buildings rather than full-detail geometry across the entire region. Preserve a lightweight regional overview.
10. Maintain a persistent renderer and use timestamped route-aware interpolation for ambulance motion. Rebuild static geometry only on relevant scene/dataset changes.
11. Use controlled building dimensions, screen-space ambulance labels and camera occlusion handling. Buildings must not cover the moving ambulance or block road geometry.
12. Cache routes by origin/access segment, destination ID/access revision, graph version and traffic revision. Changes that affect route validity must invalidate the cache.
13. Distinguish synthetic traffic from live-provider traffic. Use a seed and simulation clock; routing, ETA and vehicle movement must share costs.
14. Bound provider calls with debouncing, cancellation and request sequencing. Do not query all hospital routes on every animation frame.
15. If reviewed coverage grows substantially, benchmark marker clustering and viewport filtering. At the current 23-row scale, correct lifecycle and payload handling take priority over a new heavy grid/map framework.
16. Establish measurable targets on an agreed device: for example 30+ FPS follow view, no map recreation during pin selection, and bounded p95 directory/route latency. Record actual results and data size; do not report unmeasured targets as achieved.

**Gate:** pin selection remains stable under telemetry load; no marker churn or reinitialisation; route/position coherence holds after traffic changes; performance evidence is reproducible.

## Stage 9 — Clean project structure and verify the complete change

**Tools:** `rg`, dependency/import analysis, existing pnpm scripts, Vitest/Testing Library, PostgreSQL integration tests and proposed Playwright browser tests.

1. Create an inventory with columns: path, purpose, imported-by, retained/migrated/archived/deleted and reason. Search references before removing anything.
2. Retire duplicate production/demo hospital arrays and old name aliases from active paths. Keep test-only fixtures isolated and explicitly named.
3. Keep one source region config, one identity catalogue, one operational scenario generator and one repository selection point.
4. Do not edit `packages/scenario-fixtures/dist/index.js` manually. Change source during implementation and rebuild using the workspace's normal build pipeline.
5. Determine whether generated outputs are intentionally tracked before cleaning them. Remove only confirmed disposable outputs inside the resolved workspace and regenerate as required.
6. Retain migrations, lockfile, source dataset, `.env` templates and useful tests. Never publish secrets or delete environment files to tidy the tree.
7. Remove unused dependencies only after source/import and build verification. Do not migrate UI frameworks as part of cleanup.
8. Update old references to 30 km, fictional hospital names and stale dataset counts in active UI, errors and docs. Historical plans can remain archived with an explicit superseded note.
9. Replace progress claims with dated evidence for this implementation. Do not retain “fully verified” merely because an older suite passed.
10. Run contract/importer tests first, then database integration tests, role/API tests and map browser tests. Run repository typecheck, test and build once changes are integrated.
11. Add real-browser tests for pin mode, drag-versus-click, keyboard input, invalid origin, concurrent validation, network failure, confirmed state persistence and fallback mode.
12. Add an end-to-end test: fresh ambulance login → canonical hospital list → inspect preserved identity → choose 35 km valid road origin → confirm → run → inspect route and hospital → reset to selected origin.
13. Verify both Chirashree and KMC independently through directory/detail/resources/account scoping. Tests must detect a repeated hospital even when array length is still 23.
14. Record a cutover checklist, recovery instructions, source coverage report and before/after performance trace.

**Gate:** only intended files/data paths remain active; no missing facility is concealed by a duplicate; all implementation tests have current evidence and the old database remains recoverable until retirement is complete.

## Mandatory implementation specifications

The nine stages above set order and scope. The following details remove ambiguity for implementation. Proposed module names may be adapted to repository conventions, but the invariants and tests must be preserved.

### A. Repository structure and ownership of data

| Existing area | Future responsibility | Suggested additions |
|---|---|---|
| `packages/contracts/src/hospital.ts`, `resources.ts`, `scheduling.ts`, `region.ts` | Runtime schemas and shared DTOs; no database queries | Origin, route-result, dataset-manifest and event-envelope contracts |
| `packages/scenario-fixtures/src/importer.ts` | Pure validated source-to-domain transformation | Separate identity importer and deterministic operational-overlay generator |
| `apps/api/src/db/` | Connection, migrations and concrete repository implementation | `repositories/`, transaction helper and import service |
| `apps/api/src/modules/hospitals/` | Canonical directory, detail and permitted operational updates | Alias resolution at request boundary, never substring entity resolution |
| `apps/api/src/modules/simulation/` | Run lifecycle, origin command, clock and active route ownership | Origin validation service and explicit run state machine |
| `apps/api/src/modules/routing/` | Real graph/live adapters and route provenance | Road-access resolver, graph loader and shared edge-cost function |
| `apps/api/src/modules/agents/` | Requirements, readiness and ranking | Requirement-to-resource policy; versioned evidence snapshot |
| `apps/api/src/modules/realtime/` | Authentication, authorized rooms and event delivery | Snapshot reconciliation and transactional outbox publisher |
| `apps/web/src/components/LiveMap.tsx` | Map lifecycle and display | `useOriginPlacement` hook and draft marker component |
| `apps/web/src/components/Simulation3DView.tsx` | Page controls and state fetching | Mounted scene component that owns its canvas/renderer lifetime |

The main operational call chain must become:

`validated source + demo overlay → transaction/repository → directory and readiness DTOs → agents/routes → map/simulation snapshots`.

No component should import the raw hospital JSON to bypass API state. No agent should retain a second mutable capacity store. Fixtures may continue to provide isolated test inputs.

### B. Minimum persistent schema and import semantics

1. `hospital_identity`: canonical ID primary key; source namespace and external ID unique together; exact source name; preserved source latitude/longitude; geographic point; dataset revision; facility type; source provenance. Restrict ordinary operational update DTOs from accepting these identity fields.
2. Preserve original source coordinate representation in the import record or decimal columns without reducing precision. Geographic calculations may use a double-precision derivative. Do not define a low-precision decimal scale that truncates source data.
3. `hospital_alias`: unique `(aliasNamespace, aliasValue)` mapping to canonical ID. Ambiguous legacy alias `hosp-004` must have a documented resolution for each dependent record; it cannot map to two destinations in one namespace.
4. `hospital_capability`: unique hospital/code, supported nullable boolean, evidence source and freshness. Constrain code to the shared catalogue version.
5. `resource_pool`: hospital/resource type/pool identity, counts and version. Separate physical pools only if capacity is not duplicated across them. Available count is derived, not an independent write input.
6. `specialist_availability`, `service_hours`, `operating_theatre`, `scheduled_procedure`: foreign keys, versions and valid temporal ranges. Deferral and allocation update the same transactional state used by readiness checks.
7. `scenario_run`: run ID, dataset/overlay/graph revisions, seed, scenario start, status, ambulance ID, bound case ID, selected origin, run version and source generation.
8. `idempotency_record`: actor/run/operation/key unique, request hash, state, result and retention expiry. Do not retain a success record for a rolled-back operation.
9. `import_batch`: source checksum, importer/generator versions, counts, state, errors and commit timestamp. Distinguish `VALIDATED`, `COMMITTED`, `FAILED` and `SUPERSEDED`.
10. `schema_migrations`: ordered version, checksum and application timestamp. Acquire a migration lock, reject changed applied checksums, fail missing scripts and use transactions where supported by each migration.
11. `outbox_event`: event ID, aggregate ID/version, type, payload, created/published timestamps and retry metadata. A publisher retry may duplicate delivery; clients deduplicate event IDs and reject older versions.

**Import transaction order:** validate full input → resolve identity/crosswalk → check conflicts → insert import-batch intent → upsert immutable identity under preservation rules → apply versioned demo overlay → validate foreign keys/counts → write audit/outbox → commit. Failure returns a structured report and leaves no partly active dataset.

**Active dataset switch:** publish a completed revision through one pointer/configuration update. Consumers must not see half the old and half the new revision. Any running scenario either retains its pinned revision or is explicitly stopped before switching.

**Schema runner repair:** resolve migration assets independently of the caller's working directory; detect empty/missing SQL; log actual execution status; close/release clients; return nonzero on required migration failure. An offline dry run may report file validation only, never “migrations applied”.

**Repository migration breadth:** inventory every direct `store.<Map>` read/write. Moving only hospital routes is insufficient because simulation, scheduling, dispatch and auth currently access store internals. Convert consumers to methods or a cohesive repository/unit-of-work boundary; avoid ad hoc SQL fragments spread across handlers.

### C. Detailed capability and readiness rules

The following are software modelling requirements. Clinical necessity and permitted substitutions remain configured policies reviewed by the project owner; do not invent medical equivalence in the importer.

| Capability category | Minimum structured evidence when required |
|---|---|
| Ventilator / CT / ICU / cath | Supported service, appropriate available pool/slot, required staff and hours at arrival |
| Neurosurgery / trauma service | Supported service, appropriate team availability and ready-at, required facilities under the configured care objective |
| Stabilisation / oxygen / emergency intake | Supported service, required resuscitation/resource capacity, staff/readiness and receiving status |
| Unknown/unsupported code | Validation error or explicitly unresolved requirement; never silently omit |

1. Audit every code emitted by rules, Gemini parsing and scenario injections against the catalogue. For example, the current decompensation injection includes `TRAUMA_BAY`, a resource term absent from the inspected capability enum. Keep capability codes and resource types separate; map deliberately rather than accepting arbitrary strings.
2. Missing a pool is `UNKNOWN_RESOURCE_DATA`, not automatically “zero confirmed capacity”; both may block confirmed eligibility but explanations must differ.
3. `supported: true` alone cannot satisfy current readiness. `supported: false` cannot become supported because a generated staff row exists.
4. Require a consistent evidence revision or timestamp bundle for one recommendation calculation. If underlying data changes before dispatch, revalidate in the dispatch transaction.
5. Use explicit route states `AVAILABLE`, `UNAVAILABLE`, `PENDING`, `STALE`. ETA is nullable for unavailable routes; remove magic `9999` logic.
6. Compare times consistently: `arrival = evaluationTime + routeDuration`; `careStart = max(arrival, requiredResourceReadyAt, requiredStaffReadyAt) + applicableIntakeDelay`. Evaluate opening hours and actual allocated scheduling intervals; avoid adding the same queue delay twice.
7. Full-care eligibility must not force stabilization eligibility to true in output unless the actual stabilization requirements were also evaluated.
8. In early dataset stages, candidates with no reviewed road access stay explicitly unroutable. Do not fill priority slots with arbitrary routes just to pass the dataset gate; routing end-to-end completion belongs to Stage 7.

### D. Origin preview/commit API: concrete contract

Suggested routes below extend the existing `/api/v1/simulation/origin` path. Keep one compatibility adapter temporarily if an old client must be supported, but do not preserve unsafe immediate mutations.

**Preview: `POST /api/v1/simulation/origin/preview`**

Request: `runId`, `requested: { lat, lng }`, `expectedRunVersion`, `clientRequestId`.

Response: `clientRequestId`, `validationId`, `expiresAt`, `runId`, `runVersion`, `regionVersion`, `graphVersion`, `requested`, nullable `resolved`, nullable `roadSegmentId`, nullable `segmentFraction`, nullable `snapDistanceMeters`, `validationStatus`, nullable `rejectionCode` and explanation. Invalid geometry returns typed validation feedback; it must not update origin, position or route.

**Commit: `POST /api/v1/simulation/origin`**

Request: `runId`, `validationId`, `expectedRunVersion`, `idempotencyKey`. Store or cryptographically bind the preview to its actor/run and selected point; do not trust client-supplied “already validated” coordinates.

Commit order:

1. Authenticate, authorize the actor/run and validate the request schema.
2. Begin transaction; acquire run lock; check idempotency record. For a completed matching request, return its recorded result before treating its old expected version as a new conflict.
3. Verify preview ownership, expiry, graph/region revision and requested run version.
4. Verify setup state, ambulance ownership and absence of an incompatible active dispatch. Preview acceptance does not override these checks.
5. Revalidate resolved point/access when graph or region evidence requires it; return a new-preview-required error rather than trusting expired evidence.
6. Write origin, projected position, incremented run version and source generation, clear incompatible setup route, and persist result/outbox/audit together.
7. Commit, then return the authoritative snapshot. Publisher delivery happens after commit and may be retried safely.

**Responses:** `400` malformed input; `401` missing/expired session; `403` wrong ownership/role; `404` unknown run or inaccessible entity according to disclosure policy; `409` stale version, expired preview, idempotency mismatch or disallowed run transition; `422` outside region/no valid road access; `503` routing/database dependency unavailable. Include stable error codes; avoid detecting error type through string `includes()` checks.

**Cancellation semantics:** aborting a preview request is safe because it has no side effects. Cancelling a network wait for commit does not undo a committed write; reconcile using the same idempotency key and a fresh snapshot.

**Client races:** selecting A then B must display B even if A's response arrives last. Versioned commit responses and socket events must not overwrite a newer run generation. Controls must show “saving” until success/failure is resolved; do not silently drop a request and re-enable multiple saves.

### E. Routing and simulation invariants

1. Hospital directory inclusion is a 40 km geographic rule. A valid route may leave and re-enter that circle; choose graph coverage with a detour buffer and test it. Do not truncate a bridge/road at the boundary.
2. Graph import validates node references, positive finite lengths/speeds, legal direction, access type and connected components. A node having one adjacent edge does not prove reachability from an ambulance origin.
3. Store actual edge polylines and calculate length consistently with them. Existing synthetic distances cannot be assumed to match local coordinates.
4. Use one `edgeTravelSeconds` implementation for ranking and movement. Either derive time from length/speed or treat validated base time as authoritative and derive effective speed from it; do not mix independent sources silently.
5. Preserve directed access. Add reverse adjacency only for permitted directions. Closed edges are excluded rather than assigned a large numeric sentinel.
6. A point inside an edge produces a temporary routing position with remaining segment costs and legal direction; it must not jump to a graph node. At reroute, retain travelled progress and recompute the remaining route from actual position.
7. Include all traversable access connectors in distance/time. A straight connector from hospital centroid to nearest graph node is not road evidence. If access is unresolved, render the preserved hospital marker but disable route selection with a clear reason.
8. Recompute route when destination revision, graph revision or relevant traffic revision changes. A cached active route must not survive a confirmed diversion to a new facility.
9. No bound case means no clinical arrival transition. A selected demo preview destination can animate, but must not mutate unrelated cases. Arrival applies only to the run's bound case and matching destination revision, using an idempotent transition.
10. Handle start-at-destination explicitly. A zero-edge route should complete safely if appropriate; it should not run forever with no movement.
11. Use monotonic time for elapsed simulation increments and UTC timestamps for persisted observations. Inject a clock in tests. Document speed/catch-up policy so delayed ticks do not pretend to be deterministic wall-clock replay.
12. Validate commands before changing state. In particular an invalid step request must not pause a running simulation; malformed play/speed values must not produce NaN clock state.
13. Stop timers on server shutdown and test teardown. A reset increments generation; clients discard telemetry from prior generations even when its sequence number is higher.
14. Real GPS and simulation are explicit mutually exclusive authoritative position sources. Source switch invalidates pending pin previews and prevents a late simulated update from overwriting device telemetry.

### F. Scheduling and access-control repairs

1. The ticket decision route must require the owning hospital user or explicitly authorised admin. Resolve actor user ID and canonical hospital ID server-side; user display name is not a durable actor identity.
2. A request's URL case ID and body case ID must agree, or remove the duplicate body field. Derive ETA from the current route; do not treat arbitrary client-provided seconds as trusted scheduling evidence.
3. Select only active competing resource intervals. A completed, cancelled or already deferred procedure is not an actionable elective conflict; an urgent/emergency case must not be treated as elective.
4. Check case type `ELECTIVE`, status permitting review and `ELIGIBLE_FOR_REVIEW` before elective deferral. `NOT_DEFERRABLE` and `PROTECTED_IN_PROGRESS` are both prohibitions.
5. Preserve legitimate zero turnover using nullish defaulting; `(turnoverMinutes || 20)` incorrectly replaces zero. Validate negative/NaN durations and timezone-aware timestamps.
6. Review alternatives before declaring a hospital blocked. Conflicts are specific to compatible theatres, equipment and staff; hospital-wide overlap alone is insufficient.
7. Require an explicit alternate theatre for `ALTERNATIVE_RESOURCE`. Validate ownership, active status, capability, staffing, future conflicts and reservation availability.
8. Deduplicate on case/destination generation/conflict revision. When the destination changes, a pending ticket for the previous hospital must not be returned as the current one.
9. In one transaction, lock ticket, affected procedure and resources in a deterministic order; validate expected versions; apply mutations, reservations and outbox; commit. Concurrent start/deferral must have one permitted winner.
10. Read/list/detail endpoints must have appropriate scope as well as mutation endpoints. Return readiness summaries to ambulance users without unrelated private schedule details.
11. Socket connection requires valid authentication for operational events; malformed session cookies return an auth error, not an uncaught decode exception. Limit rooms by canonical hospital/run/case permissions and disconnect or revalidate revoked sessions.
12. Remove hard-coded admin subscriptions to two old hospital IDs. Admin access should be an explicit supported event scope, not an incomplete list of legacy rooms.
13. Configure allowed web origins for credentialed API/socket access and verify session-related mutation protections. Keep any intentionally public demo feed separately scoped to non-sensitive synthetic summaries.

### G. Three.js lifecycle and reset details

1. Reproduce a cold load with delayed simulation-state response. Currently the loading UI does not mount the canvas; the setup effect can exit with no ref, then fail to run when only loading/state changes.
2. Prefer a separate `SimulationScene` mounted only when a validated initial snapshot exists. Its ref is present when its mount effect runs. Another acceptable design is a callback ref that explicitly owns setup/teardown.
3. Do not fix F-18 by adding the whole `simState` object to dependencies: that would restore scene rebuilding on every update. Use an initial readiness condition and a separate geometry-revision reconciliation path.
4. Scene geometry updates when dataset/graph changes; telemetry updates only move objects and camera. Shared material/geometry disposal must be ownership-aware to avoid double disposal.
5. In follow mode use local metric coordinates and a floating/local origin when needed. Keep source coordinates untouched; test north/east and heading conventions rather than assuming schematic y is latitude.
6. Reset must restore the selected dataset/overlay snapshot, traffic preset, schedules/tickets and run state according to documented reset scope. Ordinary run reset and complete demo reset are separate commands.
7. Complete demo reset must not erase cases while leaving their priority tickets, or restore five legacy resource pools while exposing the larger directory. Reset versions/generations and event subscribers coherently.
8. Test WebGL context loss, delayed data, empty data, mode toggle, remount, resize and failed fetch. Provide actionable error/retry state instead of an endless loading skeleton.

### H. Regression-test specification

Add tests to existing relevant suites or new focused files. The suggested IDs below should appear in the stage report so failures are traceable to the handoff.

| Test | Setup/action | Required assertion |
|---|---|---|
| D-01 | Import 23-row source twice, then reorder rows | Same 23 unique IDs; identical identity hash; no new records |
| D-02 | Query Chirashree and KMC independently | Different canonical IDs, exact source names/coordinates and separate resources |
| D-03 | Duplicate ID, NaN coordinate, negative count, available > total | Typed validation failure; no partial import |
| D-04 | Null capability/availability/hours | Remain null/unknown; not false, zero or 24x7 by default |
| D-05 | Change synthetic seed | Identity hash unchanged; permitted operational values may change |
| D-06 | Import with CT/cath/ICU/staff fixtures | UI detail and Agent 2 read identical authoritative evidence |
| D-07 | Database offline or migration file missing | Migration command fails nonzero; no success/syntax-verification claim |
| D-08 | Seed, terminate process, start independent API | Persisted revision and edits survive; no legacy enrichment |
| D-09 | Force import/decision failure mid-transaction | No partial active revision, ticket, procedure or resource mutation |
| D-10 | Full demo reset after changes/tickets | Selected dataset restored coherently; no legacy pools or orphan tickets |
| P-01 | Ordinary map/hospital click with Set Pin off | Zero origin mutations and no simulation reset |
| P-02 | Select A, then B; respond B before A | B remains current; A response ignored |
| P-03 | Draft, validate, Cancel | Confirmed position/route/version unchanged |
| P-04 | Confirm twice with same key; lose first response | One logical commit; replay returns same recorded result |
| P-05 | Same key/different body; stale version; expired preview | Conflict response and unchanged state |
| P-06 | Valid road origin 35 km out; point beyond 40 km | First accepted, second rejected by server regardless of client |
| P-07 | Water/off-road/bridge and out-of-tolerance fixtures | Explicit access rules; no kilometre snap or straight-line guessing |
| P-08 | Commit then reset chosen origin | Lat/lng and projected x/y match across API, 2D and 3D |
| R-01 | Hospital absent from old A–E map | Route targets its actual access point or unavailable, never A |
| R-02 | One-way, closure, disconnected component | Legal directed route or explicit no-route; no reverse shortcut |
| R-03 | Mid-edge traffic reroute or confirmed diversion | Position continuity and correct current destination revision |
| R-04 | Long but valid ETA >9999 seconds | Remains available; sentinel removal verified |
| R-05 | Missing live provider/network error | Truthful fallback/unavailable source, never fictitious LIVE_OSRM |
| R-06 | Run bound to case X with case Y also active | Only X can receive arrival transition; Y unchanged |
| R-07 | Zero-edge route; invalid step; clock jump | Correct completion, no invalid-command side effect, bounded monotonic elapsed time |
| S-01 | In-progress/non-deferrable/urgent/cancelled procedure | No prohibited elective deferral |
| S-02 | Wrong hospital or ambulance user decides ticket | 403 with no mutation |
| S-03 | Concurrent procedure start and approval | One valid transition; no double allocation |
| S-04 | Diversion from B to C with pending B ticket | B ticket superseded; C review references C and new revision |
| V-01 | Cold load with delayed API then data arrives | Renderer starts without requiring mode toggle |
| V-02 | 100 telemetry updates then unmount/remount | No renderer recreation per tick; no surviving extra loops/listeners |
| V-03 | Route bend, follow camera, tall building occlusion | Visible ambulance on route; no corner-cutting or unexplained teleport |
| A-01 | Logout/account switch during slow directory response | Previous scope data cleared; late old response rejected |
| A-02 | Unauthenticated/expired socket or wrong-room subscriber | Cannot receive protected case/operational events |
| B-01 | Clean production image start with compiled packages | No missing source-entry/config/JSON/migration asset errors |

Use synthetic coordinates for boundary unit tests without adding invented hospitals to the actual dataset. Browser visual checks need recorded screenshots or video on an agreed reference device; jsdom success does not prove camera visibility.

### I. Verification commands and artifact checks

These are **future implementation commands**, not commands executed to prepare this document. Run from the repository root unless a command states otherwise. Inspect package scripts before running because the workspace may change.

```powershell
pnpm --filter @goldenhour/contracts typecheck
pnpm --filter @goldenhour/scenario-fixtures typecheck
pnpm --filter @goldenhour/api test
pnpm --filter @goldenhour/web test
pnpm typecheck
pnpm test
pnpm build
```

The fixtures package currently has no test script; place importer regression tests in an existing configured suite or add a deliberate test setup. Do not invoke a nonexistent script and count it as tested. Playwright/browser and database integration commands must be added and documented if they are not present. Existing lint echo scripts do not validate code.

Container checks must cover builder config files, package exports, runtime Node compatibility, emitted JSON assets, migration packaging and a real API process start. TypeScript compilation alone cannot catch a package manifest pointing at a source path omitted from the image. Use a dedicated disposable test database with a known target; no production or unrelated local data belongs in this check.

### J. Completion report required from Antigravity

The implementer must provide:

1. Dataset manifest and preserved-identity comparison with actual unique facility count.
2. Coverage status: supplied-only, expanded-reviewed or incomplete, with source dates and unresolved regions.
3. Bug register F-01–F-31 with fixed/currently-not-applicable/blocked disposition and evidence.
4. Tests D/P/R/S/V/A/B with exact commands/results; distinguish mock, real database and browser coverage.
5. Migration/import/cutover report and recovery instructions; evidence that a new process reads persistent data.
6. Pin interaction demonstration including off-mode, invalid road point, stale request and 35 km valid setup origin.
7. Performance measurements with device, dataset/graph size, mode and seed.
8. Remaining limitations and disabled features. No “all fixed” claim while a required gate is incomplete.

## Final acceptance matrix

| Requirement | Required evidence |
|---|---|
| Preserve names/locations | Exact source-to-database-to-API identity comparison |
| Include supplied hospitals | Manifest row count equals unique canonical IDs and independently retrievable facilities |
| Extend to 40 km | Server, client circle, messages and boundary tests all use shared region config |
| Review “all hospitals” coverage | Source/date/area coverage worksheet and unresolved-candidate list |
| Improve operational dataset | Deterministic overlays, resource invariants, specialist/schedule consistency and NIL tests |
| Clean database | New schema migration, verified backup, ID reconciliation, persistence and cutover results |
| Pin reliability | Off-mode zero writes; one confirmation/one commit; stale responses ignored; exact resolved position parity |
| Regional routing | 30–40 km origin test, road connectivity and explicit no-route results |
| Agent integration | No legacy fixture dependency or invented capacity; readiness uses current structured state |
| Optimisation | Measured map lifecycle, payload, latency and frame-time results |
| Project cleanup | Reviewed file inventory and passing build from source |

## Decisions to record before later implementation

- Confirm that the supplied NITK centre remains the intended region origin; use it by default for this plan.
- Select licensed sources for expanding hospital coverage and routable roads; record usage and storage restrictions.
- Select demo operational profiles and scenario seeds; keep real hospital identity separate from synthetic clinical/service claims.
- Identify the exact development database and backup destination; keep cleanup isolated from unrelated services and data.
- Configure map credentials securely, allowed domains and any required map ID; no secrets belong in this Markdown file.
- Agree reference browser/device for performance evaluation and clinical ownership for any workflow intended beyond a demonstration.

## Instructions for an implementing developer

Complete the dataset milestone first. Start by repairing identity collisions and legacy seed merging, not by adding more map components. Preserve all source hospital names and coordinates exactly. Keep new operational parameters in explicit synthetic overlays. Use the 40 km configuration consistently. Rebuild and reconcile persistent storage before retiring the old data path. Then repair pin mode, validation and commit semantics together; a button-only patch will not fix backend coordinate/version errors. Finish with measured optimisation, scoped cleanup and evidence-backed verification.


