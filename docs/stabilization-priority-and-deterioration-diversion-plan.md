# Stabilization Priority and In-Transit Deterioration: Implementation Plan

**Date:** 24 October 2026  
**Scope:** Markdown plan only. No application code is changed.  
**Implementation order:** Five sequential stages.  
**Requested behavior:** Remove unavailable full-care A from the priority cards, allow dispatch to eligible stabilization B, and offer diversion to the nearest eligible B or C when the crew reports patient deterioration.

## 1. Exact behavior to implement

### Case 1: No hospital currently meets full-care requirements

The screenshot shows an empty Primary A card, a disabled dispatch button, and valid B/C stabilization candidates. The interface describes B as an option but does not allow initial dispatch to it.

Change this flow as follows:

1. Remove the empty A card from the priority section completely. Do not leave a disabled placeholder occupying priority position 1.
2. Show a compact status message above the remaining cards: **“No full-care destination is currently eligible. Stabilization options are available below.”**
3. Place the best eligible stabilization destination first. In the screenshot, this is Bayview (B).
4. Provide **“Dispatch to Bayview for stabilization”**, subject to crew confirmation and current eligibility checks.
5. Display C as the next alternative. Show only valid candidates; two valid destinations should produce two cards, not an invented third destination.
6. Keep missing full-care capabilities visible. Promoting B to first operational priority does not turn it into a full-care hospital.
7. Replace “Limitations vs Hospital A” with **“Full-care requirements not available here”**. Limitations are relative to the confirmed requirements, not to an absent hospital.
8. Replace the “destination is undefined” briefing with meaningful fallback copy.

**Example briefing:** “No full-care destination is currently eligible. Bayview is the first stabilization option, with an estimated 5-minute drive. Full-care requirements remain unmet; review the listed limitations before confirming dispatch.”

The 5-minute value is from the supplied screenshot, not a fixed value to hardcode. All runtime copy must use the current evaluated route data.

### Case 2: Patient deteriorates while the ambulance is in transit

Add a visible **“Patient deteriorating — review diversion”** action in the active ambulance journey section.

1. The crew reports deterioration; the application does not invent new clinical thresholds or automatically diagnose deterioration.
2. Refresh B/C eligibility and routes from the ambulance's latest valid position.
3. Compare the eligible reachable alternatives by **current road travel time**, not straight-line distance or the original scene location.
4. Highlight the shorter-ETA option and show both candidates where available.
5. Let the crew confirm diversion to the suggested hospital or choose the other eligible option with a recorded reason.
6. Apply the destination change only after confirmation and server-side revalidation.
7. Update the active route, hospital notifications, reservation lifecycle and audit trail together.

**Example:** B has a fresh ETA of 7 minutes and C has a fresh ETA of 3 minutes. Highlight **“Nearest eligible alternative: C — 3 min”**, even if B was originally ranked first.

Do not automatically reroute because a vitals field changes, an AI message suggests deterioration, or the dialog opens.

### Interpretation of “remove A completely”

- Remove the absent/ineligible full-care option from the current priority cards and actionable ranking.
- Do not delete the hospital record, audit history or previously confirmed destination.
- A hospital failing full-care eligibility can still appear as a clearly labelled stabilization candidate if it independently satisfies the confirmed stabilization requirements.
- If the ambulance is already travelling to A when A becomes ineligible, retain A in the **current journey** status until an authorized diversion occurs. Removing a recommendation card must not silently change a committed destination.
- If full-care eligibility later returns, A may appear again in a new recommendation. Existing dispatch remains unchanged until an explicit action.

## 2. Current code gaps

The following findings are based on source inspection, not runtime testing.

| Area | Current behavior | Required change |
|---|---|---|
| `RecommendationPanel.tsx` | Always renders an A card, including the empty full-care state | Render an ordered list of actual actionable candidates |
| Initial dispatch UI | B/C show standby text until a destination exists | Enable stabilization dispatch when no full-care candidate exists |
| `store.dispatchCase()` | Rejects recommendations without `hospitalA`; uses A throughout request/destination creation | Accept a validated selected destination and explicit care objective |
| `agent3.ts` | B/C are ordered by time-to-care, while their copy says proximity | Make the ranking objective explicit; use road ETA for nearest diversion |
| Route failures | Ranking can retain a 9999-second placeholder | Exclude unavailable routes from automatic selection |
| `agent2.ts` | Stabilization checks capability tags but does not mirror all resource/staff checks used on acceptance | Use a shared requirements-to-resources evaluation for stabilization eligibility |
| Existing B/C diversion buttons | Permit manual target selection but no dedicated deterioration comparison | Add a refresh, compare and confirm deterioration flow |
| `handleDivert()` | Sends generic reason and shows a hardcoded St. Jude release message | Send structured deterioration context and use actual affected hospital names |
| `store.divertCase()` | Mutates requests/reservations and destination without a complete target/care-objective validation flow | Validate first; apply all intended mutations consistently or none |
| Hospital acceptance | Infers full-care versus stabilization from capability membership | Persist and honor the explicitly selected care objective and requirement version |
| Coordinator briefing | Can interpolate an absent A name | Generate null-safe, mode-specific briefing text |

This requires a coordinated backend and frontend change. Hiding A alone would still leave the dispatch endpoint rejecting the requested stabilization flow.

## Stage 1 — Define priority modes and explicit destination intent

**Goal:** Separate clinical care level, display priority and operational request role.

### 1.1 Proposed contract changes

Review `packages/contracts/src/recommendation.ts` and `case.ts`. Introduce:

- `recommendationMode`: `FULL_CARE_AVAILABLE`, `STABILIZATION_ONLY`, or `NO_ELIGIBLE_DESTINATION`.
- `careObjective`: `FULL_CARE` or `STABILIZATION`, persisted on the selected destination and its MAIN request.
- `priorityCandidates`: ordered actual candidates, each containing hospital ID, priority rank, care objective, eligibility, drive time, receiving delay, time-to-care, route status/source and limitations.
- Separate `fullCareEligible` and `stabilizationEligible` flags. A generic `eligible` flag must not be displayed as full-care eligibility.
- `selectionReason`: `INITIAL_FULL_CARE`, `NO_FULL_CARE_AVAILABLE`, `PATIENT_DETERIORATION`, or `MANUAL_DIVERSION`.
- Recommendation ID/version, confirmed assessment version, input position sequence/source generation and evaluation time for freshness checks.

Keep `hospitalA/B/C` temporarily for compatibility if necessary, but stop using letter A as a requirement for initial dispatch. Prefer an adapter so older consumers are not broken in one change.

**Important:** A MAIN hospital request means “the selected destination is being asked to receive this case.” It does not mean “this hospital provides full definitive care.” B can receive a MAIN request for stabilization.

### 1.2 Behavior table

| Situation | Priority section | Primary action |
|---|---|---|
| Full-care A exists | A first, then valid stabilization alternatives | Dispatch to A for full care |
| No A; B and C eligible | B first, C second; no empty A slot | Dispatch to B for stabilization |
| No A; only one eligible stabilization hospital | One clearly labelled card | Dispatch to that hospital for stabilization |
| No eligible reachable destination | No fabricated priority cards | Refresh status / contact coordination; no automatic target |
| In transit, B/C eligible | Journey remains visible; diversion comparison is available | Review nearest alternative, then confirm |
| Already at the destination or case handed over | Journey/lifecycle status | No in-transit deterioration diversion action |

For stabilization-only initial dispatch, use current road ETA as the default priority sort, with time-to-care displayed alongside it. Keep normal full-care ranking based on the existing time-to-care objective. This makes the “nearest” wording truthful rather than silently switching between different metrics.

### 1.3 Acceptance gate

- Contracts distinguish priority, care objective and request role.
- Zero, one, two or three candidates are valid UI states.
- A null full-care candidate does not prevent an eligible stabilization destination from being selected.
- A committed destination is represented separately from current recommendations.

## Stage 2 — Implement eligibility and nearest-alternative ranking

**Goal:** Recommend destinations that can satisfy the selected care objective using current inputs.

### 2.1 Stabilization eligibility

Extract/reuse a shared evaluator for the confirmed stabilization requirement set. It must check:

1. Hospital exists and belongs to the authorized service scope.
2. Receiving status permits the requested intake.
3. Required stabilization capabilities are present.
4. Resource pools mapped from those requirements have available capacity.
5. Required staff slots, where mapped by the application's existing rules, are available.
6. Requirements have been confirmed for the applicable assessment version.
7. A usable route exists from the current valid ambulance position.

Missing full-care requirements must remain visible but must not automatically disqualify a hospital from a separately valid stabilization evaluation. Missing stabilization requirements must disqualify it.

Use the same requirement/resource mapping for evaluation and hospital acceptance. Do not advertise eligibility with one mapping and reserve with a different mapping. Resource snapshots are advisory until the hospital acceptance transaction rechecks them.

### 2.2 Initial priority generation

1. Evaluate all participating hospitals against full-care and stabilization requirements.
2. Obtain valid routes using the actual current source: geographic routing for real coordinates, or the configured demo graph for synthetic movement.
3. Exclude unavailable/no-path results; do not rank a sentinel number as a valid ETA.
4. If eligible full-care hospitals exist, retain normal full-care selection.
5. Otherwise set `STABILIZATION_ONLY` and order eligible stabilization candidates by current road ETA.
6. Break equal ETA ties by time-to-care and then stable hospital ID for deterministic output.
7. Return up to three actual candidates if available. Do not force exactly three or reinsert an empty A placeholder.

The request's B-first example is honored because B is the first eligible stabilization option in that snapshot. If refreshed information changes which hospital is fastest, show the newly ranked hospital by name rather than promising that an old letter always means nearest.

### 2.3 Deterioration preview

Use a short-lived server-generated comparison for the currently identified B/C alternatives:

- Capture their stable hospital IDs at preview creation; do not rely on labels that can change during refresh.
- Exclude the current destination from proposed diversion targets.
- Re-evaluate eligibility and current travel times for both.
- Sort by `travelSeconds`, then `timeToCareSeconds`, then hospital ID.
- Return candidate-level rejection reasons and the recommended target, if one exists.
- Include the current destination ETA as context; do not imply that switching is always preferable merely because a diversion button was pressed.

If B/C are both invalid, return no suggested diversion. Offer a separate **“Search other eligible stabilization hospitals”** action to refresh the wider candidate set. Do not silently substitute an unrelated facility under a stale B/C label.

If position or route data is stale, do not claim “nearest now.” Show the limitation and require a fresh preview before normal confirmation. Any exceptional manual override must be an explicit authorized policy, not a hidden fallback.

### 2.4 Files and checks

Likely files: `agent2.ts`, `agent3.ts`, case recommendation routes, routing contracts/providers, scenario fixtures and ranking tests.

- [ ] B is first when A is unavailable and B has the shortest eligible road ETA.
- [ ] C wins a deterioration comparison when its current road ETA is shorter.
- [ ] A closer hospital missing a required stabilization resource does not win.
- [ ] Route failure, stale position and receiving restrictions are visible and handled.
- [ ] Empty confirmed requirements do not accidentally make every hospital eligible.
- [ ] Labels explain whether the list is ranked by drive time or time-to-care.

## Stage 3 — Make stabilization dispatch and diversion safe backend operations

**Goal:** Make the selected stabilization hospital operationally actionable without weakening lifecycle checks.

### 3.1 Initial dispatch request

Extend the existing `POST /api/v1/cases/:id/dispatch` request to identify:

- Target hospital ID.
- Explicit `careObjective`.
- Recommendation ID and confirmed assessment version.
- Expected destination/case version as appropriate.
- Selection reason and an idempotency key.

The server must derive/revalidate eligibility. It must not trust a client-supplied `eligible: true`, travel time or care objective without checking it against the current confirmed requirements.

For stabilization-only dispatch:

1. Confirm the caller can dispatch this assigned case and its lifecycle permits initial dispatch.
2. Validate the selected hospital and stabilization requirement snapshot.
3. Create exactly one MAIN request for the selected hospital.
4. Create standby requests only for distinct eligible alternatives. If B becomes MAIN, do not also create a B standby request.
5. Set the selected destination to B with `careObjective=STABILIZATION` and readiness `PENDING`.
6. Preserve the unmet full-care requirements for display and later coordination; do not erase them to make the target appear fully eligible.
7. Record the selected hospital, reason, versions and mode in the audit trail.

### 3.2 Hospital acceptance

Acceptance uses the persisted care objective and immutable confirmed requirement version attached to the request. Do not infer which requirement set to allocate solely by checking whether the hospital has all full-care capability tags.

Recheck receiving status, resource counts and applicable staffing atomically before allocation. Standby acceptance does not reserve scarce equipment. A MAIN stabilization request reserves only the resources required by the approved stabilization mapping, while preserving all existing capacity invariants.

### 3.3 Two-step deterioration API

Proposed API shape:

- `POST /api/v1/cases/:id/diversion-preview`: refreshes and returns the current B/C comparison, preview ID, recommended target, versions, timestamps and limitations. It has no destination/reservation side effects.
- Existing `POST /api/v1/cases/:id/divert`: accepts the preview ID, selected target ID, `PATIENT_DETERIORATION` reason, relevant versions and idempotency key.

Preview creation alone must not mark the case as diverted or cancel current requests.

On confirmation, verify:

1. Caller authorization and case ownership/assignment.
2. Case is in the supported in-transit state; reject arrived, handed-over and closed cases.
3. Target is different from the current destination.
4. Preview, assessment and destination versions are current.
5. Position is sufficiently fresh and has not moved enough to invalidate the comparison. Use a documented age/displacement policy rather than requiring an unchanged sequence during continuous GPS updates.
6. The target remains eligible and reachable.
7. Any newly entered clinical observations have been reviewed and linked to the confirmed requirement version used for this decision. The button must not silently rewrite confirmed requirements.

If revalidation changes the suggested destination or materially changes the comparison, return a conflict requiring refreshed confirmation. Never silently switch the user's selected target.

### 3.4 Apply the transition consistently

Perform all validation before changing existing requests or reservations. Then apply the destination update, request transitions, unused-reservation release and audit/outbox entries together.

- Release only unused `RESERVED` allocations at the previous destination according to the existing lifecycle.
- Never release `IN_USE` equipment as part of diversion.
- Supersede/cancel obsolete generation requests so they cannot later reserve resources.
- Create one new MAIN stabilization request at the selected target.
- Set target readiness to `PENDING` until actual acceptance; diversion confirmation does not mean the hospital has accepted.
- Preserve the original destination if validation fails before commit.
- Make retries idempotent; repeated confirmation must not duplicate MAIN requests or release resources twice.

For the current in-memory store, precompute a complete mutation plan and apply it without partial failure. For a SQL-backed implementation, use a real transaction with version checks. Do not describe in-memory mutations as durable database transactions.

If the new hospital declines after a successful diversion, show that state and refresh alternatives. Do not silently restore reservations at the old hospital or pretend the new target is confirmed.

### 3.5 Acceptance gate

- [ ] Initial dispatch works when A is null and B is valid for stabilization.
- [ ] B receives one MAIN request; remaining eligible alternatives receive standby only.
- [ ] Acceptance reserves the explicit stabilization requirement set.
- [ ] Invalid or obsolete diversion leaves current destination and allocations unchanged.
- [ ] Successful diversion releases only eligible unused reservations and updates the destination generation once.
- [ ] Unauthorized, repeated, same-target and post-arrival diversion requests are handled explicitly.

## Stage 4 — Update priority cards, deterioration controls, briefing and map

**Goal:** Make the requested actions visible and understandable while showing their limitations.

### 4.1 Priority cards

Replace the fixed A/B/C layout with reusable candidate cards driven by ordered candidate data.

Suggested no-full-care layout:

```text
No full-care destination is currently eligible.
Review stabilization options and their unmet full-care requirements.

Priority 1 — Stabilization             Priority 2 — Stabilization
Bayview (B)                           Northpoint (C)
Drive: 5 min                          Drive: 11 min
Time to care: 6 min                   Time to care: 14 min
Unmet full-care requirements          Unmet full-care requirements
[Dispatch here for stabilization]     [Choose this alternative]
```

Use responsive one/two/three-column layout according to actual candidate count. Do not retain empty priority slots. Selecting an alternate opens the same dispatch confirmation flow with the correct target.

For a previously confirmed but now ineligible destination, show a separate journey warning with **“Review alternatives”**. This preserves truth about where the ambulance is currently directed.

### 4.2 Deterioration entry point and dialog

Place the deterioration action in the active journey panel, near destination/ETA information. Keep it available even if the recommendation cards are below the fold.

Dialog contents:

- Current destination and care objective.
- Latest position timestamp and routing source.
- Eligible B/C options with fresh drive ETA, receiving delay and time-to-care.
- Highlighted shortest-road-ETA option.
- Unmet full-care requirements and any rejection reasons for alternatives.
- Crew-reported deterioration reason; optional updated observations with the existing review flow.
- **“Confirm diversion to [hospital]”** and **“Keep current destination”**.

Allow choosing the other eligible candidate; record an override reason if it differs from the suggested nearest option. Prevent duplicate submission while a command is pending. Preserve entered reason text after refresh or a recoverable error.

Do not make broad clinical claims such as “safe” or “will stabilize the patient” from capability matching alone. Use operational language: “Meets the currently confirmed stabilization requirements.”

### 4.3 Briefing and feedback

Use null-safe structured inputs and deterministic fallback copy for these states:

- Full-care available: name the selected full-care option and valid backups.
- Stabilization only: state full-care unavailability and name the first eligible stabilization option.
- No candidate: state that no eligible reachable destination is available; do not invent a hospital.
- Diversion pending: name the new target and say acceptance is pending.
- Diversion confirmed: report actual destination/acceptance state without assuming resource availability before the server confirms it.

Remove hardcoded references to St. Jude from success messages. Use the actual old/new hospital names and release counts returned by the server. If no old reservation existed, do not claim reservations were released.

The coordinator LLM must not choose the dispatch target. It may summarize validated structured results; deterministic copy remains available when generation fails or no A exists.

### 4.4 Map and simulator synchronization

- Distinguish recommendation priority from confirmed destination styling.
- On confirmed diversion, use the new destination generation to invalidate the old active route.
- Recalculate from the latest ambulance position without teleporting the vehicle.
- Ignore delayed route responses for the old destination.
- Keep old and new hospital request/inventory displays synchronized through the event flow.
- Emit destination, request and inventory events consistently; avoid double application where direct socket events and outbox delivery overlap.
- Simulation follows the accepted operational destination change; opening a preview must not change its route.

### 4.5 Likely affected files

- `apps/web/src/components/RecommendationPanel.tsx`.
- `apps/web/src/pages/AmbulancePage.tsx` and hospital request display where care objective is shown.
- `apps/web/src/lib/api-client.ts` and shared contracts.
- Proposed `DeteriorationDiversionDialog.tsx` and reusable destination candidate card.
- `apps/api/src/modules/agents/gemini.ts` for null-safe operational briefing inputs/fallback.
- Map/simulator route invalidation consumers and realtime event handlers.

### 4.6 Acceptance gate

- [ ] The screenshot's empty A card and disabled A action are absent in stabilization-only mode.
- [ ] B has a working stabilization dispatch action.
- [ ] No briefing or success message contains `undefined`, incorrect hospital names or false acceptance claims.
- [ ] The deterioration action compares fresh B/C ETAs and requires explicit confirmation.
- [ ] Priority selection, confirmed destination and map route remain distinct and synchronized.
- [ ] Dialog and cards are usable on mobile and by keyboard.

## Stage 5 — Verify both requested cases and regression behavior

**Goal:** Prove that the change fixes the blocked dispatch flow without breaking the existing lifecycle.

### 5.1 Required acceptance scenarios

| Test | Setup | Expected result |
|---|---|---|
| Screenshot case | A null, B/C stabilization eligible | A card removed; B first and dispatchable; null-safe briefing |
| Initial B dispatch | Crew confirms B for stabilization | One B MAIN request; distinct alternatives standby; selected care objective persisted |
| Initial C selection | Crew chooses the other valid option | C becomes MAIN; B is not incorrectly treated as the selected destination |
| Stabilization acceptance | Hospital lacks full-care capability but meets stabilization needs | Only explicit stabilization requirements are evaluated/reserved |
| Closer C after movement | Refreshed B ETA 7 min, C ETA 3 min | C suggested in deterioration preview |
| Closer but ineligible | C closer but lacks a required stabilization resource | C excluded with reason; B suggested if valid |
| Equal ETA | B/C have same road ETA | Tie resolved by time-to-care then stable ID |
| No valid B/C | Both unreachable or ineligible | No automatic diversion target; explicit wider-search/manual coordination option |
| Already heading to B | B is current destination | No self-diversion; C considered as an alternative, current B ETA shown |
| Stale location | Position exceeds freshness policy | No unsupported “nearest now” claim; require refreshed preview |
| Target changes while dialog open | Resource loss or destination version change | Confirmation rejected safely; no partial resource release |
| New assessment | Observations changed but confirmation is outdated | Existing confirmation requirements enforced; stale preview rejected |
| Duplicate confirmation | Same idempotency key submitted twice | One destination generation and one MAIN request |
| In-use equipment | Prior allocations include IN_USE | Diversion never releases in-use equipment |
| Hospital declines new request | Diversion committed, new hospital declines | Pending/unavailable status shown; alternatives refreshed |
| Arrival complete | Case already arrived/handed over | In-transit diversion hidden/disabled and server rejects it |
| A becomes available again | New full-care candidate exists | Recommendations refresh; current journey does not silently change |
| Delayed route response | Old A route returns after diversion to C | Old response ignored; route remains directed to C |

### 5.2 Test placement

- Extend `apps/api/test/agents2-3-routing.test.ts` for care-level eligibility and nearest-road-ETA ranking.
- Extend `dispatch-atomic-reservation.test.ts` for stabilization initial dispatch and explicit acceptance requirements.
- Extend `diversion-lifecycle.test.ts` for preview/confirm validation, idempotency and release semantics.
- Extend `apps/web/src/test/RecommendationPanel.test.tsx`, `DispatchFlow.test.tsx` and `DiversionAndLifecycle.test.tsx` for card removal, actionable B and deterioration comparison.
- Add map/simulator destination-change regression coverage using the current simulator contract.

Use synthetic fixtures and mocked route providers for normal automated tests. The tests should exercise state transitions and resource effects, not merely assert that a button label exists.

Run `pnpm test`, `pnpm typecheck` and `pnpm build` after implementation. Record actual results; this planning task does not run them or claim they pass.

### 5.3 Manual walkthrough

1. Reproduce the supplied no-full-care state.
2. Verify no empty A slot remains and B has a stabilization dispatch action.
3. Confirm B dispatch, switch to the receiving hospital and verify its MAIN stabilization request.
4. Accept and verify the correct allocation set.
5. On a separate in-transit fixture with B/C alternatives, report deterioration.
6. Change the vehicle position so C has the shorter valid road ETA.
7. Verify C is highlighted, cancel once, and confirm that no destination/resource mutation occurred.
8. Reopen, confirm diversion and verify the new route, pending acceptance, previous unused-resource release and audit reason.
9. Repeat with C ineligible and with both candidates unavailable.

## Delivery order and implementation boundaries

| Order | Stage | Required outcome |
|---|---|---|
| 1 | Contracts and intent | Priority and care objective no longer depend on letter A |
| 2 | Eligibility and ranking | Valid stabilization-only priorities and fresh B/C comparison |
| 3 | Backend actions | Initial stabilization dispatch and validated diversion work end to end |
| 4 | UI and synchronization | A removed when absent; actionable B and deterioration dialog; correct map/briefing |
| 5 | Verification | Both requested flows and existing lifecycle pass the test matrix |

**Assumptions:** “Nearest” means shortest currently available road travel time; deterioration is crew-reported; final diversion remains crew-confirmed; full-care limitations stay visible; no hospital is deleted from master data. These choices implement the requested workflow without introducing new clinical decision rules.

**Out of scope:** Automatic diagnosis, autonomous diversion, new treatment protocols, a full RAG rollout, and rewriting unrelated map/simulator systems. Their existing interfaces should be integrated only where needed for the new destination behavior.

**Completion criterion:** A missing full-care A no longer blocks stabilization dispatch, and an in-transit crew can explicitly confirm diversion to the nearest currently eligible B/C alternative using fresh route information.
