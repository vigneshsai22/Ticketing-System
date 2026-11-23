# Frontdesk - Engineering & Business Assumptions

This document records the architectural, business, and operational assumptions for **Frontdesk**, the support ticketing platform designed for **Arvo Systems** (9 agents, ~40 tickets/day).

---

## 1. Operating Calendar & Business Hours
- **Timezone**: All business calculations strictly adhere to `Asia/Kolkata` (UTC+05:30).
- **Working Hours**: 09:30 to 18:30, Monday through Friday (excluding admin-managed holidays).
- **Business Day Length**: Exactly 9 hours = 540 minutes per working day.
- **Storage Standard**: All timestamps are persisted in PostgreSQL as `TIMESTAMPTZ` in UTC. Conversion to `Asia/Kolkata` is performed during business time evaluation and presentation.
- **Off-Hours Ticket Arrival**: If a ticket arrives off-hours or during a weekend/holiday, the SLA clock begins at the **next working instant** (e.g. 09:30 on the next business day).
- **Urgent Resolution SLA Interpretation**: For `urgent` priority, the policy specifies `respond: 120m` and `resolve = end of the working day that contains the response deadline`. The resolution deadline is set to `18:30 Asia/Kolkata` on the exact calendar business day when the 120-minute response deadline falls.

---

## 2. SLA Engine, Pauses, and Cycles
- **Public Response Definition**: The first response clock stops ONLY upon the first **public** agent message sent to the customer. Internal notes, status updates without public messages, and system assignment changes do not satisfy first response.
- **Waiting on Customer & Clock Pause**:
  - Setting status to `waiting_on_customer` pauses **both** response and resolution SLA clocks.
  - Each pause interval is recorded with explicit `started_at`, `ended_at`, `paused_by`, and `reason` in `sla_pauses`.
  - When the customer replies, the ticket status reverts to `open` (or `pending`), the active pause interval is closed, and deadlines are recalculated forward by adding the elapsed business minutes of the pause.
- **Auto-Close**:
  - If a ticket remains in `waiting_on_customer` for **2,700 business minutes** (equivalent to 5 business days) without customer activity, the ticket is transitioned to `closed` automatically by the system.
- **Resolution & Reopening Windows**:
  - A customer may reopen a `resolved` ticket within **5 working days** (2,700 business minutes).
  - Reopening a ticket starts a **new SLA cycle** (`cycle_no` increments). Each cycle preserves its own historical `clock_start`, `response_due`, `resolve_due`, `first_response_at`, `resolved_at`, and breach timestamps in `ticket_cycles`.
  - If the customer attempts to contact support after the 5-day window has expired, or contacts support on an `auto-closed` ticket, the system automatically spawns a **new ticket** linked to the prior ticket via `parent_ticket_id`.
- **Mid-Flight Priority Adjustments**:
  - When a ticket's priority is upgraded or downgraded during an active cycle, response and resolution deadlines are recomputed from the original `clock_start` using the new tier's SLA thresholds, adding any valid paused time.
  - **No Breach Erasure**: Breaches that occurred prior to an upgrade/downgrade are never erased.
  - **Escalated Mid-Flight**: If an upgrade causes a deadline to retroactively precede the current clock time, the ticket is marked as breached immediately with reason `"escalated_mid_flight"`.

---

## 3. Concurrency, Race Conditions & Claiming (INC-0291)
- **Atomic Ownership Acquisition**:
  - Ticket claiming uses atomic conditional update:
    `UPDATE tickets SET assignee_id = :agent_id WHERE id = :id AND assignee_id IS NULL RETURNING ...`
  - If another agent claims the ticket in the same microsecond window, the second transaction fails and receives an HTTP `409 Conflict` containing the current assignee's full name (`{ "error": "Ticket already claimed", "current_assignee": "Dev Sharma" }`).
- **Strict Assignee Reply Enforcement**:
  - Only the ticket's designated assignee (or a lead/admin role with explicit managerial override) is permitted to post a public response.
- **Message Deduplication / Idempotency**:
  - Agent and customer reply endpoints accept an `Idempotency-Key` header. Unique indexing in PostgreSQL on `(ticket_id, idempotency_key)` prevents double-submissions from network retries or rapid click events.

---

## 4. Complete Information Isolation (INC-0304)
- **Zero Leakage of Internal Notes**:
  - Under no circumstance may private agent notes appear in customer-facing APIs, exports, webhooks, or search indexes.
  - **Structural Separation**: Internal notes reside in a completely separate table (`internal_notes`) rather than a shared table with a boolean flag.
  - **Dedicated Customer Serializers**: Customer portal routes and queries never query `internal_notes`.
  - **Database View**: The `customer_visible_events` view strictly queries `public_messages` and whitelisted public audit transitions (`ticket_created`, `ticket_resolved`, etc.).
  - **Automated Canary Testing**: CI test suite injects high-entropy canary secrets into internal notes and verifies that no customer-facing query or endpoint contains the canary string.

---

## 5. Append-Only Audit Integrity & Cryptographic Chaining (INC-0318)
- **Database Trigger Enforcement**:
  - PostgreSQL trigger `trg_audit_events_immutable` raises an uncatchable exception on any `UPDATE` or `DELETE` attempt against `audit_events`.
  - Immutability triggers similarly protect `public_messages` and `internal_notes`.
- **Cryptographic Chaining**:
  - Every audit event computes a SHA-256 hash chaining back to `prev_hash`:
    `hash = SHA256(prev_hash + seq + ticket_id + actor_id + event_type + before + after + created_at)`.
  - This allows tamper verification across the entire audit log.

---

## 6. Time Machine & Injectable Clock Architecture
- **Clock Abstraction**:
  - The application prohibits direct invocation of `new Date()` (without arguments) and `Date.now()` outside the clock module.
  - A `ShiftableClock` wraps base time, allowing time shifting (e.g. `+2 hours`, `+1 business day`, or pinning to specific timestamps like Friday 18:00) during evaluation and automated testing.
  - Both an automated Vitest AST guard test and ESLint configuration enforce this restriction across the entire codebase.

---

## 11. Customer Portal, Magic-Links, Exports & Information Isolation (INC-0304)

1. **Public Agent Reply Enforcement**:
   - Only the ticket's designated assignee (or lead/admin) can post public replies. Non-assignees are rejected with `403 Forbidden`.
   - `Idempotency-Key` header is mandatory; deduplication on `(ticket_id, idempotency_key)` returns the existing record on retries without duplicating inserts.
   - First public agent reply sets `first_response_at` on the active cycle (internal notes and status changes do not).
   - If `wait_on_customer: true` is passed, the status updates to `waiting_on_customer` and a pause interval is created in `sla_pauses`.

2. **Internal Notes Segregation**:
   - Internal notes are stored in a distinct table (`internal_notes`) accessed only via [`notes.repository.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/services/notes.repository.ts).
   - Under no circumstances does an internal note touch customer serializers, public streams, or customer endpoints.

3. **Customer Portal & Magic Links**:
   - Passwordless authentication via 32-byte cryptographically random magic-link tokens. Tokens are stored as SHA-256 hashes with 72-hour expiration in `magic_links`.
   - Rate limiting: 60 requests per minute per IP / token.
   - Customers can create tickets directly, inspect their ticket thread via `customer_visible_events`, and reply.
   - Customer replies immediately close open pauses, recompute SLA deadlines forward, and revert status to `open` (or `in_progress`).

4. **Reopening & Linked Ticket Creation**:
   - Customers can reopen resolved tickets within 5 working days (2,700 business minutes from `resolved_at`). Reopening starts a fresh SLA cycle (`cycle_no + 1`) with newly computed deadlines.
   - If the window has expired (or if the ticket was auto-closed), customer contact automatically creates a NEW ticket linked to the prior ticket via `parent_ticket_id`.

5. **Customer vs. Internal Exports**:
   - `GET /api/tickets/:id/export/customer`: Public-safe plain-text transcript containing only public events and agent/customer messages.
   - `GET /api/tickets/:id/export/internal`: Lead/admin only report integrating public conversation, confidential internal notes (`[INTERNAL NOTE - CONFIDENTIAL]`), and full audit hash records.

6. **INC-0304 Canary Test**:
   - Automated test seeds `"CANARY_9f3a"` in an internal note and probes all customer endpoints, the customer transcript, public search, simulated outbox, and the database view, asserting zero occurrences and failing the build if any leakage occurs.


1. **Mandatory Priority Change Auditing (`PATCH /tickets/:id/priority`)**:
   - `reason` is strictly mandatory; empty or whitespace-only reasons return `400 Bad Request`.
   - Authorized only for agents and leads (or admins).
   - Recomputes deadlines from the original `clock_start` using `packages/sla`. If an upgrade causes a deadline to fall in the past, it records breach reason `"escalated_mid_flight"`.
   - Enforces optimistic concurrency via `ticket.version`.
   - Records an immutable audit event (`priority_changed`) with `{ before: { priority }, after: { priority, reason, escalated_mid_flight } }`.

2. **Real-time Event Streaming & Presence (SSE)**:
   - Endpoint `GET /api/events` serves a Server-Sent Events stream exclusively to agents, leads, and admins (customers receive no stream).
   - Payloads are strictly sanitized: they carry ticket IDs, human IDs, status, priority, and version numbers. **Note bodies and internal communications are explicitly stripped** at the broadcaster layer to prevent side-channel leakage.
   - Presence tracking via `POST /api/events/presence` broadcasts `"{user} is viewing ticket {ticket_id}"`.

3. **Public Search vs. Internal Search Separation (INC-0304)**:
   - Public Search (`GET /api/search`): Queries `tickets`, `customers`, and `public_messages`. It does NOT reference or join `internal_notes`.
   - Internal Search (`GET /api/search/internal`): Dedicated code path for staff only (`requireRole('agent', 'lead', 'admin')`). It searches both public content and `internal_notes`, providing matched text snippets.

4. **Simulated Outbox & Customer Serialization (INC-0304)**:
   - Every customer-facing event (ticket intake confirmation, agent public reply, status changes, auto-close warning, magic links) generates an entry in the `outbox` table.
   - All email bodies are constructed exclusively through `renderCustomerEmail()`, which takes only customer-visible DTOs. Internal notes or agent internal metadata cannot be passed to the email builder.
   - Staff can review outbound emails via `GET /api/admin/outbox` (lead/admin only).

5. **Customer Intake via Phone/Email**:
   - `POST /api/tickets/intake` allows agents to log requests on behalf of customers.
   - Performs atomic customer lookup by email; creates a new customer profile if first-time contact, or updates customer details.
   - Records initial message in `public_messages` and enqueues an intake confirmation email.

6. **Admin User Management**:
   - `POST /api/admin/users`, `PATCH /api/admin/users/:id` restricted to admin role.
   - All role modifications and deactivations/activations write immutable records to `audit_events`.

7. **Canary Leak Test Registry (`canary-registry.ts`)**:
   - Maintains an exhaustive registry of all customer-facing surfaces (`customer_visible_events` view, public search, ticket serializer, message serializer, outbox email templates).
   - Automated tests inject high-entropy canary tokens into `internal_notes` and assert that no customer surface leaks the token.


1. **Session Cookie & JWT Standard**:
   - Authentication uses HTTP-only `frontdesk_session` cookies.
   - Standard HS256 HMAC-SHA256 signature is verified on every request, populating `request.user`.
   - `POST /api/auth/demo-login` supports 1-click login by specifying either `role` (`lead`, `admin`, `agent`) or `email`.

2. **Atomic Claim Concurrency (INC-0291)**:
   - Claims are atomic via `UPDATE tickets SET assignee_id = $1, version = version + 1 WHERE id = $2 AND assignee_id IS NULL RETURNING *`.
   - If `rowCount === 0`, the current owner's name is queried and an HTTP `409 Conflict` is returned (`{ error: "Ticket already claimed", current_assignee: owner_name }`).
   - Stress-tested under 20 concurrent parallel requests: exactly 1 wins, 19 receive 409s.

3. **Optimistic Locking via `ticket.version`**:
   - All mutation endpoints (`claim`, `release`, `reassign`, `status`, `reply`) increment and check `ticket.version`.
   - Stale updates return `409 Conflict` with optimistic lock error message.

4. **Cryptographic Audit Hash Chaining (INC-0318)**:
   - Every mutation is committed within the SAME transaction as the audit event record.
   - The ticket row is serialized via `SELECT id FROM tickets WHERE id = $1 FOR UPDATE`.
   - Hash is computed as `sha256(prev_hash + canonicalJson(payload))`.
   - Canonical JSON sorts keys alphabetically at every nesting level.
   - `GET /api/tickets/:id/audit/verify` re-computes the entire chain sequentially and pinpoints any tampered event.

5. **Pause / Resume Bookkeeping**:
   - Moving status to `waiting_on_customer` opens an un-ended interval in `sla_pauses`.
   - Moving status from `waiting_on_customer` sets `ended_at = clock.now()` and triggers `computeDeadlines()` with all accumulated pauses, elongating `response_due` and `resolve_due` in `ticket_cycles`.


1. **Closing Instant Boundary (18:30:00)**:
   - Operating hours are defined as `09:30:00.000` to `18:30:00.000` Asia/Kolkata.
   - An instant `t` is considered working time if `minuteOfDay >= 570 && minuteOfDay < 1110`.
   - Exactly `18:30:00` is the closing boundary: tickets arriving at or after `18:30:00` start their clock at `09:30:00` on the next working day.

2. **Exactly-at-Deadline Boundary**:
   - SLA deadline checks evaluate `now > deadline`.
   - At the exact millisecond of the deadline (`now.toMillis() === deadline.toMillis()`), remaining business minutes is 0, but status remains non-breached.
   - At `now > deadline` (even by 1 millisecond), the ticket is marked `breached` with overrun business minutes computed.

3. **Zero-Minute Policy**:
   - If an SLA policy specifies 0 response or resolution minutes, the deadline is set to `nextWorkingInstant(start)`. If created off-hours, the deadline is `09:30:00` on the next business day.

4. **Pause Intervals Over Off-Hours, Weekends & Holidays**:
   - When a ticket is placed in `waiting_on_customer`, only business minutes that fall within valid working hours (09:30-18:30 Mon-Fri, non-holiday) elongate the deadline.
   - Pauses that start during off-hours (e.g. Saturday afternoon) or span a weekend contribute 0 extra pause minutes for non-working hours.

5. **Urgent Resolution SLA with Pauses**:
   - Base rule: Urgent resolution deadline is `18:30:00` on the working day containing the 120-minute response deadline.
   - If pauses occur after the response deadline or during that working day, the resolution deadline is extended forward by the exact business minutes of the pause (rolling over to subsequent business days if necessary).

6. **Breach Permanence & Mid-Flight Priority Changes**:
   - Breaches already recorded on a ticket cycle (`response_breached_at`, `resolve_breached_at`) are immutable. Even if downgraded to a lower priority (e.g. urgent to low), recorded breaches are never deleted.
   - If an upgrade retroactively causes a deadline to precede the current instant `now`, the ticket cycle is flagged as breached immediately with reason `"escalated_mid_flight"`.

7. **SLA Health Threshold ("At Risk")**:
   - A ticket transitions to `at_risk` when remaining business minutes are less than or equal to 20% of the total SLA policy budget (`remaining / totalBudget <= 0.20`).

---

## 12. Scheduler, Time Machine & Incident Dataset (Phase 7)

1. **Background & On-Demand Scheduler**:
   - **PostgreSQL Advisory Lock**: Acquired via `pg_try_advisory_lock(847291)`. Guarantees that multiple API server instances, clustered worker nodes, or rapid test calls never execute overlapping scheduler passes.
   - **SLA Breach Detection**: Evaluates pending response and resolution deadlines against the active clock. Flags breaches exactly once, assigning root-cause breach reasons (`unassigned_too_long` if unassigned, `slow_after_assignment` if assigned to an agent), and records immutable audit events with actor `"system"`.
   - **Customer Silence Warning & Auto-Close**:
     - At 2,160 business minutes of customer silence (80% threshold = 1 business day before cutoff), sends an outbox warning email and records an `auto_close_warning_sent` audit event.
     - At 2,700 business minutes (5 working days) of silence, auto-closes the ticket, ends the active pause interval in `sla_pauses`, emits a `ticket_auto_closed` audit event, and delivers an outbox notification.
     - **Resume vs. Auto-Close Race Immunity**: If a customer replies prior to the 2,700-minute mark, the pause is terminated, status reverts to `open`, and subsequent scheduler passes skip auto-closing.
   - **Reopen Window Expiry**: Evaluates `resolved` tickets after 2,700 business minutes (5 working days) and permanently transitions them to `closed` with reason `reopen_window_expired`.

2. **Time Machine & Simulation Banner**:
   - **API Endpoints**:
     - `GET /api/demo/time`: Returns current clock offset, frozen status, and banner metadata formatted in `Asia/Kolkata`.
     - `POST /api/demo/time/jump`: Jumps to canonical named moments:
       - `"Friday 18:00"`: `2026-03-06T18:00:00+05:30` (Friday evening urgent arrival).
       - `"Saturday"`: `2026-03-07T12:00:00+05:30` (Weekend off-hours).
       - `"Monday 11:01"`: `2026-03-09T11:01:00+05:30` (1 minute past urgent response deadline).
       - `"+1 working day"`: Advances current time by 540 business minutes via `@frontdesk/sla`.
     - `POST /api/demo/time/shift`: Shifts by arbitrary minutes, hours, or days.
     - `POST /api/demo/time/set`: Pin/freeze to specific ISO timestamp.
     - `POST /api/demo/time/reset`: Reverts clock offset to zero (real wall clock).
     - `POST /api/scheduler/run`: Triggers an immediate idempotent scheduler pass.
   - **Automatic Scheduler Execution**: Every Time Machine jump, shift, set, and reset immediately invokes `runSchedulerPass`, providing instantaneous feedback in demo and test environments.
   - **UI Banner Contract**: Whenever `is_shifted` is true (offset ≠ 0 or frozen), the backend supplies `banner: { active: true, message: "⚠️ Time Machine Active: Clock is ...", formatted_time: "..." }` to display a persistent warning header.

3. **Production Seed Dataset**:
   - **Staff**: 11 members: 1 Lead (Aria Chen), 1 Admin (Kiran Patel), 9 Agents (Dev Sharma, Sara Lindqvist, Marcus Brody, Zoe Al-Mansoor, Alex Rivera, Priya Nair, Kenji Sato, Fatima Al-Zahra, Lucas Meyer).
   - **Customers**: 8 B2B corporate customer accounts (Acme, Wayne Enterprises, Globex, Initech, Hooli, Stark Industries, Umbrella Corp, Cyberdyne Systems).
   - **40 Deterministic Tickets**:
     - `INC-0001`: Friday 18:00 urgent ticket (`respond_due: Mon 11:00`, `resolve_due: Mon 18:30`).
     - `INC-0002`: Already late ticket with breached response and resolution deadlines (`slow_after_assignment`).
     - `INC-0003`: At-risk ticket with <20% business minutes remaining.
     - `INC-0004`: Ticket in `waiting_on_customer` with active pause.
     - `INC-0005`: Ticket near auto-close (~2,600 business minutes in silence, warning sent).
     - `INC-0006`: Reopened ticket with 2 full SLA cycles.
     - `INC-0007`: Mid-flight priority upgrade (low -> urgent) retroactively overdue and marked `escalated_mid_flight`.
     - `INC-0008`: Auto-closed ticket after 2,700 business minutes of customer silence.
     - `INC-0009` through `INC-0040`: 32 realistic enterprise incident tickets distributed across all agents and states.
---

## 14. Lead Operations Dashboard & Admin Governance Controls

1. **Lead SLA Compliance & Root Cause Attribution (`/api/analytics/lead-dashboard`)**:
   - **Compliance Metrics**: Dynamically computes response compliance % and resolution compliance % against total tickets within the chosen filter scope (agent, priority, date range).
   - **Automatic Root-Cause Attribution**: Every late ticket is evaluated using `@frontdesk/sla`'s `computeBreachReason`, diagnosing:
     - `unassigned_too_long`: Ticket lingered >50% of SLA response budget waiting for claim.
     - `slow_after_assignment`: Ticket spent the majority of budget assigned to an agent without timely public reply or resolution.
     - `escalated_mid_flight`: Priority upgrade retroactively made deadlines overdue.
     - `multiple_reassignments`: Ticket bounced across agents 2+ times.
     - `other`: General SLA business time overrun.
   - **Customer Wait Exclusion**: Accurately aggregates elapsed business minutes during `waiting_on_customer` status in `sla_pauses`, displaying excluded paused minutes (e.g. `+120m paused`).
   - **Internal CSV Audit Export**: `/api/analytics/export-csv` outputs an RFC 4180 compliant CSV prefixed with prominent internal confidentiality banners (`WARNING: CONTAINS INTERNAL DATA`), including assigned staff names and diagnostic root causes.

2. **Admin SLA Policies & System Settings Governance**:
   - **Strict Future-Only Computation Rule**: Updates to SLA policies (`respond_minutes`, `resolve_minutes`, `resolve_mode`) or system configuration settings (`business_day_minutes`, `auto_close_minutes`, `reopen_window_days`, `working_hours`) apply **strictly to future ticket cycles** created after the modification. Active and historical ticket cycles retain their frozen deadlines to prevent retroactive SLA tampering or cycle distortion.
   - **Cryptographic Audit Logging**: Every policy update, setting change, holiday addition, holiday deletion, and staff permission change writes an immutable row into `audit_events` with actor type `'agent'`, the administrator's ID, the before/after state diff, and timestamp derived strictly from the injected `Clock`.

3. **Holiday Calendar & Multi-Persona Administration**:
   - Holiday additions and deletions in `holidays` directly feed into business-time calculation skips in `Asia/Kolkata` timezone.
   - Administrator staff controls (`/api/admin/users`) allow provisioning new support staff, changing roles (agent <-> lead <-> admin), and toggling active/deactivated availability status.
   - Canned reply macros (`/api/canned-replies`) allow leads and admins to maintain standardized troubleshooting and closing macros accessible across the agent composer.

---

## 16. Comprehensive Architectural Decisions & Edge Case Directory

This section provides an explicit accounting of every critical engineering decision, ambiguity resolution, and edge case across the platform.

### A. Mid-Flight Priority Changes & Escalation Semantics (Deep-Dive)
- **Problem**: What happens when an agent or lead upgrades a ticket's priority mid-flight (e.g., from `low` to `urgent`) after the ticket has already been open for several hours?
- **Decision 1: Original Clock Anchor vs. "Reset from Now"**:
  - *Decision*: Deadlines are recomputed from the original cycle `clock_start` adding accumulated non-working time and valid pauses.
  - *Rationale*: Resetting deadlines from `now` would reward slow response times and allow SLA gaming (e.g., an agent upgrading a ticket simply to get fresh deadline hours).
- **Decision 2: Immediate Retroactive Breach (`escalated_mid_flight`)**:
  - *Decision*: If the recomputed deadline falls in the past relative to the current evaluation instant `now`, the ticket cycle is flagged as **breached immediately** at `now` with `response_breach_reason = 'escalated_mid_flight'`.
  - *Rationale*: A customer who escalates an issue because it was ignored cannot have the system report that their response is "on track" when 3 hours have already passed on a 2-hour SLA.
- **Decision 3: Immutability of Existing Breaches (No Breach Erasure)**:
  - *Decision*: If a ticket already breached under a higher priority and is later downgraded, existing breach timestamps (`response_breached_at`, `resolve_breached_at`) and breach reasons are **permanently retained**.
  - *Rationale*: SLA reporting integrity prohibits "un-breaching" a ticket by downgrading priority.
- **Decision 4: Mandatory Business Justification**:
  - *Decision*: `PATCH /api/tickets/:id/priority` strictly requires a non-empty `reason` string, validated via Zod. An immutable `priority_changed` audit event is recorded capturing `old_priority`, `new_priority`, `actor_id`, and `reason`.

### B. Urgent Priority "End of Response Day" Resolution Rule
- **Rule**: For `urgent` tickets, the policy specifies `respond: 120m` and `resolve = end of the working day containing the response deadline`.
- **Ambiguity**: What if a ticket arrives at 17:00 on Friday?
  - 120 business minutes from Friday 17:00 is Monday 10:30 (Friday 17:00-18:30 is 90 mins; Monday 09:30-10:00 is 30 mins).
  - The working day containing the response deadline (Monday 10:30) is Monday.
  - Therefore, the resolution deadline is Monday at **18:30:00 IST**.
- **Edge Case: Pauses with Urgent Resolution**:
  - If a customer pause occurs during Monday, the resolution deadline is pushed forward past 18:30 by the exact business duration of the pause, rolling over to Tuesday 09:30+ as necessary.

### C. Future-Only Administrative Rule
- **Rule**: Updates to SLA policies (`respond_minutes`, `resolve_minutes`, `resolve_mode`) or system configuration settings (`business_day_minutes`, `auto_close_minutes`, `reopen_window_days`, `working_hours`) apply **strictly to future ticket cycles** created after the modification.
- **Rationale**: Active tickets retain their locked deadlines to preserve contractual SLA commitments made at ticket intake.

### D. Concurrency & Deduplication Guarantees
- **Claim Race**: Handled via atomic SQL `UPDATE tickets SET assignee_id = :id ... WHERE assignee_id IS NULL RETURNING *`. Loser receives 409 Conflict with the winner's name.
- **Double Submit**: Handled via PostgreSQL unique index on `(ticket_id, idempotency_key)` on `public_messages`. Retries return HTTP 200 with the original record and `duplicate: true`.
- **Resume vs. Auto-Close**: `addCustomerMessage` and scheduler auto-close serialize via `SELECT ... FOR UPDATE` on the ticket row, eliminating race conditions between customer replies and background auto-close triggers.
- **Priority Change vs. Breach Detection**: Row-level locking on `ticket_cycles` ensures deadline recalculations never race against background breach detection passes.


1. **SLA Timeline Ribbon Visualization**:
   - Renders a proportional horizontal timeline on every ticket showing:
     - Working vs non-working business intervals (09:30-18:30 IST Mon-Fri).
     - Customer wait pauses (`waiting_on_customer`) with hover popovers displaying start/end timestamps and elapsed business minutes.
     - Priority upgrade/downgrade event markers with reason tooltips.
     - First public response milestone marker.
     - SLA response and resolution deadline indicators.
     - Real-time "NOW" marker driven by the active `ShiftableClock` in `Asia/Kolkata` (IST).

2. **Proof Mode & Dispute Settlement Engine (INC-0318)**:
   - **Target Dispute**: Settling customer SLA disputes definitively (e.g., customer claiming ticket was late when first response was delivered in 40 business minutes on Monday morning after a Friday evening arrival).
   - **Printable Certificate**: Print-optimized stylesheet (`@media print`) rendering official Arvo Systems cryptographic dispute certificate.
   - **Executive Plain-Language Summary**: Formulates unambiguous factual statements (e.g., *"First public reply: 10:42:07 IST by Anita R., 40 business minutes after creation"*).
   - **One-Click Cryptographic Chain Verification**: Traverses every linked event from genesis (`INC-0001-GENESIS`) to the head hash, recalculating SHA-256 over `(prev_hash + seq + ticket_id + actor_id + event_type + before + after + created_at)`. Displays clear Green PASS or Red FAIL with first broken link index.
   - **Tamper Evidence**: Copyable SHA-256 signatures for each transition, demonstrating complete immutability.

3. **"Why Was It Late?" Diagnostic Breakdown**:
   - Breached and late tickets surface a diagnostic card detailing:
     - Exact root-cause attribution from `@frontdesk/sla`: `unassigned_too_long`, `slow_after_assignment`, `escalated_mid_flight`, `multiple_reassignments`, or `other`.
     - Quantified business metrics: allocated SLA budget minutes, time unassigned in queue, time spent with agent, excluded customer wait pauses (`sla_pauses`), and exact overrun minutes.

4. **Agent Audit Timeline vs. Customer Isolation**:
   - Agents and leads have a dedicated "Audit History" tab in ticket detail displaying the complete immutable chain of internal and external events.
   - Customers remain strictly confined to `customer_visible_events` (public messages and non-confidential status changes), guaranteeing 0 internal note leakage.

5. **Interactive Guided "Try This" Tour**:
   - A step-by-step floating tour allowing evaluators to experience the full operational workflow:
     1. Take an unassigned ticket.
     2. Add a private internal note.
     3. Preview the ticket as the customer (verifying zero note leakage).
     4. Reply to customer with "Wait on Customer" enabled to pause SLA clocks.
     5. Jump the Time Machine to Monday morning to observe SLA deadline shifts and scheduler execution.


