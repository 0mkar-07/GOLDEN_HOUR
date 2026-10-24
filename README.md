# GoldenHour — Emergency Hospital Coordination Platform

> **Hackathon Demonstration Simulation**  
> **Status:** Phase 1 Foundation Verified  
> **Notice:** Uses synthetic patient data and simulated hospital environments. Not clinically validated for real-world medical diagnosis or dispatch.

---

## 1. Architecture Overview

GoldenHour coordinates in-transit ambulances with emergency hospital networks using real-time patient requirements, verified hospital capabilities/staff readiness, and calculated time-to-care estimates.

```text
golden-hour-2/
├── apps/
│   ├── api/            # Fastify backend, health endpoints, DB pool, domain modules
│   └── web/            # React + Vite shell, Tailwind CSS, Ambulance/Hospital/Admin interfaces
├── packages/
│   ├── contracts/      # Shared Zod schemas, health contracts, state enums
│   └── scenario-fixtures/ # Synthetic road network and hospital seeds
├── docs/
│   ├── implementation-plan.md  # Master 13-phase implementation specification
│   └── progress.md             # Phase completion logs and test results
├── docker-compose.yml  # PostgreSQL local container
├── pnpm-workspace.yaml # Monorepo workspace configuration
└── README.md
```

---

## 2. Ports and Endpoints

| Service | Port | Description |
|---|---|---|
| **Web Frontend** | `http://localhost:3000` | Vite React application with proxy to API |
| **API Server** | `http://localhost:4000` | Fastify backend REST API |
| **API Liveness** | `http://localhost:4000/health/live` | Checks service uptime and process state |
| **API Readiness** | `http://localhost:4000/health/ready` | Verifies database connectivity (`SELECT 1`) |
| **PostgreSQL** | `localhost:5432` | Database service (`goldenhour` / `goldenhour_dev_password`) |

---

## 3. Quick Start Commands

### Prerequisites
* **Node.js**: `v20+` or `v24+`
* **pnpm**: `v10+` or `v12+` (`npm install -g pnpm`)
* **Docker** (optional): For running local PostgreSQL container via `docker compose up -d`

### Installation & Build

```bash
# 1. Install all monorepo dependencies
pnpm install

# 2. Typecheck all packages and apps
pnpm typecheck

# 3. Build all packages and apps
pnpm build

# 4. Run automated test suites (API + Web)
pnpm test
```

### Starting the Applications

```bash
# Start both API (port 4000) and Web (port 3000) concurrently:
pnpm dev

# Or start individually:
pnpm dev:api   # Starts Fastify API with hot-reload (tsx watch)
pnpm dev:web   # Starts Vite dev server with proxy
```

### Database & Migrations

```bash
# Start PostgreSQL via Docker Compose:
docker compose up -d

# Run database migrations:
pnpm migrate

# Seed synthetic scenarios:
pnpm seed
```

---

## 4. Phase Verification Checklist

- [x] TypeScript monorepo configured with `pnpm workspaces`.
- [x] `@goldenhour/contracts` shared package with Zod health schemas and core enums.
- [x] `@goldenhour/scenario-fixtures` package with seeded hospital models.
- [x] Fastify API with `/health/live` and `/health/ready` checking PostgreSQL connectivity.
- [x] React 18 + Vite frontend shell with active routes for **Ambulance**, **Hospital**, and **Admin**.
- [x] Dynamic `ApiHealthBadge` polling live API and DB status.
- [x] Automated test suites in `apps/api` and `apps/web` passing.
- [x] Clean zero-error `pnpm typecheck` and `pnpm build`.
