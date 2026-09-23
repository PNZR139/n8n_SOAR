-- V1 schema. Runs automatically on first Postgres boot
-- (mounted into /docker-entrypoint-initdb.d).
-- tenant_id is present on every table from day one (multi-tenant readiness).

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  source      TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (tenant_id, event_type);

CREATE TABLE IF NOT EXISTS incidents (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  rule_name   TEXT NOT NULL,
  severity    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | triage | investigating | contained | resolved
  summary     TEXT,
  event       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status ON incidents (tenant_id, status);

CREATE TABLE IF NOT EXISTS cases (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | triage | investigating | contained | resolved | closed
  severity    TEXT NOT NULL DEFAULT 'medium',
  assignee    TEXT,
  incident_id UUID REFERENCES incidents(id),
  n8n_execution_id TEXT,                     -- links case to the playbook run
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_tenant_status ON cases (tenant_id, status);

CREATE TABLE IF NOT EXISTS case_notes (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author      TEXT NOT NULL DEFAULT 'system',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_case ON case_notes (case_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  actor       TEXT NOT NULL,        -- user, api key, or "n8n"
  action      TEXT NOT NULL,        -- e.g. "case.status.change", "remediation.isolate_host"
  target      TEXT NOT NULL,        -- e.g. case id, host id
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log (tenant_id, created_at DESC);
