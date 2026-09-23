# SOAR — V1 (single tenant, API-first)

Security orchestration platform with n8n as the playbook engine.
V1 goal: **one fully working end-to-end flow** — alert intake → correlation →
incident → n8n playbook → case update. UI comes in step 2.

## Components

| Service | Role |
|---|---|
| `app` (Node.js/TypeScript, Fastify) | connector registry, correlation engine, case API |
| `n8n` (queue mode, 2 workers) | playbook runtime |
| Postgres | events, incidents, cases, notes, audit log; also n8n's DB |
| Redis | n8n job queue + correlation windows/dedup state |

## Quick start

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and N8N_ENCRYPTION_KEY
docker compose up -d --build
```

- App API: http://localhost:3000/health
- n8n UI:  http://localhost:5678

## Smoke test the pipeline

```bash
# 1. Fire 20 failed auth events (hits brute-force rule threshold)
for /l %i in (1,1,20) do curl -s -X POST localhost:3000/events -H "content-type: application/json" ^
  -d "{\"event_type\":\"auth.failed\",\"source\":\"test\",\"target_user\":\"alice\",\"src_ip\":\"1.2.3.4\"}"

# 2. Check that an incident was created
curl localhost:3000/incidents

# 3. List registered connectors, test VirusTotal
curl localhost:3000/connectors
curl -X POST localhost:3000/connectors/virustotal/actions/enrich_ip -H "content-type: application/json" -d "{\"params\":{\"ip\":\"8.8.8.8\"},\"config\":{\"apiKey\":\"YOUR_KEY\"}}"
```

(The 21st identical event within 15 min is suppressed by the default dedup rule.)

## Layout

```
app/src/connectors/   plug-n-play connector hub  (drop packages into plugins/)
app/src/correlation/  YAML rule engine, Redis windows
app/src/cases/        case + notes + audit API
plugins/              connector packages (virustotal example included)
rules/                correlation rules (YAML)
n8n/playbooks/        exported workflow JSON + conventions
```

## API surface (V1)

| Method | Path | Purpose |
|---|---|---|
| POST | `/events` | alert intake → normalize → correlate |
| GET | `/incidents` | correlated incidents |
| POST | `/rules/reload` | reload YAML rules without restart |
| GET | `/connectors` | list connectors + capabilities |
| POST | `/connectors/reload` | hot reload plugins |
| POST | `/connectors/:name/test` | connectivity check |
| POST | `/connectors/:name/actions/:action` | run an action (called by n8n) |
| GET/POST/PATCH | `/cases...` | case CRUD, notes, approvals |

## V1 guardrails already in place

- Immutable `audit_log` — every mutation and approval is recorded
- `tenant_id` on every table and Redis key (multi-tenancy ready)
- Dedup + threshold state isolated per tenant in Redis

## Roadmap

1. ✅ API-first core (this)
2. Minimal UI (dashboard, cases, approval queue, connectors page)
3. First real playbook: phishing end-to-end
4. Remediation tiers (auto / conditional / approval-gated) + kill switch
