-- GoldenHour Initial Database Schema (Phase 2)
-- Enforces versioning, foreign keys, non-negative quantities, and isolation invariants.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  hospital_id VARCHAR(64),
  ambulance_id VARCHAR(64),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospitals (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL,
  location_x DOUBLE PRECISION NOT NULL,
  location_y DOUBLE PRECISION NOT NULL,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  receiving_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  receiving_delay_seconds INTEGER NOT NULL DEFAULT 120 CHECK (receiving_delay_seconds >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_availability (
  id VARCHAR(64) PRIMARY KEY,
  hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  specialty VARCHAR(64) NOT NULL,
  available_team_slots INTEGER NOT NULL DEFAULT 0 CHECK (available_team_slots >= 0),
  ready_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hospital_specialty UNIQUE (hospital_id, specialty)
);

CREATE TABLE IF NOT EXISTS resource_pools (
  id VARCHAR(64) PRIMARY KEY,
  hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  resource_type VARCHAR(64) NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  out_of_service_count INTEGER NOT NULL DEFAULT 0 CHECK (out_of_service_count >= 0),
  external_occupancy INTEGER NOT NULL DEFAULT 0 CHECK (external_occupancy >= 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  in_use_count INTEGER NOT NULL DEFAULT 0 CHECK (in_use_count >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hospital_resource UNIQUE (hospital_id, resource_type),
  CONSTRAINT chk_capacity_invariants CHECK (out_of_service_count + external_occupancy + reserved_count + in_use_count <= total_count)
);

CREATE TABLE IF NOT EXISTS emergency_cases (
  id VARCHAR(64) PRIMARY KEY,
  assigned_ambulance_id VARCHAR(64) NOT NULL,
  case_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  patient_label VARCHAR(255) NOT NULL,
  assessment_version INTEGER NOT NULL DEFAULT 0,
  destination_version INTEGER NOT NULL DEFAULT 0,
  selected_hospital_id VARCHAR(64) REFERENCES hospitals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessments (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  observations JSONB NOT NULL,
  proposed_full_care_needs TEXT[] NOT NULL DEFAULT '{}',
  proposed_stabilization_needs TEXT[] NOT NULL DEFAULT '{}',
  confirmed_full_care_needs TEXT[] NOT NULL DEFAULT '{}',
  confirmed_stabilization_needs TEXT[] NOT NULL DEFAULT '{}',
  clinician_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by VARCHAR(64) REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_case_assessment_version UNIQUE (case_id, version)
);

CREATE TABLE IF NOT EXISTS destinations (
  case_id VARCHAR(64) PRIMARY KEY REFERENCES emergency_cases(id) ON DELETE CASCADE,
  hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(id),
  readiness VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  selected_by VARCHAR(32) NOT NULL DEFAULT 'CLINICIAN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_requests (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(id),
  role VARCHAR(32) NOT NULL DEFAULT 'MAIN',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  destination_generation INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allocations (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  resource_pool_id VARCHAR(64) NOT NULL REFERENCES resource_pools(id),
  hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(id),
  resource_type VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  state VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  in_use_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS ambulance_positions (
  id BIGSERIAL PRIMARY KEY,
  ambulance_id VARCHAR(64) NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  heading DOUBLE PRECISION NOT NULL DEFAULT 0,
  server_sequence BIGINT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendations (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  assessment_version INTEGER NOT NULL,
  position_sequence BIGINT NOT NULL,
  inventory_version INTEGER NOT NULL,
  hospital_a JSONB,
  hospital_b JSONB,
  hospital_c JSONB,
  all_candidates JSONB NOT NULL DEFAULT '[]',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id VARCHAR(64) PRIMARY KEY,
  entity_id VARCHAR(64) NOT NULL,
  entity_version INTEGER NOT NULL,
  authorized_event_type VARCHAR(128) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  delivery_state VARCHAR(32) NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id VARCHAR(64) PRIMARY KEY,
  seed VARCHAR(64) NOT NULL,
  running BOOLEAN NOT NULL DEFAULT FALSE,
  speed_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  simulated_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  scenario_step VARCHAR(64) NOT NULL DEFAULT 'INITIAL',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
