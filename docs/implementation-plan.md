# GoldenHour implementation plan and AI coding prompts

Version: 24 October 2026  
Target: working hackathon demonstration using synthetic patient data and five simulated hospitals.

## 1. Product and scope

Build three connected interfaces:

1. **Ambulance:** a medical professional enters patient information, confirms requirements, sees main destination A and visible backups B/C, updates the patient condition, chooses a diversion, and records arrival and handover.
2. **Hospital:** staff manually update actual resource and specialist availability, review incoming requests, confirm readiness, and record resource use and release.
3. **Admin:** manage hospitals and accounts, monitor emergencies and stale data, inspect activity history, and operate a connected 3D simulation.

The backend owns all decisions, reservations, permissions, and shared state. Three agent modules perform requirement interpretation, capability filtering, and time-based ranking. They are modules in one backend, not separate microservices. Start with deterministic rules and simulated routing; an LLM and external maps are optional later integrations.

### Rules that every phase must preserve

- A must meet the professional-confirmed full-care requirements. Rank eligible hospitals by estimated time until required care can start.
- B/C must meet the professional-confirmed immediate stabilization requirements. Select them from the ambulance's **current** position, not its initial position or proximity to A.
- The professional controls clinical requirements and diversions. The system does not independently diagnose, prescribe, or infer deterioration from animations.
- A hospital owning equipment is different from that equipment being currently available. Actual staff readiness matters, not only a roster.
- Main requests and standby notices are distinct. Notifications do not constitute confirmed acceptance.
- Reserve resources only for the confirmed destination. Standby B/C notices do not lock scarce equipment.
- A single resource cannot be promised to two patients. All required allocations succeed together or none succeed.
- Resources remain unavailable while reserved or in use. Arrival does not release a resource; actual use is recorded explicitly. Only a hospital update marking it ready releases an in-use resource.
- Hospital staff update actual capacity and occupancy; the backend maintains reservations and computed availability. Staff must not overwrite a computed free count.
- Pending, stale, unknown, and confirmed states must look different.
- Every screen and the 3D scene uses the same backend state. Client animations do not decide clinical or inventory outcomes.
- Real clinical deployment is out of scope. Clinical scenario rules require qualified review before use beyond the synthetic demonstration.

## 2. Recommended implementation structure

Use this default unless a working repository already has an equivalent stack. Do not rewrite an existing working system just to match these choices.

| Layer | Default |
|---|---|
| Workspace | TypeScript monorepo with pnpm workspaces |
| Frontend | React, Vite, React Router, Tailwind CSS |
| Server state in frontend | TanStack Query; small local state for UI only |
| Backend | Node.js, Fastify, TypeScript |
| Shared validation | Zod schemas and shared DTO types |
| Database | PostgreSQL; `pg` driver, parameterized SQL, versioned SQL migrations |
| Live updates | Socket.IO; authenticated subscriptions plus REST snapshots |
| Map MVP | Local simulated road network with an SVG map; external map adapter later |
| 3D | Three.js through React Three Fiber and Drei, compatible stable releases |
| Tests | Vitest, API integration tests against PostgreSQL, Playwright |
| Local runtime | Docker Compose for PostgreSQL; separate web and API processes |

Keep one API server and one database initially. Redis, Kubernetes, microservices, ambulance hardware integration, real patient records, and real hospital integrations are not MVP requirements.

Choose supported stable dependency versions during Phase 1, verify compatibility against official documentation, and commit the lockfile. Do not blindly install `latest` or mix documentation for different major versions.

```text
apps/
  web/src/
    app/                  # Router, providers, authentication
    features/ambulance/
    features/hospital/
    features/admin/
    features/simulation/
    components/           # Shared visual components
    lib/                  # Typed API client and live subscriptions
  api/src/
    modules/auth/
    modules/hospitals/
    modules/resources/
    modules/cases/
    modules/dispatch/
    modules/agents/
    modules/routing/
    modules/realtime/
    modules/simulation/
    db/
packages/
  contracts/              # DTOs, request validation, events, enums
  scenario-fixtures/      # Synthetic inputs, road graph, hospital seeds
migrations/
tests/e2e/
docs/
```

## 3. How to use the prompts

Save this file as `docs/implementation-plan.md` in your coding repository. Give your coding AI the master prompt below, followed by **one phase prompt at a time**. Complete each phase's acceptance gate before starting the next.

Every phase must leave the repository runnable. Update `docs/progress.md` with implemented features, commands run, results, unresolved issues, and the next phase. Commit each completed phase locally if Git is available. Do not publish, deploy, or push merely because a phase mentions future deployment.

### Master prompt — use at the beginning of every coding session

```text
You are implementing GoldenHour, a hackathon emergency hospital coordination app.
Read docs/implementation-plan.md, AGENTS.md if present, docs/progress.md, and the existing repository before editing.
Implement only the phase I specify, including its necessary integration and tests.
Preserve the confirmed product rules and previously working behavior.

Use the stack already selected in the repository. If this is Phase 1 with no existing stack, use the plan's defaults and verify compatible stable versions using official docs.
Keep one backend, one database, shared contracts, and three agent modules.
Never put clinical decisions, inventory allocation, or authorization solely in frontend code.
Never replace a working database implementation with hardcoded arrays to make a UI appear functional.
Use synthetic patient data. Keep secrets server-side. Validate all incoming requests.
Do not create real treatment rules or claim the demonstration is clinically validated.

Implement the code, migrations, API contracts, UI connections, and meaningful tests required for this phase.
Run the relevant checks and fix failures. Report failures honestly; do not weaken assertions to make tests pass.
If infrastructure or credentials are unavailable, use the documented demo adapter and clearly report the limitation.
Do not silently change contracts; update backend, frontend client, events, and tests together.
Do not make unrelated changes or start later phases.
Finish by updating docs/progress.md and summarizing changed files, run commands, test results, and remaining blockers.
```

## 4. Shared contracts and state design

Define these in Phase 2 before complex UI work.

### Main records

| Record | Important fields |
|---|---|
| User | ID, role, hospital or ambulance membership, password hash, active flag |
| Hospital | ID, name, coordinates, capabilities, receiving status |
| StaffAvailability | Hospital, specialty, available team slots, ready-at time, updated-at |
| ResourcePool | Hospital, resource type, total count, out-of-service count, external occupancy, version, updated-at |
| Allocation | Case, pool, quantity, RESERVED/IN_USE/RELEASED state, timestamps |
| EmergencyCase | Assigned ambulance, case status, assessment version, destination version, synthetic patient details |
| Assessment | Observations, timestamps, requirements, clinician confirmation, version |
| AmbulancePosition | Ambulance, coordinates, server sequence, observed-at |
| Recommendation | Assessment/position/inventory versions, A/B/C, reasons, missing capabilities, time components |
| HospitalRequest | Case, hospital, MAIN/STANDBY role, status, destination generation, expiry/review metadata |
| Destination | Selected hospital, pending/confirmed readiness, version, clinician or system actor |
| AuditEvent | Actor, action, entity, timestamp, minimal change details |
| OutboxEvent | Event ID, entity/version, authorized event type, delivery state |
| SimulationRun | Seed, graph, clock, running/paused state, scenario state |

Use UTC timestamps, integer resource quantities, seconds for durations, and explicit latitude/longitude fields. Use request IDs for tracing and opaque IDs for entities.

### Keep different lifecycles separate

- **Case:** DRAFT → ASSESSED → DISPATCHING → EN_ROUTE → ARRIVED → HANDED_OVER → CLOSED. CANCELED is an allowed terminal path with explicit rules.
- **Hospital request:** PENDING → ACCEPTED / DECLINED / CANCELED / EXPIRED. STANDBY is a request role, not a guarantee.
- **Destination readiness:** PENDING / CONFIRMED / UNAVAILABLE.
- **Resource allocation:** RESERVED → IN_USE → RELEASED; an unused reservation may go directly to RELEASED.

Case closure and resource release are separate. A handed-over or closed transport case may still own an in-use ventilator allocation.

### Inventory calculation

```text
available = total - out_of_service - external_in_use
            - active_reserved_allocations - active_in_use_allocations
```

`external_in_use` covers patients not represented by GoldenHour allocations. Never include the same patient in both external occupancy and an allocation. Reject changes that make committed quantities exceed capacity; report a resource incident if an already committed device fails instead of silently erasing its allocation.

### Time calculation

For each clinically eligible hospital:

```text
arrival_at = now + route_travel_seconds
care_start_at = max(arrival_at, required_resources_ready_at)
                + additional_receiving_delay_seconds
time_to_care_seconds = care_start_at - now
```

Do not double-count preparation that overlaps travel. Unknown readiness stays unknown. For the initial demo, confirm only resources that can actually be allocated now; future release estimates may be shown as unconfirmed possibilities, never as guaranteed inventory.

### Suggested API surface

All business endpoints use `/api/v1`. Finalize the DTOs before implementing callers.

| Area | Endpoints |
|---|---|
| Authentication | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Hospitals | `GET /hospitals`, `GET /hospitals/:id`, authorized `PATCH /hospitals/:id` |
| Live inventory | `GET /hospitals/:id/resources`, `PATCH /resource-pools/:id`, `PATCH /staff-availability/:id` |
| Cases | `POST /cases`, `GET /cases/:id`, `POST /cases/:id/assessments`, `POST /cases/:id/confirm-requirements` |
| Matching | `POST /cases/:id/recommendations`, `POST /cases/:id/dispatch` |
| Hospital actions | `GET /hospital-requests`, `POST /hospital-requests/:id/accept`, `POST /hospital-requests/:id/decline` |
| Journey | `POST /ambulances/:id/positions`, `POST /cases/:id/divert`, `POST /cases/:id/arrive`, `POST /cases/:id/handover` |
| Allocation | `POST /allocations/:id/start-use`, `POST /allocations/:id/release` |
| Admin | `GET /admin/overview`, `GET /admin/audit`, user/hospital management routes |
| Demo | `POST /simulation/start`, `/pause`, `/reset`, `/step`, `/scenario` |

Mutation requests carry an idempotency key where repeats have consequences, and `expectedVersion` where overwriting newer state matters. Conflicts return a structured 409 with a refresh instruction. Standard errors contain `code`, `message`, safe `details`, and `requestId`.

Live events include `case.updated`, `recommendation.updated`, `request.updated`, `inventory.updated`, `ambulance.position.updated`, and `simulation.updated`. An envelope contains `eventId`, `entityId`, `entityVersion`, and `occurredAt`. Broadcast only to authorized rooms. Persist durable business events in the same transaction as mutations; clients deduplicate and refetch snapshots on reconnect or version gaps.

## Phase 1 — Repository foundation

**Outcome:** web, API, database, and shared package start locally.

```text
Implement Phase 1 of docs/implementation-plan.md.
Create or adapt the TypeScript workspace, apps/web, apps/api, packages/contracts, and packages/scenario-fixtures.
Set up React/Vite, Fastify, PostgreSQL using Docker Compose, shared TypeScript configuration, linting, formatting, and Vitest.
Use the pg driver with a migration runner and parameterized SQL. Provide .env.example without secrets.
Implement /health/live and /health/ready; readiness must check the database.
Create a basic GoldenHour shell with Ambulance, Hospital, and Admin routes and an API health indicator.
Use a dev proxy and document local ports. Pin compatible dependencies and commit the lockfile.
Provide root commands for dev, build, lint, typecheck, test, migrate, and seed.
Document exact startup commands in README.md. Verify web-to-API communication and database readiness.
Do not implement business logic yet.
```

**Gate:** clean setup can start the database and both apps; the web screen shows real API readiness; build and type checks pass.

## Phase 2 — Contracts, database, identity, and seeded data

**Outcome:** consistent records and authorization boundaries exist before feature work.

```text
Implement Phase 2 using the shared record and state definitions in the plan.
Create shared Zod request/response schemas, state enums, and event envelopes.
Create SQL migrations with foreign keys, nonnegative quantities, version columns, and required uniqueness constraints.
Implement the User, Hospital, StaffAvailability, ResourcePool, Allocation, EmergencyCase, Assessment, HospitalRequest, Destination, Recommendation, AuditEvent, OutboxEvent, and SimulationRun structures.
Add five synthetic hospitals, a connected road graph, one ambulance, demo users for each role, and repeatable seeded scenarios. Seed must be safe to rerun.
Implement login/logout/me with secure password hashing and server-side sessions in HTTP-only cookies. Use CSRF protection or verified same-origin mutation policy, explicit CORS, and role plus ownership checks.
Provide demo credentials through documented development setup, never production defaults.
Implement a typed frontend API client and authenticated route guards. Server authorization is mandatory even with route guards.
Document contracts and state transitions. Test cross-hospital access denial, unauthorized requests, DTO validation, and migration/seed repeatability.
```

**Gate:** each role logs in; hospital A cannot mutate hospital B; shared schemas are imported by both apps; seed contains exactly the intended five hospitals.

## Phase 3 — Hospital live data vertical slice

**Outcome:** the hospital screen edits real database state through the API.

```text
Implement Phase 3 as a complete frontend-to-backend feature.
Create hospital resource and staff readiness read/update APIs with ownership checks, optimistic concurrency, audit entries, and timestamps.
Compute availability using the plan's formula. Do not accept arbitrary client-supplied available counts.
Track external occupancy separately from GoldenHour allocations. Reject impossible capacity edits and show actionable conflict messages.
Build the hospital dashboard with resource quantities, specialty readiness, receiving status, last-updated time, and forms for manual changes.
Use the real API, not frontend hardcoded hospital arrays. Include loading, validation, conflict, empty, and error states.
Keep current values after a failed request; show success only after server acknowledgment.
Test that an edit persists after reload, is visible through another authorized session, and cannot reduce capacity below committed use.
```

**Gate:** editing a hospital updates PostgreSQL and survives reload; negative or conflicting updates are rejected.

## Phase 4 — Ambulance case entry and Agent 1

**Outcome:** a real case can be created and its requirements confirmed.

```text
Implement Phase 4.
Build case creation, assessment versioning, and requirement confirmation APIs plus the ambulance form.
Capture synthetic patient label, presenting issue, relevant observations with units and timestamps, clinician-assessed urgency, ambulance support, and optional notes. Support unknown values explicitly.
Implement Agent 1 as a deterministic, versioned scenario-rule module with typed inputs and outputs. It returns proposed full-care and stabilization requirements, reasons, and missing inputs.
Use synthetic demonstration scenarios; do not invent clinical vital-sign thresholds or generate treatment advice.
Show the proposed requirements for the medical professional to review and edit. Persist confirmed requirements with actor and timestamp.
Invalidate recommendations when confirmed requirements change. An old recommendation must not dispatch a newer assessment.
Test incomplete input, explicit unknowns, manual requirement changes, authorization, and assessment-version conflicts.
```

**Gate:** a clinician can create, reload, edit, and confirm a case; Agent 1 never silently treats missing information as normal.

## Phase 5 — Agent 2, Agent 3, and routing

**Outcome:** the backend produces explainable A/B/C recommendations.

```text
Implement Phase 5.
Agent 2 filters full-care and stabilization candidates separately using confirmed requirements, capabilities, staff readiness, and inventory freshness.
Agent 3 ranks eligible candidates by estimated time to the relevant care, using the plan's time calculation. Use deterministic tie-breaking.
Build a RoutingProvider interface and a simulated provider using shortest paths on the seeded road graph. Edge travel times include scenario traffic multipliers. Do not use straight-line distance as road ETA.
Select A as the best full-care candidate. Select B/C as distinct stabilization candidates excluding A, evaluated from the current ambulance position.
Return fewer options honestly when there are insufficient candidates. Return reasons for eligibility, rejection, missing capabilities, and unknown readiness.
Persist the input versions and scoring components with each recommendation. Separate confirmed allocatable candidates from future/unknown availability.
Add the ambulance recommendation panel and SVG map with A primary and B/C clearly labeled backups.
Test a nearby unsuitable hospital losing to a suitable one, readiness changing the result, route traffic changing ETA, and backup ranking changing with ambulance movement.
```

**Gate:** seeded scenarios yield predictable results; the UI explains why each option was selected; B/C use the latest position.

## Phase 6 — Dispatch, acceptance, and atomic reservations

**Outcome:** a hospital can accept a case without overbooking resources.

```text
Implement Phase 6.
Dispatch creates a main request for A and standby requests for B/C. Store the assessment version and destination generation.
Implement hospital accept/decline APIs and the incoming-request UI. Reject obsolete requests after requirements or destination changes.
On main acceptance, use one PostgreSQL transaction to lock the case and required resource rows in a consistent order, recheck availability, allocate every required quantity, mark the request accepted, confirm the destination, append audit/outbox events, and commit.
If any requirement fails, rollback all allocations and return a structured conflict. Use bounded retries for retryable database conflicts.
Use idempotency keys and a database-enforced one-active-destination invariant. Two repeated accept requests must not allocate twice.
Include reservable specialist/team slots where required; Boolean staff availability alone cannot prevent double booking a single team.
Standby acknowledgment does not allocate resources. Hospital-configured auto-accept must call exactly the same checked transaction as manual acceptance.
Test with a real PostgreSQL database and concurrent requests: two cases competing for the last ventilator must produce exactly one successful allocation; a multi-resource failure must leave no partial reservation.
```

**Gate:** concurrent booking test passes; no inventory becomes negative; old standby/main requests cannot overwrite the current destination.

## Phase 7 — Real-time synchronization and recovery

**Outcome:** changes appear consistently across logged-in screens.

```text
Implement Phase 7.
Add Socket.IO authentication and server-authorized rooms for assigned ambulance cases, the user's hospital, and permitted admin views.
Persist business events in an outbox within their mutation transactions. Publish committed events through a single-process dispatcher with retry and event IDs.
Do not emit confirmed inventory or acceptance changes before transaction commit. Delivery may repeat; consumers must deduplicate.
Integrate events with TanStack Query invalidation and snapshot refetch. Compare entity versions and ignore older updates.
On reconnect, resubscribe and refetch authoritative snapshots even if transport recovery succeeds. Show disconnected/stale status and prevent pretending a local write succeeded.
Position updates may be throttled and transient, but must include sequence/time and persist the latest authoritative position.
Test accept-in-hospital updating the ambulance view, unauthorized room subscriptions, duplicate events, out-of-order events, and state reconciliation after disconnect.
```

**Gate:** two browser sessions agree after acceptance and after reconnection; missing a socket event does not permanently corrupt UI state.

## Phase 8 — Dynamic backups, diversion, arrival, and release

**Outcome:** the complete journey works, including a clinician-selected backup.

```text
Implement Phase 8.
Recompute backups on accepted location updates, traffic changes, requirement changes, and inventory changes. Throttle recalculation and use a configurable improvement margin to avoid constant backup swapping.
Update standby tickets when membership changes; cancel obsolete standby notices. Keep A and its reservation stable unless explicitly changed or invalidated.
Implement clinician diversion with expectedVersion and idempotency. Persist the chosen destination and generation, notify affected hospitals, switch navigation, and show pending readiness until acceptance succeeds.
Try to confirm the new destination through the same allocation service. Where the switch is confirmed immediately, allocate the new destination and release unused old reservations atomically. For an explicit pending diversion, cancel the old incoming request and release its unused reservation as a deliberate logged action; never release in-use allocations.
A late response from the old hospital must not restore the old route. If the new hospital cannot confirm, display unavailable/pending status and alternatives; never silently reverse the clinician's action.
Add arrive and handover actions. Add hospital start-use and release actions separately. Arrival or case closure must not automatically release equipment or imply every reserved item is in use.
Test diversion notifications, changed roles, no leaked unused reservations, old acceptance rejection, and occupied equipment remaining unavailable after handover.
```

**Gate:** a diversion changes every interface correctly; unused reservations are released once; in-use resources remain unavailable until hospital release.

## Phase 9 — Admin management and monitoring

**Outcome:** the admin can operate and inspect the system.

```text
Implement Phase 9.
Create the admin dashboard using real APIs: active cases, hospital readiness, stale updates, resource occupancy, pending requests, and ambulance positions.
Add authorized user/hospital management and an audit timeline with filters by case, hospital, action, and time.
Admin configuration must not silently override clinical requirements or release occupied equipment.
Add configurable demo refresh, staleness, and ranking-improvement settings with validation and documented units.
Provide clear empty/loading/error states and usable keyboard navigation.
Test that admin endpoints reject hospital and ambulance users, sensitive patient fields are not unnecessarily exposed, and updates have actor-attributed audit entries.
```

**Gate:** admin can trace one case from creation through handover and explain every destination/resource change.

## Phase 10 — Connected 3D simulation

**Outcome:** a convincing demonstration driven by actual application state.

```text
Implement Phase 10.
Add an admin simulation view using React Three Fiber, Three.js, and simple reusable geometry for roads, five hospitals, and an ambulance.
Use the same road graph, hospital coordinates, current route, and server position as the 2D map. Define one deterministic conversion from map coordinates to scene coordinates.
The server owns the simulation clock and moves the ambulance along route edges. Clients interpolate for smooth rendering but never authoritatively advance case state.
Add start/pause/step/speed/reset controls and scenario actions for traffic, hospital availability, and a simulated condition change requiring clinician confirmation.
Route all changes through existing domain services. Scenario controls must not directly bypass allocation invariants or edit browser-only counters.
Show A and B/C, ETA, readiness, and the event timeline. Make reset admin-only, confirmation-gated, and restricted to the synthetic demo dataset.
Provide an SVG/text fallback if WebGL is unavailable. Use basic shapes before spending time on detailed assets.
Test pause/resume, route changes after diversion, inventory consistency, and deterministic replay from the same seed.
```

**Gate:** ambulance movement changes backend position and backup ranking; a hospital update affects both normal screens and the 3D scene.

## Phase 11 — Dedicated frontend and backend integration gate

**Outcome:** the full product works across roles, beyond isolated component tests.

```text
Implement Phase 11 as an integration and stabilization pass, not a redesign.
Audit every visible control and connect any unfinished one to the real API. Remove accidental hardcoded data outside scenario fixtures.
Verify DTOs, endpoint paths, units, IDs, auth cookies, proxy/CORS policy, event names, version handling, and error display across apps.
Create Playwright tests with independent authenticated browser contexts for ambulance, hospital, and admin, backed by a real test PostgreSQL database and seeded demo data.
Exercise: create case -> confirm requirements -> rank A/B/C -> dispatch -> hospital acceptance -> reservation -> live position -> clinician diversion -> backup confirmation -> arrival -> start use -> handover -> hospital release.
Assert database resource counts and destination versions, not only that a success toast appeared.
Also test last-resource contention, stale hospital data, unconfirmed destination presentation, reconnect/refetch, and a late acceptance after diversion.
Document and fix defects. Run migration from a clean database and a production frontend/API build.
Do not call integration complete if only mocked network tests pass.
```

**Gate:** end-to-end flow passes across all three roles; critical concurrent allocation tests pass; no broken controls remain in the demo path.

## Phase 12 — Optional live maps and optional LLM assistance

**Outcome:** replace adapters without changing the verified domain logic. Skip this phase if the demo deadline is close.

```text
Implement only the optional integration explicitly selected by the project owner.
For maps: implement the existing RoutingProvider with an approved real routing service, verify current provider terms and API docs, handle keys securely, quotas, failures, and ETA timestamps. Distinguish simulated and live results. Never label fallback simulated traffic as live.
For an LLM: add a server-side RequirementsInterpreter adapter that converts notes into a schema-validated proposal with missing fields and reasons. Treat text as untrusted input, use timeouts, and fall back to deterministic scenarios.
Keep clinician confirmation mandatory. The LLM must not allocate resources, accept cases, write clinical orders, or access unrestricted database tools.
Use synthetic patient data and server-side environment variables. If credentials are unavailable, leave the integration disabled with a clear setup guide.
Test adapter failure, invalid model output, missing fields, and preservation of the same allocation/ranking invariants.
```

**Gate:** the application still works without keys; failed external services do not fabricate successful or live results.

## Phase 13 — Packaging, deployment preparation, and presentation

**Outcome:** another developer can run the demo and the team can present it reliably.

```text
Implement Phase 13.
Prepare Dockerfiles or equivalent reproducible build/start instructions, environment validation, database migrations, and a deployment checklist for one persistent API service, PostgreSQL, and the frontend.
Ensure the chosen hosting model supports long-lived Socket.IO connections; document reverse-proxy settings, HTTPS, secure cookies, allowed origins, and health checks.
Keep secrets out of source control, logs, frontend bundles, and screenshots. Disable public demo reset and unrestricted signup by default.
Write README setup, environment reference, architecture overview, demo credentials/setup procedure, known limitations, and a short demo script.
Provide a deterministic demo reset command with an explicit development-only guard. Never run a destructive reset against an unknown database.
Run build, lint, typecheck, critical unit/integration tests, and Playwright smoke tests from a clean seeded setup.
Record what passed and what was not executable. Prepare deployment artifacts, but do not publish or incur hosting charges without a deployment instruction.
```

**Gate:** clean-machine instructions work; the demo is repeatable; production-like build works; deployment requirements and limitations are explicit.

## 5. Suggested execution order

| Milestone | Phases | What you should be able to demonstrate |
|---|---|---|
| Foundation | 1–2 | Log in by role and access seeded database records |
| First integrated features | 3–4 | Hospital edits availability; ambulance creates and confirms a case |
| Core coordination | 5–6 | Ranking, hospital response, and safe resource allocation |
| Live journey | 7–8 | Cross-screen updates, moving backups, diversion, and handover |
| Demo experience | 9–10 | Admin monitoring and connected 3D simulation |
| Reliability | 11 | Complete multi-user integration passes |
| Optional polish and delivery | 12–13 | Optional real integrations and reproducible deployment package |

Prioritize the complete 2D workflow before 3D polish. Do not defer API integration to the last week: each phase is an integrated vertical slice, and Phase 11 is the dedicated full-system gate.

## 6. Reusable repair and continuation prompts

### Resume after a new chat

```text
Read docs/implementation-plan.md and docs/progress.md, then inspect the repository and recent changes.
Identify the last completed acceptance gate and the next incomplete phase.
Verify existing commands before changing code. Continue only that phase, preserving the existing API contracts and working features.
Do not regenerate the project or replace persistent data with mocks.
```

### Fix a failed integration

```text
Reproduce the failure below and trace it from UI action through API validation, service logic, database transaction, event publication, and frontend refresh.
Find the first incorrect boundary. Add a regression test for the actual failure and implement the smallest coherent fix.
Do not hide the failure with fake success responses, disabled authorization, relaxed resource constraints, or arbitrary delays.
Rerun the affected integration flow and report the root cause, fix, and evidence.
Failure: [paste error and reproduction steps]
```

### Review a completed phase

```text
Review the current phase against docs/implementation-plan.md and its acceptance gate.
Inspect implementation, migrations, role permissions, concurrency behavior, contracts, UI states, and tests.
List concrete defects by severity with reproduction steps. Fix blockers and rerun relevant checks.
Check specifically for frontend-only state, stale recommendations, double allocation, early resource release, incorrect backup origin, and reconnect inconsistency.
Do not claim clinical validation or production readiness from software test success.
```

## 7. Final demo checklist

- [ ] Five distinct hospitals have useful differences in resources and staff readiness.
- [ ] One medical professional submits and confirms a synthetic case.
- [ ] A is clinically eligible under the demo rules and ranked by time to care.
- [ ] B/C remain visible and reflect current ambulance position.
- [ ] Hospital acceptance creates a real reservation in PostgreSQL.
- [ ] A second case cannot book the same last ventilator.
- [ ] Changing patient requirements invalidates obsolete recommendations and requests.
- [ ] A clinician-selected diversion updates navigation, tickets, and reservations.
- [ ] Handover does not make occupied equipment available.
- [ ] Hospital release makes the resource available again.
- [ ] Reloading/reconnecting restores authoritative state.
- [ ] Admin and 3D views match the ambulance/hospital views.
- [ ] Every displayed live/simulated status is accurate.
- [ ] Synthetic scenarios, clinical-review limitations, and external dependencies are documented.

## 8. Reference documentation

Verify exact APIs against the dependency versions selected in Phase 1.

- [Socket.IO — handling disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections): transport reconnection does not remove the application's need to synchronize state.
- [Socket.IO — client API](https://socket.io/docs/v4/client-api/): client connection and recovery behavior.
- [React Three Fiber — introduction](https://r3f.docs.pmnd.rs/): React-based scene construction and compatible package setup.
- [WHO — prehospital emergency care operational guidance](https://www.who.int/publications/9789240114067): clinical oversight and appropriate destination context; not a validation of GoldenHour.

The database model, API surface, phase boundaries, and demo defaults in this document are proposed engineering decisions for GoldenHour. They are not prescribed by these references.
