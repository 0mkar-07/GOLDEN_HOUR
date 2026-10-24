# GoldenHour: Live Maps and UI Upgrade Plan

**Prepared:** 24 October 2026  
**Scope:** Planning document only. All implementation steps below are proposed future work.  
**Delivery:** Four stages, with a reviewable result and acceptance criteria at each stage.  
**Visual reference:** The Apollo Pharmacy screenshot supplied in the request.

## 1. Intended result

Turn GoldenHour into a clean, practical emergency coordination workspace with a real geographic map, road-following routes, visible location freshness, and consistent screens for ambulance crews, hospitals, and dispatchers.

Use the reference image's white surfaces, deep teal navigation, strong headings, simple outlined controls, and orderly spacing. Retain GoldenHour's identity and emergency workflows. The reference provides visual direction; its pharmacy shopping navigation, promotional banners, discounts, illustrations, and product cards do not belong in this application.

Default implementation choice: **Google Maps JavaScript API for the map and Google Routes API through the backend for routes and travel estimates**, with API credentials supplied during implementation. Keep the existing simulation available as an explicitly labelled demo mode.

An interactive real-world map, externally calculated road routes, and actual vehicle tracking are three separate capabilities. Each needs its own data source and status. A map API key alone does not provide ambulance GPS.

## 2. Findings from the current repository

These findings come from source inspection; the running application and test suite were not exercised for this planning task.

| Area | Current implementation | Required change |
|---|---|---|
| Frontend | React 18, Vite, Tailwind, React Router, Lucide icons | Build on the existing stack; avoid a framework replacement |
| Global appearance | `index.css` and `App.tsx` establish dark surfaces; page components also hardcode dark classes | Introduce shared light-theme tokens and migrate individual components |
| Header | Gradient logo block, colored role tabs, compact badges, desktop-only account controls | White utility header, teal active navigation, accessible mobile account controls |
| Ambulance map | `RoadNetworkMap.tsx` renders SVG nodes and straight lines using `x/y` | Add geographic map rendering from `lat/lng` and actual route geometry |
| Hospital coordinates | `hospital.ts` requires both `x/y` and `lat/lng` | Validate geographic coordinates while preserving the simulation contract during migration |
| Ambulance position | `case.ts` includes coordinates, speed, heading, `serverSequence`, and `observedAt` | Add explicit source and accuracy metadata; define ingestion and stale-state rules |
| Routing | `RoutingProvider.calculateRoute()` is synchronous and graph-node based | Add asynchronous geographic routing and update callers |
| Existing live adapter | `LiveRoutingAdapter` calculates a simulated graph route and can label it `LIVE_OSRM` merely because a URL is configured | Replace this behavior; only a validated external response may receive a live-provider label |
| Ranking | `agent3.ts` uses a fixed hospital-to-node mapping, with an unknown hospital falling back to Hospital A's node | Use actual hospital coordinates for live routing; explicitly reject unmapped simulation destinations |
| Realtime | Socket.IO and event envelopes already exist | Reuse the transport with position sequencing, resynchronization, and authorization |
| Vehicle storage | The store exposes a single `ambulancePosition` | Keep the first delivery honest about single-unit support; require per-unit storage before fleet-wide tracking |
| Simulation | A separate 3D view and seeded road graph already exist | Preserve them in a clearly labelled Simulation tab |

The README's claim that live routing already exists is not sufficient evidence: the inspected adapter does not make an external routing request. Correct implementation and documentation together.

## 3. Boundaries and design decisions

- Preserve clinician confirmation before dispatch, hospital eligibility checks, atomic reservation, diversion release, arrival, handover, and explicit equipment release.
- Keep the existing time-to-care calculation. Route duration is one input; it does not replace receiving delay or resource readiness.
- A hospital marker click selects a facility for inspection. It must not dispatch, accept, divert, or reserve equipment.
- Keep approved hospital records as the source of capabilities and availability. Map search results cannot establish clinical readiness.
- Do not add Places search, geocoding, native navigation, a mobile app, or a commercial fleet integration to the initial scope.
- The initial map can use the current synthetic dataset. Audit its geographic consistency first; do not silently move the project to another city based on the UI reference.
- Actual device tracking requires an explicit location source. Proposed first source: an opt-in browser GPS session on the ambulance device. A dispatcher laptop's location must never become the vehicle location automatically.
- Preserve synthetic-data labelling even when the basemap and route provider are real.

## 4. Stage 1 — Visual foundation and shared application shell

**Objective:** Establish a coherent healthcare interface before integrating map behavior.

### 4.1 Visual specification

| Token | Proposed value | Use |
|---|---|---|
| Page background | `#F6F8F8` | Main workspace |
| Surface | `#FFFFFF` | Header, panels, tables, forms |
| Brand teal | `#176B68` | Primary actions and active links |
| Deep teal | `#174C49` | Navigation or compact context strip |
| Main text | `#172B2A` | Headings and body text |
| Secondary text | `#596B69` | Supporting information |
| Border | `#DCE5E3` | Dividers and panel outlines |
| Selected tint | `#EAF5F2` | Selected row or facility |
| Critical | `#B42318` | Critical alerts and destructive actions |
| Warning | `#8A5800` | Stale data and delayed readiness |
| Success | `#237048` | Confirmed or available status |

These are proposed design tokens, not a substitute for contrast verification. Validate text, focus indicators, and component states against their actual backgrounds.

- Use the existing system font stack. Body text: 14–16 px; field labels: 13–14 px; page headings: 26–30 px; section headings: 18–20 px. Avoid tiny uppercase labels for operational information.
- Use a 4/8/12/16/24/32 px spacing scale, 8 px control corners, and 10–12 px panel corners.
- Prefer thin borders and whitespace. Reserve shadows for floating menus, dialogs, and temporary overlays.
- Use one consistent Lucide icon style, usually 18–20 px. Remove decorative emoji markers, persistent beacon pulses, colored glows, and gradient buttons.
- Use red only where the meaning requires urgency or danger. The normal primary action is teal.
- Keep pale accent fills limited to contextual status or selection. Do not give every section a different pastel background.
- Use short operational labels: “Review assessment”, “Confirm requirements”, “View hospital”, and “Dispatch to [hospital]”. Show model/provider details in an expandable technical detail area.

### 4.2 Shared shell

1. Create a white header with GoldenHour branding, service area, current unit/facility, connection status, and account controls.
2. Add a clear navigation row for Ambulance, Hospital, and Dispatch. Rename “Admin & 3D” to “Dispatch”; put the existing 3D experience under Simulation.
3. Retain an unobtrusive “Demo · Synthetic data” indicator. Clearly identify demo role switching and keep it available on mobile.
4. Use a compact page title and context row. Include search only on screens where a real search/filter behavior exists; avoid a decorative hero search box.
5. Retain the current maximum content width near 1280 px, with 24–32 px desktop gutters and 16 px mobile gutters.
6. Define reusable button, field, panel, table, status, empty-state, and inline-error styles. Keep critical action feedback next to its action.

### 4.3 Files expected to change during implementation

- `apps/web/src/index.css`: theme tokens, base typography, focus and motion behavior.
- `apps/web/tailwind.config.js`: shared semantic colors and spacing extensions where needed.
- `apps/web/src/App.tsx`: light application shell.
- `apps/web/src/components/Header.tsx`: navigation and responsive account controls.
- `apps/web/src/components/ApiHealthBadge.tsx`: compact, readable connection status.
- Proposed `apps/web/src/components/ui/`: shared UI primitives, introduced only where they eliminate real duplication.

### 4.4 Acceptance criteria

- The header and shell work at 390, 768, 1280, and 1440 px viewport widths without horizontal page overflow.
- Keyboard focus remains visible; navigation and account controls are reachable on mobile.
- No decorative gradients, colored shadow glows, or constantly pulsing status decorations remain in migrated shared components.
- Existing routes and role switching continue to work.
- Review screenshots of the shell and one representative form/table before propagating the design across all screens.

**Stage output:** An agreed visual system and shared shell, ready for consistent page migration.

## 5. Stage 2 — Geographic map and genuine route integration

**Objective:** Display actual geography, hospital markers, and provider-generated road routes without confusing simulation with live data.

### 5.1 Provider setup and configuration

Use separate browser and backend credentials. The browser key is visible to clients by design and needs website/referrer and API restrictions; the server credential stays on the API service. Configure applicable server restrictions for the deployment. Google documents separate keys and application/API restrictions in its [Maps security guidance](https://developers.google.com/maps/api-security-best-practices).

Proposed configuration names, to be added during implementation:

| Variable | Location | Purpose |
|---|---|---|
| `VITE_MAP_PROVIDER=google` | Web build configuration | Select Google map or explicit demo mode |
| `VITE_GOOGLE_MAPS_API_KEY` | Web build configuration | Restricted browser Maps key |
| `VITE_GOOGLE_MAPS_MAP_ID` | Web build configuration | Map styling and advanced markers |
| `ROUTING_PROVIDER=google` | API environment | Select geographic routing provider |
| `GOOGLE_ROUTES_API_KEY` | API secret configuration | Backend Routes API credential |
| `ROUTING_TIMEOUT_MS=5000` | API environment | Initial external-request deadline |

Enable billing and Maps JavaScript API, create a JavaScript map ID, and enable Routes API for backend routing. Advanced markers require a map ID and the marker library. See [Google's advanced marker setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start).

Document the exact Vite environment file location or `envDir` configuration. Do not assume the repository root `.env` reaches the web app. For Docker builds, supply public web configuration before the Vite build; setting only the final Nginx container environment will not rewrite an already-built bundle. Never pass the server Routes secret as a `VITE_` variable.

### 5.2 Data contracts and compatibility

1. In `packages/contracts/src/hospital.ts`, validate finite latitude in `[-90, 90]` and longitude in `[-180, 180]`. Validate `x/y` as finite simulation coordinates.
2. Keep the existing required `x/y` fields through the initial migration. Introduce a separate geographic input schema for GPS rather than forcing GPS clients to invent simulation coordinates.
3. Add a shared route contract, preferably `packages/contracts/src/routing.ts`, exported through `index.ts`.
4. Include route ID, origin position sequence, destination hospital ID/version, calculation time, distance in meters, duration in seconds, route source, traffic mode, geometry, and status.
5. Use explicitly named `{ lat, lng }` points at application boundaries. If GeoJSON is used internally, document its `[lng, lat]` order and test conversion.
6. Add `GOOGLE_ROUTES` to the shared routing-source enum. Keep legacy values readable during migration, but do not emit `LIVE_OSRM` without an actual OSRM request.
7. Represent unavailable routes as unavailable, not as a numeric placeholder such as 9999 seconds. Exclude them from automatic ranking and explain the reason.
8. Validate seeded hospitals against their intended road-access locations. Keep fictional names visibly marked as demo facilities.

### 5.3 Backend routing changes

- Introduce an asynchronous geographic provider boundary using origin and destination coordinates. Keep the graph router available for simulation.
- Implement a Google provider in a dedicated module under `apps/api/src/modules/routing/`.
- Use backend Compute Routes requests with `DRIVE`, an explicitly chosen traffic preference, and a narrow response field mask for duration, distance, and encoded polyline. Validate responses before use. These fields and request options are documented in [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions).
- Update `runAgent3`, case recommendation handlers, and all other affected callers/tests to await routing. Identify every caller before changing the provider interface.
- Route to `hospital.location.lat/lng`; remove the fixed node mapping from the geographic path.
- Retain the current eligibility and time-to-care rules. Use a single immutable input snapshot and generation ID so a slow response cannot overwrite a newer recommendation.
- Bound request concurrency and add request cancellation/deadlines. A timeout, quota response, invalid credential, or no-route result must produce a structured error.
- Recheck assessment, inventory, destination, and position versions before applying asynchronous results. Keep current reservation checks authoritative at dispatch/acceptance time.
- Reuse the same route result for ranking and displayed geometry so the ETA and visible route agree.
- Add a proposed authenticated `GET /api/v1/cases/:caseId/routes` endpoint for the current route bundle. It should read server-managed results, not become an unrestricted proxy for arbitrary coordinates or URLs.
- Preserve the existing `/api/v1/routing/graph` endpoint for simulation consumers.

### 5.4 Frontend map behavior

Create a lazy-loaded `LiveMap.tsx` behind a small `MapPanel.tsx` boundary. Keep `RoadNetworkMap.tsx` as the labelled simulation view.

- Load the Maps script once and clean up marker listeners and overlays on unmount.
- Display distinct ambulance and hospital symbols, with A/B/C labels for recommendation roles.
- Display confirmed destination separately from the current recommendation; those can differ.
- Draw the selected road route with a clear teal line. Show backups with subdued, distinguishable lines only when requested.
- Do not draw straight lines as if they were navigable routes.
- Synchronize map selection with a hospital details panel and recommendation list.
- Fit bounds on initial load and explicit “Show all” actions. Do not reset zoom on every position update.
- Provide “Follow ambulance”, “Recenter”, and “Show hospitals” controls. Manual panning pauses follow mode.
- Display route distance, estimated drive time, hospital receiving delay, total time-to-care, source, and update time with distinct labels.
- Keep provider attribution and map controls visible at every breakpoint.
- Provide loading, missing-configuration, authorization-failure, network-failure, no-route, and empty-hospital states. Keep the hospital list usable when the map is unavailable.

Google route content shown on a map must use a Google map. Preserve attribution and review storage restrictions before retaining provider responses; do not copy Google routes into the SVG/3D fallback. Public release also needs the applicable terms/privacy disclosures. See [Routes API policies](https://developers.google.com/maps/documentation/routes/policies).

### 5.5 Live and demo state rules

| Situation | Required presentation |
|---|---|
| Google basemap with synthetic positions | “Google map · Simulated vehicle position” |
| Successful Google routing | “Google route”, with calculation time and traffic mode |
| GPS update received from assigned device | “Device GPS”, with timestamp and accuracy |
| Provider unavailable in demo mode | Explicit simulated route fallback, if graph mapping is valid |
| Provider unavailable for real GPS outside the demo graph | “Route unavailable”; no invented graph route |
| Prior route retained after failure | “Last route · Stale”, with age; never present it as freshly calculated |

### 5.6 Acceptance criteria

- A restricted test key loads the map and the approved hospital locations.
- Routes visibly follow roads and match backend duration/distance data.
- Missing or rejected keys leave the rest of the app usable.
- A configured URL alone can no longer cause a simulated route to be labelled live.
- Unknown hospitals are never routed to Hospital A by default.
- No server credential appears in browser assets or logs.
- Synthetic positions remain labelled synthetic even on a real map.

**Stage output:** A working geographic map and genuine routing adapter, with honest error and demo behavior.

## 6. Stage 3 — Live position updates and role-specific page redesign

**Objective:** Connect map updates to an explicit tracking source and make the three operational screens clear and efficient.

### 6.1 Position ingestion and realtime flow

Proposed flow: assigned device → authenticated position endpoint → validated server state → authorized Socket.IO event → map marker update → controlled route refresh.

1. Add explicit `source` values such as `SIMULATED` and `DEVICE_GPS`, optional accuracy in meters, and an agreed speed unit such as meters/second. Document heading in degrees and normalize it.
2. Add a proposed `POST /api/v1/ambulances/:ambulanceId/position` endpoint. Validate device/unit authorization, coordinate bounds, timestamps, accuracy, duplicates, and reasonable sequencing.
3. Preserve `observedAt`; record server receipt time separately. Assign `serverSequence` on the server. Reject old updates that would move the vehicle backwards in time.
4. Require an explicit “Start sharing this device's location” action. Handle permission denial, unsupported geolocation, insecure context, and stopped/background browser sessions. Browser tracking is suitable for a foreground demo; reliable background fleet telemetry is a separate integration.
5. Keep simulation and GPS as mutually exclusive position producers for a unit. Switching sources clears incompatible route state and creates a visible source-change event.
6. Reuse or extend the existing realtime envelope with a typed position event. Reconcile existing event names before introducing duplicates.
7. Authorize subscriptions and emissions. The existing general case room and broadcast fallback must not expose new precise location payloads indiscriminately. Hospitals should see only assigned inbound units; dispatchers see their authorized region; ambulance users see their assigned unit.
8. On reconnect, fetch a fresh snapshot before applying buffered events. Drop duplicate/out-of-order sequence numbers. Reauthenticate and clear subscriptions on role changes/logout.
9. Start with a proposed position transmission interval of 2–5 seconds. Mark the location stale after 15 seconds without a valid update, aligned with the existing staleness setting where appropriate.
10. Smooth only between received points, stop animation when stale, and respect reduced-motion preferences. Do not extrapolate movement beyond the last observed location.
11. Start with route refresh no more often than every 30 seconds per active route, unless the destination changes or confirmed off-route movement warrants a refresh. Use distance/accuracy thresholds and debounce to avoid GPS jitter triggering requests.
12. Do not automatically divert when a route changes. Update the recommendation and preserve the existing human action and reservation flow.

For initial delivery, support the existing single ambulance end to end. If fleet-wide tracking is required, replace the singleton store with per-ambulance records, unit/case associations, per-unit sequence counters, persistence, and scoped snapshot endpoints before displaying multiple live units.

### 6.2 Ambulance page

Desktop layout:

```text
White header: GoldenHour | Service area | Unit | Connection | Account
Navigation: Ambulance | Hospital | Dispatch
Case context: Case ID | Clinical state | Confirmed destination
------------------------------------------------------------------
Patient intake / assessment (38%) | Geographic map (62%)
Requirements and confirmation     | ETA / freshness / source
------------------------------------------------------------------
Destination A             Backup B               Backup C
Eligibility, drive time, receiving delay, time-to-care, action
------------------------------------------------------------------
Case activity and lifecycle actions
```

- Before dispatch, emphasize intake, assessment review, and requirement confirmation.
- After dispatch, emphasize confirmed destination, ETA, map, and lifecycle actions; retain patient details in an accessible collapsible section.
- Show compact vital fields with readable units and validation messages.
- Keep primary and backup roles clear without large colored card backgrounds.
- Label dispatch buttons with the hospital name. Explain disabled actions beside the control.
- Keep arrival, handover, and diversion distinct. Do not infer arrival from proximity alone.
- On mobile, prioritize case status and the current action. Use accessible Map/Details tabs, retaining entered form state when switching.

### 6.3 Hospital page

- Start with facility name, receiving status, and last update time.
- Put pending incoming requests before inventory management.
- Show each incoming request's case ID, confirmed destination role, ETA/source, requested resources, and Accept/Decline controls.
- Use a compact resource table: Resource, Total, Out of service, External use, Reserved, In use, Available, Update.
- Keep the existing inventory formula intact and show conflicts inline when version checks fail.
- Put active allocations and explicit equipment-release actions in a separate section.
- Keep staff availability concise and editable without a large grid of decorative cards.
- Show an inbound map only for relevant authorized assignments, preferably on demand. Facility readiness comes from GoldenHour data, never from map-provider listings.

### 6.4 Dispatch/admin page

- Use tabs for Overview, Map, Cases, Audit, Simulation, and Settings where existing functionality supports them.
- Show a compact summary row for active cases, pending requests, and facility status; avoid oversized metric cards with little operational value.
- Pair the geographic map with a searchable hospital/unit list. Until per-unit storage exists, label the current single tracked unit clearly.
- Make selection bidirectional between list and map.
- Preserve case traceability and audit filters. Display timestamps in the user's configured timezone with unambiguous details.
- Lazy-load the existing 3D module only when Simulation is opened. Keep simulation traffic controls inside that context.

### 6.5 Accessibility and responsive behavior

- Maintain a fully usable hospital/route list as an alternative to map interaction.
- Use text and icon shapes in addition to color for readiness, primary/backup role, and stale data.
- Target 44 px touch controls, visible focus, labelled icon buttons, and sensible heading order.
- Keep dialogs keyboard-operable with focus restoration. Avoid announcing every GPS tick to screen readers; announce meaningful status changes.
- Give desktop maps roughly 420–560 px height and mobile maps roughly 280–360 px, subject to actual viewport testing.
- Keep actionable buttons and Google attribution clear of mobile bottom sheets and sticky toolbars.

### 6.6 Files expected to change

- `packages/contracts/src/case.ts`, `recommendation.ts`, `hospital.ts`, and proposed `routing.ts`.
- `apps/api/src/db/store.ts`, routing modules, case routes, agent3, realtime modules, and proposed position routes.
- `apps/api/src/modules/simulation/service.ts` for source separation and compatibility.
- `apps/web/src/pages/AmbulancePage.tsx`, `HospitalPage.tsx`, and `AdminPage.tsx`.
- `apps/web/src/components/RecommendationPanel.tsx` and proposed map components/hooks.
- `apps/web/src/lib/api-client.ts`, `socket.ts`, and role-change handling in the auth context where needed.
- Database migrations only if new position/source fields or per-unit records are persisted; update seed/reset behavior accordingly.

### 6.7 Acceptance criteria

- Fresh authorized updates move the correct marker without remounting the map or resetting manual zoom.
- Permission denial and disconnected GPS leave the interface usable and accurately labelled.
- Old events and slow route responses cannot overwrite newer state.
- Reconnection restores current state without duplicate subscriptions.
- Changing user roles does not retain unauthorized location data.
- All three screens share the visual system and preserve existing clinical/resource workflows.
- The map, destination panel, and recommendation list show consistent hospital selection and route provenance.

**Stage output:** A complete, responsive operational UI with explicit live/demo position sources and reliable realtime behavior.

## 7. Stage 4 — Verification, performance, configuration, and rollout

**Objective:** Verify the integrated experience and make map operation predictable under normal and failed conditions.

### 7.1 Automated verification

| Layer | Meaningful checks |
|---|---|
| Contracts | Bounds, nonfinite values, invalid timestamps, source fields, coordinate order, route failure states |
| Routing adapter | Valid result, timeout, unauthorized key, quota response, empty routes, malformed response, cancellation |
| Ranking | Same eligibility/time-to-care behavior; unavailable routes excluded; deterministic ties; late results discarded |
| Realtime | Duplicate/out-of-order positions, reconnection snapshot, role change, unauthorized unit updates/subscriptions |
| Map UI | Selection synchronization, stale labels, unavailable map, list fallback, follow/pan behavior, cleanup |
| Workflow regression | Assessment confirmation, dispatch, atomic reservation, diversion, arrival, handover, explicit release |

Extend the existing suites, especially `phase12-adapters.test.ts`, `agents2-3-routing.test.ts`, `DispatchFlow.test.tsx`, `HospitalPage.test.tsx`, `AdminPage.test.tsx`, and `DiversionAndLifecycle.test.tsx`.

Mock provider/network boundaries in automated tests. Do not call paid Google APIs from routine CI. Use a restricted development key for a separate manual provider smoke test. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; do not count the current placeholder lint command as meaningful validation.

### 7.2 Visual and interaction review

- Capture Ambulance, Hospital, and Dispatch at 390, 768, 1280, and 1440 px.
- Review populated, loading, empty, stale, disconnected, invalid-key, and no-route states.
- Compare the result against the reference's hierarchy: white surfaces, teal navigation, consistent spacing, strong readable headings, and restrained borders.
- Verify long hospital names, large text/200% zoom, keyboard-only use, mobile touch controls, and table overflow.
- Walk through the complete existing demo scenario, including diversion and resource release, with both map-enabled and simulation-only configuration.

### 7.3 Performance and usage controls

- Load the geographic map only when visible; load 3D only in Simulation.
- Keep map instances stable and update marker/route objects incrementally.
- Add bounded provider concurrency, server-side per-user/per-case rate limits, request coalescing, and backoff after provider failures.
- Do not persist or cache provider content by default. Any retention optimization must first be checked against current provider terms.
- Set project quotas and usage alerts. Budget alerts alone are not a hard spending cap.
- Estimate usage before rollout: route requests ≈ active cases × destinations evaluated × refreshes per minute × active minutes, plus user-triggered recalculations. Track map loads separately.
- Measure route latency, error rates, stale-position counts, reconnects, and requests per active case. Avoid logging credentials, patient notes, or precise location payloads unnecessarily.

### 7.4 Configuration and rollout

1. Add placeholder configuration and provider setup instructions to `.env.example` and README; never commit supplied credentials.
2. Document browser build-time variables, backend runtime secrets, restricted domains, map ID, enabled APIs, quotas, and the chosen GPS source.
3. Verify Docker build paths and configuration injection, including existing build assumptions, before declaring deployment ready.
4. Release first with geographic maps enabled for a controlled demo and position source explicitly simulated.
5. Verify real provider responses and failure states, then enable opt-in device GPS on an assigned test unit.
6. Preserve a configuration switch back to the labelled demo map. In a real GPS session, disable unavailable routing rather than fabricate graph estimates.
7. Update README/progress claims to distinguish implemented, simulated, and externally verified capabilities.

### 7.5 Final acceptance checklist

- [ ] Geographic basemap and real road geometry work with restricted credentials.
- [ ] Map, route, traffic, and position sources are distinguishable.
- [ ] No simulated route is labelled as a live provider result.
- [ ] Actual tracking starts only from an explicitly assigned source.
- [ ] GPS denial, staleness, reconnects, and provider outages are understandable.
- [ ] Hospital selection cannot accidentally perform a dispatch or resource mutation.
- [ ] Existing clinical confirmation and resource lifecycle behavior passes regression checks.
- [ ] Route duration, receiving delay, and time-to-care remain distinct.
- [ ] Mobile and keyboard users can complete the same core workflows.
- [ ] Light-theme styling is consistent across pages, dialogs, tables, and empty states.
- [ ] Server secrets stay out of frontend artifacts; browser keys are restricted.
- [ ] Provider attribution remains visible and deployment setup is documented.
- [ ] Tests, typecheck, build, visual review, and manual provider smoke test are recorded.

**Stage output:** A verified release with clear configuration, source labelling, and rollback behavior.

## 8. Stage sequence and implementation handoff

| Stage | Depends on | Reviewable result |
|---|---|---|
| 1. Visual foundation | Current repository and supplied reference | Shared shell and representative UI patterns |
| 2. Map and routing | Stage 1 patterns; credentials for live smoke test | Real geography, validated provider routes, explicit fallback |
| 3. Tracking and page redesign | Stage 2 contracts and routing | Complete role screens and authorized position flow |
| 4. Verification and rollout | Stages 1–3 | Test evidence, screenshots, configuration guide, release checklist |

The visual redesign, contract work, provider abstraction, and mocked tests can proceed without an API key. External verification requires the restricted browser credential, map ID, backend Routes credential, and enabled services. Actual vehicle tracking additionally requires the selected device/feed and its assignment to a unit.

For implementation, use the defaults in this plan unless product requirements change: Google map/provider pairing, existing demo geography pending coordinate audit, light teal/white styling, single-unit tracking first, and the existing 3D simulation retained as a separate experience.

**Completion means all four stages meet their acceptance criteria. Adding a Google basemap alone does not complete live routing, live tracking, or the UI redesign.**
