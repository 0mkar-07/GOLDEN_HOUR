# GoldenHour Implementation Progress

## Project State
- **Status:** Phase 3 Complete & Verified
- **Current Phase:** Phase 3 (Hospital live data vertical slice) Gate PASSED
- **Next Phase:** Phase 4 (Ambulance case entry and Agent 1)
- **Active Spec:** `docs/implementation-plan.md`

## Milestones Log

### 2026-10-24 — Phase 1: Repository Foundation
- Initialized monorepo with `pnpm workspaces`, Fastify, React/Vite, health endpoints (`/health/live`, `/health/ready`), and baseline tests.

### 2026-10-24 — Phase 2: Contracts, Database, Identity, and Seeded Data
- Defined shared Zod schemas and DTOs in `@goldenhour/contracts`.
- Implemented PostgreSQL DDL in `migrations/001_initial_schema.sql` and unified in-memory store in `apps/api/src/db/store.ts`.
- Seeded 5 synthetic hospitals, 10 resource pools, 5 staff readiness records, road graph, and 4 demo accounts.
- Enforced session cookies, role guards, and cross-hospital isolation (`403 Forbidden`).

### 2026-10-24 — Phase 3: Hospital Live Data Vertical Slice
- **Strict Server-Side Inventory Computation:**
  - Implemented the plan's exact invariant formula:
    $$\text{Available} = \text{Total} - \text{OutOfService} - \text{ExternalOccupancy} - \text{ActiveReserved} - \text{ActiveInUse}$$
  - Prevented arbitrary client-supplied availability counts.
  - Enforced non-negative count constraints on total, out-of-service, and external occupancy.
  - Enforced capacity lower-bound check: Total cannot be reduced below current committed use ($$\text{OutOfService} + \text{External} + \text{Reserved} + \text{InUse} \le \text{Total}$$), returning `400 INVARIANT_VIOLATION`.
  - Added optimistic concurrency with version checks: Stale updates return `409 VERSION_CONFLICT`.

- **Live Staff Readiness & Receiving Status:**
  - Endpoints `PATCH /api/v1/staff-availability/:id` and `PATCH /api/v1/hospitals/:id`.
  - Enforces hospital ownership checks: Staff of Hospital A cannot mutate Hospital B.
  - Audit logging for all hospital metadata, resource pool, and staff adjustments.

- **Frontend Hospital Dashboard (`HospitalPage.tsx`):**
  - Integrated directly with `apiClient` without hardcoded arrays.
  - Displays hospital metadata, receiving status toggle (`OPEN`, `RESTRICTED`, `DIVERT_ALL`), and intake delay controls.
  - Real-time resource pool cards with multi-color capacity bars (Available, Reserved, In Use, External/OOS).
  - Modal form for editing Total, Out-of-service, and External occupancy with projected availability preview and inline conflict handling.
  - Staff readiness slots manager with quick increment/decrement controls.
  - Survives browser page reload by fetching authoritative server state.

- **Verification Checks:**
  - `pnpm typecheck`: Passed (4/4 projects, 0 errors).
  - `pnpm test`: Passed (21/21 tests across 5 test suites).
  - Backend integration tests (`apps/api/test/hospital-slice.test.ts`):
    - Availability formula accurately enforced.
    - Total capacity update recalculates availability server-side.
    - Version conflict returns 409.
    - Reducing capacity below committed use returns 400.
    - Negative counts rejected with 400.
    - Staff slot and receiving status updates persist and record audit events.
  - Frontend integration tests (`apps/web/src/test/HospitalPage.test.tsx`):
    - Live facility details, calculated availability, and edit modal verified.

- **Gate Acceptance:** All Phase 3 criteria met. Editing a hospital updates database/store state and survives reload; negative or conflicting updates are rejected.
