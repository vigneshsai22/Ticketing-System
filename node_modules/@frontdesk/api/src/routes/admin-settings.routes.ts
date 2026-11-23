import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import {
  CreateHolidaySchema,
  UpdateSlaPolicySchema,
  UpdateSettingSchema,
  validateWithZod
} from '../validation/schemas.js';

export interface HolidayRecord {
  id: string;
  date: string;
  name: string;
  created_at: string;
}

export interface SlaPolicyRecord {
  id: string;
  priority: 'urgent' | 'medium' | 'low';
  respond_minutes: number;
  resolve_minutes: number;
  resolve_mode: 'fixed_minutes' | 'end_of_response_day';
}

export interface SettingRecord {
  key: string;
  value: unknown;
  description: string | null;
}

const adminSettingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // --------------------------------------------------------------------------
  // 1. HOLIDAY CALENDAR MANAGEMENT
  // --------------------------------------------------------------------------

  // List all holidays (Staff/Lead/Admin)
  fastify.get('/admin/holidays', {
    preHandler: [fastify.authenticate]
  }, async (_request, reply) => {
    const db = await getDbClient();
    const res = await db.query<HolidayRecord>(
      'SELECT id, date, name, created_at FROM holidays ORDER BY date ASC'
    );
    return reply.send({ holidays: res.rows });
  });

  // Create new holiday (Admin only, audited)
  fastify.post<{
    Body: { date: string; name: string };
  }>('/admin/holidays', {
    preHandler: [fastify.requireRole('admin')]
  }, async (request, reply) => {
    const val = validateWithZod(CreateHolidaySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { date, name } = val.data;

    const nowIso = fastify.clock.now().toISOString();

    const insertRes = await db.query<HolidayRecord>(
      `INSERT INTO holidays (date, name, created_at)
       VALUES ($1, $2, $3)
       RETURNING id, date, name, created_at`,
      [date, name.trim(), nowIso]
    );

    const newHoliday = insertRes.rows[0];

    // Record audit event
    await db.query(
      `INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'holiday_created', NULL, $2::jsonb, 'GENESIS', 'sha256_mock_hash', $3)`,
      [request.user.id, JSON.stringify(newHoliday), nowIso]
    );

    return reply.status(201).send({ holiday: newHoliday });
  });

  // Delete holiday (Admin only, audited)
  fastify.delete<{
    Params: { id: string };
  }>('/admin/holidays/:id', {
    preHandler: [fastify.requireRole('admin')]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { id } = request.params;

    const existing = await db.query<HolidayRecord>('SELECT * FROM holidays WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Holiday not found' });
    }
    const oldHoliday = existing.rows[0];

    await db.query('DELETE FROM holidays WHERE id = $1', [id]);
    const nowIso = fastify.clock.now().toISOString();

    // Record audit event
    await db.query(
      `INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'holiday_deleted', $2::jsonb, NULL, 'GENESIS', 'sha256_mock_hash', $3)`,
      [request.user.id, JSON.stringify(oldHoliday), nowIso]
    );

    return reply.send({ success: true, deleted_id: id });
  });

  // --------------------------------------------------------------------------
  // 2. SLA POLICIES MANAGEMENT (Applies strictly to future ticket computations)
  // --------------------------------------------------------------------------

  // List all SLA policies (Staff/Lead/Admin)
  fastify.get('/admin/sla-policies', {
    preHandler: [fastify.authenticate]
  }, async (_request, reply) => {
    const db = await getDbClient();
    const res = await db.query<SlaPolicyRecord>(
      'SELECT id, priority, respond_minutes, resolve_minutes, resolve_mode FROM sla_policies ORDER BY CASE priority WHEN \'urgent\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END'
    );
    return reply.send({ policies: res.rows });
  });

  // Update SLA policy for a priority tier (Admin only, audited)
  // NOTE: Per ASSUMPTIONS.md, policy updates apply strictly to future ticket cycle creations.
  fastify.patch<{
    Params: { priority: string };
    Body: { respond_minutes?: number; resolve_minutes?: number; resolve_mode?: 'fixed_minutes' | 'end_of_response_day' };
  }>('/admin/sla-policies/:priority', {
    preHandler: [fastify.requireRole('admin')]
  }, async (request, reply) => {
    const { priority } = request.params;
    if (!['urgent', 'medium', 'low'].includes(priority)) {
      return reply.status(400).send({ error: 'Invalid priority tier' });
    }

    const val = validateWithZod(UpdateSlaPolicySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { respond_minutes, resolve_minutes, resolve_mode } = val.data;

    const existingRes = await db.query<SlaPolicyRecord>('SELECT * FROM sla_policies WHERE priority = $1', [priority]);
    if (existingRes.rows.length === 0) {
      return reply.status(404).send({ error: 'SLA policy not found' });
    }
    const oldPolicy = existingRes.rows[0];

    const updateRes = await db.query<SlaPolicyRecord>(
      `UPDATE sla_policies
       SET respond_minutes = COALESCE($1, respond_minutes),
           resolve_minutes = COALESCE($2, resolve_minutes),
           resolve_mode = COALESCE($3, resolve_mode)
       WHERE priority = $4
       RETURNING *`,
      [respond_minutes, resolve_minutes, resolve_mode, priority]
    );

    const updatedPolicy = updateRes.rows[0];
    const nowIso = fastify.clock.now().toISOString();

    // Record audit event
    await db.query(
      `INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'sla_policy_updated', $2::jsonb, $3::jsonb, 'GENESIS', 'sha256_mock_hash', $4)`,
      [
        request.user.id,
        JSON.stringify(oldPolicy),
        JSON.stringify(updatedPolicy),
        nowIso
      ]
    );

    return reply.send({
      policy: updatedPolicy,
      notice: 'Policy updated successfully. Applies strictly to future ticket computations; existing cycles retain their established deadlines.'
    });
  });

  // --------------------------------------------------------------------------
  // 3. SYSTEM SETTINGS MANAGEMENT (Applies strictly to future computations)
  // --------------------------------------------------------------------------

  // List all system settings
  fastify.get('/admin/settings', {
    preHandler: [fastify.authenticate]
  }, async (_request, reply) => {
    const db = await getDbClient();
    const res = await db.query<SettingRecord>('SELECT key, value, description FROM settings ORDER BY key ASC');
    return reply.send({ settings: res.rows });
  });

  // Update a system setting (Admin only, audited)
  fastify.patch<{
    Params: { key: string };
    Body: { value: unknown; description?: string };
  }>('/admin/settings/:key', {
    preHandler: [fastify.requireRole('admin')]
  }, async (request, reply) => {
    const val = validateWithZod(UpdateSettingSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { key } = request.params;
    const { value } = val.data;
    const description = (request.body as { description?: string })?.description;

    const existingRes = await db.query<SettingRecord>('SELECT * FROM settings WHERE key = $1', [key]);
    if (existingRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Setting not found' });
    }
    const oldSetting = existingRes.rows[0];

    const updateRes = await db.query<SettingRecord>(
      `UPDATE settings
       SET value = $1::jsonb,
           description = COALESCE($2, description)
       WHERE key = $3
       RETURNING *`,
      [JSON.stringify(value), description, key]
    );

    const updatedSetting = updateRes.rows[0];
    const nowIso = fastify.clock.now().toISOString();

    // Record audit event
    await db.query(
      `INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'settings_updated', $2::jsonb, $3::jsonb, 'GENESIS', 'sha256_mock_hash', $4)`,
      [
        request.user.id,
        JSON.stringify(oldSetting),
        JSON.stringify(updatedSetting),
        nowIso
      ]
    );

    return reply.send({
      setting: updatedSetting,
      notice: 'Setting updated successfully. Applies strictly to future ticket computations; existing cycles retain their established deadlines.'
    });
  });
};

export default adminSettingsRoutes;
