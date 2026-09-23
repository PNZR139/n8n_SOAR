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
