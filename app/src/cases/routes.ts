import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pool, audit } from "./db";

const VALID_STATUSES = ["new", "triage", "investigating", "contained", "resolved", "closed"];

export async function caseRoutes(app: FastifyInstance) {
  const tenant = () => process.env.DEFAULT_TENANT ?? "default";

  app.get("/", async (req) => {
    const { status } = req.query as { status?: string };
    const { rows } = status
      ? await pool.query(
          `SELECT id, title, status, severity, assignee, created_at, updated_at
           FROM cases WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 200`,
          [tenant(), status]
        )
      : await pool.query(
          `SELECT id, title, status, severity, assignee, created_at, updated_at
           FROM cases WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [tenant()]
        );
    return rows;
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const caseRes = await pool.query(
      `SELECT * FROM cases WHERE tenant_id = $1 AND id = $2`,
      [tenant(), req.params.id]
    );
    if (caseRes.rowCount === 0) return reply.code(404).send({ error: "case not found" });
    const notes = await pool.query(
      `SELECT id, author, body, created_at FROM case_notes WHERE case_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    return { ...caseRes.rows[0], notes: notes.rows };
  });

  app.post<{ Body: { title: string; severity?: string; incident_id?: string; n8n_execution_id?: string } }>(
    "/",
    async (req, reply) => {
      const { title, severity, incident_id, n8n_execution_id } = req.body ?? {};
      if (!title) return reply.code(400).send({ error: "title is required" });
      const id = randomUUID();
      await pool.query(
        `INSERT INTO cases (id, tenant_id, title, severity, incident_id, n8n_execution_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tenant(), title, severity ?? "medium", incident_id ?? null, n8n_execution_id ?? null]
      );
      await audit("api", "case.create", id, { title });
      return reply.code(201).send({ id });
    }
  );

  app.patch<{ Params: { id: string }; Body: { status?: string; assignee?: string; severity?: string } }>(
    "/:id",
    async (req, reply) => {
      const { status, assignee, severity } = req.body ?? {};
      if (status && !VALID_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `invalid status`, valid: VALID_STATUSES });
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (status) { fields.push(`status = $${i++}`); values.push(status); }
      if (assignee) { fields.push(`assignee = $${i++}`); values.push(assignee); }
      if (severity) { fields.push(`severity = $${i++}`); values.push(severity); }
      if (fields.length === 0) return reply.code(400).send({ error: "nothing to update" });
      fields.push(`updated_at = now()`);
      values.push(tenant(), req.params.id);
      const res = await pool.query(
        `UPDATE cases SET ${fields.join(", ")} WHERE tenant_id = $${i++} AND id = $${i}`,
        values
      );
      if (res.rowCount === 0) return reply.code(404).send({ error: "case not found" });
      await audit("api", "case.update", req.params.id, req.body ?? {});
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string }; Body: { author?: string; body: string } }>(
    "/:id/notes",
    async (req, reply) => {
      const { author, body } = req.body ?? {};
      if (!body) return reply.code(400).send({ error: "body is required" });
      await pool.query(
        `INSERT INTO case_notes (tenant_id, case_id, author, body) VALUES ($1, $2, $3, $4)`,
        [tenant(), req.params.id, author ?? "api", body]
      );
      return reply.code(201).send({ ok: true });
    }
  );

  /** Approval queue placeholder for V1: pending approvals are cases in 'triage'
   *  that n8n is waiting on (Wait node). Approve via POST /cases/:id/approve. */
  app.post<{ Params: { id: string }; Body: { decision: "approve" | "deny"; callback_url?: string } }>(
    "/:id/approve",
    async (req, reply) => {
      const { decision, callback_url } = req.body ?? {};
      if (!decision) return reply.code(400).send({ error: "decision is required" });
      await audit("api", `approval.${decision}`, req.params.id, { callback_url: callback_url ?? null });
      // If a resume URL was provided by the playbook, call it so the n8n Wait node continues.
      if (callback_url) {
        await fetch(callback_url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, case_id: req.params.id }),
        });
      }
      return { ok: true, decision };
    }
  );
}
