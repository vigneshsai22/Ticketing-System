# NOT_FINISHED.md - Frontdesk Roadmap & Deliberate Deferrals

This document tracks items intentionally deferred, temporary stubs, and components scheduled for subsequent development phases.

---

## Current Status (Foundation & Database Phase)

### 1. Fully Completed in This Phase
- [x] Monorepo configuration (`apps/api`, `apps/web`, `packages/shared`, `packages/sla`).
- [x] Docker Compose setup for local PostgreSQL 16 container.
- [x] Dual PostgreSQL support: `pg` pool when `DATABASE_URL` is set, with `@electric-sql/pglite` embedded WASM PostgreSQL fallback for zero-dependency execution.
- [x] Injectable Clock service in `@frontdesk/shared`:
  - `Clock` interface
  - `SystemClock`
  - `ShiftableClock` (supports `shiftByMinutes`, `shiftByHours`, `shiftByDays`, `set(freeze)`, `reset`, `unfreeze`)
  - Unit tests for shiftable time operations
  - Architectural Clock Guard test preventing direct `new Date()` / `Date.now()` outside the clock module
  - ESLint `no-restricted-syntax` rules for time machine compliance
- [x] Complete PostgreSQL Schema & Migration (`schema.sql`):
  - `users` (agent, lead, admin roles)
  - `customers`
  - `tickets` with `INC-0001` human ID generation sequence and trigger
  - `ticket_cycles` for per-cycle SLA tracking
  - `sla_policies` with configurable respond/resolve minutes and resolve mode
  - `settings` for business day minutes, auto-close window, and working hours
  - `holidays` for admin-managed business calendar exclusions
  - `sla_pauses` for tracking `waiting_on_customer` intervals
  - `public_messages` (immutable with idempotency keys)
  - `internal_notes` (structurally isolated table, immutable)
  - `audit_events` (immutable, append-only, sequential with hash chaining)
  - `magic_links` for passwordless customer authentication
  - `canned_replies` for agent canned responses
  - `outbox` for simulated transactional emails
- [x] Immutability triggers on `audit_events`, `public_messages`, and `internal_notes` raising exceptions on `UPDATE` or `DELETE`.
- [x] Database view `customer_visible_events` strictly isolating internal notes.
- [x] Baseline Stub Seed script:
  - 9 Arvo Systems agents (Aria Chen as lead, Kiran Patel as admin, 7 agents)
  - SLA policies (urgent, medium, low)
  - System settings (540 business minutes, 2700 auto-close, 5-day reopen)
  - 2026 official holidays
  - Sample customer accounts
- [x] Pre-filled `ASSUMPTIONS.md` documenting all engineering and business rules.

---

## 2. Planned for Subsequent Phases (Per Master Plan)

### 2. SLA Engine (`packages/sla`) - Completed
- [x] Pure TypeScript SLA module with NO database access using Luxon, injectable holiday list, settings, and Clock.
- [x] `isWorkingTime(t)` and `nextWorkingInstant(t)` handling 09:30-18:30 Asia/Kolkata business hours, weekends, and holidays.
- [x] `addBusinessMinutes(start, minutes, pauses[])` with segment-based pause handling.
- [x] `businessMinutesBetween(a, b, pauses[])` calculating exact non-paused business minutes.
- [x] `computeDeadlines(cycle, policy, pauses)` implementing urgent "end of working day containing response deadline" rule.
- [x] `recomputeOnPriorityChange(cycle, oldPolicy, newPolicy, pauses, now)` preserving prior breaches and assigning `escalated_mid_flight` reason.
- [x] `computeSlaState(now, cycle, policy, pauses)` returning `on_track`, `at_risk` (<20% budget remaining), `breached`, `paused`, and `completed`.
- [x] `computeBreachReason(events, cycle, pauses)` calculating root cause (`unassigned_too_long`, `slow_after_assignment`, `escalated_mid_flight`, `multiple_reassignments`) and excluded customer wait minutes.
- [x] 35 Vitest tests covering all required golden rules and edge cases.

---

### 3. Core API (`apps/api`) - Completed
- [x] Fastify application factory and server startup with dual-engine PostgreSQL support.
- [x] Session cookie authentication with HS256 JWT, role guard middleware (`requireRole('lead', 'admin')`), and 1-click `POST /api/auth/demo-login`.
- [x] Ticket CRUD and status state machine (`new` -> `open` -> `in_progress` -> `waiting_on_customer` -> `resolved` -> `closed`; `reopened`).
- [x] INC-0291 Atomic ticket claim (`POST /api/tickets/:id/claim`), release (`POST /api/tickets/:id/release`), and reassign (`POST /api/tickets/:id/reassign`).
- [x] Optimistic locking via `ticket.version` on all ticket mutations.
- [x] Append-only audit logging in the SAME transaction, hash chained per ticket via `SELECT ... FOR UPDATE`, with server timestamps from `Clock`.
- [x] Cycle 1 creation on ticket creation with initial deadlines computed from `packages/sla`.
- [x] Pause and resume bookkeeping in `sla_pauses` with deadline elongation upon resume.
- [x] `GET /api/tickets/:id/audit` and `GET /api/tickets/:id/audit/verify` with tamper detection.
- [x] Comprehensive test suite in `apps/api/src/tests/core-api.test.ts` passing all 9 tests (including 20 parallel claims and tamper detection).

---

### 4. Advanced Core API & Canary Protection - Completed
- [x] `PATCH /tickets/:id/priority`: agent/lead only, mandatory reason, audit event with old/new/actor/reason, calls `recomputeOnPriorityChange`, records `escalated_mid_flight` breach, optimistic locking.
- [x] Real-time SSE stream (`GET /api/events`): agent/lead only, broadcast events (`ticket_updated`, `ticket_claimed`, `new_message`, `presence`), sanitized payload stripped of note bodies.
- [x] Agent search (`GET /api/search`) and internal-only search (`GET /api/search/internal`) maintained in separate code paths.
- [x] Canned replies table + CRUD (`/api/canned-replies`): lead/admin manage, agents list and use.
- [x] Customer intake (`POST /api/tickets/intake`): agent creates ticket on customer's behalf with automatic customer lookup/creation and outbox notification.
- [x] Admin user management (`/api/admin/users`): create/deactivate agents, change roles, all audited.
- [x] Outbox email queue (`outbox` table) driven exclusively through `renderCustomerEmail()` customer serializer; `GET /api/admin/outbox` viewer endpoint.
- [x] Canary leak test registry (`canary-registry.ts`) with automated verification testing against injected canary secrets.
- [x] 10 new Vitest tests in `apps/api/src/tests/priority-and-features.test.ts` (63 total monorepo tests passing).

---

### 5. Customer Portal, Magic-Links & Canary Enforcement - Completed
- [x] Agent endpoints: `POST /api/tickets/:id/reply` (assignee only, mandatory `Idempotency-Key`, optional `wait_on_customer` pausing both clocks, first reply sets `first_response_at`), `POST /api/tickets/:id/notes` (separate table, separate repository).
- [x] Customer API: magic-link token per ticket (hashed in DB, expiring, rate limited), direct ticket creation with severity choice, viewing thread, replying (resumes clocks and exits `waiting_on_customer`), reopening within 5-day window (new cycle, fresh clocks) vs spawning a linked ticket.
- [x] Strict separation: dedicated customer repository (`customer.repository.ts`) and serializer (`customer-serializer.ts`) using explicit column whitelists and `customer_visible_events` view.
- [x] Import boundary guard test verifying customer modules never import or reference `internal_notes`.
- [x] Exports: customer transcript (`GET /api/tickets/:id/export/customer`, public only) and internal export (`GET /api/tickets/:id/export/internal`, lead/admin only, labeled confidential notes).
- [x] Canary leak test: seeds `"CANARY_9f3a"` into internal notes, queries all customer endpoints, exports, outbox, and view, asserting zero leakage and failing the build on violation.
- [x] 7 new Vitest tests in `apps/api/src/tests/customer-isolation.test.ts` (70 total monorepo tests passing).

---

### 6. Scheduler, Time Machine & Complete Seed Dataset - Completed
- [x] Background & On-Demand Scheduler Pass (`scheduler.service.ts`):
  - Protected by PostgreSQL advisory lock (`pg_try_advisory_lock(847291)`) preventing overlapping runs.
  - Idempotent detection and recording of SLA response & resolution breaches exactly once with root-cause attribution (`unassigned_too_long` vs `slow_after_assignment`).
  - Auto-close warning sent after 2,160 business minutes of customer silence (80% cutoff) with `auto_close_warning_sent` audit event and outbox delivery.
  - Automatic ticket closure after 2,700 business minutes (5 business days) of customer silence with active pause closure, `ticket_auto_closed` audit event, and outbox email.
  - Automatic expiration of 5-day customer reopen window on `resolved` tickets after 2,700 business minutes.
  - All automated transitions audited with actor `"system"`.
- [x] Time Machine Endpoints & Simulation Banner (`time-machine.routes.ts`):
  - `GET /api/demo/time`: returns offset, frozen state, and banner data formatted in `Asia/Kolkata`.
  - `POST /api/demo/time/jump`: jumps to canonical demo moments (`"Friday 18:00"`, `"Saturday"`, `"Monday 11:01"`, `"+1 working day"`) and immediately runs the scheduler pass.
  - `POST /api/demo/time/shift`: shifts clock by minutes/hours/days and runs scheduler.
  - `POST /api/demo/time/set`: pins/freezes to specific ISO instant and runs scheduler.
  - `POST /api/demo/time/reset`: unshifts clock back to real system time.
  - `POST /api/scheduler/run`: triggers an on-demand scheduler pass.
  - UI banner contract providing visible warning whenever clock is shifted or frozen.
- [x] Complete Production Seed Script (`apps/api/src/db/seed.ts`):
  - 11 Arvo staff: 1 Lead (Aria Chen), 1 Admin (Kiran Patel), 9 Agents (Dev Sharma, Sara Lindqvist, Marcus Brody, Zoe Al-Mansoor, Alex Rivera, Priya Nair, Kenji Sato, Fatima Al-Zahra, Lucas Meyer).
  - 8 B2B customer organizations.
  - 40 deterministic, realistic incident tickets across all statuses:
    - `INC-0001`: Friday 18:00 urgent ticket (`respond_due: Mon 11:00`, `resolve_due: Mon 18:30`).
    - `INC-0002`: Already late ticket with breached response and resolution deadlines (`slow_after_assignment`).
    - `INC-0003`: At-risk ticket with <20% budget remaining.
    - `INC-0004`: Waiting on customer ticket with active pause in `sla_pauses`.
    - `INC-0005`: Near auto-close ticket (~2,600 business minutes in silence, warning sent).
    - `INC-0006`: Reopened ticket with 2 full cycles.
    - `INC-0007`: Mid-flight priority upgrade (low -> urgent) retroactively overdue and marked `escalated_mid_flight`.
    - `INC-0008`: Auto-closed ticket after 2,700 business minutes of customer silence.
    - `INC-0009` through `INC-0040`: 32 realistic enterprise incident tickets across all agents.
  - Re-runnable: safe `TRUNCATE CASCADE` bypassing row triggers and resetting sequence `ticket_human_id_seq` to 1.
- [x] 5 new end-to-end Vitest tests in `apps/api/src/tests/scheduler-and-seed.test.ts` (75 total monorepo tests passing).

---

## 7. Web UI (`apps/web`) & Single Deployable Service - Completed
- [x] React 18 + Vite + Tailwind CSS + shadcn/ui design tokens.
- [x] Dense but calm dark mode theme with Plus Jakarta Sans and JetBrains Mono fonts.
- [x] Sticky Time Machine Banner with active simulation time (Asia/Kolkata), quick jump presets ("Friday 18:00", "Saturday", "Monday 11:01", "+1 Day", "Run SLA", "Reset Time"), and collapsible custom shift drawer.
- [x] Top Application Header:
  - Arvo Systems branding and status.
  - Command palette search trigger (`Cmd+K`).
  - Demo Persona Switcher (switch between 11 seeded agents, leads, and admins with instant role switching).
- [x] Split-Screen "My Tickets" Single-Screen Interface:
  - Left Filterable Ticket List:
    - Scopes: "My tickets", "Unassigned queue", "All queue" (for leads & admins).
    - Groups: "Late / Breached", "At Risk (<20% budget)", "Waiting on Customer (Paused)", "On Track".
    - Rich ticket card: human ID (`INC-0001`), subject, priority chip, business-time SLA countdown chip, state badge, customer organization.
  - Right Ticket Detail & Thread:
    - Full ticket header with INC id, subject, status, priority changer.
    - Assignee management with Claim (optimistic UI), Release, and Reassign.
    - Real-time SSE presence banner: `"Anita is viewing"` / `"Dev Sharma is viewing"`.
    - SLA summary with response and resolution deadlines.
    - Chronological Thread:
      - Public replies in calm blue theme with sender badge and public indicator.
      - Internal notes in warm amber/yellow theme with lock icon and "Team only • Never visible to customer" badge.
      - Interleaved lifecycle audit events (claims, status changes, priority changes with reason).
  - Dual-Mode Composer:
    - Mode toggle: "Reply to customer" (blue, "Visible to [name@email]") vs "Internal note" (amber/yellow, "Team only").
    - Dynamic send button text reflecting active mode ("Send Public Reply" vs "Save Internal Note").
    - "Send and wait on customer" toggle (pauses both SLA clocks upon reply).
    - Canned replies insertion picker.
    - "Preview as customer" modal powered by `customer_visible_events` (strictly 0 internal notes visible).
    - Priority-change modal with mandatory business justification reason.
- [x] Concurrency & Conflict Protection:
  - Optimistic claim UI with friendly `ClaimConflictModal` displaying the winning owner if an HTTP 409 Conflict occurs.
- [x] Global Cmd+K Command Palette & Keyboard Shortcuts:
  - `c`: Claim ticket
  - `r`: Focus Reply composer
  - `n`: Focus Internal Note composer
  - `j` / `ArrowDown`: Next ticket
  - `k` / `ArrowUp`: Previous ticket
- [x] Single Deployable Service: Fastify serves compiled production SPA from `apps/web/dist` on `/` with automatic SPA fallback, while hosting `/api` endpoints.
- [x] Landing Page & Demo Tour (`LandingPage.tsx`):
  - One-click demo logins (Agent: Dev Sharma, Lead: Aria Chen, Admin: Kiran Patel).
  - Interactive "try this" scenario tour (Friday urgent arrival INC-0001, claim conflict INC-0291, zero-leakage canary INC-0304, mid-flight priority upgrade, customer silence auto-close).
  - Friendly cold-start loading screen probing `/api/health` with automatic retries for sleeping free-tier host instances.
- [x] Customer Magic-Link Portal (`CustomerPortal.tsx`):
  - "Raise a problem" form with plain-language severity descriptions ("I cannot work at all", "Something is broken but I can work around it", "A question or small request").
  - Ticket thread strictly querying `customer_visible_events` (public messages only) with zero internal notes leakage.
  - Dynamic status banner: "We're waiting for your reply, the clock is paused" vs "We're working on it, expected reply by Mon 11:00 IST".
  - Reopen button inside 5-day window (new cycle, fresh clocks) and friendly "closed, start a new linked ticket" state afterwards.
- [x] Simulated Emails Outbox Viewer (`OutboxViewer.tsx`):
  - Real-time viewer of all outbound transactional emails sent via the customer serializer.
  - Interactive clickable magic links that open the Customer Portal with pre-populated authentication tokens.
- [x] Seamless In-App Navigation:
  - Header view switcher pills allowing switching between Agent Console, Customer Portal, Simulated Outbox, Demo Tour, Lead SLA, and Admin Settings.
  - Full URL query parameter synchronization (`?view=customer&ticket=...&token=...`, `?view=outbox`, `?view=landing`, `?view=lead-dashboard`, `?view=admin`).
  - Dark mode aesthetic, responsive layout, full keyboard accessibility, and comprehensive empty/loading/error states.

---

## 8. Lead Dashboard & Admin Governance Screens - Completed
- [x] Lead Operations Dashboard (`LeadDashboard.tsx` & `/api/analytics/lead-dashboard`):
  - KPI Cards: Response SLA Compliance %, Resolution SLA Compliance %, Currently Late tickets, At Risk tickets (<20% budget remaining), Waiting on Customer (paused clocks), Unassigned tickets.
  - Late Tickets Table answering "which problems were late and why":
    - Auto-derived diagnostic breach root cause (`computeBreachReason` diagnosing `unassigned_too_long`, `slow_after_assignment`, `escalated_mid_flight`, `multiple_reassignments`, `other`).
    - Excluded business minutes recorded during customer silence (`waiting_on_customer` pauses).
    - Click-to-open directly in Agent Console.
  - Analytics & Visual Charts:
    - Late tickets trend over time.
    - Breach-reason breakdown with counts and percentages.
    - Team workload per agent (active open tickets, late tickets, resolved count).
  - Multi-dimensional filters: by agent, by priority, and by date range (7d, 30d, all-time).
  - Internal CSV Export (`/api/analytics/export-csv`): RFC 4180 compliant CSV download with prominent confidential internal warning banner (`WARNING: CONTAINS INTERNAL DATA`), staff assignments, and root cause diagnosis.
- [x] Admin Governance Screens (`AdminSettings.tsx` & `/api/admin/*`):
  - Holiday Calendar Editor: view, add, and delete official holidays skipping `Asia/Kolkata` business hours, with full audit logging.
  - SLA Policies & Engine Settings Editor:
    - Configure `urgent`, `medium`, and `low` response/resolution targets and resolution modes (`end_of_response_day` vs `fixed_minutes`).
    - Edit system parameters (`business_day_minutes`, `auto_close_minutes`, `reopen_window_days`, `working_hours`).
    - Cryptographically audited in `audit_events`.
    - **Future-Only Calculation Rule**: Modifying policies or settings applies strictly to future ticket cycle calculations; active and historical ticket cycles retain established deadlines (documented in `ASSUMPTIONS.md`).
  - User & Agent Management: view staff roster, provision new agents, promote/demote roles (agent <-> lead <-> admin), and toggle active availability status.
  - Canned Replies Manager: search, filter, create, edit, and delete standardized response macros.
- [x] Comprehensive End-to-End Test Suite:
  - 7 new tests in `apps/api/src/tests/lead-dashboard-and-admin.test.ts` (82 total monorepo tests passing across 9 test files).

---

## 9. SLA Ribbon, Proof Mode, Dispute Settlement & Guided Tour - Completed
- [x] SLA Ribbon on Ticket Detail (`SlaRibbon.tsx`):
  - Proportional horizontal timeline showing working vs non-working intervals (09:30-18:30 IST).
  - Paused segments (`waiting_on_customer`) with hover popovers displaying start/end and business minutes excluded.
  - Priority-change markers with justification reason popovers.
  - First public response milestone marker.
  - Response and resolution deadline markers.
  - Active time indicator ("NOW") formatted in `Asia/Kolkata` (IST) derived strictly from `ShiftableClock`.
- [x] Proof Mode Dispute Settlement Page (`ProofMode.tsx`):
  - Printable chronological timeline of every audit event (who, what, when, before/after diff, SHA-256 hash).
  - "Verify Integrity" one-click validator calling `verifyTicketAuditChain` with prominent Pass/Fail status banner and broken link reporting.
  - Plain-language dispute settlement summary (aimed at INC-0318 disputes, e.g. *"First public reply: 10:42:07 IST by Anita R., 40 business minutes after creation"*).
  - Copyable SHA-256 cryptographic signatures per event.
  - Print-ready stylesheet for generating hardcopy dispute packets.
- [x] "Why Was It Late?" Diagnostic Card (`TicketDetail.tsx`):
  - Displayed on late/breached tickets using `computeBreachReason`.
  - Displays quantitative breakdown: allocated budget, time unassigned in queue, time with assignee, excluded customer wait pauses, and total overrun business minutes.
- [x] Timeline / Audit History Tab (`TicketDetail.tsx`):
  - Toggle between "Discussion Thread" (interleaved public messages and internal notes) and "Audit History" (complete cryptographically signed ledger).
  - Strict customer separation: customer portal users remain isolated to `customer_visible_events`.
- [x] Polish & Micro-Interactions:
  - Distinct `at_risk` amber card styling (amber card border, glow, and countdown badge when remaining business time <20%).
  - Agent workload distribution view in Lead Dashboard.
  - Subtle transitions and responsive layout.
- [x] Guided Interactive "Try This" Tour (`GuidedTour.tsx`):
  - 5-step floating interactive guide walkthrough:
    1. Take a ticket (claim unassigned queue).
    2. Add an internal note (yellow team-only note).
    3. Preview as customer (verifying zero note leakage).
    4. Wait on customer (send public reply with clock pause).
    5. Jump Time Machine (advance to Monday morning to observe business hours resumption).

---

## 10. Security Hardening, Input Validation & Concurrency Protection - Completed
- [x] Zod Input Validation on All Entrypoints:
  - Centralized schemas in [`schemas.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/validation/schemas.ts) validating params, query, and request bodies.
  - Rejects malformed emails, empty notes, missing justifications, invalid roles, and out-of-range numbers with structured 400 Bad Request responses.
- [x] OWASP Security Headers & CSRF Protection:
  - Standard headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy`.
  - Origin verification hook on state-mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) authenticated via session cookies.
- [x] Customer Route Rate Limiting:
  - 60 requests/minute sliding window tracking IP and magic link tokens in `magic-link.service.ts`.
  - Standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`.
- [x] Comprehensive Race Condition Elimination:
  - **Double Submit**: Idempotency key uniqueness and deduplication across agent replies and customer messages.
  - **Claim vs. Reassign**: Atomic `UPDATE ... WHERE assignee_id IS NULL` paired with row locking (`SELECT ... FOR UPDATE`) and version checks (`OptimisticLockError`).
  - **Resume vs. Auto-Close**: Row-level locking on ticket and active pause serializes customer message resumption and background auto-close passes.
  - **Priority Change vs. Breach Detection**: Row-level locking on `ticket_cycles` prevents concurrent priority recalculations from colliding with scheduler breach detection.
- [x] Full Monorepo Test Suite:
  - 10 test suites, 96 unit and integration tests passing in Vitest.

---

## 11. Known Issues & Deliberate Deferrals

The following items are intentionally deferred as production roadmap items beyond the local single-service deployment scope:

1. **Distributed Rate Limiting (Redis / Key-Value Store)**:
   - *Current Implementation*: In-memory sliding window rate limiter within the Fastify process.
   - *Production Need*: For multi-instance clustered horizontal scaling, rate limit counters should reside in Redis or an ElastiCache instance.
2. **Real SMTP Outbound Transport**:
   - *Current Implementation*: Outbox table with customer serializer rendering simulated transactional emails viewable via `/admin/outbox`.
   - *Production Need*: Integration with SendGrid, AWS SES, or Postmark with webhook delivery tracking (bounces, opens).
3. **Automated Attachment Upload & S3 Storage**:
   - *Current Implementation*: Message text and note bodies with rich plaintext formatting.
   - *Production Need*: Presigned S3/GCS bucket uploads with antivirus scanning for file attachments on customer and agent messages.
4. **WebSocket Fallback for SSE**:
   - *Current Implementation*: Server-Sent Events (SSE) `/api/events` for agent presence and ticket updates.
   - *Production Need*: WebSocket or long-polling fallback for corporate proxies that buffer or drop persistent HTTP streams.
5. **Full Text Search Indexing (Elasticsearch / pg_trgm GIN)**:
   - *Current Implementation*: PostgreSQL `ILIKE` pattern matching across subjects, public messages, and customers.
   - *Production Need*: GIN trigram indexing (`pg_trgm`) or external OpenSearch cluster for fuzzy typo-tolerant full-text search across millions of historical tickets.


