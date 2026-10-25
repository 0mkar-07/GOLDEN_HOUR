# Codex implementation handoff: patient-state-aware hospital selection

Prepared: 25 October 2026. Scope of this task: documentation only. Do not execute this plan or change application code until a later implementation instruction.

## 1. Intended behaviour and interpretation of the request

The application should demonstrate why the right destination changes with patient needs, transport suitability, urgency and operational readiness. Merely assigning every hospital different data will not solve this: the assessment and ranking contracts must express the decision being made.

This plan interprets **A** as a scenario's more comprehensive definitive-care facility, **B** as a nearer facility that may offer suitable early care, and **C** as another nearby alternative. These are scenario labels, not permanent hospital IDs or ranking positions. “OT” means operating theatre; **OT readiness** means the required theatre, team and supporting resources can actually start the required service. A physically nearby theatre does not by itself establish readiness.

Required demonstration cases:

1. **Stable patient needing a specialist service:** A is selected even though B is closer, because B lacks a required service and the assessed transport plan permits proceeding to A.
2. **Urgent patient needing a service B can provide:** B is selected because its relevant theatre/team can start the needed care sooner than A. B need not have every capability A possesses.
3. **Critical patient needing capabilities only A provides:** A can still be selected when the professionally confirmed plan supports direct transport. Critical does not automatically mean nearest hospital.
4. **Patient deteriorating and requiring stabilisation before continued transfer:** B can become the immediate destination when B can deliver the required stabilisation sooner and the confirmed plan requires it, even if definitive care remains at A.
5. **Nearest facility unsuitable:** C is excluded despite being closest if it cannot deliver the patient's immediate required intervention.
6. **B near but its relevant OT/team unavailable:** A or another suitable facility can win because actual care starts sooner there.

These are demonstration scenarios, not clinical routing instructions. A medically critical patient can sometimes require the closest appropriate stabilisation facility, while specialized definitive care can justify bypassing a nearer facility in other circumstances. That distinction is reflected in the US trauma field-triage guidance, but it is not a substitute for local NITK/Karnataka EMS policy or a general rule for all conditions. See the [2021 field-triage guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC9323557/) and [ACS local transport-policy discussion](https://www.facs.org/quality-programs/trauma/systems/field-triage-guidelines/faqs/).

Do not implement `stable → A`, `urgent → B`, or `critical → A/B` as hard-coded shortcuts. Outcomes must follow the patient's confirmed needs and current evidence.

## 2. Copy-ready instruction for a later Codex run

> Implement this document when explicitly instructed to start coding. First inspect the current source, contracts and tests; preserve all existing unrelated changes. Keep the 23 supplied facility identities, original names and coordinates, canonical hospital accounts and 40 km region intact. Extend assessment, readiness and selection semantics so destination choice depends on the confirmed patient care objective, immediate requirements, definitive requirements, transport assessment and operational service readiness. Preserve the existing shared routing snapshot and corrected time calculations. Add reproducible synthetic operating scenarios demonstrating all six cases above. Do not hard-code hospital IDs, force winners, invent clinical thresholds, change source geography or present synthetic capacities as live facts. Add tests before declaring a stage complete. Keep dispatch, diversion and elective deferral under their existing authorised human confirmation workflows. Report completed gates, actual test evidence and remaining blockers honestly.

## 3. Current-source audit: extend what exists

The repository has evolved since earlier plans. Reconfirm these anchors before implementing; do not reapply superseded fixes blindly.

| Source | Current observation | Gap to address |
|---|---|---|
| `apps/api/src/modules/agents/agent1.ts` | Separates proposed full-care and stabilisation capability lists; uses issue text and individual vitals | No structured transport assessment, required intervention priority or confirmed pathway selection; `urgencyLevel` is destructured without materially controlling this policy |
| Agent 1 rules | Broad text matching can assign an entire neurotrauma bundle on words such as “head” | Differentiate presenting complaint, supported suspicion and confirmed requirement; do not remove capabilities solely to manufacture a B outcome |
| Agent 1 rule vocabulary | Emits terms including `PEDIATRIC_TRAUMA` | Validate every emitted term against the current catalogue; unsupported codes need an explicit mapping/review result |
| `agent2.ts` | Checks more resource pools than earlier versions and returns full-care/stabilisation booleans | Must evaluate requirements per pathway at arrival, with status/evidence detail rather than two booleans alone |
| Agent 2 stabilisation branch | A missing resuscitation pool can pass because rejection is conditional on the pool existing with zero capacity | Missing required resource evidence must remain unknown, not implicitly available |
| `agent3.ts` | Uses shared route/timing data and serializes actual readiness fields | Full-care candidates still take primary precedence whenever any are reachable; this prevents a confirmed stabilisation-first pathway from becoming primary |
| `agentCoordinator.ts` | Retrieves requirements, evaluates hospitals, obtains a route snapshot and invokes Agent 3 | Needs explicit current patient policy input, assessment confirmation checks and pathway-aware comparison |
| Coordinator missing-input check | Some checks only detect `undefined` | Treat `null`, absent, stale and invalid observations distinctly; do not assume null means normal |
| `agents/tools.ts` | Provides capability/readiness/hour tools | Extend returned evidence with relevant team readiness, service intervals, source/expiry and actual resource conflicts |
| Contracts | Existing assessment, recommendation, resource and scheduling DTOs | Add structured pathway fields without breaking current case lifecycle and canonical IDs |
| UI | Existing A/B/C and priority candidate representations | Separate scenario labels from priority order; explain care objective and decision change |

The task is an extension of the current coordinator and shared snapshot, not a rewrite of the map, login system or whole application.

## 4. Core domain model

Keep these axes independent:

| Axis | Meaning | Must not be confused with |
|---|---|---|
| Clinical stability | Professionally assessed stable, unstable or unknown state at an observation time | A guaranteed ability to tolerate any trip |
| Urgency | How time-sensitive the required care is under the confirmed plan | A diagnosis or automatic nearest-hospital instruction |
| Definitive requirements | Services needed for the intended complete treatment objective | Every advanced service a hospital happens to offer |
| Immediate requirements | Services needed before continued transport or later treatment, when applicable | A generic oxygen-only checklist for every deteriorating patient |
| Transport assessment | Whether the current plan permits direct transport or requires stabilisation first | An AI-predicted survival time |
| Service readiness | Earliest feasible start of the particular required intervention | Hospital opening hours or an unused theatre count alone |
| Destination state | Proposed, selected, accepted, reserved, en route or arrived | Recommendation rank |

**Decision priority:** validate evidence → respect confirmed pathway and hard requirements → establish feasible arrival/service readiness → compare clinically relevant care-start times → explain alternatives → await required user action.

## Stage 1 — Define scenario contracts and success cases before implementation

**Tools:** existing Zod/TypeScript contracts, Vitest and versioned scenario fixtures.

1. Add named scenario specifications for the six cases in Section 1.
2. Record patient observations separately from expected derived proposals and professionally confirmed policy. A fixture can contain an expected winner for testing; runtime ranking must not read that field.
3. Include `scenarioId`, seed, scenario start time, origin, facility-role bindings, operational overlay revision and expected explanation reason codes.
4. Keep an explicit fixture scope for three-facility unit tests. For full-directory demonstrations, evaluate all supplied facilities and allow another eligible hospital to outrank A/B/C.
5. If a presentation uses a restricted scenario subset, label it “Scenario subset” and do not claim it is an unrestricted regional optimum.
6. Use synthetic route snapshots for arithmetic unit tests. In live mode, obtain actual route values; never force live Google ETAs to match demonstration numbers.
7. Write the initial decision matrix tests before changing Agent 1 so subsequent code has a clear behavioural target.

**Gate:** the scenario manifest describes why each result should occur, not just which hospital should win.

## Stage 2 — Extend the assessment and confirmation model

**Existing edit targets:** `packages/contracts/src/case.ts`, recommendation contracts, assessment creation/confirmation routes and store methods.

Proposed fields should use enums and structured evidence, not an unvalidated prompt string:

| Field | Suggested representation |
|---|---|
| `clinicalStability` | `STABLE`, `UNSTABLE`, `UNKNOWN`; proposed and confirmed values distinguished |
| `conditionTrend` | `IMPROVING`, `UNCHANGED`, `DETERIORATING`, `UNKNOWN` with supporting observation IDs |
| `urgency` | Reuse/extend existing urgency enum consistently |
| `transportAssessment` | `DIRECT_TRANSPORT_PERMITTED`, `STABILIZE_BEFORE_TRANSFER`, `REVIEW_REQUIRED` |
| `immediateRequirements` | Typed requirement list with capability, resource/staff dependencies and reason |
| `definitiveRequirements` | Typed requirement list with reason and source |
| `requiredIntervention` | Versioned service/procedure category, with `UNKNOWN` supported |
| `selectedPathway` | `DIRECT_DEFINITIVE`, `STABILIZE_THEN_TRANSFER`, `REVIEW_REQUIRED` |
| `timeConstraints` | Optional professionally configured arrival/intervention constraints with unit, scope, author and policy source |
| `confirmation` | Confirming user, timestamp, assessment version, policy version and override reason where applicable |
| `missingEvidence` | Field-level absent/null/stale/contradictory evidence descriptors |

Implementation instructions:

1. Separate proposed fields from confirmed fields; an LLM response does not silently confirm a transport assessment.
2. Require timestamps and observation linkage. Stability and trend are time-dependent.
3. Treat stability and urgency independently: a patient may be physiologically stable while needing time-sensitive definitive treatment.
4. Do not invent a universal “safe transport duration” or infer survival minutes from one vital sign. Any demo timing constraint is synthetic, labelled and policy-sourced.
5. Validate that time constraints specify what they constrain: arrival, first stabilising intervention or definitive care. Do not compare an arrival ETA to a deadline for intervention without including readiness.
6. For old assessments lacking new fields, use `REVIEW_REQUIRED` until explicitly confirmed or migrated through a documented review flow; do not assume stable/direct transport.
7. Increment assessment version when requirements or pathway changes. Invalidate incompatible recommendation/preview versions.
8. Preserve historical assessments; do not overwrite the prior confirmed plan when deterioration observations arrive.

**Gate:** unknown and unconfirmed fields cannot silently become a definitive direct-transport instruction.

## Stage 3 — Make Agent 1 propose a patient-specific care plan

**Tools:** current rules interpreter, Gemini interpreter, shared structured schemas and validated clinical policy configuration.

1. Keep Agent 1's role as interpreting observations into proposed needs and identifying missing information. It should not choose A/B/C by name.
2. Add structured output for clinical stability evidence, trend, immediate need, definitive need and proposed pathway requiring confirmation.
3. Replace broad text-to-complete-bundle behaviour with supported scenario/policy templates. Preserve uncertainty when the complaint does not establish a specific treatment need.
4. Make urgency a meaningful input to the explanation and policy evaluation, while avoiding a direct urgency-to-hospital lookup.
5. Evaluate multiple observations and context using the approved policy rather than claiming a single measured value establishes diagnosis or transport suitability.
6. Compare the latest observation with prior observations for a proposed trend only when timestamps, units and comparability are valid. One observation cannot establish a trend.
7. Distinguish support reportedly provided in the ambulance from support currently effective and sufficient. Do not infer transport suitability merely because a bag-valve mask or oxygen appears in a text array.
8. Validate model and rule outputs using the same schema and capability catalogue. Address existing resource/capability vocabulary mismatches explicitly.
9. Define procedure-specific requirements: an urgent general surgical scenario need not automatically require neurosurgery; a confirmed neurosurgical scenario must not lose that requirement to admit a nearer general hospital.
10. Keep immediate and definitive needs separate. Requiring every definitive diagnostic service at a stabilisation stop can wrongly eliminate all valid immediate options; any distinction must come from reviewed policy, not convenience.
11. On incomplete/conflicting observations, return `REVIEW_REQUIRED` and targeted missing-input questions. Keep the prior confirmed destination unchanged pending review.
12. Return factual reason codes and evidence references. Avoid uncalibrated fixed confidence scores as proof of clinical correctness.
13. Use identical confirmation and dispatch protections for Gemini output and rules fallback.

**Gate:** the same presenting issue with a different confirmed clinical/transport state produces an appropriately different proposed pathway without fabricating capabilities or a destination.

## Stage 4 — Create coherent operational overlays for the NITK dataset

**Tools:** existing preserved identity dataset, deterministic overlay generator, resources/staff/scheduling contracts.

1. Keep all names, IDs and source coordinates unchanged. Assign scenario roles A/B/C through a separate binding table.
2. Bind roles only to labelled synthetic operating profiles. Do not claim a named hospital actually lacks neurosurgery, has a free OT or has a particular trauma certification based on a demo configuration.
3. Create service-specific capability groups and staff/resource dependencies. A single `hasOT: true` flag is insufficient.
4. Represent compatible theatre availability, required surgical/anaesthesia/support team readiness, required equipment, receiving status and service hours.
5. Model currently free resources separately from future-ready resources and existing reservations. Future estimates must not count as already allocated.
6. Include one demo facility with comprehensive relevant definitive services, one closer facility with a narrower but useful service set, and another near facility that lacks a required immediate service.
7. Include an alternate overlay where the nearer facility's compatible theatre is occupied and the farther facility can start care sooner.
8. Keep the profile internally consistent: supported service, equipment, staff and opening intervals must agree, or uncertainty must be explicit.
9. Use a seed and scenario clock; freeze identical inputs across patient-state comparisons so the changed outcome is attributable to policy, not random hospital regeneration.
10. Do not globally disable other hospitals to force A/B/C in the full regional view. Use isolated fixtures or disclose a scenario subset.

### Synthetic teaching fixture — not actual hospital data

All values below are relative to a single evaluation time and use a mocked route snapshot for tests.

| Role | Road travel | Stabilisation care start | General emergency intervention start | Specialist definitive care start | Illustrative profile |
|---|---:|---:|---:|---:|---|
| A | 18 min | 20 min | 22 min | 22 min | Relevant specialist service and compatible teams/resources available |
| B | 7 min | 8 min | 11 min | Unsupported | Nearer general emergency facility with ready compatible OT/team |
| C | 5 min | Not eligible for the specified immediate need | Unsupported | Unsupported | Nearer location but insufficient relevant support |

Expected outcomes under explicit fixture inputs:

- Stable, specialist requirement confirmed, direct transport permitted → A.
- Urgent general intervention required, B satisfies all relevant hard requirements → B at 11 min rather than A at 22 min.
- Critical, specialist requirement confirmed, direct transport permitted → A; severity alone does not erase required capabilities.
- Deteriorating, immediate requirement confirmed, stabilisation-before-transfer confirmed → B for immediate care; preserve A as a possible later definitive destination.
- Same general-intervention case but B's start moves to 35 min → A at 22 min, assuming both remain eligible.
- B loses required immediate support → exclude B; do not select C merely because it is closer; return a reviewed alternative or no confirmed feasible option.

These are service-start values, not just travel values. Derive them from underlying readiness/intake fixtures so arithmetic can be verified; do not store these results as hospital-wide constants.

**Gate:** patient-state scenarios reuse the same hospital data, and operating-state scenarios reuse the same patient data. Each counterfactual changes only the intended cause.

## Stage 5 — Upgrade Agent 2 to evaluate each care objective separately

**Tools:** existing hospital evaluation module, readiness tools, resource pools, schedules and the shared route snapshot.

1. Evaluate immediate stabilisation, required definitive intervention and any intermediate service separately for each hospital.
2. Return structured status: `ELIGIBLE_NOW`, `ELIGIBLE_AT_TIME`, `INELIGIBLE`, `UNKNOWN`, with evidence versions and reasons. Retain compatibility booleans only as derived fields.
3. Build readiness for the patient's required intervention. A hospital's unused general OT cannot satisfy a requirement for a different unsupported service.
4. Check resource quantities, specialist/team slots, service intervals, compatible theatre, required equipment and hospital receiving status at predicted arrival.
5. Missing required pools or staff produce unknown readiness, not implicit availability. Preserve the difference between missing data and a confirmed zero.
6. Use specific reasons: unsupported service, equipment unavailable, team not ready, closed at arrival, incompatible theatre, intake diversion, stale data or route unavailable.
7. Evaluate service intervals jointly: the required theatre, team and equipment must overlap for the necessary service window; independent ready timestamps may not be sufficient.
8. Keep clinical hard constraints separate from optional preferences. Extra unrelated capabilities must not compensate for a missing required intervention.
9. Expose feasible immediate and definitive care-start times separately. Do not reuse a full-care readiness delay to score a stabilisation stop.
10. Revalidate evidence at acceptance/reservation. Eligibility is a proposal based on a snapshot, not a resource guarantee.

**Gate:** B can be eligible for stabilisation or general intervention while remaining ineligible for a specialist definitive need; both statements can be true simultaneously.

## Stage 6 — Select pathway first, then rank appropriate candidates

**Tools:** existing coordinator/Agent 3, shared timing calculator, explicit decision policy and typed reason codes.

### Required decision flow

1. Load the latest confirmed assessment and transport/pathway decision. If it is missing, stale or contradictory, return `REVIEW_REQUIRED`.
2. Obtain a versioned route snapshot from the current ambulance location.
3. Evaluate relevant service readiness for each candidate and the confirmed objective.
4. If direct definitive care is confirmed, rank candidates satisfying the definitive hard requirements by feasible care start, subject to any explicitly approved timing constraints.
5. If stabilisation before transfer is confirmed, rank candidates satisfying immediate requirements by the agreed immediate-intervention policy. Do this even when a full-care hospital exists somewhere in the region.
6. Keep definitive facilities visible as subsequent-care candidates rather than automatically overriding the confirmed immediate objective.
7. If no candidate can satisfy the selected objective, show no confirmed feasible option and request appropriate review. Do not silently weaken requirements to fill three cards.
8. Break true ties deterministically. Never choose based on a hospital's letter, name, prestige proxy or total number of capability tags.
9. Produce explicit policy reason codes and metric comparisons, then persist the evidence/version snapshot.

### Timing model

```text
arrivalAt = evaluationTime + routeTravelSeconds
serviceStartAt = earliest feasible required-service interval at/after arrivalAt
                 + any residual intake/preparation time not already counted

timeToImmediateCare = immediateServiceStartAt - evaluationTime
timeToDefinitiveCare = definitiveServiceStartAt - evaluationTime
```

Keep non-overlapping or unknown service windows unresolved. Avoid adding intake/preparation twice if schedule readiness already includes it.

### Two-leg stabilisation pathway

For `STABILIZE_THEN_TRANSFER`, show the immediate destination plus a separately qualified possible onward destination. An estimated total can include:

`travel to stabilisation + initial wait/intake + stabilisation duration + transfer preparation + onward road travel + definitive receiving wait`.

Do not assign a default zero stabilisation duration or treat a possible onward hospital as already accepted. When duration, transport availability or onward acceptance is unknown, show “Onward transfer timing not confirmed.” Do not use an invented total to override the confirmed immediate need.

### Example reason codes

- `DEFINITIVE_SERVICE_REQUIRED`
- `NEARER_FACILITY_MISSING_REQUIRED_SERVICE`
- `DIRECT_TRANSPORT_CONFIRMED`
- `STABILIZATION_FIRST_CONFIRMED`
- `EARLIER_REQUIRED_INTERVENTION`
- `THEATRE_NOT_READY_AT_ARRIVAL`
- `SPECIALIST_TEAM_UNAVAILABLE`
- `TRANSPORT_ASSESSMENT_REQUIRED`
- `NO_FEASIBLE_CONFIRMED_PATHWAY`

**Gate:** the six demonstration cases work through one general policy, including the critical-direct-to-A case and the deterioration-stabilise-at-B case. No hospital-specific branch is allowed in production ranking.

## Stage 7 — Integrate deterioration, confirmation and event-driven reassessment

**Tools:** current assessment history, coordinator, realtime events, destination/version checks and diversion dialog.

1. A deterioration report creates a new observation/assessment proposal and invalidates affected recommendation evidence; it does not silently overwrite the active destination.
2. Show what changed: clinical state/trend, immediate requirements, transport assessment and proposed pathway.
3. Require the authorised user's confirmation for the updated care plan before dependent dispatch/diversion commands.
4. Recompute from the ambulance's current position, not the incident start pin or distance from NITK.
5. Include case, assessment, destination, route, inventory and policy versions in the diversion preview. Reject confirmation when any required evidence changed materially.
6. Preserve current dispatch until a valid replacement transition completes. Resource release and new reservations follow the existing atomic lifecycle; do not drop the current destination first.
7. Reassess when a relevant theatre/team becomes unavailable, traffic changes, receiving status changes or new patient evidence arrives. Avoid an LLM request for every animation frame.
8. A pending elective-deferral ticket does not make an OT available. Require a permitted hospital decision and applied resource-state update.
9. An in-progress/protected/non-deferrable procedure must not be stopped by this workflow. Alternative-resource review remains separate from elective deferral approval.
10. Return a bounded provisional or review-needed state on missing/provider evidence. Never claim that tools or approvals occurred merely because a narrative suggests they did.

**Gate:** a stable-to-deteriorating sequence produces an explainable revised proposal without an unconfirmed automatic diversion.

## Stage 8 — Update recommendation and hospital UI semantics

**Tools:** existing recommendation panel, deterioration dialog, hospital dashboard and scenario controls.

1. Show the confirmed care objective and assessment age above the ranked list.
2. Use labels such as **Recommended now**, **Definitive-care option**, and **Immediate stabilisation option**. Do not let a historical “Hospital A” card always imply first priority.
3. Show travel ETA, service readiness, relevant OT/team availability, immediate-care start and definitive-care start as distinct facts.
4. Explain B-over-A: “B meets the required intervention needs and can start at 11 min; A can start at 22 min.”
5. Explain A-over-B: “B is nearer but lacks the confirmed specialist service; direct transport to A is the confirmed pathway.”
6. Explain stabilisation-first: “Immediate stabilisation at B is recommended under the confirmed plan; definitive treatment remains a separate next step.”
7. List absent required services, not generic “less equipped”. Do not imply a facility is globally inferior because it lacks one case-specific service.
8. Provide a patient-state comparison demo that freezes geography/operating data while changing the confirmed scenario assessment. Label simulated inputs clearly.
9. Display scenario role, canonical hospital name and recommendation rank independently in developer diagnostics.
10. Show `NIL`, stale and unconfirmed facts explicitly. Remove generic assurances such as “ready” when only a capability string supports the claim.
11. Display actual interpreter/fallback mode and factual tool activity. A generated explanation cannot change the scored result.

**Gate:** a reviewer can explain why the same hospital dataset produces different destinations without assuming the system uses random values or letter-based rules.

## Stage 9 — Tests, counterfactuals and migration checks

**Tools:** Vitest, Fastify injection tests, existing frontend Testing Library suites, real-browser checks during implementation.

| Test | Expected result |
|---|---|
| Stable specialist case, nearer facility lacks service | A wins when direct transport is confirmed |
| Urgent general case, B has suitable OT/team sooner | B wins without needing every unrelated capability of A |
| Critical specialist case with confirmed direct transport | A wins; critical alone does not force nearest |
| Deteriorating case with confirmed stabilisation-first plan | B becomes recommended immediate destination despite reachable full care at A |
| C nearest but missing immediate requirement | C excluded with specific reason |
| B OT becomes unavailable while patient data stays fixed | A/other eligible facility wins on actual service start |
| Additional irrelevant capabilities added to A | No ranking change solely from capability count |
| Source names/IDs or fixture array order permuted | Same clinically equivalent outcome; role letters do not control selection |
| Missing resuscitation pool or staff data | UNKNOWN, not eligible by absence |
| Null/stale observations and transport assessment | Review required, no invented normal state |
| Model emits unknown capability or unsupported pathway | Validation rejects/requests review; no silent dropping of need |
| New deterioration proposal not yet confirmed | Existing destination remains unchanged |
| Stale assessment/route result arrives late | Cannot overwrite recommendation for newer versions |
| Pending theatre-deferral ticket | Readiness remains unconfirmed until valid applied update |
| In-progress or non-deferrable scheduled case | No elective-deferral mutation |
| Unknown stabilisation duration/onward acceptance | No invented two-leg completion time or transfer guarantee |
| Patient not requiring surgery | OT availability does not affect unrelated care ranking |
| Honest equal scores | Stable tie-break, no injected randomness |
| Full 23-facility run admits a better candidate D | D can win; scenario A/B/C labels do not constrain production results |

Implementation instructions:

1. Add tests for both deterministic and LLM-output parsing paths using the same contracts.
2. Use mocked routes/clock for exact arithmetic assertions and fixed scenario seeds for replay tests.
3. Add a test varying patient state while holding operating state constant, and another varying theatre readiness while holding patient state constant.
4. Verify source name/coordinate checksums remain unchanged after overlay generation and scenario reset.
5. Add integration coverage for assessment proposal → confirmation → recommendation → diversion preview → authorised confirmation.
6. Test migration of legacy assessments and older clients; return clear review-required/validation responses rather than interpreting missing new fields as direct transport permission.
7. Run relevant package tests, typecheck and build; record legacy failures separately with evidence. Do not weaken assertions to fit a predetermined A/B/C order.
8. Browser-check both primary card modes and the distinction between scenario role and priority rank.

**Gate:** every demonstration outcome and its reverse/counterexample is covered. A successful demo is not sufficient without rejection and stale-state tests.

## Stage 10 — Delivery order and Codex completion report

1. Commit-sized implementation unit: scenario specifications and assessment/pathway schemas.
2. Next unit: Agent 1 proposal parsing/rules and confirmation/version handling.
3. Next unit: coherent operational fixtures and per-objective Agent 2 readiness.
4. Next unit: pathway-aware coordinator/Agent 3 with current route snapshots.
5. Next unit: deterioration, onward-transfer status and safe diversion lifecycle.
6. Next unit: UI explanation, scenario comparison and full regression checks.

Required completion report:

- Changed files and why each change was needed.
- Preserved identity checksum and synthetic overlay definitions.
- The six worked cases with actual explanation reason codes and input versions.
- Confirmation that no fixed hospital letter/ID determines ranking.
- Tests/commands executed, results and genuinely unverified areas.
- Actual clinician/local-policy inputs still needed before any use beyond the synthetic demo.
- Any disabled or incomplete feature, including missing onward-transfer timing.

## File map for the implementing Codex run

| Area | Required work |
|---|---|
| `packages/contracts/src/case.ts` | Structured patient state, transport/pathway proposals and confirmation |
| `packages/contracts/src/recommendation.ts` | Per-objective results, pathway, reasons and evidence versions |
| `packages/contracts/src/resources.ts`, `scheduling.ts` | Service-specific readiness and feasible intervals |
| `packages/scenario-fixtures/src/` | Preserved identities plus explicit synthetic case/operating overlays |
| `apps/api/src/modules/agents/agent1.ts`, `interpreter.ts`, `gemini.ts` | Consistent validated proposed policy; no name-based hospital decision |
| `apps/api/src/modules/agents/agent2.ts`, `tools.ts` | Per-objective evidence and unknown-state handling |
| `apps/api/src/modules/agents/agent3.ts`, `agentCoordinator.ts` | Confirmed pathway before ranking, current evidence and consistent explanations |
| `apps/api/src/modules/cases/routes.ts`, `db/store.ts` | Versioned assessment confirmation and invalidation |
| Dispatch/scheduling modules | Preserve acceptance, reservation and human-review boundaries |
| `RecommendationPanel.tsx`, `DeteriorationDiversionDialog.tsx` | Explain immediate versus definitive destination and why it changed |
| Ambulance/hospital pages | Capture/confirm state and show actual service readiness |
| API/web tests | Decision matrix, counterfactuals, lifecycle and compatibility |

## Inputs to record rather than guess

- The intended demo patient presentations and which services are confirmed requirements in each.
- A qualified owner for clinical/transport policy if extending beyond a synthetic demonstration.
- Whether the demo should show all 23 facilities or a clearly labelled subset for teaching.
- Any local-policy timing constraints, their author, scope and units; otherwise keep them absent.
- Required supporting resources for each demo procedure category.
- Whether onward transfer remains a proposal-only display or belongs to a separately authorised implementation scope.

For a synthetic demo, Codex can implement the fixture scenarios and review-required defaults without inventing clinical thresholds. It must not claim that this establishes a validated clinical destination-selection policy.

## Definition of done

The same preserved hospital dataset supports all six outcomes for explicit reasons. Patient state changes the confirmed objective and required services; readiness and routing determine feasible care start. A closer facility is neither always selected nor always rejected. A comprehensive facility is selected when its relevant capabilities and the confirmed transport plan justify it. Missing evidence stays visible, and no recommendation silently dispatches or diverts an ambulance.

This task creates only this Markdown handoff. Application changes and test execution are reserved for a later authorised Codex implementation run.
