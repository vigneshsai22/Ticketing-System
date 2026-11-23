# Frontdesk - High-Integrity Support Ticketing System

Frontdesk is an enterprise support ticketing platform purpose-built for **Arvo Systems** (11 team members: 1 lead, 1 admin, 9 agents, handling ~40 high-stakes B2B incident tickets per day). 

Frontdesk guarantees **tamper-evident auditability**, **zero customer data leakage**, **mathematically precise business-hours SLA calculations**, and **atomic concurrency protection** against distributed race conditions.

---

## 1. Architecture Overview

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        AC["Agent Console (React 18 + Tailwind)"]
        CP["Customer Portal (Magic-Link Auth)"]
        LD["Lead SLA Dashboard & Analytics"]
        AS["Admin Governance & Policy Editor"]
        PM["Proof Mode Dispute Certifier"]
    end

    subgraph Server["Fastify Unified Server (Single Deployable Port 3000)"]
        direction TB
        Static["Static SPA Hosting (/ & /assets)"]
        API["REST API Layer (/api)"]
        AuthGuard["Auth & Role Guards (HS256 JWT + Cookie)"]
        ZodVal["Zod Input Validation Engine"]
        RateLimiter["Sliding Window Rate Limiter (60 req/min)"]
        SSE["SSE Broadcaster (/api/events)"]
        
        API --> AuthGuard
        API --> ZodVal
        API --> RateLimiter
    end

    subgraph CoreEngine["Core Engines & Services"]
        SLA["@frontdesk/sla (Pure TypeScript Engine)<br/>Luxon • Asia/Kolkata Business Calendar"]
        Clock["@frontdesk/shared Clock Service<br/>SystemClock & ShiftableClock (Time Machine)"]
        Audit["Cryptographic Audit Ledger<br/>SHA-256 Hash Chain per Ticket"]
        Scheduler["Background & On-Demand Scheduler<br/>Advisory Lock • SLA Breach & Auto-Close"]
        Outbox["Transactional Email Outbox<br/>Customer Serializer Isolation"]
    end

    subgraph Storage["PostgreSQL 16 Database (Dual Engine)"]
        direction TB
        Tickets["tickets (INC-0001 sequence, version)"]
        Cycles["ticket_cycles (Per-Cycle Deadlines & Breaches)"]
        AuditEvents["audit_events (IMMUTABLE Trigger)"]
        PubMsgs["public_messages (Idempotency Key, IMMUTABLE)"]
        Notes["internal_notes (STRUCTURALLY ISOLATED, IMMUTABLE)"]
        CustView["customer_visible_events VIEW (0 Note Leakage)"]
        Policies["sla_policies & holidays (09:30-18:30 IST)"]
        Pauses["sla_pauses (waiting_on_customer intervals)"]
    end

    Clients --> Server
    Server --> CoreEngine
    CoreEngine --> Storage
```

---

## 2. Quickstart & Local Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Docker** (Optional, for running PostgreSQL locally)

### Option A: Zero-Dependency Embedded Mode (Instant Run)
When `DATABASE_URL` is omitted, Frontdesk automatically boots with an embedded **PGlite WASM PostgreSQL engine**. No external database required:

```bash
# 1. Clone repository
git clone https://github.com/arvo-systems/frontdesk.git
cd frontdesk

# 2. Install dependencies across monorepo workspaces
npm install

# 3. Build monorepo packages and frontend SPA
npm run build

# 4. Run database migrations & production seed
npm run db:migrate
npm run db:seed:stub

# 5. Start unified server
npm run dev
```
Visit `http://localhost:3000` (or `http://localhost:5173` for Vite HMR in development).

### Option B: Docker Compose with PostgreSQL 16
```bash
# 1. Start local PostgreSQL container
docker compose up -d

# 2. Set database connection string
export DATABASE_URL="postgres://frontdesk:frontdesk_secret@localhost:5432/frontdesk"

# 3. Migrate, seed, and start
npm run db:migrate
npm run db:seed:stub
npm run dev
```

---

## 3. Seeded Demo Accounts

Frontdesk ships with 11 pre-configured Arvo Systems staff members and 8 corporate B2B customer accounts. Use the **One-Click Demo Switcher** in the top navigation bar or the landing page:

| Persona | Name | Email | Role | Responsibilities |
| :--- | :--- | :--- | :---: | :--- |
| **Lead** | **Aria Chen** | `aria.chen@arvo.internal` | `lead` | SLA dashboard, ticket reassignments, internal exports, overrides |
| **Admin** | **Kiran Patel** | `kiran.patel@arvo.internal` | `admin` | Holiday editor, SLA policies, staff user provisioning, settings |
| **Agent** | **Dev Sharma** | `dev.sharma@arvo.internal` | `agent` | Primary queue claims, public customer replies, internal notes |
| **Agent** | **Sara Lindqvist** | `sara.lindqvist@arvo.internal` | `agent` | Support agent handling technical investigations |
| **Agent** | **Marcus Brody** | `marcus.brody@arvo.internal` | `agent` | Support agent |
| **Agent** | **Zoe Al-Mansoor** | `zoe.almansoor@arvo.internal` | `agent` | Support agent |
| **Agent** | **Alex Rivera** | `alex.rivera@arvo.internal` | `agent` | Support agent |
| **Customer** | **Alice Vance** | `alice@acme.com` | `customer` | Acme Corp (Magic-link passwordless access) |
| **Customer** | **Bruce Wayne** | `bruce@wayne.com` | `customer` | Wayne Enterprises (Magic-link passwordless access) |

---

## 4. How Critical Production Incidents are Prevented

Frontdesk was specifically engineered to eradicate three catastrophic failure modes identified in enterprise ticketing systems:

### INC-0291: The Double-Claim Concurrency Race
- **Vulnerability**: Two agents simultaneously opening an unassigned ticket both clicked "Claim" at the same millisecond. In un-isolated architectures, both updates succeeded, leaving dual ownership, conflicting replies, and duplicated work.
- **How Frontdesk Prevents It**:
  1. **Atomic Conditional SQL**:
     ```sql
     UPDATE tickets 
     SET assignee_id = :agent_id, version = version + 1, updated_at = :now
     WHERE id = :id AND assignee_id IS NULL
     RETURNING *;
     ```
  2. **Row-Level Serialization & Optimistic Locking**: Reassignments and status transitions use `SELECT ... FOR UPDATE` and check `ticket.version`.
  3. **Deterministic User Feedback**: The second transaction immediately receives an HTTP `409 Conflict` with the winner's name:
     `{ "error": "Ticket already claimed", "current_assignee": "Dev Sharma" }`.
- **Automated Tests**:
  - [`core-api.test.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/tests/core-api.test.ts): Fires **20 simultaneous parallel claim requests** against a single ticket; asserts exactly 1 succeeds and 19 receive 409 Conflict.
  - [`race-conditions-and-security.test.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/tests/race-conditions-and-security.test.ts): Tests simultaneous Claim vs Reassign with optimistic locking.

---

### INC-0304: Complete Information Isolation (Zero Leakage)
- **Vulnerability**: A confidential internal diagnosis note (*"Customer's setup is buggy, don't tell them"*) was exposed to an external customer due to a shared messages table with a leaky boolean filter (`is_internal = false`).
- **How Frontdesk Prevents It**:
  1. **Structural Table Separation**: Internal notes reside in an isolated table (`internal_notes`) with no foreign joins to customer views.
  2. **Database View Enforcement**: Customer portal queries use the `customer_visible_events` PostgreSQL view, strictly querying `public_messages` and filtered public lifecycle transitions.
  3. **Strict Serialization Layer**: Customer endpoints and outbox emails pass data strictly through `renderCustomerEmail()` and `serializeCustomerTicket()`, which whitelist public columns only.
  4. **Lint & Import Boundary Guards**: The customer repository and routes are forbidden by architecture tests from importing `internal_notes`.
- **Automated Tests**:
  - [`customer-isolation.test.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/tests/customer-isolation.test.ts): Injects a high-entropy canary secret (`CANARY_9f3a`) into an internal note, then queries every customer endpoint, public search, outbox queue, SSE stream, and customer export transcript, asserting **0 occurrences**.

---

### INC-0318: Append-Only Cryptographic Audit & Dispute Settlement
- **Vulnerability**: A customer disputed their SLA compliance, claiming their ticket was late. The vendor had no immutable proof of when the ticket arrived or when first response occurred, leading to audit log tampering suspicions.
- **How Frontdesk Prevents It**:
  1. **Database-Level Immutability**: PostgreSQL trigger `trg_audit_events_immutable` raises an uncatchable exception on any SQL `UPDATE` or `DELETE` attempt against `audit_events`, `public_messages`, or `internal_notes`.
  2. **Cryptographic SHA-256 Chaining**: Each audit row calculates:
     $$\text{hash} = \text{SHA256}(\text{prev\_hash} + \text{seq} + \text{ticket\_id} + \text{actor\_id} + \text{event\_type} + \text{before} + \text{after} + \text{created\_at})$$
  3. **Proof Mode Certificate**: Accessible via the UI, "Proof Mode" prints a tamper-evident certificate with a one-click **"Verify Integrity"** engine that recomputes every hash from genesis to head, rendering a plain-language summary:
     > *"First public reply: 10:42:07 IST by Anita R., 40 business minutes after creation (SLA target: 120 minutes). Cryptographic chain: VERIFIED INTACT."*
- **Automated Tests**:
  - [`schema.test.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/db/schema.test.ts): Verifies `UPDATE` and `DELETE` throw immutability violation exceptions.
  - [`core-api.test.ts`](file:///c:/Users/Lenovo/Desktop/ticketing%20system/apps/api/src/tests/core-api.test.ts): Verifies the SHA-256 chain and validates tamper detection if an event is modified.

---

## 5. SLA Engine Rules & Business Calendar

All business hours calculations adhere to `@frontdesk/sla` using **`Asia/Kolkata` (IST)** standard working hours:

| Priority | First Response Due | Resolution Due | Resolve Mode | Description |
| :---: | :---: | :---: | :---: | :--- |
| **Urgent** | **120 business mins** | **End of Response Day** | `end_of_response_day` | Response within 2 working hours; resolution due at **18:30 IST** on the working day containing the response deadline. |
| **Medium** | **270 business mins** | **810 business mins** | `fixed_minutes` | Response within 4.5 working hours; resolution within 1.5 working days (13.5 business hours). |
| **Low** | **540 business mins** | **1,620 business mins** | `fixed_minutes` | Response within 1 business day (9 hours); resolution within 3 business days (27 hours). |

### Core SLA Business Rules
1. **Operating Calendar**: Monday through Friday, 09:30 to 18:30 IST (540 business minutes per day). Weekends and official admin-managed holidays are excluded.
2. **Off-Hours Arrivals**: Tickets arriving after 18:30, on weekends, or during holidays begin their clock at 09:30 on the **next working instant**.
3. **Waiting on Customer (Pause)**: Setting status to `waiting_on_customer` pauses both response and resolution SLA clocks. Only business minutes within working hours elongate the deadline.
4. **Auto-Close Rule**: After **2,700 business minutes** (5 working days) of customer silence in `waiting_on_customer`, the system sends a warning at 2,160 minutes and auto-closes the ticket.
5. **Reopen Window**: Resolved tickets can be reopened by customers within **2,700 business minutes** (5 working days). Reopening increments `cycle_no` and starts fresh SLA deadlines. After 5 days, customer contact spawns a new linked ticket (`parent_ticket_id`).
6. **Mid-Flight Priority Changes**: Upgrading priority (e.g. Medium $\rightarrow$ Urgent) retroactively recomputes deadlines against original start time plus pauses. If the new deadline has already passed, the ticket is flagged as **breached immediately** with root cause `escalated_mid_flight`. Prior breaches are **never erased**.

---

## 6. How to Use the Time Machine

The **Time Machine** enables deterministic demonstration and testing of time-dependent SLA behaviors without waiting days in real time:

1. **Sticky Simulation Banner**: Whenever time is shifted or frozen, a persistent amber banner displays the simulated IST time, offset, and quick-jump actions.
2. **One-Click Canonical Moments**:
   - `"Friday 18:00"`: Jumps to `2026-03-06T18:00:00+05:30` (ticket arrives right at weekend closing).
   - `"Saturday"`: Jumps to `2026-03-07T12:00:00+05:30` (verifies SLA clocks do not tick on weekends).
   - `"Monday 11:01"`: Jumps to `2026-03-09T11:01:00+05:30` (1 minute past urgent response deadline; triggers automated breach detection).
   - `"+1 working day"`: Advances time by exactly 540 business minutes.
   - `"Reset Time"`: Reverts clock offset to the current real wall clock.
3. **Automatic Scheduler Execution**: Every Time Machine action immediately runs an idempotent background scheduler pass, recalculating breaches and evaluating customer silence.

---

## 7. Running Tests & Quality Verification

Frontdesk features **10 test suites** with **96 tests** covering unit, integration, and security constraints:

```bash
# Run all tests once
npm test

# Run tests with active file watcher
npm run test:watch

# Run architectural clock guard test (prevents Date.now() / new Date() leaks)
npx vitest run packages/shared/src/clock/clock-guard.test.ts

# Run monorepo linter (ESLint with clock restriction rules)
npm run lint

# Build production bundles
npm run build
```

---

## 8. Free-Tier Production Deployment

Frontdesk is designed to run on free container hosting (Render, Koyeb, Railway, Fly.io) backed by a managed PostgreSQL instance (Neon, Supabase, Render Postgres):

### Free-Tier 24/7 Uptime Strategy
- **750-Hour Budget**: Free hosting tiers (e.g. Render) provide 750 free instance hours per month. Running Frontdesk as a **single unified service** (hosting the compiled React SPA + Fastify API on port 3000) consumes exactly 744 hours in a 31-day month, staying **100% within free limits for a full week and month**.
- **Keep-Alive Self-Ping**: Free instances idle to sleep after 15 minutes. By setting `KEEP_ALIVE_URL=https://<your-app>.onrender.com/api/health`, Frontdesk pings itself every 10 minutes to stay continuously awake.
- **Automated GitHub Actions Ping**: Included in [`.github/workflows/keep-alive.yml`](file:///.github/workflows/keep-alive.yml) to ping `/api/health` every 10 minutes from GitHub's runner infrastructure.

### Deployment Environment Variables
Configure the following in your host dashboard:
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://user:password@ep-host.neon.tech/neondb?sslmode=require
JWT_SECRET=production-secret-jwt-key-32-chars-minimum
COOKIE_SECRET=production-secret-cookie-key-32-chars
AUTO_MIGRATE=true
AUTO_SEED=true
KEEP_ALIVE_URL=https://frontdesk.onrender.com/api/health
```
Deploy via Dockerfile or by pointing your host's build command to:
```bash
npm ci && npm run build
```
And start command:
```bash
node apps/api/dist/index.js
```
