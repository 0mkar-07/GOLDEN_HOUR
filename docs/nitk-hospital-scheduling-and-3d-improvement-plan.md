# GoldenHour: NITK Map, Hospital Visibility, Operation Scheduling and 3D Simulator

**Prepared:** 24 October 2026  
**Document status:** Implementation proposal only.  
**Execution restriction:** Do not execute this document, install its proposed dependencies, run migrations or change application code as part of this documentation delivery.  
**Delivery structure:** Five stages, implemented and verified one by one in a future authorized implementation task.

## 1. Requested outcomes

1. Fix hospital markers being visible only after logging in as an administrator. Authorized ambulance and hospital users should see the permitted regional facility directory without first visiting the admin page.
2. Center the preview on NITK Surathkal and use reviewed locations of actual nearby hospitals. Do not scatter fictional markers around a random radius or place them in the sea, rivers or inaccessible areas.
3. Add hospital service hours, operating-theatre schedules and elective/emergency procedure classification.
4. When an incoming emergency conflicts with a scheduled elective procedure using the same resources, create a hospital-review ticket requesting that an eligible, not-yet-started elective case be deferred in favor of the emergency.
5. Build a genuine 3D simulation view with roads, buildings and trees that agree with the geographic dataset and the authoritative simulation state.

The scheduling feature is a coordination workflow. It must not automatically stop a procedure already underway. The responsible hospital team decides whether a planned elective case can be deferred and confirms actual resource availability. A ticket is not an accepted hospital transfer or an equipment reservation.

## 2. What source inspection established

The application was not run to reproduce the visibility issue. These findings identify investigation targets, not a confirmed runtime diagnosis.

| Area | Observed state | Consequence |
|---|---|---|
| Hospital directory API | `GET /api/v1/hospitals` uses `requireAuth`, not an admin-only role requirement | Do not assume the fix is removing an admin restriction |
| Ambulance map loading | `loadMapAndHospitals` combines graph and hospital calls using `Promise.all` | One rejected request prevents the successful hospital response from being applied |
| Authentication timing | `AuthProvider` loads the session asynchronously; ambulance data loading is not explicitly keyed to completed authentication | Initial unauthorized requests may not be retried when login completes |
| Role change | User identity changes in context | Effects, requests, caches and socket subscriptions must follow the new authenticated identity |
| Admin map | Fetches hospital data through its own page flow | Its success does not prove other pages load the same directory correctly |
| Hospital contract | Includes address, location, capabilities, receiving status and delay | No operation scheduling model is present in the inspected contract |
| Resource contract | Includes pools, allocations and staff readiness | Scheduling needs timed reservations/resource assignments in addition to aggregate counts |
| Simulator renderer | `Simulation3DView.tsx` renders an SVG with a perspective transform | Buildings and true 3D require a real scene renderer, not another CSS tilt |
| Web dependencies | React 18, React Three Fiber 9, Drei 10 and Three.js are declared | Check and resolve peer compatibility before activating a real renderer |

The [React Three Fiber introduction](https://r3f.docs.pmnd.rs/getting-started/introduction) specifies that Fiber 8 pairs with React 18 and Fiber 9 pairs with React 19. Installed dependencies alone do not establish a working compatible 3D stack.

## 3. Shared design rules

- Hospital directory visibility is separate from permission to edit a hospital, inspect patient records or change its schedule.
- Real-world location does not prove clinical capability, current capacity, opening hours or participation in this application.
- Use real location metadata with clearly labelled synthetic operational data for demonstrations.
- Keep map center, ambulance starting point, hospital building position and ambulance entrance as distinct coordinates.
- Use one region dataset for geographic map, preview routes and simulator. Changing labels while retaining the old New York coordinates is not a migration.
- Store appointment timestamps in UTC and display local schedules using the hospital timezone, initially `Asia/Kolkata` for this region.
- An elective classification belongs to a procedure/case, not a permanent `isElective` property of a hospital.
- A possible schedule change must not make a hospital appear immediately available before approval and resource revalidation.
- Existing clinician confirmation, stabilization/full-care intent, hospital acceptance and allocation lifecycle remain authoritative.

## Stage 1 — Fix hospital visibility across authenticated roles

**Goal:** Hospitals load reliably for ambulance, hospital and admin users, including fresh login and role changes.

### 1.1 Tools to use

| Tool | Purpose |
|---|---|
| Browser DevTools Network panel | Inspect hospital/graph requests, status codes, cookies and response timing |
| React DevTools | Inspect authenticated user, loading state and hospital props passed to the map |
| Fastify request logs with request IDs | Trace server authorization without logging cookies or secrets |
| Vitest and Testing Library | Test login timing, role switching and partial network failures |
| Fastify `app.inject` | Verify directory permissions separately from mutation permissions |

No new frontend framework is required. A shared hook and explicit request state are sufficient for the initial fix.

### 1.2 Reproduce before changing behavior

Test each path in a clean browser session:

1. Direct login as ambulance user and immediate opening of the map.
2. Direct login as hospital user and opening the authorized regional view.
3. Admin login followed by switching to ambulance or hospital.
4. Page refresh with an existing session.
5. Logout and login as a different user without a full browser reload.
6. Hospital request succeeds while graph or preview routing request fails.
7. An old admin request resolves after the user has switched roles.

For each reproduction, record whether the API returned hospitals, whether the frontend stored them, and whether marker rendering received valid coordinates. Diagnose these separately; an empty map is not always an empty database.

### 1.3 Proposed loading flow

1. Wait for authentication resolution. Do not issue authenticated directory calls while `loading=true` or no authenticated user exists.
2. Load the permitted directory independently of graph and route requests.
3. If using a grouped operation, use independent settled results and apply successful responses individually. Do not discard hospital data because routing failed.
4. Key directory loading by authenticated user/session generation and service region. Reload when those inputs change.
5. Cancel obsolete requests or ignore their responses using a request-generation token.
6. Clear sensitive user-specific state immediately on logout/role change. Do not reuse an admin cache across users.
7. Represent `loading`, `ready`, `empty` and `error` separately. Show “Unable to load hospitals — Retry” rather than silently displaying no markers.
8. Keep directory rendering independent of whether an active case, recommendation or destination exists.
9. Reconnect sockets with the current authenticated session and authorized rooms; do not retain old admin subscriptions.

### 1.4 Access matrix

| Action | Ambulance | Hospital | Admin |
|---|---|---|---|
| View authorized regional facility names/locations | Yes | Yes | Yes |
| View approved receiving-status summary | Yes | Yes | Yes |
| Edit facility location or service hours | No by default | Own facility, if permitted | Authorized region |
| View detailed elective schedule | Only derived readiness summary | Own facility | Only with explicit scheduling permission |
| Approve deferral of an elective case | No | Designated hospital scheduling/clinical role | Not merely because the user is admin |
| View unrelated patient records | No | No | Only explicitly authorized scope |

Do not make the directory public or bypass authentication to fix this bug. If a public preview is later required, provide a separate minimal endpoint without patient or detailed resource data.

### 1.5 Expected implementation locations

- `apps/web/src/context/AuthContext.tsx`: expose stable authentication/session state as needed.
- `apps/web/src/pages/AmbulancePage.tsx`: separate directory/graph/route loads and retry after authentication.
- `apps/web/src/pages/HospitalPage.tsx` and `AdminPage.tsx`: share directory semantics.
- Proposed `apps/web/src/hooks/useHospitalDirectory.ts`: shared role-aware load state and stale-response protection.
- `apps/web/src/components/MapPanel.tsx` and `LiveMap.tsx`: display directory loading/error/empty states.
- `apps/api/src/modules/hospitals/routes.ts`: verify read scope and preserve ownership checks on writes.

### 1.6 Acceptance gate

- [ ] Hospitals appear on direct ambulance/hospital login without any admin visit.
- [ ] A graph/route failure does not hide successfully loaded hospitals.
- [ ] Slow authentication causes a later authenticated load, not a permanently empty map.
- [ ] Old admin responses cannot populate a different user's state.
- [ ] Hospital users cannot mutate another facility or read its detailed elective schedule.
- [ ] Loading, empty and failed states are distinguishable and retryable.

## Stage 2 — Create a reviewed NITK regional geography dataset

**Goal:** Use NITK Surathkal as the preview area and place facilities at reviewed real locations with road-accessible arrival points.

### 2.1 Geographic scope and reference sites

NITK's official material locates the campus at Srinivasnagar, Surathkal, on both sides of NH 66, with the Arabian Sea to the west. This makes coastline checks especially important. See [NITK campus details](https://old.nitk.ac.in/general-info/campus-details) and [NITK contact information](https://webj.nitk.ac.in/general/contact).

Start with a small reviewed directory rather than a large automatically generated set:

| Site | Verified identity/address context | Role in the preview | Verification still required |
|---|---|---|---|
| NITK Surathkal | Srinivasnagar, Surathkal | Default map center and a separately chosen demo incident origin | Exact preview center, drivable ambulance starting point and permitted campus access |
| NITK Health Care Centre | Campus health centre, described by NITK as near the main playground | Campus landmark/health facility | Exact entrance; do not presume tertiary emergency capability |
| Padmavathi Hospital, Surathkal | Listed by NITK near the Surathkal overpass/corporation location | Nearby hospital candidate | Exact footprint, vehicle entrance and operational participation |
| Srinivas Institute of Medical Sciences, Mukka | Listed by NITK at the integrated campus in Mukka | Northern regional hospital candidate | Exact hospital building/entrance, not just the university campus centroid |
| A.J. Hospital & Research Centre | Official contact page gives NH 66, Kuntikana, Mangaluru | Regional hospital candidate | Emergency vehicle approach and arrival point |

The NITK health-centre and nearby-hospital identities are supported by [NITK's health-care directory](https://www.nitk.ac.in/Health_care_centre). A.J.'s location is supported by its [official contact page](https://www.ajhospital.in/contact). These sources establish identities/address context, not verified routing coordinates or current resource availability.

This document intentionally does not invent precise latitude/longitude pairs. The implementation deliverable must include a reviewed coordinate manifest before markers are enabled. A plausible address geocode is a candidate for review, not automatic approval.

### 2.2 Tools and data sources

| Tool/source | Use | Constraint |
|---|---|---|
| Official NITK/hospital websites | Confirm names, addresses, branch identity and entrance descriptions | Do not infer live capacity from marketing text |
| Google Places/Geocoding, if selected | Resolve exact named branches for the Google-map experience | Account/key required; verify storage/display terms before retaining results |
| Licensed OpenStreetMap regional extract | Roads, footprints, waterways and land-use for the owned simulator dataset | Preserve source date, attribution and license obligations |
| QGIS | Review markers, coastlines, building footprints and vehicle entrances visually | Human review supplements automated checks |
| Turf.js or an offline GIS script | Point-in-polygon, distance-to-road and geometry validation | Use a consistent coordinate system and units |
| Optional PostGIS | Persistent spatial queries as the dataset grows | Not required for a small reviewed static manifest |
| Configured routing provider | Verify a drivable route to the selected entrance | A route response does not certify the facility's clinical services |

OpenStreetMap data requires attribution and compliance with its license; see [OSM copyright and license](https://www.openstreetmap.org/copyright). Use a versioned extract/build artifact, not a public query service on every browser frame. Do not copy Google map geometry into an independently distributed OSM/Three.js scene.

### 2.3 Proposed location manifest

Store distinct fields for:

- `regionId`, region dataset version and timezone.
- Stable hospital/site ID, official name, branch and address.
- Building/label coordinate.
- Ambulance entrance coordinate and entrance description.
- Optional provider place ID and source object IDs where permitted.
- `locationSource`, source URL, acquisition date and licensing metadata.
- `verificationStatus`: `UNREVIEWED`, `APPROXIMATE_REVIEWED`, `ENTRANCE_VERIFIED`, `REJECTED`.
- Reviewer, review time, accuracy estimate and unresolved issues.
- A distinct `operationalDataMode=DEMO` flag for synthetic capacity/staff/schedules.

Use an openly licensed or owner-supplied dataset for persistent simulator geometry. Keep any provider-restricted location/route content in a separate policy-aware integration.

### 2.4 Placement workflow: no random hospital coordinates

1. Resolve each exact site and branch using official address context plus permitted geospatial data.
2. Inspect the building footprint and public/private road approach. Pick a building label point and a separate drivable ambulance entrance.
3. Validate latitude/longitude bounds, finite values, expected service-region extent and coordinate order. GeoJSON uses `[longitude, latitude]`.
4. Check the building/entrance points against water polygons and an explicit land/coastline mask. Absence from a river polygon alone does not prove a point is on land.
5. Verify the entrance is connected to a legal drivable road within a configurable tolerance. Reject points on the wrong side of a divided highway, behind inaccessible gates or disconnected from the route graph.
6. Request/inspect a route from the chosen NITK incident point to each entrance. Review suspicious straight connectors and failed approach geometry.
7. Approve the manifest manually. Keep unresolved sites in the directory as “location not verified” if useful, but do not fabricate a marker.
8. Freeze coordinates by stable ID. Re-rendering, resetting or logging in must not move facilities.

Do not prohibit every road-water intersection: valid bridges can cross waterways. Validate bridge/access metadata and elevation layers where present. Hospital buildings and tree placements should not appear in water; road bridges need different validation rules.

### 2.5 One coordinate model for map and simulator

- Geographic storage: WGS84 latitude/longitude.
- Scene coordinates: meters in a local projected coordinate system centered near NITK.
- A suitable regional option is UTM zone 43N (`EPSG:32643`), subject to validating the chosen dataset extent. Use a real projection library/QGIS, not multiplication of degrees by an arbitrary visual factor.
- Subtract a fixed local origin to keep Three.js coordinates small. Define scene axes explicitly, for example X east, Y up, Z south.
- Store an invertible projection definition and test landmark round trips. Keep altitude/elevation assumptions explicit.
- Derive legacy `x/y` compatibility fields from the same projection during migration; do not maintain unrelated handwritten coordinates.

### 2.6 Migrate the preview and fixtures together

Update, in a future implementation:

- Preview map center and initial zoom/bounds.
- Demo ambulance starting coordinate and reset behavior.
- Hospital location manifest and seeded records.
- Road graph nodes, edges, geometry, distances and travel-time model.
- Preview route endpoint and map bounds.
- Simulator projection, case fixtures and expected test coordinates.

Use a named region fixture such as `NITK_SURATHKAL_DEMO`. Do not mutate existing real GPS sessions or operational hospital records when selecting it. Keep synthetic resource values clearly separated from real facility identity.

Likely files include `packages/scenario-fixtures/src/index.ts`, proposed regional GeoJSON/manifests, `db/seed.ts`, relevant defaults in `db/store.ts`, routing preview handlers and simulation reset initialization. Search for old coordinates and hardcoded node mappings before declaring migration complete.

### 2.7 Acceptance gate

- [ ] Preview opens around reviewed NITK coordinates without requiring an active case.
- [ ] Every displayed hospital has a source, review state and stable location.
- [ ] No hospital or demo incident is placed in a water body or on an inaccessible point.
- [ ] Routes end at reviewed vehicle entrances, not arbitrary campus/building centroids.
- [ ] Old-region coordinates are absent from the NITK scenario path.
- [ ] Real hospital names do not imply real-time verified clinical capacity.
- [ ] The same landmark aligns in 2D map, schematic and 3D scene.

## Stage 3 — Add hospital service hours and procedure scheduling data

**Goal:** Represent when services/resources are available and which scheduled procedures may be reviewed for deferral.

### 3.1 Separate three meanings of “operation timings”

1. **Facility/service hours:** ED, outpatient clinic, imaging and other department availability.
2. **Operating-theatre availability:** staffed/open intervals, maintenance and turnover blocks for a specific theatre.
3. **Procedure booking:** a particular elective/emergency case's planned and actual time/resource requirements.

Do not use one hospital opening-time field for all three. A hospital may have one service available while another is closed. Unknown service hours remain unknown; do not assume every facility is 24/7.

### 3.2 Tools and implementation approach

- PostgreSQL migrations for durable scheduling records and constraints.
- Existing `pg` client for transactions and repository access.
- Zod and shared TypeScript contracts for request/response validation.
- A maintained timezone-aware date library, selected and pinned after compatibility review; use `Intl.DateTimeFormat` for display where sufficient.
- Existing Fastify routes and ownership checks for APIs.
- React forms and an accessible table/timeline for the hospital scheduling interface.
- Vitest plus real database integration tests for interval overlap and concurrency.

The current runtime contains in-memory business state. Adding SQL tables alone does not persist scheduling. Wire actual repositories to these routes, or clearly label an explicit in-memory demo adapter. Never silently fall back to volatile writes in production.

### 3.3 Proposed schema

| Entity | Key fields | Purpose |
|---|---|---|
| `hospital_services` | hospital ID, service type, timezone, schedule status, version | Separates ED/OT/imaging/outpatient operation |
| `service_hours` | service ID, weekday, local start/end, overnight indicator | Recurring weekly hours |
| `service_exceptions` | service ID, date/time range, closed/extended status, reason | Holidays and temporary changes |
| `operating_theatres` | hospital ID, theatre ID/name, capabilities, active status | Named rooms/resources |
| `theatre_availability` | theatre ID, time range, staffed state, blocked reason | Open, maintenance or turnover intervals |
| `scheduled_procedures` | hospital ID, procedure ID, classification, status, planned/actual timestamps, version | Individual scheduled cases |
| `procedure_resource_bookings` | procedure ID, resource/unit/team, quantity, occupied interval | Room, equipment and staff conflicts |
| `hospital_priority_policy` | hospital ID, policy version, permitted reviewer roles, response window, deferral rules | Explicit configurable coordination policy |

Procedure fields should include:

- `caseType`: `ELECTIVE`, `URGENT`, `EMERGENCY` or an explicitly unknown state.
- `status`: `SCHEDULED`, `PREPARING`, `IN_PROGRESS`, `COMPLETED`, `DEFERRED`, `CANCELLED`.
- Planned start/end; actual start/end; setup, preparation and turnover durations.
- Required theatre capabilities, equipment and staff assignments.
- `deferralEligibility`: `REVIEW_REQUIRED`, `NOT_DEFERRABLE`, or policy-approved eligibility; do not infer eligibility from `ELECTIVE` alone.
- Review/lock flags for preparation already underway, such as a hospital-defined noninterruptible phase.
- Decision owner, last verified time, source system and optimistic-lock version.
- An opaque case reference; no elective patient identity in ambulance-visible responses.

Use half-open occupied intervals `[start, end)` and require end after start. Expand occupancy to include relevant setup and turnover time. Use non-overlap constraints for individually named theatres where applicable; shared pools with quantity require transactional capacity checks, not just a single-room exclusion constraint.

### 3.4 APIs and UI

Proposed APIs, with explicit role/ownership checks:

- `GET /api/v1/hospitals/:id/services`: service-hours summary.
- `PATCH /api/v1/hospitals/:id/services/:serviceId`: permitted facility owner edits with expected version.
- `GET /api/v1/hospitals/:id/procedures?from=...&to=...`: bounded detailed schedule for authorized hospital personnel.
- `POST /api/v1/hospitals/:id/procedures`: create a validated booking.
- `PATCH /api/v1/procedures/:id`: reschedule or change state using expected version.
- `GET /api/v1/hospitals/:id/readiness-window`: ambulance-safe summary of resource readiness, without elective patient data.

Hospital page sections:

1. Service hours and exceptions.
2. Theatre/resource schedule with date navigation.
3. Procedure list with elective/urgent/emergency classification and actual status.
4. Pending emergency-priority review tickets.
5. Audit history of approved deferrals and rescheduling.

### 3.5 Acceptance gate

- [ ] Service hours and procedure timings are modeled separately.
- [ ] Elective classification is per case, not a hospital boolean.
- [ ] Cross-midnight intervals, local timezone display and exceptions work correctly.
- [ ] Invalid/overlapping resource bookings are rejected according to capacity.
- [ ] Restart recovery preserves durable scheduling state when durable mode is enabled.
- [ ] Ambulance users receive readiness summaries, not detailed elective records.

## Stage 4 — Create emergency-priority review tickets for scheduling conflicts

**Goal:** Detect shared-resource timing conflicts and request hospital action without pretending a planned deferral is already approved.

### 4.1 Tools to use

| Tool/pattern | Role |
|---|---|
| Existing route ETA and destination service | Estimate arrival at the selected hospital |
| Scheduling repository | Find relevant active bookings and resource conflicts |
| Deterministic interval/capacity evaluator | Detect conflicts; no LLM required |
| PostgreSQL transaction + version checks | Apply an approved schedule change consistently |
| Transactional outbox and Socket.IO | Deliver in-app tickets and status updates after commit |
| Durable job runner | Expire tickets and reevaluate stale conflicts |
| Fake clock and concurrency tests | Validate exact-time boundaries, race conditions and idempotency |

This plan covers in-app notifications only. Email/SMS/WhatsApp are separate integrations requiring explicit authorization and recipient/configuration decisions.

### 4.2 Detect an actual conflict

Do not compare ETA and elective start using exact timestamp equality. Calculate an arrival/readiness interval and intersect it with the relevant resource bookings.

```text
arrival estimate = route calculation time + remaining travel duration
arrival window = estimate plus/minus configured ETA uncertainty
emergency resource window = arrival window adjusted for intake/setup
                           and an approved estimated resource duration
elective occupied window = preparation + procedure + turnover interval

conflict = same required resource/team has insufficient capacity
           during overlapping emergency and elective windows
```

Unknown emergency duration or unknown staff/room demand produces a manual-review ticket, not a fabricated exact schedule. Use hospital-approved duration assumptions only, and record them with the ticket.

Examples:

- Elective start 14:00 IST; emergency arrival window 13:55-14:05 IST; same theatre and team required: review conflict.
- Same times but a separate staffed theatre and equipment are available: no elective deferral request is needed.
- Elective procedure already in progress: do not request automatic interruption; return actual availability and evaluate another resource/hospital.
- Elective end 13:50 but cleaning/setup runs until 14:10: include turnover in readiness.

Times above are synthetic examples, not medical rules or fixed policy settings.

### 4.3 When to create a ticket

Create tickets only for an authorized intended destination/case workflow, not every hospital evaluated in a ranking request. Recommendation refreshes should not flood facilities with deferral requests.

Suitable trigger: the crew selects a destination requiring a scheduling review and explicitly requests emergency-priority coordination. The server records the selected hospital, care objective, confirmed requirement version and arrival estimate, then creates/reuses the current conflict ticket.

If no destination is confirmed yet, describe the ticket as a preliminary availability review. It must not imply that the hospital has accepted the emergency or that an elective case is already cancelled.

### 4.4 Ticket model and states

Proposed `emergency_priority_tickets` fields:

- Ticket ID, emergency case ID, target hospital ID and destination generation.
- Care objective and confirmed assessment version.
- Conflicting procedure IDs and resource identifiers, visible only to authorized hospital roles.
- Arrival window, route source/version, route calculation age and schedule versions.
- Requested action: `REVIEW_ELECTIVE_DEFERRAL` or `REVIEW_RESOURCE_ALTERNATIVE`.
- Reason, urgency context from the confirmed case, policy version and expiration time.
- Idempotency/conflict fingerprint and created/updated versions.
- Response, reviewer, response time, reason and proposed availability.

Lifecycle:

```text
PENDING_REVIEW -> ACKNOWLEDGED -> APPROVED / DECLINED
PENDING_REVIEW or ACKNOWLEDGED -> EXPIRED / CANCELLED / SUPERSEDED
APPROVED -> APPLIED
```

Approval records the authorized decision; application performs versioned state changes. Prefer approval and application in one atomic transaction when feasible, avoiding a misleading approved-but-never-applied state. If they are separate, show that distinction explicitly and retry safely.

### 4.5 Hospital decision workflow

1. Show an in-app ticket with emergency arrival window, required resources and the conflicting schedule.
2. Let authorized staff choose a different theatre/team, approve deferral of a permitted unstarted elective case, decline, or propose a later availability time.
3. Recheck procedure state at decision time. If it changed to `IN_PROGRESS` or a protected preparation phase, reject automated deferral application and return the current state.
4. Recheck schedule/resource versions and other competing emergencies.
5. Apply any approved booking release/reschedule and emergency hold through a transaction. Do not create capacity by merely decrementing a counter twice.
6. Keep ordinary hospital acceptance separate unless an explicitly documented combined operation executes both checks atomically.
7. Notify the ambulance of the actual result: pending review, alternate resource proposed, available from a given time, or declined.
8. Record an audit entry for the decision, affected bookings, actor and versions.

Do not automatically cancel elective patient care. Approved deferral should create a tracked rescheduling task with responsible staff and a reason, rather than silently deleting the original booking.

### 4.6 Races, duplicate tickets and ETA changes

- Two emergencies competing for one slot must not both acquire it. Lock/version-check the shared resource and booking state.
- Duplicate network submissions reuse the same command idempotency key.
- Repeated ETA refreshes update the current ticket within policy rather than creating a ticket on every GPS tick.
- Materially changed arrival windows or destination generations supersede old tickets and require renewed review where relevant.
- Diversion to another hospital cancels the previous pending review; it does not automatically reverse an already applied elective deferral.
- Expired tickets cannot later approve resource changes using stale versions.
- A database failure must leave schedule, hold and outbox state consistently committed or unchanged.

### 4.7 Integrate with ranking and stabilization priorities

Use scheduling information as a time-to-care input, not as unconditional immediate availability:

```text
careStart = max(estimated arrival, verified resource ready time)
            + applicable receiving/setup delay
timeToCare = careStart - evaluation time
```

Avoid counting the same setup/turnover delay twice. Define which component owns each delay and retain separate explanatory fields.

A hospital requiring unapproved elective deferral should appear as **“Availability pending hospital review”**, not confirmed eligible capacity. Continue displaying valid stabilization alternatives B/C. Do not erase confirmed full-care requirements or automatically reroute while the review is pending.

### 4.8 Proposed endpoints and files

- `POST /api/v1/cases/:id/priority-review`: create an authorized review request.
- `GET /api/v1/hospitals/:id/priority-tickets`: hospital-scoped work queue.
- `POST /api/v1/priority-tickets/:id/decision`: reviewer action with expected version/idempotency key.
- `GET /api/v1/cases/:id/priority-review`: ambulance-safe status summary.
- Proposed contracts: `scheduling.ts`, `priority-ticket.ts`.
- Proposed modules: `modules/scheduling/`, `modules/priority-tickets/`.
- Extend hospital pages, readiness evaluation, Agent 3 timing inputs, outbox events and allocation integration.

### 4.9 Acceptance gate

- [ ] Shared-resource overlap creates one review ticket, not an automatic cancellation.
- [ ] Nonconflicting resources do not cause unnecessary elective deferral requests.
- [ ] In-progress/protected procedures cannot be automatically stopped.
- [ ] Hospital authority and ownership are checked server-side.
- [ ] Pending review does not become confirmed capacity or an accepted destination.
- [ ] Approval rechecks versions and creates no double allocation.
- [ ] Changed ETA, diversion, expiry and competing emergencies behave deterministically.
- [ ] Every applied deferral has an audit record and rescheduling follow-up.

## Stage 5 — Build the NITK 3D environment and verify the complete experience

**Goal:** Render real spatial context with buildings, trees and roads while preserving simulation correctness and a usable 2D fallback.

### 5.1 Tools and compatibility decision

| Tool | Use |
|---|---|
| Three.js | Scene objects, geometries, lighting and GPU rendering |
| React Three Fiber | React integration and frame-loop access |
| Drei | Compatible camera/control helpers where useful |
| QGIS + regional GeoJSON | Reviewed footprints, road centerlines, land/water and vegetation masks |
| Projection library | Convert the shared WGS84 dataset to local scene meters |
| Optional Blender | A small ambulance or hospital landmark asset; not required for every building |
| Browser performance tools | Frame time, draw calls, memory and repeated mount/unmount checks |

First resolve React/Fiber/Drei compatibility. Lowest-scope option: keep React 18 and select a compatible Fiber 8/Drei combination after checking peer dependencies. An upgrade to React 19/Fiber 9 is a broader alternative requiring app/test regression work. Do not use forced dependency installation to conceal incompatible peers.

### 5.2 Scene composition

Suggested components, added only in a future implementation:

```text
SimulationScene
  TerrainAndWaterLayer
  RoadNetworkLayer
  BuildingLayer
  VegetationLayer
  HospitalLandmarks
  AmbulanceVehicle
  ActiveRouteOverlay
  SceneCameraControls
  SelectionAndStatusOverlay
```

**Terrain and water:** Use a flat regional base initially with reviewed coastline/water polygons. Label it as simplified terrain. Do not invent elevation as if it were surveyed. Add real elevation only if a licensed dataset and a clear need exist.

**Roads:** Build ribbon meshes from validated centerlines and width metadata/explicit defaults. Handle bends and intersections, directional access and known bridge layers. Render the same route graph used by the simulation; decorative road meshes must not invent new navigable paths.

**Buildings:** Extrude reviewed footprints. Use source height where available, or a visible documented approximation from levels/default height. Distinguish visual height estimates from verified footprints. Three.js supports extrusion through [ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry).

**Trees:** Place simple tree meshes in approved vegetation/land polygons. Exclude roads, building footprints, water, vehicle entrances and route clearance buffers. A seeded distribution may vary decorative tree positions inside those masks; hospital locations and road topology must never be random. Use repeatable sampling, bounded attempts and spatial validation.

**Hospitals and ambulance:** Place landmarks using the Stage 2 coordinate manifest. Put the vehicle on the authoritative route at its observed/simulated progress, with a consistent heading conversion. Keep marker labels available without occluding the route.

### 5.3 Realism and dataset limitations

- Start with a campus/local-area detailed scene and a simpler regional overview for farther hospitals. Do not compress distant hospitals into the campus to make them fit a single decorative scene.
- Use camera framing, distance-based detail and tiled/chunked loading to show wider geography.
- Keep building height, vegetation density and terrain simplifications documented.
- Use owned/licensed road/footprint data for this scene. Provider-restricted basemap/route content requires its own permitted display path.
- Preserve OSM attribution if that dataset is used.
- Never claim the scene is a precise hospital interior or surveyed digital twin when it is an approximate outdoor visualization.

### 5.4 Animation and performance

The simulation service owns time, vehicle movement and route changes. `useFrame` updates visual interpolation only; it must not advance case state or send arrival commands every frame.

- Reuse geometry/materials and instance repeated trees/building shapes. [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh) and [Fiber performance guidance](https://r3f.docs.pmnd.rs/advanced/pitfalls) describe these techniques.
- Keep mutable mesh transforms in refs; avoid React state updates on every animation frame.
- Use adjustable pixel ratio, limited shadows and low-cost materials for the initial scene.
- Lazy-load the 3D module only when requested; dispose GPU resources on unmount and handle WebGL context loss.
- Show a 2D schematic/map fallback if graphics support fails. All operational actions remain available outside the canvas.
- Provide follow/orbit/top-down controls, reset camera, reduced-motion mode and keyboard-accessible alternatives.
- A manual camera movement pauses follow rather than being overwritten by every telemetry update.

### 5.5 Integrate scheduling into the simulator

Add isolated, synthetic scenarios:

1. Ambulance starts at the reviewed NITK incident point and travels to a nearby verified entrance.
2. An elective booking overlaps the emergency arrival at the same required theatre.
3. The hospital receives a pending review ticket while the ambulance sees pending availability.
4. Hospital staff approve deferral of an eligible unstarted procedure or choose an alternate theatre.
5. Readiness and time-to-care update only after the approved action is applied.
6. A second run uses an already-started procedure and demonstrates that it is not interrupted.

Simulation schedule times must use an explicit simulation clock/epoch and remain isolated from live hospital schedules. Rewind or replay must not reissue hospital tickets, cancel real procedures or change live resource allocations.

### 5.6 End-to-end test matrix

| Test | Expected result |
|---|---|
| Fresh ambulance login | Hospital markers load without an admin session |
| Hospital login and role change | Permitted directory visible; detailed records remain scoped |
| Graph API failure | Directory remains visible with partial-error feedback |
| NITK preview reset | Same reviewed origin/facility coordinates every time |
| Geography validation | Hospital/building/tree positions pass land/access checks |
| Valid bridge | Road remains valid across water when verified as a bridge |
| Overnight service hours | Local schedule resolves to correct UTC intervals |
| Elective/emergency same resource | One pending priority-review ticket |
| Different available theatre | Alternate resource offered without needless deferral |
| Procedure starts during review | Stale approval rejected; ongoing procedure not stopped |
| Two emergencies race | Capacity granted at most once; conflict explained |
| ETA shifts or ambulance diverts | Old pending review updated/superseded/cancelled appropriately |
| Approval accepted | Schedule, hold and audit/outbox are consistent |
| 3D disabled/context lost | Full 2D operational experience remains usable |
| Replay/reset | No live scheduling or resource mutations |
| Scene source alignment | Hospital entrance/route position matches geographic map |

Extend current auth, hospital, routing, lifecycle and simulator suites. Add real-database integration tests for scheduling transactions. Mock paid providers in CI and use a separate restricted-key manual map smoke test. Run project test, typecheck and build commands only in the future implementation task, not as part of this document creation.

### 5.7 Release checks

- Record tested browser/device hardware; target smooth rendering rather than claiming an unmeasured frame rate.
- Test at 390, 768, 1280 and 1440 px, with keyboard and reduced motion.
- Measure a 30-minute simulation for memory/listener leaks and unbounded ticket creation.
- Verify server restart recovery for durable schedules/tickets and explicit interruption behavior for any volatile simulation state.
- Introduce feature flags for new schedule/ticket workflow and 3D renderer.
- Roll out directory fixes first, reviewed NITK fixtures second, scheduling/tickets next, and 3D last.
- Update documentation to distinguish real locations, approximate geometry and synthetic clinical/operational data.

## 4. Implementation file map

| Stage | Existing areas to inspect/change later | Proposed additions |
|---|---|---|
| 1 | Auth context, three role pages, API client, hospital read routes, map components | Shared directory hook and role-loading tests |
| 2 | Scenario fixtures, hospital seed, preview routing, simulation origin/reset | NITK manifest, licensed regional GeoJSON, geography validation script |
| 3 | Hospital/resources contracts, repositories, migrations, hospital page | Scheduling contracts, service-hours and theatre/procedure APIs |
| 4 | Dispatch/readiness flow, allocation integration, realtime/outbox, Agent 3 timing | Priority ticket model, conflict evaluator, decision API and review queue |
| 5 | `Simulation3DView.tsx`, web dependencies and simulator tests | Compatible 3D scene layers, projected assets and graphics fallback |

Use additive migrations and expected-version checks. Reconcile current in-progress work before choosing migration numbers or changing interfaces. Existing map/simulator and stabilization-priority plans remain applicable; this document adds regional geography and scheduling behavior rather than replacing their lifecycle rules.

## 5. Required inputs before dependent implementation

| Input | Needed for | Suggested default |
|---|---|---|
| Approved NITK incident/start point | Preview and demo routes | A reviewed vehicle-accessible campus point, not an arbitrary campus centroid |
| Final nearby hospital list and location reviewer | Coordinate manifest | Start with the small shortlist above |
| Licensed geography source | Persistent 3D scene | Versioned OSM/owner-supplied extract with attribution |
| Map provider, map ID and restricted key references | Geographic map smoke test | Existing Google direction; never store actual keys in this MD |
| Hospital participation/operational-data owner | Resource/schedule data | Synthetic demo data until verified integration exists |
| Service hours and schedule source | Scheduling | Hospital-supplied data; unknown until supplied |
| Deferral eligibility/approval policy | Priority tickets | Human review; never automatic interruption of started procedures |
| Authorized reviewer roles | Ticket decisions | Hospital-designated scheduler/clinical coordinator |
| ETA uncertainty and resource-duration policy | Conflict detection | Explicit configurable reviewed values, not invented clinical thresholds |
| Persistence/deployment target | Transactions and recovery | PostgreSQL repositories; clearly isolated in-memory tests |
| React stack choice | Real 3D activation | Compatible React 18/Fiber 8 path unless broader upgrade is chosen |
| Target devices and regional detail extent | Scene performance | Detailed NITK/local area plus simplified regional overview |

## 6. Final definition of done

- Hospitals load for all authorized roles without an admin-first workaround.
- The NITK preview and nearby hospitals use a reviewed, stable geographic manifest.
- No random facility coordinates or invalid water-body placement remain in the regional scenario.
- Service hours, procedure classification and theatre/resource bookings have distinct validated data models.
- Emergency conflicts create scoped hospital-review tickets with explicit pending/approved/declined states.
- Approval respects actual procedure state, capacity, authorization and transaction boundaries.
- The simulator displays aligned roads, buildings and vegetation with a complete 2D fallback.
- All automated/manual checks have recorded results and the app accurately labels approximate and synthetic data.

**Only this Markdown file is created for the present request. None of these implementation steps has been executed.**
