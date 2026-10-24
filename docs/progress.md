# GoldenHour Implementation Progress

## Project State
- **Status:** Phase 2 Complete & Verified
- **Current Phase:** Phase 2 (Contracts, database, identity, and seeded data) Gate PASSED
- **Next Phase:** Phase 3 (Hospital live data vertical slice)
- **Active Spec:** `docs/implementation-plan.md`

## Milestones Log

### 2026-10-24 — Phase 1: Repository Foundation
- Initialized monorepo with `pnpm workspaces`, Fastify, React/Vite, health endpoints (`/health/live`, `/health/ready`), and baseline tests.

### 2026-10-24 — Phase 2: Contracts, Database, Identity, and Seeded Data
- **Shared Contracts (`@goldenhour/contracts`):**
  - Expanded Zod schemas and TypeScript DTOs:
    - [`UserDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/auth.ts), `LoginRequest`, `LoginResponse`
    - [`HospitalDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/hospital.ts), `LocationDto`, `UpdateHospitalRequest`
    - [`ResourcePoolDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/resources.ts), [`StaffAvailabilityDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/resources.ts), [`AllocationDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/resources.ts)
    - [`EmergencyCaseDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/case.ts), [`AssessmentDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/case.ts), [`HospitalRequestDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/case.ts), [`DestinationDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/case.ts), [`AmbulancePositionDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/case.ts)
    - [`RecommendationDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/recommendation.ts), [`CandidateEvaluationDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/recommendation.ts)
    - [`AuditEventDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/audit.ts), [`OutboxEventDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/audit.ts)
    - [`SimulationRunDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/simulation.ts), [`RoadGraphDto`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/contracts/src/simulation.ts)
  - Core domain enums: `UserRole`, `ReceivingStatus`, `SpecialtyType`, `ResourceType`, `CaseStatus`, `RequestRole`, `RequestStatus`, `DestinationReadiness`, `AllocationState`, `DestinationActor`.

- **SQL Migrations & Database Repository:**
  - Written [`migrations/001_initial_schema.sql`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/migrations/001_initial_schema.sql) with PostgreSQL DDL: foreign keys, check constraints on non-negative quantities, versions, and capacity invariants (`out_of_service + external + reserved + in_use <= total`).
  - Created [`apps/api/src/db/store.ts`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/api/src/db/store.ts) enforcing all schema constraints, version increments, and isolation rules in memory when PostgreSQL is running standalone/demo mode.

- **Identity & Session Authentication:**
  - Password hashing with random salt using Node's native `crypto.scrypt` and timing-safe comparison in [`apps/api/src/modules/auth/password.ts`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/api/src/modules/auth/password.ts).
  - Server-side session store with HTTP-only cookie (`gh_session`) in [`apps/api/src/modules/auth/session.ts`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/api/src/modules/auth/session.ts).
  - Fastify auth plugin with `requireAuth`, `requireRole`, and `requireHospitalOwnership` in [`apps/api/src/modules/auth/plugin.ts`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/api/src/modules/auth/plugin.ts).
  - Cross-hospital access protection: Staff of Hospital A cannot read or mutate Hospital B.

- **Seeded Scenarios & Demo Users:**
  - Seeded 5 synthetic hospitals (`HOSP-A` through `HOSP-E`), 10 resource pools, 5 staff readiness records, and a connected road network graph in [`packages/scenario-fixtures`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/packages/scenario-fixtures/src/index.ts).
  - 4 Documented Demo Users:
    - `paramedic@goldenhour.test` / `demo123` (Ambulance Lead)
    - `stjude_admin@goldenhour.test` / `demo123` (St. Jude ED Coordinator, Hospital A)
    - `bayview_admin@goldenhour.test` / `demo123` (Bayview Urgent Manager, Hospital B)
    - `admin@goldenhour.test` / `demo123` (System Dispatch Admin)
  - `pnpm seed` is idempotent and safe to rerun repeatedly.

- **Frontend Integration:**
  - Typed API client in [`apps/web/src/lib/api-client.ts`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/web/src/lib/api-client.ts) handling credentials and DTO typing.
  - Global `AuthProvider` in [`apps/web/src/context/AuthContext.tsx`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/web/src/context/AuthContext.tsx).
  - Interactive Demo Role Switcher in [`Header.tsx`](file:///c:/Users/Hp/OneDrive/Desktop/golden%20hour%202/apps/web/src/components/Header.tsx) allowing instant switching between demo roles.

- **Verification Checks:**
  - `pnpm typecheck`: Passed (4/4 projects, 0 errors).
  - `pnpm build`: Passed (contracts, fixtures, api, web production builds clean).
  - `pnpm test`: Passed (12/12 tests: 10 API + 2 Web).
  - Critical Invariant Tests:
    - Cross-hospital mutation rejection: Hospital A user receives `403 Forbidden` attempting to mutate Hospital B.
    - Capacity violation rejection: Resource pool reduction below committed allocations returns `400 INVARIANT_VIOLATION`.
    - Version conflict rejection returns `409 VERSION_CONFLICT`.
    - Unauthenticated calls return `401 UNAUTHORIZED`.
  - Repeatable seed test: Multiple runs preserve exact 5 hospitals and 4 demo users without duplicate records.

- **Gate Acceptance:** All Phase 2 criteria met. Each role logs in; Hospital A cannot mutate Hospital B; shared schemas are imported by both apps; seed contains exactly the intended five hospitals.
