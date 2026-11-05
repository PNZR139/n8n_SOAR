# n8n Playbooks

Workflows live inside n8n itself; this folder holds versioned exports
(Settings → Download, or via the n8n API) so playbooks are code-reviewed
and recoverable.

## Conventions

- One playbook per file, kebab-case: `phishing-triage.json`
- Every playbook starts with a **Webhook** node whose path matches the
  `playbook:` field in a correlation rule (e.g. `pb-identity-triage`)
- Trigger URL shape: `http://<n8n>:5678/webhook/<playbook-name>`
- Reusable logic (enrich-IP, create-case, notify) is a separate workflow
  invoked via the **Execute Workflow** node
- Playbooks call SOAR connectors through the app API, not directly:
  `POST http://app:3000/connectors/<name>/actions/<action>`
- Playbooks write results back via `POST http://app:3000/cases` and
  `POST /cases/:id/notes`, storing `n8n_execution_id` on the case
- Every playbook has the Error Trigger wired to a failure-notification step

## Included playbooks

| File | Trigger | What it does |
|---|---|---|
| `pb-identity-triage.json` | Webhook `pb-identity-triage` (fired by rule `auth-brute-force`) | Creates a case linked to the incident, optionally enriches `src_ip` via the VirusTotal connector, writes a triage note, sets the case to `triage` |
| `playbook-error-handler.json` | Error Trigger | Opens a high-severity case with the failing node and error message when a playbook fails |

## Install

1. Import both files: n8n UI → Workflows → ⋯ → **Import from file**.
2. Open `pb-identity-triage` → Settings → **Error workflow** → pick `playbook-error-handler`.
3. **Activate** (n8n 2.x calls this *Publish*) `pb-identity-triage`. The webhook only answers on
   `/webhook/<path>` while the workflow is active.
4. Optional VirusTotal enrichment: set `VT_API_KEY` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` on the
   `n8n-worker` service (workers run the executions in queue mode). Without them the playbook still
   completes and the note says enrichment was unavailable.

## Test

After sending 20 failed-auth events (see the root README), check:

```
curl localhost:3000/cases              # a case "Possible brute-force on <user>" with status "triage"
curl localhost:3000/cases/<id>         # includes the n8n triage note
```
