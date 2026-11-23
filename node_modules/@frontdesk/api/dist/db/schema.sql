-- ==============================================================================
-- FRONTDESK DATABASE SCHEMA (PostgreSQL)
-- Implements multi-role ticketing, SLA cycles, append-only immutability triggers,
-- structural isolation of internal notes (INC-0304), and customer views.
-- ==============================================================================

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('agent', 'lead', 'admin')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CUSTOMERS (Magic-link portal users)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    organization TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. SEQUENCE FOR HUMAN-READABLE TICKET ID (INC-0001)
CREATE SEQUENCE IF NOT EXISTS ticket_human_id_seq START WITH 1 INCREMENT BY 1;

-- 4. TICKETS
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    human_id TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('urgent', 'medium', 'low')),
    status TEXT NOT NULL CHECK (status IN ('new', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed', 'reopened')),
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    version INT NOT NULL DEFAULT 1,
    cycle_no INT NOT NULL DEFAULT 1,
    parent_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);

-- Trigger to auto-generate human_id if not explicitly provided
CREATE OR REPLACE FUNCTION generate_ticket_human_id()
RETURNS TRIGGER AS $$
DECLARE
    next_val INT;
BEGIN
    IF NEW.human_id IS NULL OR NEW.human_id = '' THEN
        LOOP
            next_val := nextval('ticket_human_id_seq');
            NEW.human_id := 'INC-' || LPAD(next_val::text, 4, '0');
            IF NOT EXISTS (SELECT 1 FROM tickets WHERE human_id = NEW.human_id) THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_ticket_human_id ON tickets;
CREATE TRIGGER trg_generate_ticket_human_id
BEFORE INSERT ON tickets
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_human_id();

-- 5. TICKET CYCLES (SLA History per cycle for reopens)
CREATE TABLE IF NOT EXISTS ticket_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    cycle_no INT NOT NULL,
    clock_start TIMESTAMPTZ NOT NULL,
    response_due TIMESTAMPTZ NOT NULL,
    resolve_due TIMESTAMPTZ NOT NULL,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    response_breached_at TIMESTAMPTZ,
    resolve_breached_at TIMESTAMPTZ,
    response_breach_reason TEXT,
    resolve_breach_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ticket_cycle UNIQUE (ticket_id, cycle_no)
);

CREATE INDEX IF NOT EXISTS idx_ticket_cycles_ticket ON ticket_cycles(ticket_id);

-- 6. SLA POLICIES (Configurable in DB table, in minutes)
CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority TEXT UNIQUE NOT NULL CHECK (priority IN ('urgent', 'medium', 'low')),
    respond_minutes INT NOT NULL,
    resolve_minutes INT NOT NULL,
    resolve_mode TEXT NOT NULL DEFAULT 'fixed_minutes' CHECK (resolve_mode IN ('fixed_minutes', 'end_of_response_day'))
);

-- 7. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT
);

-- 8. HOLIDAYS (Admin-managed)
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. SLA PAUSES (Recorded when status is 'waiting_on_customer')
CREATE TABLE IF NOT EXISTS sla_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    cycle_no INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    paused_by UUID,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sla_pauses_ticket ON sla_pauses(ticket_id, cycle_no);

-- 10. PUBLIC MESSAGES (Customer & Agent public communication; IMMUTABLE)
CREATE TABLE IF NOT EXISTS public_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('agent', 'customer', 'system')),
    sender_id UUID NOT NULL,
    body TEXT NOT NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_messages_ticket ON public_messages(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_messages_idempotency 
    ON public_messages(ticket_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- 11. INTERNAL NOTES (INC-0304: Structurally isolated in separate table; IMMUTABLE)
CREATE TABLE IF NOT EXISTS internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_ticket ON internal_notes(ticket_id);

-- 12. AUDIT EVENTS (INC-0318: Append-only hash chained audit log; IMMUTABLE)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGSERIAL UNIQUE NOT NULL,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'customer', 'system')),
    actor_id UUID,
    event_type TEXT NOT NULL,
    before JSONB,
    after JSONB,
    prev_hash TEXT,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ticket ON audit_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_seq ON audit_events(seq);

-- 13. MAGIC LINKS (Customer portal passwordless auth)
CREATE TABLE IF NOT EXISTS magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. CANNED REPLIES (Agent productivity shortcuts)
CREATE TABLE IF NOT EXISTS canned_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    shortcut TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. OUTBOX (Simulated email delivery queue)
CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    template TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- DATABASE LEVEL IMMUTABILITY TRIGGERS (INC-0318, INC-0304)
-- Enforces that audit_events, public_messages, and internal_notes CANNOT be
-- updated or deleted by any user or application process.
-- ==============================================================================

CREATE OR REPLACE FUNCTION prevent_record_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Immutability violation: Table "%" is strictly append-only. UPDATE and DELETE operations are forbidden.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_record_modification();

DROP TRIGGER IF EXISTS trg_public_messages_immutable ON public_messages;
CREATE TRIGGER trg_public_messages_immutable
BEFORE UPDATE OR DELETE ON public_messages
FOR EACH ROW
EXECUTE FUNCTION prevent_record_modification();

DROP TRIGGER IF EXISTS trg_internal_notes_immutable ON internal_notes;
CREATE TRIGGER trg_internal_notes_immutable
BEFORE UPDATE OR DELETE ON internal_notes
FOR EACH ROW
EXECUTE FUNCTION prevent_record_modification();

-- Revoke UPDATE/DELETE permissions from app role if present
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'frontdesk_app') THEN
        REVOKE UPDATE, DELETE ON audit_events FROM frontdesk_app;
        REVOKE UPDATE, DELETE ON public_messages FROM frontdesk_app;
        REVOKE UPDATE, DELETE ON internal_notes FROM frontdesk_app;
    END IF;
END $$;

-- ==============================================================================
-- 4. CUSTOMER VISIBLE EVENTS VIEW
-- INC-0304: Exposes strictly public events (public_messages and safe ticket lifecycle
-- events). Excludes all internal notes, private audit changes, and agent internal discussions.
-- ==============================================================================
CREATE OR REPLACE VIEW customer_visible_events AS
SELECT 
    m.id AS event_id,
    m.ticket_id,
    'message' AS event_type,
    m.sender_type,
    m.sender_id,
    m.body AS content,
    NULL::jsonb AS metadata,
    m.created_at
FROM public_messages m
UNION ALL
SELECT 
    a.id AS event_id,
    a.ticket_id,
    a.event_type,
    a.actor_type AS sender_type,
    a.actor_id AS sender_id,
    NULL::text AS content,
    jsonb_build_object(
        'event_type', a.event_type,
        'before', a.before,
        'after', a.after
    ) AS metadata,
    a.created_at
FROM audit_events a
WHERE a.event_type IN ('ticket_created', 'ticket_resolved', 'ticket_reopened', 'ticket_closed')
ORDER BY created_at ASC;
